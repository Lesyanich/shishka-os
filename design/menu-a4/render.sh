#!/bin/bash
# Build + render the printed A4 menu to a print-ready PDF.
#
# WHY per-page render: Chrome headless --print-to-pdf clips the bottom rows of
# the FIRST page of a multi-page document. So each A4 page is rendered as its
# own single-page PDF (which always comes out right) and merged afterwards.
#
# WHY file:// and not a local http server: the logo is at ../labels/, one level
# above this folder, so any server rooted here answers 404 and the header prints
# its alt text instead of the mark. Rendering from disk is what makes the path
# resolve. A PDF built over http looks right in the browser tab and wrong on
# paper, which is the worst way for this to fail.
#
# Requires: Google Chrome, python3 + PIL + pypdf.
# Usage: bash render.sh [build_menu.py flags...]
#        SRC=sauce-sheet.html OUT=shishka-sauces-A4.pdf bash render.sh --only-sauces -o sauce-sheet.html
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

python3 build_menu.py "$@"

python3 - "$CHROME" "${SRC:-menu-print.html}" "${OUT:-shishka-menu-A4.pdf}" <<'PY'
import re, sys, subprocess, os, glob
from pypdf import PdfWriter, PdfReader

chrome, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(src).read()

# Split into <div class="page">…</div> blocks. The pages are siblings at one
# nesting level, so match each opening tag up to the matching close by counting.
m = re.search(r'(.*?)(<div class="page".*</div>)\s*(</body>.*)', html, re.S)
head, body, tail = m.group(1), m.group(2), m.group(3)

pages, depth, start = [], 0, None
for tok in re.finditer(r'<div\b[^>]*>|</div>', body):
    if tok.group(0).startswith('</'):
        depth -= 1
        if depth == 0:
            pages.append(body[start:tok.end()])
    else:
        if depth == 0:
            start = tok.start()
        depth += 1

print(f"{len(pages)} pages to render")

# Temporaries are namespaced per run. They used to be plain _pgNN.*, and a
# second render started in this folder while the first was still going wiped
# the first one's pages at its cleanup step — the merge then died on a file
# that had existed a second earlier. The sauce sheet and the full menu are
# exactly the pair someone will run at the same time.
tmp = f'_pg{os.getpid()}'

pdfs = []
for i, p in enumerate(pages, 1):
    fn_html, fn_pdf = f'{tmp}_{i:02d}.html', f'{tmp}_{i:02d}.pdf'
    # One page per file, and body padding removed so the sheet sits at 0,0.
    open(fn_html, 'w').write(
        head + '<style>body{background:#fff;padding:0}</style>\n' + p + '\n' + tail)
    subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--no-margins', '--virtual-time-budget=20000',
                    f'--print-to-pdf={fn_pdf}', f'file://{os.getcwd()}/{fn_html}'],
                   check=True, capture_output=True)
    pdfs.append(fn_pdf)
    print(f"  page {i:02d}", flush=True)

w = PdfWriter()
for f in pdfs:
    w.append(PdfReader(f))
with open(out, 'wb') as fh:
    w.write(fh)

for f in glob.glob(f'{tmp}_*.html') + glob.glob(f'{tmp}_*.pdf'):
    os.remove(f)

r = PdfReader(out)
box = r.pages[0].mediabox
print(f"OK  {out}  pages={len(r.pages)}  "
      f"{float(box.width)/72*25.4:.1f} x {float(box.height)/72*25.4:.1f} mm")
PY
