"""Subsets MaruBuri Bold to the title glyphs, renames it (OFL Reserved Font Name rule) and prints a base64 woff2.
Usage: python tools/subset_font.py <MaruBuri-Bold.woff2> <out.b64>"""
import base64, io, sys
from fontTools import subset
from fontTools.ttLib import TTFont

TEXT = '새벽곰'
NEW_FAMILY = 'DawnTitleSerif'
src, out = sys.argv[1], sys.argv[2]
font = TTFont(src)
opts = subset.Options()
opts.flavor = 'woff2'
opts.name_IDs = ['*']
opts.layout_features = []
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(text=TEXT)
sub.subset(font)
name = font['name']
copyright_ = name.getDebugName(0)
for rec in list(name.names):
    if rec.nameID not in (0,):
        name.removeNames(nameID=rec.nameID)
for nid, val in [(1, NEW_FAMILY), (2, 'Regular'), (3, NEW_FAMILY + '-Subset-1.0'), (4, NEW_FAMILY), (5, 'Version 1.000; subset of MaruBuri Bold'), (6, NEW_FAMILY),
                 (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1. Modified (subset + renamed) from MaruBuri Bold.'),
                 (14, 'https://openfontlicense.org')]:
    name.setName(val, nid, 3, 1, 0x409)
buf = io.BytesIO()
font.flavor = 'woff2'
font.save(buf)
data = buf.getvalue()
open(out, 'w').write(base64.b64encode(data).decode())
print('glyphs:', font.getGlyphOrder(), 'bytes:', len(data), 'copyright:', copyright_.encode('ascii', 'replace').decode())
