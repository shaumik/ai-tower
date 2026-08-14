#!/usr/bin/env python3
"""NEURAL SPIRE — MHCP competition packager.

Assembles the modular dev sources (css/ + js/) into a single, readable,
unminified index.html, then packages the submission .zip per the MHCP
Game Prototype rules:

  - single .zip, <= 35MB, index.html at the top level
  - all of our own game code inline in index.html, unminified
  - third-party libraries (Three.js) in a vendor/ folder inside the zip,
    referenced with relative paths — NOT embedded in index.html
  - no external network requests (verified below)

Usage: python3 tools/build_competition.py
Output: dist/index.html and dist/neural-spire-mhcp.zip
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP_NAME = "neural-spire-mhcp.zip"
MAX_ZIP_MB = 35

def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    # Inline the stylesheet in place of its <link> tag.
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    link_tag = '<link rel="stylesheet" href="css/style.css">'
    assert link_tag in html, "stylesheet link not found in index.html"
    html = html.replace(link_tag, "<style>\n" + css + "\n</style>")

    # Inline every js/*.js in place of its <script src> tag, keeping order.
    # The vendor/three.min.js tag is left as-is: libraries stay in vendor/.
    def inline_script(m):
        src = m.group(1)
        code = (ROOT / src).read_text(encoding="utf-8")
        banner = "/* " + "=" * 22 + " " + src + " " + "=" * 22 + " */"
        return "<script>\n" + banner + "\n" + code + "</script>"

    html, n = re.subn(r'<script src="(js/[\w.]+)"></script>', inline_script, html)
    n_js = len(list((ROOT / "js").glob("*.js")))
    assert n == n_js, f"inlined {n} scripts but js/ holds {n_js}"
    assert '<script src="vendor/three.min.js"></script>' in html, "vendor script tag missing"

    # Guard: the assembled page must reference nothing external.
    for pat in (r'src="http', r'href="http', r"@import", r"url\(\s*['\"]?http"):
        assert not re.search(pat, html), f"external reference matches {pat!r}"

    DIST.mkdir(exist_ok=True)
    out_html = DIST / "index.html"
    out_html.write_text(html, encoding="utf-8")

    out_zip = DIST / ZIP_NAME
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(out_html, "index.html")                       # top level, not inside a folder
        z.write(ROOT / "vendor" / "three.min.js", "vendor/three.min.js")
        z.write(ROOT / "vendor" / "THREE-LICENSE", "vendor/THREE-LICENSE")

    mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"built {out_html.relative_to(ROOT)} ({out_html.stat().st_size:,} bytes, {n} scripts inlined)")
    print(f"built {out_zip.relative_to(ROOT)} ({mb:.2f} MB / {MAX_ZIP_MB} MB limit)")
    if mb > MAX_ZIP_MB:
        sys.exit("ZIP EXCEEDS SIZE LIMIT")

if __name__ == "__main__":
    main()
