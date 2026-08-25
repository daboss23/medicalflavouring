---
name: anime-js
description: Animate DOM, SVG, and JS objects with anime.js v4 (the `animejs` package) — the modern named-import API (`animate`, `createTimeline`, `stagger`, `createScope`, `createDraggable`, `onScroll`, `svg.*`, `utils.*`). Use when the user wants a lightweight animation library instead of GSAP, asks for anime.js specifically, or needs tweens, timelines, staggered reveals, scroll-triggered motion, draggables, SVG line-drawing/morph/motion-path, or spring physics in vanilla JS, React, Vue, or Svelte. v4 is a hard break from v3 — do NOT use the old default `anime({...})` call. For GSAP, use the gsap-* skills instead.
---

# anime.js v4

Lightweight (~9 kB) JS animation engine. Package: **`animejs`** (v4.x). v4 replaced v3's
single default `anime()` function with **tree-shakeable named exports**. If you see
`import anime from 'animejs'` and `anime({...})`, that's v3 — rewrite it.

```bash
npm install animejs
```

```js
import { animate, createTimeline, stagger, utils } from 'animejs';
```

CDN / ESM: `import { animate } from 'https://cdn.jsdelivr.net/npm/animejs/+esm'`.

## Core: `animate(targets, params)`

`targets` = CSS selector, Element, NodeList, or a plain JS object. Any animatable
property goes at the top level; timing/easing/callbacks are reserved keys.

```js
animate('.box', {
  x: 320,                 // transform shorthand (translateX). Also y, rotate, scale...
  rotate: { from: -180 }, // per-property {from,to} or just a value (the `to`)
  backgroundColor: '#ff3b30',
  duration: 800,          // ms
  delay: stagger(100),    // function-based values per element
  ease: 'outElastic(1, .4)',
  loop: 3,                // or true for infinite
  alternate: true,        // yoyo
  onComplete: self => console.log('done', self.currentTime),
});
```

Key reserved params: `duration`, `delay`, `ease`, `loop`, `alternate`, `reversed`,
`autoplay`, `composition`, and callbacks `onBegin`/`onUpdate`/`onComplete`/`onLoop`/`onRender`.
`animate()` returns a **JSAnimation** with `.play() .pause() .restart() .reverse()
.seek(t) .then()` and `.completed` (a Promise).

### Keyframes
```js
animate('.box', {
  keyframes: [ { x: 100 }, { y: 100 }, { x: 0 }, { y: 0 } ],
  duration: 2000,
  ease: 'inOut(3)',
});
// or per-property array: translateX: [0, 100, 0]
```

## Easing

Strings: `'linear'`, `'inQuad'`, `'outCubic'`, `'inOutQuart'`, `'outElastic(amplitude, period)'`,
`'inOut(power)'`, `'outBack'`, `'steps(5)'`, `'cubicBezier(.5,0,.5,1)'`, `'irregular(...)'`.
Physics spring: `import { createSpring } from 'animejs'; ease: createSpring({ stiffness: 120, damping: 10, mass: 1 })`.

## Stagger — `stagger(value, options?)`

```js
import { stagger } from 'animejs';
animate('.grid-item', {
  scale: [0, 1],
  delay: stagger(80, { from: 'center', grid: [10, 6], ease: 'outQuad' }),
});
```
`from`: `'first' | 'last' | 'center' | index`. `grid: [cols, rows]` for 2-D ripples.
Range form: `stagger(['-10deg', '10deg'])` distributes values across elements.

## Timeline — `createTimeline(defaults?)`

```js
import { createTimeline, stagger } from 'animejs';
const tl = createTimeline({ defaults: { duration: 600, ease: 'outExpo' } });
tl.add('.a', { x: 200 })
  .add('.b', { y: 100 }, '-=200')     // position: relative to previous end
  .add('.c', { opacity: [0, 1] }, 500) // absolute time
  .label('mid', 800)
  .add('.d', { scale: [0, 1] }, 'mid');
tl.play();   // .pause() .seek() .reverse() .then()
```
Position arg accepts absolute ms, `'+=N'`/`'-=N'`, a label, or `'<'`/`'<<'` (with previous).

## Scroll-triggered — `onScroll(options)`

Pass as a value to `autoplay` (or drive progress via `sync`):

```js
import { animate, onScroll } from 'animejs';
animate('.reveal', {
  y: [40, 0], opacity: [0, 1],
  autoplay: onScroll({
    target: '.reveal',
    enter: 'bottom top',   // triggerEdge targetEdge
    leave: 'top bottom',
    sync: true,            // scrub progress to scroll (like GSAP scrub)
    // container: '.scroller', debug: true,
  }),
});
```

## SVG — `svg.*`

```js
import { animate, svg } from 'animejs';
// Line drawing (stroke-dashoffset handled for you):
animate(svg.createDrawable('.path'), { draw: '0 1', duration: 1500, ease: 'inOutQuad' });
// Motion path — move an element along a path:
const { translateX, translateY, rotate } = svg.createMotionPath('#track');
animate('.dot', { translateX, translateY, rotate, duration: 2000, loop: true });
// Shape morph (compatible paths):
animate('#shape', { points: svg.morphTo('#target-shape'), duration: 800 });
```

## Draggable — `createDraggable(target, options)`

```js
import { createDraggable, createSpring } from 'animejs';
createDraggable('.card', {
  container: '.bounds',          // constrain
  x: { snap: 40 }, y: false,     // axis config; false to lock an axis
  releaseEase: createSpring({ stiffness: 80 }),
  onGrab: () => {}, onRelease: () => {},
});
```

## Scope — `createScope` (React/Vue/Svelte cleanup + responsive)

Scope registers everything created inside it so ONE `.revert()` tears it all down —
essential for component unmount and for media-query-conditional animations.

```js
import { createScope, animate, utils } from 'animejs';

// React:
useEffect(() => {
  const scope = createScope({ root: rootRef }).add(self => {
    animate('.box', { x: 100, loop: true, alternate: true });
    self.add('pulse', () => animate('.box', { scale: 1.2 })); // callable method
    utils.set('.box', { opacity: 1 });
  });
  return () => scope.revert();   // cleanup — reverts all anims + styles
}, []);
```

Responsive: `createScope({ mediaQueries: { sm: '(max-width: 640px)' } }).add((self) => { if (self.matches.sm) {...} })`.

## utils

`utils.$(selector)` (query), `utils.set(t, props)` (instant set), `utils.remove(t)` (stop),
`utils.random(min, max, decimals?)`, `utils.clamp`, `utils.round`, `utils.snap`,
`utils.mapRange`, `utils.interpolate`, `utils.get(el, prop)`. Chainable modifiers:
`utils.round(2)` returns a function usable as a `modifier`.

## Also available
- `createTimer({ duration, loop, onUpdate })` — a pure clock, no target.
- `createAnimatable(target, { x: 500, ...})` — cheap, reusable setters for cursor-follow / high-frequency updates.
- `text.split` / `splitText` — split into chars/words/lines for text animation.
- `waapi.animate(...)` — same API backed by the native Web Animations API (offloads to compositor).

## Gotchas
- **v4 ≠ v3.** No default export; no `anime.timeline()`; `translateX`→ use `x`; `elasticity`
  → use `outElastic(amp, period)` string or `createSpring`.
- Always `scope.revert()` (or `animation.pause()` + `utils.remove`) on component unmount.
- Respect `prefers-reduced-motion` — gate non-essential motion (matches this repo's convention).
- This repo already standardizes on **GSAP** (`gsap-*` skills) for the T-Apex site; prefer anime.js
  only when explicitly asked, or for a self-contained widget — don't mix both in one component.
