#!/usr/bin/env python3
"""Build the self-contained preview copy of the sales page.

Inlines everything under assets/ as data URIs and strips the document wrapper,
so the result can be published as a standalone artifact.
"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'dist', 'mfs-ora-sales-page.html')
PREVIEW_TITLE = 'ORA® 6 + 1 Offer'


def data_uri(path):
    with open(path, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


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
