#!/usr/bin/env python3
"""Assemble the Illustrator-editable door-sign SVG.
Live <text> (editable), vector ornaments/icons, embedded logo + fonts."""
import base64, pathlib
here = pathlib.Path(__file__).parent
fonts_css = (here/"fonts2.css").read_text()
logo_b64  = base64.b64encode((here/"logo-white.png").read_bytes()).decode()

W,H = 940,1620
CX = W/2
OLIVE="#3d4b32"; Wc="#ffffff"
SOFT="rgba(255,255,255,.74)"; DIM="rgba(255,255,255,.6)"; LINE="rgba(255,255,255,.42)"
SER="'Cormorant Garamond', serif"
SANS="'Jost', sans-serif"
THAI="'Noto Sans Thai', sans-serif"

# ---- reusable flourish path (300x22 box, centered drawing) ----
FLO_PATHS = (
 '<path d="M150 11 C128 11 128 4 110 6 C96 7.5 92 15 80 11 C70 8 60 11 44 11"/>'
 '<path d="M150 11 C172 11 172 4 190 6 C204 7.5 208 15 220 11 C230 8 240 11 256 11"/>'
 '<circle cx="150" cy="11" r="3" fill="#fff" stroke="none"/>'
 '<path d="M150 11 l-10 -5 M150 11 l-10 5 M150 11 l10 -5 M150 11 l10 5" opacity=".5"/>'
)
def flourish(yc):
    return (f'<g transform="translate({CX-150},{yc-11})" fill="none" stroke="#fff" '
            f'stroke-width="1.2" stroke-linecap="round" opacity=".9">{FLO_PATHS}</g>')

def text(x,y,s,*,size,fam=SER,style="normal",weight="400",fill=Wc,ls=0,anchor="middle"):
    ls_attr = f' letter-spacing="{ls}"' if ls else ""
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" '
            f'font-style="{style}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{ls_attr}>{s}</text>')

NB=" "
def track(s):
    """letter-spacing via non-breaking spaces (SVG collapses normal spaces)."""
    toks=[NB*3 if ch==" " else ch for ch in s]
    return NB.join(toks)

# ---- food icons (48x48 viewBox), drawn as nested svg at given pos ----
ICONS = {
 "salad": '<path d="M6 25h36a18 18 0 0 1-18 14A18 18 0 0 1 6 25z"/><path d="M24 25c-6-2-9-7-7-12 4 1 7 4 7 8"/><path d="M24 24c2-7 8-10 13-9-1 6-6 9-11 9"/><path d="M24 25c0-5 3-9 8-10"/><path d="M14 39h20"/>',
 "pizza": '<path d="M24 7 L40 39 Q24 45 8 39 Z"/><path d="M8 39 Q24 45 40 39"/><circle cx="20" cy="24" r="2.1" fill="#fff" stroke="none"/><circle cx="28" cy="29" r="2.1" fill="#fff" stroke="none"/><circle cx="22" cy="34" r="1.9" fill="#fff" stroke="none"/>',
 "roll": '<g transform="rotate(-18 24 26.5)"><rect x="9" y="20" width="30" height="13" rx="6.5"/></g><path d="M16.5 16.5l3 5M22 14.5l3 5M27.5 12.5l3 5"/><path d="M30 30.5l3 5"/>',
 "coffee": '<path d="M10 20h22v9a11 11 0 0 1-11 11A11 11 0 0 1 10 29z"/><path d="M32 22h4.5a4.5 4.5 0 0 1 0 9H32"/><path d="M16 9c-1 2 1 3 0 5M22 9c-1 2 1 3 0 5"/>',
}
def icon(name,cx,top,sz=66):
    return (f'<svg x="{cx-sz/2}" y="{top}" width="{sz}" height="{sz}" viewBox="0 0 48 48" '
            f'fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" '
            f'stroke-linejoin="round">{ICONS[name]}</svg>')

# ---- offer column ----
def offer(cx, name, en, sub, th):
    parts=[icon(name,cx,818)]
    parts.append(text(cx,930,en,size=27,style="italic",weight="500"))
    yy=930
    if sub:
        yy+=28; parts.append(text(cx,yy,sub,size=15,fam=SANS,fill=DIM,ls=1.2))
    yy+=28; parts.append(text(cx,yy,th,size=17,fam=THAI,fill=DIM))
    return "".join(parts)

cols=[170,370,570,770]
offers = (
 offer(cols[0],"salad","Salad Bar","", "สลัดบาร์") +
 offer(cols[1],"pizza","Mini Pizza","gluten-free","มินิพิซซ่า") +
 offer(cols[2],"roll","Spring Rolls","fresh","ปอเปี๊ยะ") +
 offer(cols[3],"coffee","Coffee","", "กาแฟ")
)

# ---- slide tag (vector group, bottom center) ----
tag_w=300; tag_h=128; tag_x=CX-tag_w/2; tag_y=H-30-tag_h-22
slide_tag = f'''<g>
  <rect x="{tag_x}" y="{tag_y}" width="{tag_w}" height="{tag_h}" rx="8"
        fill="{OLIVE}" stroke="{LINE}" stroke-width="1"/>
  <svg x="{CX-27}" y="{tag_y+18}" width="54" height="15" viewBox="0 0 60 16" fill="none"
       stroke="{SOFT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 8H46"/><path d="M14 8l6-5M14 8l6 5"/><path d="M46 8l-6-5M46 8l-6 5"/></svg>
  {text(CX, tag_y+66, track("SLIDE"), size=32, weight="600")}
  {text(CX, tag_y+95, "เลื่อน", size=22, fam=THAI, fill=SOFT)}
  {text(CX, tag_y+117, "сдвиньте", size=16, style="italic", fill=DIM, ls=1)}
</g>'''

# ---- trilingual subtitles via tspans (correct font per script) ----
welcome_sub = (f'<text x="{CX}" y="455" font-size="23" fill="{SOFT}" text-anchor="middle">'
  f'<tspan font-family="{THAI}">ยินดีต้อนรับ</tspan>'
  f'<tspan font-family="{SER}">&#160;&#160;·&#160;&#160;Добро пожаловать</tspan></text>')
hours_sub = (f'<text x="{CX}" y="648" font-size="19" fill="{DIM}" text-anchor="middle">'
  f'<tspan font-family="{THAI}">เปิดทุกวัน</tspan>'
  f'<tspan font-family="{SER}">&#160;·&#160;ежедневно</tspan></text>')
sec_th = f'<text x="{CX}" y="800" font-family="{THAI}" font-size="17" fill="{DIM}" text-anchor="middle">สิ่งที่เราเสิร์ฟ</text>'

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs><style type="text/css"><![CDATA[
{fonts_css}
  ]]></style></defs>

  <!-- background -->
  <rect width="{W}" height="{H}" fill="{OLIVE}"/>

  <!-- engraved frame -->
  <rect x="30" y="30" width="{W-60}" height="{H-60}" rx="3" fill="none" stroke="{LINE}" stroke-width="1"/>
  <rect x="37" y="37" width="{W-74}" height="{H-74}" rx="2" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>

  <!-- top & bottom crown ornaments -->
  <g transform="translate({CX-60},18)" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round">
    <path d="M60 22 C60 14 54 10 46 12 C40 13.5 38 18 32 16 C26 14 24 9 18 11"/>
    <path d="M60 22 C60 14 66 10 74 12 C80 13.5 82 18 88 16 C94 14 96 9 102 11"/>
    <circle cx="60" cy="22" r="2.4" fill="#fff" stroke="none"/>
    <path d="M60 18 V6 M55 9 L60 5 L65 9"/></g>
  <g transform="translate({CX-60},{H-44})" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round">
    <path d="M60 4 C60 12 54 16 46 14 C40 12.5 38 8 32 10 C26 12 24 17 18 15"/>
    <path d="M60 4 C60 12 66 16 74 14 C80 12.5 82 8 88 10 C94 12 96 17 102 15"/>
    <circle cx="60" cy="4" r="2.4" fill="#fff" stroke="none"/></g>

  <!-- LOGO (embedded brand art) -->
  <image x="{CX-150}" y="74" width="300" height="238" xlink:href="data:image/png;base64,{logo_b64}"/>

  <!-- Russian-brand signal -->
  {text(CX,352,track("РУССКИЙ БРЕНД"),size=18,weight="500",fill=SOFT)}

  <!-- welcome -->
  {text(CX,412,"Welcome",size=50,style="italic",weight="500")}
  {welcome_sub}

  {flourish(500)}

  <!-- hours -->
  {text(CX,556,track("OPEN DAILY"),size=19,fam=SANS,fill=SOFT)}
  {text(CX,616,"09:30 — 18:30",size=58,weight="500",ls=3)}
  {hours_sub}

  {flourish(702)}

  <!-- what we serve -->
  {text(CX,772,track("WHAT WE SERVE"),size=20,fam=SANS)}
  {sec_th}

  <!-- offers -->
  {offers}

  <!-- tagline -->
  {text(CX,1055,"Coffee  ·  Salads  ·  Bowls",size=28,style="italic",fill=SOFT)}

  {flourish(1100)}

  <!-- wifi badge -->
  <circle cx="{CX}" cy="1168" r="42" fill="none" stroke="{LINE}" stroke-width="1"/>
  <svg x="{CX-19}" y="1149" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff"
       stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 10a13 13 0 0 1 16 0"/><path d="M7 13.5a8 8 0 0 1 10 0"/>
    <circle cx="12" cy="17.5" r="1.1" fill="#fff" stroke="none"/></svg>
  {text(CX,1242,track("FREE WI-FI"),size=13,fam=SANS,fill=DIM)}

  <!-- motto -->
  {text(CX,1330,"“ Fresh as creation, alive like the soul ”",size=31,style="italic",fill=SOFT)}
  {text(CX,1360,"свежесть творения, живая, как душа",size=18,style="italic",fill=DIM,ls=1)}

  <!-- slide tag -->
  {slide_tag}
</svg>'''

(here/"shishka-door-sign.svg").write_text(svg)
print("wrote shishka-door-sign.svg", len(svg), "bytes")
