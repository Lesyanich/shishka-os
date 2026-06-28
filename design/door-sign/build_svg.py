#!/usr/bin/env python3
"""Assemble the minimal Illustrator-editable door-sign SVG.
Icon-driven, short text. Live <text> + vector icons + embedded logo/fonts."""
import base64, pathlib
here = pathlib.Path(__file__).parent
fonts_css = (here/"fonts2.css").read_text()
logo_b64  = base64.b64encode((here/"logo-white.png").read_bytes()).decode()

W,H = 940,1080
CX = W/2
OLIVE="#3d4b32"; Wc="#ffffff"
SOFT="rgba(255,255,255,.74)"; DIM="rgba(255,255,255,.6)"; LINE="rgba(255,255,255,.42)"
SER="'Cormorant Garamond', serif"
SANS="'Jost', sans-serif"
THAI="'Noto Sans Thai', sans-serif"

FLO_PATHS = (
 '<path d="M150 11 C128 11 128 4 110 6 C96 7.5 92 15 80 11 C70 8 60 11 44 11"/>'
 '<path d="M150 11 C172 11 172 4 190 6 C204 7.5 208 15 220 11 C230 8 240 11 256 11"/>'
 '<circle cx="150" cy="11" r="3" fill="#fff" stroke="none"/>'
 '<path d="M150 11 l-10 -5 M150 11 l-10 5 M150 11 l10 -5 M150 11 l10 5" opacity=".5"/>'
)
def flourish(yc,w=300):
    return (f'<g transform="translate({CX-w/2},{yc-11})" fill="none" stroke="#fff" '
            f'stroke-width="1.2" stroke-linecap="round" opacity=".9">{FLO_PATHS}</g>')

def text(x,y,s,*,size,fam=SER,style="normal",weight="400",fill=Wc,ls=0,anchor="middle"):
    ls_attr = f' letter-spacing="{ls}"' if ls else ""
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" '
            f'font-style="{style}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{ls_attr}>{s}</text>')

NB=" "
def track(s):
    toks=[NB*3 if ch==" " else ch for ch in s]
    return NB.join(toks)

ICONS = {
 "clock":  '<circle cx="24" cy="24" r="17"/><path d="M24 14v10l7 4"/>',
 "salad":  '<path d="M6 25h36a18 18 0 0 1-18 14A18 18 0 0 1 6 25z"/><path d="M24 25c-6-2-9-7-7-12 4 1 7 4 7 8"/><path d="M24 24c2-7 8-10 13-9-1 6-6 9-11 9"/><path d="M24 25c0-5 3-9 8-10"/><path d="M14 39h20"/>',
 "pizza":  '<path d="M24 7 L40 39 Q24 45 8 39 Z"/><path d="M8 39 Q24 45 40 39"/><circle cx="20" cy="24" r="2.1" fill="#fff" stroke="none"/><circle cx="28" cy="29" r="2.1" fill="#fff" stroke="none"/><circle cx="22" cy="34" r="1.9" fill="#fff" stroke="none"/>',
 "roll":   '<g transform="rotate(-18 24 26.5)"><rect x="9" y="20" width="30" height="13" rx="6.5"/></g><path d="M16.5 16.5l3 5M22 14.5l3 5M27.5 12.5l3 5"/><path d="M30 30.5l3 5"/>',
 "coffee": '<path d="M10 20h22v9a11 11 0 0 1-11 11A11 11 0 0 1 10 29z"/><path d="M32 22h4.5a4.5 4.5 0 0 1 0 9H32"/><path d="M16 9c-1 2 1 3 0 5M22 9c-1 2 1 3 0 5"/>',
 "wifi":   '<path d="M8 20a23 23 0 0 1 32 0"/><path d="M14.5 27a14 14 0 0 1 19 0"/><circle cx="24" cy="34" r="2.3" fill="#fff" stroke="none"/>',
}
def icon(name,cx,top,sz=78,sw=1.6):
    return (f'<svg x="{cx-sz/2}" y="{top}" width="{sz}" height="{sz}" viewBox="0 0 48 48" '
            f'fill="none" stroke="#fff" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{ICONS[name]}</svg>')

# ---- icon row (5 pictograms, no labels) ----
row_names=["salad","pizza","roll","coffee","wifi"]
step=168
centers=[CX + (k-2)*step for k in range(5)]
icon_row="".join(icon(n,centers[i],700,sz=80) for i,n in enumerate(row_names))

# ---- slide tag ----
tag_w=300; tag_h=126; tag_x=CX-tag_w/2; tag_y=H-30-tag_h-24
slide_tag = f'''<g>
  <rect x="{tag_x}" y="{tag_y}" width="{tag_w}" height="{tag_h}" rx="8"
        fill="{OLIVE}" stroke="{LINE}" stroke-width="1"/>
  <svg x="{CX-27}" y="{tag_y+17}" width="54" height="15" viewBox="0 0 60 16" fill="none"
       stroke="{SOFT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 8H46"/><path d="M14 8l6-5M14 8l6 5"/><path d="M46 8l-6-5M46 8l-6 5"/></svg>
  {text(CX, tag_y+64, track("SLIDE"), size=32, weight="600")}
  {text(CX, tag_y+93, "เลื่อน", size=22, fam=THAI, fill=SOFT)}
  {text(CX, tag_y+115, "сдвиньте", size=16, style="italic", fill=DIM, ls=1)}
</g>'''

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs><style type="text/css"><![CDATA[
{fonts_css}
  ]]></style></defs>

  <rect width="{W}" height="{H}" fill="{OLIVE}"/>

  <!-- engraved frame -->
  <rect x="30" y="30" width="{W-60}" height="{H-60}" rx="3" fill="none" stroke="{LINE}" stroke-width="1"/>
  <rect x="37" y="37" width="{W-74}" height="{H-74}" rx="2" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>

  <!-- crown ornaments -->
  <g transform="translate({CX-60},18)" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round">
    <path d="M60 22 C60 14 54 10 46 12 C40 13.5 38 18 32 16 C26 14 24 9 18 11"/>
    <path d="M60 22 C60 14 66 10 74 12 C80 13.5 82 18 88 16 C94 14 96 9 102 11"/>
    <circle cx="60" cy="22" r="2.4" fill="#fff" stroke="none"/>
    <path d="M60 18 V6 M55 9 L60 5 L65 9"/></g>
  <g transform="translate({CX-60},{H-44})" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round">
    <path d="M60 4 C60 12 54 16 46 14 C40 12.5 38 8 32 10 C26 12 24 17 18 15"/>
    <path d="M60 4 C60 12 66 16 74 14 C80 12.5 82 8 88 10 C94 12 96 17 102 15"/>
    <circle cx="60" cy="4" r="2.4" fill="#fff" stroke="none"/></g>

  <!-- LOGO -->
  <image x="{CX-180}" y="92" width="360" height="286" xlink:href="data:image/png;base64,{logo_b64}"/>

  <!-- Russian-brand mark -->
  {text(CX,432,track("РУССКИЙ БРЕНД"),size=17,weight="500",fill=SOFT)}

  {flourish(490)}

  <!-- hours: clock icon + time -->
  {icon("clock",CX,520,sz=44,sw=1.7)}
  {text(CX,624,"09:30 — 18:30",size=54,weight="500",ls=3)}

  {flourish(682)}

  <!-- icon row -->
  {icon_row}

  {slide_tag}
</svg>'''

(here/"shishka-door-sign.svg").write_text(svg)
print("wrote shishka-door-sign.svg", len(svg), "bytes  H=",H)
