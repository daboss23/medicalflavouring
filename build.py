#!/usr/bin/env python3
"""Build the self-contained preview copy of the sales page.

Inlines everything under assets/ as data URIs and strips the document wrapper,
so the result can be published as a standalone artifact. Images are re-encoded
to WebP on the way in — the same bottle appears up to nine times on the page,
and each occurrence carries its own copy of the data URI.
"""
import base64
import io
import os
import re

from PIL import Image

MAX_H = 900       # taller than any rendering of these bottles on the page
QUALITY = 86

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'dist', 'mfs-ora-sales-page.html')
PREVIEW_TITLE = 'ORA® 6 + 1 Offer'


def data_uri(path):
    im = Image.open(path).convert('RGBA')
    if im.height > MAX_H:
        im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=QUALITY, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def main():
    src = open(SRC, encoding='utf-8').read()

    for name in sorted(os.listdir(os.path.join(ROOT, 'assets'))):
        src = src.replace('assets/' + name, data_uri(os.path.join(ROOT, 'assets', name)))

    head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
    body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
    font_link = re.search(r'<link href="https://fonts\.googleapis[^>]*>', head).group(0)
    style = re.search(r'<style>.*?</style>', head, re.S).group(0)

    frag = '\n'.join([
        '<title>%s</title>' % PREVIEW_TITLE,
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        font_link,
        style,
        body.strip(),
    ])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(frag)
    print('wrote %s (%.2f MB)' % (OUT, len(frag.encode('utf-8')) / 1048576))


if __name__ == '__main__':
    main()
