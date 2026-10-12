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

- **Routes, not one long page.** `/` home (Split Studio: hero with two numbered start steps →
  two server cards side by side → four icon KPI cards → live board), `/connect/<butex|notebot>` (the setup guide as a page), `/ask`,
  `/tools`, `/agent`, `/key`. Old `/#section` anchors redirect client-side.
- **Setup sheet.** On home, "Set up" opens the server's guide in a `<dialog>` (bottom sheet on
  phones, centred panel on desktop), deep-linkable as `/?setup=<server>`, Back closes it.
  Without JS the same link goes to `/connect/<server>`.
- **Guides** are one renderer (`src/web/guide.ts`) for sheet and page: app chips → checklist
  with schematic mockups → copyable form values / inline key form / snippets.
- **Nav:** a flush inline bar (wordmark + `MCP` mono tag, route links, a small primary "Set up",
  theme toggle). Below 52 rem the links become a scrollable second row; they never hide.
- **Motion:** cross-document view transitions between routes (header holds; page lifts out
  160 ms, settles in 320 ms; server icon and name morph from card to `/connect` page). One
  entrance per route. Attention pulses run three times, never forever.
- **Footer:** Ft2 inline single line.
- **Consent page:** one centred card, at most 26 rem wide, on paper. Same tokens.
- **Icons:** Lucide for functional UI (inline SVG, 1.5 stroke). The KPI cards use web-v2's
  dimensional glyphs, pre-rendered into `src/web/glyphs.ts` and lit by the same `--g-*` tokens.
  Regenerate them from the web-v2 source; never hand-edit.
- **Cards** use web-v2's 10 px card radius, `--color-paper-2` fill and hairline border.
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
