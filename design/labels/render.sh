#!/bin/bash
# Build + render the Shishka juice-label print sheets to a print-ready A4 PDF.
#
# WHY per-sheet render: Chrome headless --print-to-pdf has a bug where the FIRST
# page of a multi-page document clips its bottom rows. So we render each A4 sheet
# as its OWN single-page PDF (always renders correctly) and merge them with PyMuPDF.
#
# Requires: Google Chrome, python3 + PyMuPDF (fitz).  Usage: bash render.sh
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

python3 build_sheets.py

python3 - "$CHROME" <<'PY'
import re, sys, subprocess, os, fitz
chrome = sys.argv[1]
html = open('juice-labels-print.html').read()
m = re.search(r'(.*?)(<section class="sheet".*</section>)\s*(</body>.*)', html, re.S)
head, body, tail = m.group(1), m.group(2), m.group(3)
secs = re.findall(r'<section class="sheet".*?</section>', body, re.S)

pdfs = []
for i, s in enumerate(secs, 1):
    fn_html, fn_pdf = f'_sheet{i}.html', f'_sheet{i}.pdf'
    open(fn_html, 'w').write(head + s + '\n' + tail)
    subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--no-margins', '--virtual-time-budget=5000',
                    f'--print-to-pdf={fn_pdf}', f'file://{os.getcwd()}/{fn_html}'],
                   check=True, capture_output=True)
    pdfs.append(fn_pdf)

out = fitz.open()
for p in pdfs:
    out.insert_pdf(fitz.open(p))
out.save('shishka-juice-labels-A4.pdf')
out.close()

for i in range(1, len(secs) + 1):
    os.remove(f'_sheet{i}.html'); os.remove(f'_sheet{i}.pdf')

d = fitz.open('shishka-juice-labels-A4.pdf')
print(f"OK  shishka-juice-labels-A4.pdf  pages={d.page_count}")
d.close()
PY

# single-sticker reference (single page, no multi-page bug)
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --no-margins --virtual-time-budget=5000 \
  --print-to-pdf="shishka-juice-sticker-single.pdf" "file://$PWD/juice-label-single.html" >/dev/null 2>&1
echo "OK  shishka-juice-sticker-single.pdf"
