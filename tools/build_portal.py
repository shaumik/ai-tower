#!/usr/bin/env python3
"""Build a portal-ready zip of NEURAL SIEGE for CrazyGames or GameDistribution.

Usage:
    python3 tools/build_portal.py crazygames
    python3 tools/build_portal.py gamedistribution [GD_GAME_ID]

Output: dist/neural-siege-<provider>.zip

Portal builds differ from the GitHub Pages build:
  - the provider's ad SDK script is injected
  - window.__AD_PROVIDER is set so js/ads.js activates that provider
  - the service worker / PWA manifest are stripped (portals run in iframes
    on their CDN; offline caching there causes stale-build QA failures)
"""
import os, re, shutil, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE = ['index.html', 'css', 'js', 'icons']

SDK_TAGS = {
    'crazygames': '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    'gamedistribution': '''<script>
window.GD_OPTIONS = {
  gameId: "%GD_GAME_ID%",
  onEvent: function () {},
};
(function(d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) return;
  js = d.createElement(s); js.id = id;
  js.src = 'https://html5.api.gamedistribution.com/main.min.js';
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'gamedistribution-jssdk'));
</script>''',
}


def build(provider, gd_id='PASTE-YOUR-GD-GAME-ID'):
    assert provider in SDK_TAGS, 'provider must be crazygames or gamedistribution'
    dist = os.path.join(ROOT, 'dist', 'portal-' + provider)
    shutil.rmtree(dist, ignore_errors=True)
    os.makedirs(dist)

    for item in INCLUDE:
        src = os.path.join(ROOT, item)
        dst = os.path.join(dist, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    idx_path = os.path.join(dist, 'index.html')
    html = open(idx_path).read()

    # strip PWA bits (manifest link; SW registration is skipped via flag below)
    html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)

    # inject provider flag + SDK right after <head>
    sdk = SDK_TAGS[provider].replace('%GD_GAME_ID%', gd_id)
    inject = ('<script>window.__AD_PROVIDER="%s";window.__NO_SW=1;</script>\n%s\n'
              % (provider, sdk))
    html = html.replace('<head>', '<head>\n' + inject, 1)
    open(idx_path, 'w').write(html)

    out = os.path.join(ROOT, 'dist', 'neural-siege-%s.zip' % provider)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _dirs, files in os.walk(dist):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, dist))
    print('built', out)


if __name__ == '__main__':
    prov = sys.argv[1] if len(sys.argv) > 1 else 'crazygames'
    gid = sys.argv[2] if len(sys.argv) > 2 else 'PASTE-YOUR-GD-GAME-ID'
    build(prov, gid)
