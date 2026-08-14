#!/usr/bin/env python3
"""NEURAL SIEGE — MHCP competition packager.

Assembles the modular dev sources (css/ + js/) into a single, readable,
unminified index.html, then packages it as a submission .zip with
index.html at the top level, per the MHCP Game Prototype rules:

  - single .zip, <= 35MB, index.html at the top level
  - all game code inline in index.html, unminified
  - no third-party libraries (pure HTML5 canvas — so no vendor/ folder)
  - no external network requests (everything is inline; verified below)

Usage: python3 tools/build_competition.py
Output: dist/index.html and dist/neural-siege-mhcp.zip
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP_NAME = "neural-siege-mhcp.zip"
MAX_ZIP_MB = 35

def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    # Inline the stylesheet in place of its <link> tag.
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    link_tag = '<link rel="stylesheet" href="css/style.css">'
    assert link_tag in html, "stylesheet link not found in index.html"
    html = html.replace(link_tag, "<style>\n" + css + "\n</style>")

    # Inline every js/*.js in place of its <script src> tag, keeping order.
    def inline_script(m):
        src = m.group(1)
        code = (ROOT / src).read_text(encoding="utf-8")
        banner = "/* " + "=" * 22 + " " + src + " " + "=" * 22 + " */"
        return "<script>\n" + banner + "\n" + code + "</script>"

    html, n = re.subn(r'<script src="(js/[\w.]+)"></script>', inline_script, html)
    assert n == len(list((ROOT / "js").glob("*.js"))), (
        f"inlined {n} scripts but js/ holds {len(list((ROOT / 'js').glob('*.js')))}"
    )

    # Guard: the assembled page must reference nothing external.
    for pat in (r'src="http', r'href="http', r"@import", r"url\(\s*['\"]?http"):
        assert not re.search(pat, html), f"external reference matches {pat!r}"

    DIST.mkdir(exist_ok=True)
    out_html = DIST / "index.html"
    out_html.write_text(html, encoding="utf-8")

    out_zip = DIST / ZIP_NAME
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(out_html, "index.html")  # top level, not inside a folder

    mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"built {out_html.relative_to(ROOT)} ({out_html.stat().st_size:,} bytes, {n} scripts inlined)")
    print(f"built {out_zip.relative_to(ROOT)} ({mb:.2f} MB / {MAX_ZIP_MB} MB limit)")
    if mb > MAX_ZIP_MB:
        sys.exit("ZIP EXCEEDS SIZE LIMIT")

if __name__ == "__main__":
    main()
