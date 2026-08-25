---
name: animated-website
description: "Turn an MP4, MOV, or WebM clip into a premium scroll-driven website where scrolling controls a frame-by-frame canvas sequence. Builds cinematic product launches, automotive showcases, portfolio films, and Apple-style scrollytelling pages with engineered pacing, progressive WebP loading, responsive art direction, modern typography, and a distinctive editorial design system. Use for 'animated website', 'scroll animation', 'video to website', 'scroll-driven site', 'scroll to play', 'frame sequence', 'Apple-style page', 'cinematic landing page', 'make this video interactive', or any request to turn a video clip into an immersive web experience."
---

# Animated Website

Turn a video into a complete scroll-controlled web experience. Preserve the video's motion as the hero. Build the visual identity around the subject instead of covering the footage with generic effects.

The default direction is **precision editorial**: bold modern sans type, strict geometry, useful technical labels, asymmetric composition, hard-edged reveals, and one subject-specific signature device. The site should feel art-directed, not decorated.

## Use This Skill For

- MP4, MOV, or WebM to scroll-driven frame sequence
- Automotive, product, fashion, architecture, and portfolio launches
- Apple-style canvas playback controlled by page scroll
- Cinematic single-page launches with text timed to the footage

Do not use it for a normal embedded video player, GIF conversion, or a website with no video source. Use `frontend-design` for a regular animated site without a frame sequence.

## Required Inputs

1. A local video path
2. Enough context to identify the subject

Treat colors, copy, frame count, and chapter structure as optional. Inspect the clip and make strong defaults. Ask one question only when the subject or page goal cannot be inferred safely.

## Files to Read

- Read [references/visual-system.md](references/visual-system.md) before designing.
- Copy [assets/starter.html](assets/starter.html) as the implementation base. Preserve its loading, canvas, scroll-remap, responsive, and reduced-motion logic. Replace its identity, copy, palette, chapter layouts, and frame configuration.
- Run [scripts/extract_frames.py](scripts/extract_frames.py) for deterministic frame extraction.

## Workflow

### 1. Inspect the Film

Probe the video:

```bash
ffprobe -v quiet -print_format json -show_format -show_streams "/absolute/path/video.mp4"
```

Create a six-frame contact sheet and inspect it. Identify:

- the subject and likely audience
- camera movement and the main reveal
- where the subject sits at the start, middle, and end
- safe negative space for copy at each chapter
- colors and physical details worth borrowing
- cuts, flashes, or abrupt changes that need special pacing

Do not guess product claims from appearance. Research the product or brand before writing factual copy. Prefer first-party sources and include sources in the handoff.

### 2. Set the Design Thesis

Before coding, write a compact internal plan:

- **Subject:** one concrete subject
- **Audience:** who is viewing it
- **Job:** the one thing the page should make them feel or do
- **Palette:** four to six colors sampled from the film or subject
- **Type:** a display face, text face, and optional data face
- **Layout:** how copy moves around the subject across the sequence
- **Signature:** one memorable device rooted in the subject

Then critique it. Replace any choice that could belong to an unrelated luxury page.

For automotive work, a useful starting point is the **Trackline** direction in the visual-system reference: variable-width grotesk type, frame counters, instrument labels, and a continuous progress rail. For another subject, create an equally specific visual language.

### 3. Extract the Frames

Choose frame count from duration unless the user asks for precise control:

| Duration | Frames | Typical scroll height |
|---|---:|---:|
| 0-5 sec | 60-80 | 450-550vh |
| 5-15 sec | 90-130 | 600-750vh |
| 15-30 sec | 130-180 | 750-900vh |
| 30+ sec | 180-200 | 900-1000vh |

Use the source resolution as the ceiling. Upscaling frames wastes bandwidth without adding detail.

```bash
python3 .agents/skills/animated-website/scripts/extract_frames.py \
  --input "/absolute/path/video.mp4" \
  --output "workspace/{YYYY-MM-DD}/animated-sites/{slug}/frames" \
  --frames {COUNT} \
  --quality 68 \
  --desktop-res {SOURCE_OR_SMALLER} \
  --mobile-res {MOBILE_SIZE}
```

Proceed with the recommended count when the user already asked for the site. Pause only if the projected payload is excessive or the clip needs a meaningful creative decision.

Targets after extraction:

- desktop frames at or below 10 MB when practical
- mobile frames at or below 5 MB
- first useful frame available immediately
- no dimensions larger than the source video

If the payload misses the target, lower quality to 58-64 before cutting important frames.

### 4. Write the Scroll Story

Use four to six chapters. The footage decides where they appear. Do not force the same six sections onto every project.

Each chapter needs one job. Common roles include:

- identify the subject
- state the central idea
- reveal one verified detail
- connect heritage to the present
- show proof or capability
- give one clear next action

Viewer-facing copy must be easy to scan while scrolling:

- one idea per chapter
- headlines of two to eight words
- body copy of one or two short sentences
- labels only when they convey real information
- verified facts only
- no invented quotes, fake awards, or unsupported performance numbers

### 5. Compose Around the Film

Map every chapter to the contact sheet. Place copy in actual negative space. Alternate layouts only when the footage supports it.

Use three layers:

1. **Film:** the canvas, always dominant
2. **Information:** headline, one supporting thought, useful metadata
3. **Interface:** progress, chapter state, and action

Avoid placing a translucent rectangle behind every piece of copy. Prefer precise text shadows, localized scrims, open grid lines, and thoughtful positioning.

Keep the opening clean. The film and main type should carry it. Keep the ending decisive with one action.

### 6. Build From the Starter

Save the finished site to:

```text
workspace/{YYYY-MM-DD}/animated-sites/{slug}/index.html
```

Update these starter areas:

- project metadata and page title
- font imports and type tokens
- palette tokens
- `FRAME_COUNT`, `SCROLL_HEIGHT`, and frame paths
- chapter elements and timing windows
- signature device and progress labels
- post-sequence editorial section
- CTA URL and accessible label

Keep these engine behaviors:

- critical frames load first, then the remaining frames in small batches
- nearest-loaded-frame fallback prevents blank canvas flashes
- cover rendering maintains aspect ratio
- target frame uses remapped scroll progress
- current frame follows the target with LERP smoothing
- chapter visibility is driven by un-smoothed remapped progress, before frame LERP
- scroll UI updates without layout reads inside the animation loop
- `prefers-reduced-motion` renders a stable frame and removes nonessential movement

### 7. Preview and Critique

Serve the folder over HTTP. Do not review by double-clicking the file.

```bash
cd "workspace/{YYYY-MM-DD}/animated-sites/{slug}"
python3 -m http.server 8080
```

Inspect at least:

- desktop opening, middle, and ending
- mobile opening and a dense chapter
- one slow scroll through every transition
- reduced-motion behavior
- keyboard focus on all links

Take screenshots and critique them as a design lead:

- Is the subject still the loudest element?
- Does the type belong to this subject?
- Does each chapter sit in real negative space?
- Is the signature device memorable but controlled?
- Can any decorative element be removed?
- Does mobile feel composed rather than collapsed?

Iterate until those answers are solid.

## Motion Engine

Keep the dwell-remap engine. It creates readable slow zones around chapter centers while preserving continuous playback between them.

```javascript
const DWELL_WIDTH = 0.04;
const DWELL_PEAK = 2.8;
const LERP_FACTOR = 0.11;
```

Align dwell centers with chapter centers, not their entry points. Keep the slowdown subtle. The viewer should feel pacing, not resistance.

Use hard-edged motion for the default design:

- clip-path reveals
- line sweeps
- controlled translate on one axis
- variable-font width changes when the typeface supports them
- opacity only as a supporting transition

Avoid default blur fades, springy movement, and scattered ambient animation.

## Visual Guardrails

Unless the brief explicitly asks for them, do not default to:

- Playfair Display, DM Sans, or a serif/sans “luxury” pairing
- glassmorphism panels
- floating particles
- purple-blue gradient glows
- film grain over the whole page
- a trailing custom cursor
- six identical left-aligned content blocks
- masonry galleries
- decorative numbered sections with no meaning

These devices are not forbidden. They need a subject-specific reason.

## Performance and Accessibility

- Use semantic headings and links.
- Maintain visible keyboard focus.
- Keep text contrast at WCAG AA or better.
- Cap canvas DPR at 2.
- Pause the draw loop when the page is hidden.
- Mark decorative UI `aria-hidden="true"`.
- Use `aria-live="polite"` for loader progress only if it does not become noisy.
- Keep touch targets at least 44px.
- Use a static poster-like composition for reduced motion.
- Do not autoplay audio.

## Output

```text
workspace/{YYYY-MM-DD}/animated-sites/{slug}/
├── frames/
│   ├── desktop/frame-0001.webp
│   ├── mobile/frame-0001.webp
│   └── manifest.json
└── index.html
```

At handoff, report:

- the preview file
- video duration, frame count, and payload sizes
- the design thesis in one sentence
- what was verified on desktop and mobile
- source links for any factual product copy

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank canvas | Serve through HTTP and verify frame paths and zero padding. |
| White flashes | Use nearest-loaded-frame fallback and draw the first critical frame early. |
| Animation stutters | Lower frame count, cap DPR, and avoid large DOM animations during canvas drawing. |
| Scroll feels sticky | Lower `DWELL_PEAK` or widen `DWELL_WIDTH`. |
| Text covers the subject | Recheck the contact sheet and move that chapter to a real negative-space zone. |
| Mobile crop loses the subject | Add a chapter-specific canvas focal point or export a mobile art-directed crop. |
| Payload is too large | Lower WebP quality first, then reduce frames. |
| Font fails to load | Keep a disciplined system sans fallback and avoid layout-dependent font metrics. |
