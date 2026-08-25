# Precision Editorial Visual System

Use this reference to design scroll-sequence sites that feel authored and current. It is a starting grammar, not a fixed theme.

## Contents

1. Core idea
2. Trackline automotive direction
3. Typography
4. Layout and chapter composition
5. Signature devices
6. Motion language
7. Post-sequence section
8. Mobile art direction
9. Anti-template review

## 1. Core Idea

Treat the video as moving product photography. Interface elements should behave like useful markings on a camera, instrument, garment pattern, architectural drawing, or other artifact from the subject's world.

Build one visual sentence:

> This is a film about **[subject]**, shown through the visual language of **[specific artifact or system]**.

Examples:

- a sports car shown through track telemetry and homologation markings
- a watch shown through movement diagrams and calibration marks
- architecture shown through survey lines and material annotations
- fashion shown through pattern-cutting marks and editorial folios
- software shown through live system state and command feedback

The artifact gives the structure a reason to exist.

## 2. Trackline Automotive Direction

Use Trackline when the clip centers on a performance car, motorcycle, racing object, or engineered machine.

### Character

- precise rather than futuristic
- athletic rather than aggressive
- premium through proportion and control
- rooted in real instrumentation, not neon sci-fi panels

### Suggested Palette

Sample the film first. This fallback palette suits dark automotive footage:

```css
:root {
  --carbon: #080a09;
  --paper: #f1f0e9;
  --alloy: #a8aca8;
  --track: #414541;
  --heritage: #d1ad67;
  --signal: #e23b2f;
  --petrol: #12372d;
}
```

Use `--signal` for active state and safety feedback. Use `--heritage` for progress and authored emphasis. Do not fill large areas with both.

### Structural Vocabulary

- frame numbers
- clip duration
- chapter state
- horizontal progress rail
- alignment ticks
- model or object code
- a factual year or generation marker

These labels must tell the viewer where they are or what they are seeing.

## 3. Typography

The default is a modern grotesk with a useful width axis plus a quiet monospace face.

Recommended open-source pairings:

1. `Archivo` variable + `IBM Plex Mono`
2. `Roboto Flex` + `Roboto Mono`
3. `Barlow Condensed` + `Manrope`
4. `Anybody` variable + `Source Code Pro`

Choose based on the subject. Do not use a condensed face for paragraphs.

### Roles

- **Display:** 64-180px desktop, 52-88px mobile, 650-850 weight, -0.045em to -0.02em tracking
- **Deck:** 22-42px, medium weight, compact leading
- **Body:** 14-18px, 1.45-1.65 line-height, 45-68 characters wide
- **Data:** 10-12px mono, uppercase only when the tokens are genuinely codes

Variable width is a signature opportunity. Animate a display word from narrow to normal as the chapter enters. Keep the movement slow enough to read.

Avoid italic display styling as an automatic luxury cue. Avoid tracking body copy widely.

## 4. Layout and Chapter Composition

Build on a 12-column grid with outer gutters of `clamp(20px, 4vw, 72px)`. Allow the video subject to break the grid visually.

Map chapter layouts to the contact sheet. Useful compositions:

### A. Masthead

```text
+------------------------------------------------+
| code                                      meta |
|                                                |
| HUGE SUBJECT                                   |
| SHORT IDEA                                     |
|                                                |
| progress rail ===============================> |
+------------------------------------------------+
```

### B. Side Annotation

```text
+------------------------------------------------+
|                         | label                |
|        SUBJECT          | HEADLINE             |
|                         | short supporting line|
|                         | factual annotation   |
+------------------------------------------------+
```

### C. Open Corner

```text
+------------------------------------------------+
| headline                                       |
| deck                                           |
|                                                |
|                   SUBJECT                      |
|                                      data rail |
+------------------------------------------------+
```

### D. Split Statement

```text
+------------------------------------------------+
| FIRST WORDS                                    |
|                                                |
|                   SUBJECT                      |
|                                  LAST WORDS    |
+------------------------------------------------+
```

Use Split Statement at most once. It depends on a stable central subject.

### E. Final Action

```text
+------------------------------------------------+
|                                                |
| ONE DECISIVE LINE                              |
| short action context              [ ACTION -> ]|
|                                                |
+------------------------------------------------+
```

Do not wrap every composition in a card. The page is already a frame.

## 5. Signature Devices

Choose one. A second device should be functional and quiet.

### Telemetry Rail

A fixed bottom rail shows scroll progress, current frame, total frames, and the current chapter. It makes the interaction learnable and ties the site to motion capture.

### Variable-Width Wordmark

A main word changes width slightly with effective progress. This echoes acceleration without moving the word across the screen.

### Object Index

A large factual code, race number, material code, or model identifier sits behind the information layer. Use outline type or low-contrast fill. It must come from the subject.

### Moving Crop Mark

One corner or baseline marker follows the subject's approximate screen position across chapters. Best for clean studio rotations.

Do not combine all four.

## 6. Motion Language

The canvas supplies continuous motion. DOM motion should be sparse and orthogonal.

### Entry

- reveal overflow-hidden text from below
- extend a rule from 0 to 100%
- move data labels 12-24px on one axis
- change variable font width from 78 to 100

### Exit

- reverse the rule
- clip the text upward
- reduce opacity near the end of the timing window

### Timing

- 500-850ms for chapter entry
- 250-450ms for utility state
- ease: `cubic-bezier(.22, 1, .36, 1)`

Avoid blur transitions. They soften the engineered visual language and can be expensive during scroll.

## 7. Post-Sequence Section

Do not default to a masonry gallery. Use an editorial contact sheet that makes the sequence itself visible:

- one large selected frame
- three to five smaller indexed frames
- one short statement
- one factual note or CTA

Keep frame numbers connected to the actual files. Let images touch the grid or sit behind rules. Use square corners unless the subject calls for another geometry.

## 8. Mobile Art Direction

Mobile is not a scaled desktop layout.

- keep headlines under four lines
- move body copy near the bottom safe area
- collapse the telemetry rail to progress, chapter, and frame count
- hide secondary codes before shrinking them below 10px
- keep the subject's focal point visible with per-chapter canvas positions when needed
- use a shorter scroll height if the sequence feels exhausting on touch
- test at 390x844 and one smaller width

## 9. Anti-Template Review

Before handoff, answer these without hedging:

1. What exact detail from the footage shaped the palette?
2. What exact artifact from the subject shaped the interface?
3. Which chapter layout could not work with an unrelated video?
4. Is every label informative?
5. Did we use one signature idea or stack several effects?
6. Would removing any overlay make the film stronger?
7. Does the typography feel intentional at both 390px and 1440px?

If the answers are vague, redesign before polishing.
