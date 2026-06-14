#!/usr/bin/env python3
"""Generate the A4 print sheet for Shishka juice labels.
14-up per A4 (2 cols x 7 rows), each slot 105 x 42.43mm (exact 7-division = die-cut pitch).
Portrait label (42.4x105) rotated 90deg + scaled into each landscape slot (absolute coords).
2-colour print: black + yellow torn-marker highlight behind the name.
Logo embedded as base64 -> self-contained file.
NOTE: build the final PDF with render.sh (per-sheet render avoids Chrome's first-page clip bug).
"""
import base64, pathlib

HERE = pathlib.Path(__file__).parent
LOGO = "shishka-logo-color.png"   # relative path; render.sh runs Chrome via file:// so it loads from this folder

# ---- juice data (КБЖУ per 100 ml — vetted reference values; DB stores per-serving = these ×2.5) ----
# emoji = fruit icon shown before the name.
J = {
    "orange":    dict(emoji="🍊", name="Fresh Orange Juice",   price="฿100", ing="Orange.",
                      n=("45","0.7","10.4","0.2")),
    "carrot":    dict(emoji="🥕", name="Fresh Carrot Juice",   price="฿80",  ing="Carrot.",
                      n=("40","0.9","9.3","0.2")),
    "glow":      dict(emoji="✨", name="Glow Juice",           price="฿100", ing="Carrot, orange, ginger, turmeric.",
                      n=("43","0.8","10.0","0.2")),
    "pineapple": dict(emoji="🍍", name="Fresh Pineapple Juice",price="฿90",  ing="Pineapple.",
                      n=("53","0.4","12.9","0.1")),
    "guava":     dict(emoji="🍈", name="Fresh Guava Juice",    price="฿90",  ing="Guava.",
                      n=("50","0.8","11.5","0.3")),
    # other juices (not in this print run, ready for next time)
    "pomegranate":dict(emoji="🍷", name="Fresh Pomegranate Juice", price="—", ing="Pomegranate.",
                      n=("65","0.4","16.0","0.3")),
    "coconut":   dict(emoji="🥥", name="Fresh Coconut Juice",  price="฿80",  ing="Young coconut water.",
                      n=("18","0.5","3.6","0.2")),
    "green_detox":dict(emoji="🥬", name="Green Detox Juice",   price="฿120", ing="Cucumber, apple, kale, lime, ginger.",
                      n=("30","0.9","6.5","0.2")),
    "vitality":  dict(emoji="🟣", name="Vitality Juice",       price="฿120", ing="Beetroot, carrot, apple, ginger.",
                      n=("45","1.0","10.8","0.2")),
}

# ---- fill order, column-major (Orange6, Carrot6, Glow6, Pineapple5, Guava5 = 28) ----
seq = ["orange"]*6 + ["carrot"]*6 + ["glow"]*6 + ["pineapple"]*5 + ["guava"]*5
PER_SHEET = 14
sheets = [seq[i:i+PER_SHEET] for i in range(0, len(seq), PER_SHEET)]

def label_html(key):
    j = J[key]
    e,p,c,f = j["n"]
    return f'''<div class="label">
  <img class="logo" src="{LOGO}" alt="Shishka Healthy Kitchen">
  <div class="logo-rule"></div>
  <div class="pname">{j["emoji"]} {j["name"]}</div>
  <div class="tagline">100% cold-pressed · no added sugar</div>
  <div class="sp"></div>
  <div class="pricebar">
    <div class="cell vol"><span class="lab">Volume</span><span class="num">250 ml</span></div>
    <div class="cell price"><span class="lab">Price</span><span class="num">{j["price"]}</span></div>
  </div>
  <div class="hr"></div>
  <div class="ingredients"><b>Ingredients</b>{j["ing"]}</div>
  <div class="nutri">
    <div class="nhead">Nutrition · per 100 ml</div>
    <div class="ncells">
      <div class="ncell"><span class="v">{e}</span><span class="k">kcal</span></div>
      <div class="ncell"><span class="v">{p}</span><span class="k">prot·g</span></div>
      <div class="ncell"><span class="v">{c}</span><span class="k">carb·g</span></div>
      <div class="ncell"><span class="v">{f}</span><span class="k">fat·g</span></div>
    </div>
  </div>
  <div class="sp sp-bottom"></div>
  <footer class="footer">
    <div class="storage">Keep refrigerated 0–4°C · Shake well · Drink fresh</div>
    <div class="datefield"><span class="dl">Packed</span><span class="line"></span></div>
    <div class="datefield"><span class="dl">Best before</span><span class="line"></span></div>
    <div class="site">shishka.health</div>
  </footer>
</div>'''

COL_W = 105.0            # mm
ROW_H = 297.0 / 7        # mm = 42.42857 (exact 7-division of A4 = die-cut pitch)

sheets_html = ""
for si, cells in enumerate(sheets, 1):
    slots = []
    for j, k in enumerate(cells):          # cells are column-major: 0-6 = left col, 7-13 = right col
        col, row = j // 7, j % 7
        left, top = col * COL_W, row * ROW_H
        slots.append(f'<div class="slot" style="left:{left:.4f}mm;top:{top:.4f}mm">{label_html(k)}</div>')
    # cut guides along the cell grid (1 vertical + 6 horizontal); outer edges = paper edge
    cuts = [f'<div class="cut v" style="left:{COL_W}mm"></div>']
    cuts += [f'<div class="cut h" style="top:{r*ROW_H:.4f}mm"></div>' for r in range(1, 7)]
    sheets_html += f'<section class="sheet" data-sheet="{si}">\n' + "\n".join(slots + cuts) + '\n</section>\n'

HTML = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Shishka — Juice Labels · A4 print (2 sheets · 28 labels)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400;1,500;1,700&family=Geist:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  /* =====================================================================
     SHISHKA JUICE LABELS — A4 PRINT SHEET (build with render.sh)
     14-up (2 cols × 7 rows) · slot 105 × 42.43 mm · A4 210 × 297 mm
     Portrait label (42.4 × 105) rotated 90° into each landscape slot.
     2-colour print: BLACK + YELLOW · date written by hand.
     PRINT SETTINGS: A4 · Scale 100% (NOT "fit") · Margins NONE · colour on.
     ===================================================================== */
  :root{{
    --ink:#000;
    --pad:3.2mm;
    --font-display:'Alegreya', ui-serif, Georgia, serif;
    --font-sans:'Geist', system-ui, -apple-system, sans-serif;
  }}
  *{{ margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  body{{ background:#9aa0a6; font-family:var(--font-sans); }}

  .sheet{{
    position:relative; width:210mm; height:297mm; background:#fff;
    margin:0 auto; overflow:hidden;          /* deterministic absolute layout — print can't reflow */
  }}
  @media screen{{ .sheet{{ margin:18px auto; box-shadow:0 2px 18px rgba(0,0,0,.35); }} }}

  /* each slot = one die-cut cell, placed by exact mm coords (inline left/top) */
  .slot{{ position:absolute; width:105mm; height:42.42857mm; overflow:hidden; }}
  @media screen{{ .slot{{ outline:0.2mm dashed #c9ccd1; outline-offset:-0.2mm; }} }}

  /* cut guides along the cell grid (sit in the white gutters between labels) */
  .cut{{ position:absolute; background:#9aa0a6; }}
  .cut.v{{ top:0; height:297mm; width:0.18mm; }}
  .cut.h{{ left:0; width:210mm; height:0.18mm; }}

  /* rotate the portrait label into the landscape slot */
  .slot .label{{
    position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%) rotate(90deg) scale(0.94);  /* small even margin so print can't clip edges */
    transform-origin:center center;
  }}

  /* ---------- the label (identical to single-sticker master) ---------- */
  .label{{
    width:42.4mm; height:105mm; background:#fff; color:var(--ink);
    padding:var(--pad); display:flex; flex-direction:column; overflow:hidden;
  }}
  .logo{{ display:block; width:30mm; margin:0 auto; }}
  .logo-rule{{ width:48%; height:0.3mm; background:var(--ink); margin:1.4mm auto 0; }}
  .pname{{ font-family:var(--font-display); font-weight:800; font-size:5.3mm; line-height:1.08;
    letter-spacing:-0.2px; text-align:center; margin-top:2.0mm; }}
  .tagline{{ font-family:var(--font-display); font-style:italic; font-weight:500; font-size:2.6mm;
    line-height:1.2; text-align:center; margin-top:1.4mm; }}
  .sp{{ flex:1 1 0; min-height:1.5mm; }}
  .sp-bottom{{ flex:1.4 1 0; }}
  .pricebar{{ display:flex; align-items:stretch; border:0.3mm solid var(--ink); margin-top:2.8mm; }}
  .pricebar .cell{{ flex:1; font-family:var(--font-sans); position:static; width:auto; height:auto; overflow:visible;
    display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.0mm 0; }}
  .pricebar .cell.vol{{ border-right:0.3mm solid var(--ink); }}
  .pricebar .cell.price{{ background:var(--ink); color:#fff; }}        /* price = the hero (inverted) */
  .pricebar .lab{{ font-size:1.5mm; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-bottom:0.4mm; }}
  .pricebar .num{{ line-height:1; }}
  .pricebar .cell.vol .num{{ font-weight:600; font-size:3.3mm; }}
  .pricebar .cell.price .num{{ font-weight:800; font-size:5.6mm; }}
  .hr{{ height:0.3mm; background:var(--ink); margin:1.8mm 0 1.6mm; }}
  .ingredients{{ font-family:var(--font-sans); font-size:2.4mm; line-height:1.2; font-weight:400; text-align:center; }}
  .ingredients b{{ font-weight:700; text-transform:uppercase; letter-spacing:1px; font-size:1.95mm; display:block; margin-bottom:0.4mm; }}
  .nutri{{ border:0.3mm solid var(--ink); margin-top:1.8mm; }}
  .nutri .nhead{{ background:var(--ink); color:#fff; text-align:center; font-family:var(--font-sans);
    font-weight:700; font-size:1.7mm; letter-spacing:1px; text-transform:uppercase; padding:0.55mm 0; }}
  .nutri .ncells{{ display:flex; }}
  .nutri .ncell{{ flex:1; text-align:center; padding:0.8mm 0; border-right:0.22mm solid var(--ink); }}
  .nutri .ncell:last-child{{ border-right:0; }}
  .nutri .ncell .v{{ font-family:var(--font-sans); font-weight:700; font-size:2.5mm; line-height:1; display:block; }}
  .nutri .ncell .k{{ font-family:var(--font-sans); font-size:1.5mm; font-weight:500; letter-spacing:0.3px; text-transform:uppercase; }}
  .footer{{}}
  .storage{{ font-family:var(--font-sans); font-size:1.85mm; line-height:1.18; font-weight:500; text-align:center; margin-bottom:2.4mm; }}
  .datefield{{ margin-top:3.2mm; }}
  .datefield:first-of-type{{ margin-top:0; }}
  .datefield .dl{{ font-family:var(--font-sans); font-size:1.8mm; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; display:block; }}
  .datefield .line{{ display:block; height:0.3mm; background:var(--ink); margin-top:4.2mm; }}  /* tall gap = room to handwrite the date */
  .site{{ font-family:var(--font-sans); font-size:1.8mm; font-weight:600; letter-spacing:0.8px; text-align:center; margin-top:2.6mm; }}

  /* ---------- print ---------- */
  @media print{{
    @page{{ size:A4; margin:0; }}
    body{{ background:#fff; }}
    .sheet{{ margin:0 auto; box-shadow:none; break-inside:avoid; }}
    .sheet + .sheet{{ break-before:page; page-break-before:always; }}
  }}
</style>
</head>
<body>
{sheets_html}</body>
</html>'''

out = HERE / "juice-labels-print.html"
out.write_text(HTML, encoding="utf-8")
print(f"wrote {out}  ({len(HTML)} bytes)  sheets={len(sheets)}  labels={len(seq)}")
