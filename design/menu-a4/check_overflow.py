#!/usr/bin/env python3
"""Report, per page, how close the last row gets to the footer rule.

    python3 check_overflow.py menu-print.html

Prints one `page:px` pair per page. The number is the gap in CSS px between the
bottom of the lowest kcal/price chip (or sauce cell) and the top of the footer's
rule: NEGATIVE is clearance, POSITIVE means the chip is printing THROUGH the
rule. Anything >= 0 is a bug.

Why this exists. A .page is a fixed 297mm box with overflow:hidden and the dish
rows are flex:1 1 auto, so a page that is over budget does not reflow, wrap or
error — it silently clips the bottom of the last dish and the PDF still builds,
still has the right page count, and still passes every text-extraction check.
The only way to see it is to look at all eighteen pages, which nobody does. The
4-up dense sheets had been shipping clipped for two builds before the CEO caught
it by eye, and page 12 (the dips) was clipped the whole time and never reported.

Run this after any change to sample-page.html's metrics or to how many dishes
land on a sheet. It costs one Chrome load, against ~12 minutes for a render.

For calibration: a comfortably empty sheet reads about -80, a full three-dish
sheet about -5, and the tightest page that has ever shipped read -0.6.
"""
import re
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Measured in the page, not from the HTML: the whole point is what the layout
# engine actually did with the content, which no amount of reading the markup
# will tell you. The result is handed back through a div because --dump-dom is
# the only channel headless Chrome gives us without a driver.
PROBE = """<script>window.addEventListener('load',function(){
 var out=[];
 document.querySelectorAll('.page').forEach(function(p,i){
   var f=p.querySelector('.foot').getBoundingClientRect().top;
   var worst=-1e9;
   p.querySelectorAll('main .meta, main .sauce').forEach(function(m){
     worst=Math.max(worst, m.getBoundingClientRect().bottom - f);
   });
   out.push((i+1)+':'+worst.toFixed(1));
 });
 var d=document.createElement('div'); d.id='MEASURE';
 d.textContent=out.join(' '); document.body.appendChild(d);
});</script>"""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1]).read_text()
    # Written beside the real page so the relative photo paths still resolve —
    # measured with the images missing, every row comes out short and the
    # report is quietly wrong in the safe direction.
    probe_file = HERE / "_overflow-probe.html"
    probe_file.write_text(src.replace("</head>", PROBE + "</head>"))
    try:
        dom = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--virtual-time-budget=15000",
             "--window-size=1240,1754", "--dump-dom", probe_file.as_uri()],
            capture_output=True, text=True).stdout
    finally:
        probe_file.unlink(missing_ok=True)

    m = re.search(r'<div id="MEASURE">(.*?)</div>', dom, re.S)
    if not m:
        sys.exit("no measurement came back — Chrome did not run the probe")

    bad = []
    for pair in m.group(1).split():
        page, gap = pair.split(":")
        if float(gap) >= 0:
            bad.append((page, gap))
    print(m.group(1))
    if bad:
        sys.exit("\nCLIPPED: " + ", ".join(f"page {p} by {g}px" for p, g in bad))
    print("\nall pages clear of the footer rule")


if __name__ == "__main__":
    main()
