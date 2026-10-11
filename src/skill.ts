import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { env } from "./env";

/**
 * Serves the agent skill and everything its self-updater needs. The version is
 * read from the marker comment in SKILL.md, so bumping that one line releases
 * a new version — there is no second place to keep in sync.
 */

const SKILL_ROOT = join(import.meta.dir, "..", "skill");
const SKILL_DIR = join(SKILL_ROOT, "butex-notebot");
const MARKER = /butex-notebot skill version:\s*([0-9]+(?:\.[0-9]+){0,2})/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || name === "__pycache__") return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Minimal ZIP writer (stored, no compression) — skills are a few KB. */
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // fixed DOS timestamp keeps the zip byte-identical across restarts (stable ETag)
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | (1 << 5) | 1;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = Bun.hash.crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return Buffer.concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

function load() {
  const skillMd = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  const version = MARKER.exec(skillMd)?.[1] ?? "0.0.0";
  let notes = "";
  try {
    notes = (JSON.parse(readFileSync(join(SKILL_ROOT, "release.json"), "utf8")) as { notes?: string }).notes ?? "";
  } catch {}
  const files = walk(SKILL_DIR)
    .sort()
    .map((full) => ({ name: `butex-notebot/${relative(SKILL_DIR, full).split(sep).join("/")}`, data: new Uint8Array(readFileSync(full)) }));
  return { version, notes, skillMd, zip: zip(files), fileCount: files.length };
}

const skill = load();
export const SKILL_VERSION = skill.version;

const installSh = () => `#!/bin/sh
# Installs or upgrades the butex-notebot agent skill for Claude Code (and Codex if present).
set -e
URL="${env.publicUrl}/skill/butex-notebot.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP/skill.zip"
if command -v unzip >/dev/null 2>&1; then unzip -q "$TMP/skill.zip" -d "$TMP"
else python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP/skill.zip" "$TMP"; fi
installed=""
for base in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.agents/skills"; do
  parent="$(dirname "$base")"
  [ "$base" = "$HOME/.claude/skills" ] || [ -d "$parent" ] || continue
  mkdir -p "$base"
  rm -rf "$base/butex-notebot"
  cp -R "$TMP/butex-notebot" "$base/butex-notebot"
  installed="$installed\\n  $base/butex-notebot"
done
printf "butex-notebot skill v${skill.version} installed:%b\\n" "$installed"
echo "Connect the tools too:  claude mcp add --transport http butex ${env.publicUrl}/butex/mcp"
`;

const installPs1 = () => `# Installs or upgrades the butex-notebot agent skill for Claude Code (and Codex if present).
$ErrorActionPreference = "Stop"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("butex-notebot-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing "${env.publicUrl}/skill/butex-notebot.zip" -OutFile "$tmp\\skill.zip"
  Expand-Archive -Path "$tmp\\skill.zip" -DestinationPath $tmp -Force
  $targets = @("$HOME\\.claude\\skills")
  foreach ($extra in @("$HOME\\.codex", "$HOME\\.agents")) { if (Test-Path $extra) { $targets += "$extra\\skills" } }
  foreach ($base in $targets) {
    New-Item -ItemType Directory -Force -Path $base | Out-Null
    $dest = Join-Path $base "butex-notebot"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse "$tmp\\butex-notebot" $dest
    Write-Host "Installed butex-notebot skill v${skill.version} -> $dest"
  }
  Write-Host "Connect the tools too:  claude mcp add --transport http butex ${env.publicUrl}/butex/mcp"
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
`;

export function skillRoute(path: string): Response | null {
  const text = (body: string, type: string) =>
    new Response(body, { headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "public, max-age=300" } });
  switch (path) {
    case "/skill/version.json":
      return Response.json(
        {
          name: "butex-notebot",
          version: skill.version,
          notes: skill.notes,
          zip: `${env.publicUrl}/skill/butex-notebot.zip`,
          skill_md: `${env.publicUrl}/skill/SKILL.md`,
          files: skill.fileCount,
        },
        { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
      );
    case "/skill/SKILL.md":
      return text(skill.skillMd, "text/markdown");
    case "/skill/butex-notebot.zip":
      return new Response(skill.zip, {
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="butex-notebot.zip"',
          "cache-control": "public, max-age=300",
        },
      });
    case "/skill/install.sh":
      return text(installSh(), "text/x-shellscript");
    case "/skill/install.ps1":
      return text(installPs1(), "text/plain");
    default:
      return null;
  }
}
