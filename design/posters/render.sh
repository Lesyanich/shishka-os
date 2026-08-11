#!/bin/bash
# Render the SHISHKA A3 item posters to print-ready PDF + on-screen PNG previews.
#
# WHY one PDF per variant: Chrome headless --print-to-pdf clips the bottom of the
# FIRST page in a multi-page document (same bug worked around in design/labels).
# Rendering each <section class="poster"> as its own single-page PDF always works,
# and separate files are what the print shop wants anyway.
#
# Requires: Google Chrome.  Usage: bash render.sh [file.html]
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="${1:-double-protein-a3.html}"

python3 - "$CHROME" "$SRC" <<'PY'
import re, sys, subprocess, os

chrome, src = sys.argv[1], sys.argv[2]
html = open(src).read()
stem = os.path.splitext(os.path.basename(src))[0]

head, tail = html.split('<body>', 1)[0] + '<body>', '</body>\n</html>'
sections = re.findall(r'<section class="poster.*?</section>', html, re.S)
if not sections:
    sys.exit('no <section class="poster"> found in ' + src)

# Screen mode centres the poster on a grey desk; for capture we want the poster
# alone, flush to the viewport, so the PNG is a pixel-exact crop of the artboard.
CAPTURE_CSS = '<style>body{background:#fff;padding:0;gap:0;display:block}</style>'

for i, sec in enumerate(sections, 1):
    # posters may carry a variant class (poster en / poster multi); single-variant
    # sheets just say class="poster" and are numbered instead.
    m = re.search(r'class="poster ([a-z0-9-]+)"', sec)
    suffix = m.group(1) if m else (str(i) if len(sections) > 1 else '')
    out = f'{stem}-{suffix}' if suffix else stem
    tmp = f'_{out}.html'
    open(tmp, 'w').write(head + CAPTURE_CSS + sec + tail)
    url = f'file://{os.getcwd()}/{tmp}'
    base = ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000',
            '--allow-file-access-from-files']

    subprocess.run([chrome, *base, '--no-pdf-header-footer', '--no-margins',
                    f'--print-to-pdf={out}.pdf', url], check=True, capture_output=True)
    # A3 @ 96dpi CSS px = 1123 x 1588; scale 2 gives a ~200dpi review PNG.
    subprocess.run([chrome, *base, '--window-size=1123,1588',
                    '--force-device-scale-factor=2', '--hide-scrollbars',
                    f'--screenshot={out}.png', url], check=True, capture_output=True)
    os.remove(tmp)
    print(f'  {out}.pdf   {out}.png')

print('done — A3 297x420mm, print at 100% / "actual size", no scaling.')
PY
