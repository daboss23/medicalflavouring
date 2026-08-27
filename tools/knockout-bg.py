#!/usr/bin/env python3
"""Make a product shot's backdrop transparent without eating the product.

The ORA bottles are white on white, so a global "delete every light pixel" pass
would hollow the bottles out along with the backdrop. This floods inward from
the edges instead: only light pixels reachable from outside the product are
cleared, so the bottles, their caps and their labels survive untouched.

    python3 tools/knockout-bg.py assets/in.png assets/out.png [tolerance] [min-island]
"""
import sys
from collections import deque
from PIL import Image


def knockout(src, dst, tolerance=2, min_area=400):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_backdrop(p):
        r, g, b, a = p
        return a > 0 and r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance

    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            queue.append((x, y))

    cleared = 0
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h):
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_backdrop(px[x, y]):
            continue
        px[x, y] = (255, 255, 255, 0)
        cleared += 1
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    speckles = despeckle(im, min_area=min_area)

    # Trim the now-empty margin so the art fills its box rather than floating.
    box = im.getbbox()
    if box:
        im = im.crop(box)

    im.save(dst)
    print(
        f"{src} -> {dst}: cleared {cleared:,} px, despeckled {speckles:,} px, "
        f"cropped to {im.size[0]}x{im.size[1]}"
    )


def despeckle(im, min_area=400):
    """Clear stranded islands of opacity left behind in the backdrop.

    Product photography is compression-noisy: pixels a shade darker than the
    backdrop threshold survive the flood as white flecks scattered across the
    empty area. They are tiny and disconnected, where the product is one large
    mass — so anything below `min_area` goes.
    """
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    removed = 0

    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            component = []
            stack = [(sx, sy)]
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        i = ny * w + nx
                        if not seen[i] and px[nx, ny][3] != 0:
                            seen[i] = 1
                            stack.append((nx, ny))
            if len(component) < min_area:
                for x, y in component:
                    px[x, y] = (255, 255, 255, 0)
                removed += len(component)
    return removed


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    knockout(
        sys.argv[1],
        sys.argv[2],
        int(sys.argv[3]) if len(sys.argv) > 3 else 2,
        int(sys.argv[4]) if len(sys.argv) > 4 else 400,
    )
