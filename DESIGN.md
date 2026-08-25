# MFS ORA® — Design System

Extracted from `index.html`'s existing token block (the sales page's implicit
system), extended with the blue confirmation surface introduced by
`thank-you.html`. Codifies what exists; deviations are flagged in Section 8.

---

## 1. Atmosphere & Identity

Clinical confidence without coldness. This is pharmacy supply, so the page has to
read as accurate before it reads as attractive — figures line up, units are
stated, nothing is decorative for its own sake. The signature is **flat tonal
blocking**: whole panels carry a single saturated colour and the content sits
directly on it in white or ink, with no gradient, bevel, or glass in between.
Depth comes from one plane sitting on another, not from lighting effects. The
product photography is the only place light and shadow are allowed to exist.

Two surfaces exist:

- **Sales surface** (`index.html`) — flame-led, warm, promotional.
- **Confirmation surface** (`thank-you.html`) — blue-led, calm, factual. The
  transaction is done; nothing here is selling.

---

## 2. Color

### Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Brand/flame | `--flame` | `#ee3c13` | Sales surface accent, CTAs |
| Brand/flame-deep | `--flame-deep` | `#c72d09` | Flame pressed/active |
| Brand/blue | `--blue` | `#2350ce` | Confirmation panel, headline, total |
| Brand/blue-deep | `--blue-deep` | `#1a3da6` | Page ground behind the card |
| Brand/blue-lift | `--blue-lift` | `#3564e2` | Blue hover/active |
| Surface/paper | `--paper` | `#ffffff` | Cards, buttons on blue |
| Surface/panel | `--panel` | `#f2f2f4` | Confirmation detail panel |
| Surface/sunken | `--sunken` | `#e9e9ed` | Inset rows, thumbnail wells |
| Text/primary | `--ink` | `#16181d` | Values, headings on light |
| Text/secondary | `--ink-2` | `#4a4f5a` | Body copy |
| Text/tertiary | `--ink-3` | `#8b909b` | Field labels, meta |
| Text/on-blue | `--on-blue` | `#ffffff` | Type on the blue panel |
| Text/on-blue-mute | `--on-blue-mute` | `rgba(255,255,255,.72)` | Timestamp, subtitle |
| Border/default | `--line` | `#dcdce2` | Dividers in the panel |
| Border/on-blue | `--line-blue` | `rgba(255,255,255,.20)` | Dividers on blue |
| Status/free | `--free` | `#0f7a43` | "Free" shipping, bonus lines |

### Rules

- The two surfaces never mix accents. Flame does not appear on the confirmation
  page; blue does not appear on the sales page as an accent.
- Accent colour marks interaction or a figure that matters (the total). Never
  decorative.
- No gradients on interactive elements. A gradient is permitted only as an
  atmospheric ground, never on a button, chip, badge, or panel fill.
- Never introduce a colour absent from this table. Extend the table first.

---

## 3. Typography

Families are inherited from the sales page and unchanged.

| Token | Stack |
|-------|-------|
| `--display` | `'Geist','Plus Jakarta Sans',system-ui,sans-serif` |
| `--body` | `'Geist','Plus Jakarta Sans',system-ui,sans-serif` |
| `--mono` | `'Geist Mono','JetBrains Mono',ui-monospace,monospace` |

### Scale

| Token | Size | Weight | Tracking | Usage |
|-------|------|--------|----------|-------|
| `--t-display` | `clamp(30px,3.2vw,42px)` | 700 | `-.032em` | Page headline |
| `--t-title` | `clamp(24px,2.4vw,31px)` | 700 | `-.024em` | Product name |
| `--t-total` | `clamp(30px,3.1vw,40px)` | 730 | `-.03em` | Total figure |
| `--t-lead` | `16px` | 500 | `-.006em` | Intro paragraph |
| `--t-body` | `15px` | 500 | `-.004em` | Values, item names |
| `--t-sub` | `16.5px` | 450 | `-.004em` | Blue-panel subtitle |
| `--t-label` | `13.5px` | 450 | `0` | Field labels |
| `--t-meta` | `12.5px` | 500 | `.01em` | Timestamp, footnote |

### Rules

- Money and identifiers are set in `--mono` with `font-variant-numeric:
  tabular-nums`, so columns of figures align on the decimal.
- Labels are sentence case with a trailing colon, never uppercase tracking-out.
  (The sales page uses uppercase mono eyebrows; the confirmation surface
  deliberately does not — see Section 8.)

---

## 4. Spacing & Layout

Base unit `--space-1: 4px`. Every gap is a multiple.

| Token | Value |
|-------|-------|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--space-10` | `40px` |

| Token | Value | Usage |
|-------|-------|-------|
| `--pad-panel` | `clamp(32px,3.4vw,52px)` | Interior of either panel |
| `--shell` | `1080px` | Card max width |
| `--r-card` | `18px` | Card corner |
| `--r-btn` | `10px` | Button corner |
| `--r-well` | `8px` | Thumbnail well |

Layout: one card, two equal columns (`1fr 1fr`), stacking to one column below
`900px`. Both panels are flush — equal height, shared card radius, no offset.

---

## 5. Components

### Button — `.btn`

| Variant | Fill | Label | Usage |
|---------|------|-------|-------|
| `--on-blue` | `--paper` | `--blue` | Primary action on the blue panel |

States: rest, hover (`translateY(-1px)`, fill → `#f4f6ff`), active
(`translateY(0) scale(.99)`), focus-visible (`3px` white outline, `2px` offset),
disabled (`opacity:.5`, no transform). No gradient, no inner bevel, no drop
shadow on the button itself.

### Field pair — `.field`

Label above value. Label `--t-label` in `--ink-3`; value `--t-body` weight 640 in
`--ink`. Gap `--space-1`. Pairs sit in a two-column grid at `--space-5` gutters,
collapsing to one column under `560px`.

### Money row — `.row`

Label left in `--ink-2`, figure right in `--mono`/`--ink`. Vertical padding
`--space-3`, separated by `1px solid --line`. Discount figures print in `--blue`
prefixed with a true minus (`−`). A zero discount removes its own row.

### Line item — `.item`

Three columns: thumbnail well (`44×56`), name plus note, figure. Quantity badge
overlaps the well's top-left corner. Bonus lines set their figure as "Free" in
`--free` and their note in `--blue`.

### Total block — `.total`

Label `--t-label` in `--ink-3`, figure `--t-total` in `--blue` on the line below.
Left-aligned, matching the field-pair rhythm rather than the money rows.

---

## 6. Motion & Interaction

| Token | Value | Usage |
|-------|-------|-------|
| `--ease` | `cubic-bezier(.22,1,.36,1)` | Entrances |
| `--ease-soft` | `cubic-bezier(.32,.72,0,1)` | Opacity |
| `--t-fast` | `140ms` | Press |
| `--t-base` | `260ms` | Hover |
| `--t-entry` | `620ms` | Page entrance |

Entrance: card fades and rises `12px`; detail-panel children stagger at `50ms`.
Runs once on load. Transform and opacity only — never layout properties. All
motion is removed under `prefers-reduced-motion: reduce`.

Loading: unresolved figures render as a shimmering placeholder bar sized to the
expected value, so the layout does not shift when data lands.

---

## 7. Depth & Surface

**Strategy: tonal-shift.** Committed. Surfaces separate by colour value alone —
blue panel against light panel, sunken well against panel. No borders used for
elevation, no shadows on buttons, chips, wells, or panels.

One exception, declared: the card carries a single shadow so it reads as sitting
on the page ground rather than being cut out of it.

| Level | Value | Usage |
|-------|-------|-------|
| Card | `0 24px 60px -24px rgba(8,22,64,.42)` | The card, once |

Borders exist only as hairline dividers between rows (`--line`, `--line-blue`),
never to imply elevation.

---

## 8. Known deviations & accepted debt

- The sales page (`index.html`) uses glossy multi-stop gradient CTAs with inner
  bevels and its own uppercase mono eyebrows. The confirmation page deliberately
  does not inherit these; it is flat per Section 7. The two surfaces are
  therefore not fully consistent. Accepted: the sales page is promotional, the
  confirmation page is a receipt.
- `index.html` carries a much larger token block (`--sku-*`, band spacing, three
  shadow levels) that this file does not restate. That block remains the source
  of truth for the sales page until the two are consolidated.
- The MFS logo asset is full-colour; the blue panel renders it white via a CSS
  filter. A dedicated white/ORA wordmark asset would be preferable.
