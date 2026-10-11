# Design — NoteBot MCP

This app inherits the NoteBot family system locked in
[`notebot-web-v2/design.md`](https://github.com/TriptoAfsin/notebot-web-v2/blob/main/design.md).
Read that file first. Everything there applies here unless amended below.

## Inherited unchanged

- Genre `modern-minimal`, theme **Cobalt anchored on brand hue 252**, dual light/dark mode.
- Same OKLCH ramps (`public/app.css` `:root`, `[data-theme="dark"]`, and the
  `prefers-color-scheme` block); accent stays at or under 5% of any viewport.
- Satoshi 500/700 display, Geist 400/500 body, JetBrains Mono for labels and code. All self-hosted from `public/fonts/`.
- Hairline surfaces, 10 px cards, 8 px buttons/inputs, one solid primary per view.
- Three easings, three durations, one entrance per route, reduced-motion collapse.
- Banned list: eyebrow numbers, tag-left headings, gradients, glass, emoji icons,
  `transition-all`, scale on hover, inline raw colour values.

## Amendments for this app

- **Page family: Workbench.** The dashboard is a tool, not a landing page. Order:
  title + lede → *Get a free key* card (right column on desktop, second on mobile) →
  endpoint + live board → Connect (tabs) → Tools (index rows) → Skill → Guidelines → Your key.
- **Nav:** a flush inline bar (wordmark + `MCP` mono tag, anchor links, theme toggle).
  There's no ⌘K palette; one page doesn't need one. Links hide below 52 rem.
- **Footer:** Ft2 inline single line.
- **Consent page:** one centred card, at most 26 rem wide, on paper. Same tokens.
- **Icons:** Lucide only (inline SVG, 1.5 stroke). There is no dimensional set here.
- **Copy:** says what happens next ("Create key", "Set up a client"). Success is silent: copy buttons flip to "Copied" for 1.6 s, with no toasts.
- **Snippets** carry a `data-template` with `YOUR_KEY`, and JS fills in the session's key.

## Responsive floor

Verified at 320 / 375 / 414 / 768 / 1280 px: no horizontal scroll (`overflow-x: clip`),
no wrapped buttons (`white-space: nowrap`), grid tracks use `minmax(0, 1fr)`,
tabs scroll horizontally inside their strip.

## Stamp

```
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: Cobalt (brand-anchored, hue 252) · design-system: notebot-web-v2/design.md */
```
