# Design Brief — shishka.health (Menu Website v1)

Hi! 👋 This is the design brief for Shishka's menu website. It's written to be friendly even if this is your first website — read it top to bottom once, then start.

**Live site as it looks today (unstyled skeleton):** https://shishka.health
That ugly version is intentional — it's the working structure. Your job is to design how it *looks*. The structure and the data are already done.

---

## 0. The one golden rule

**You design the *look*. You never type prices, calories, names, or photos.**

All the content (dish names, prices in ฿, calories/КБЖУ, photos, tags) comes automatically from Shishka's database. When the kitchen changes a price, the website updates itself. So in your mockups, use the real dishes from https://shishka.health as placeholders, but understand the developer will wire the real data in. You design the *containers*; the data fills them.

This means: **don't build a "menu" as static text.** Design one reusable **dish card**, and it will be repeated automatically for every dish.

---

## 1. Which tool to use

**Strong recommendation: use Figma (it's free).**
Even though you normally use Adobe, please consider Figma for this project, because:
- It's built for websites (Adobe Photoshop/Illustrator are built for print/images).
- The developer can read exact colors, sizes, and spacing directly from a Figma file — that makes your design come to life accurately, with far less back-and-forth.
- It's free, runs in the browser, and has tons of beginner tutorials (search "Figma for beginners" on YouTube — 20 min and you're ready).
- Sharing = one link (Share → Copy link). No exporting needed.

**If you must use Adobe**, that's OK too — but then please also deliver:
- All colors as **HEX codes** (e.g. `#2D3F1C`), written next to each element.
- All sizes/spacing in **pixels (px)**.
- The logo and any icons/images exported as **SVG** (preferred) or **PNG** with transparent background.
- A short note of which **fonts** you used (exact names).

Either way, the deliverable is **mockups (pictures of the screens) + the brand basics in section 5.**

---

## 2. Design for the PHONE first 📱

This menu is opened mostly by scanning a QR code at the table, so **most people see it on a phone.** Design the phone version first and most carefully, then a desktop version.

Canvas sizes to use:
- **Phone:** 390 px wide (iPhone-ish). This is the priority.
- **Desktop:** 1440 px wide (secondary).

---

## 3. Screens & components to design

You don't need to design 50 dishes. Design these reusable pieces:

### A. Header (top of page)
- Shishka **logo** + a short tagline ("Healthy Kitchen" or your wording).
- A **"Filters" button** (opens the panel in D).

### B. Category bar (sticky tabs)
- A horizontal scrolling row of category chips: *Manaish, Smoothies, Coffee, Salads…* (see live site for the real list).
- Show the **selected** state vs **unselected** state.

### C. Dish card ⭐ (the most important element — design it beautifully)
Design it in **two versions**:
1. **With photo** — most dishes will have a food photo.
2. **Without photo (placeholder)** — many dishes don't have a photo yet. Design a nice branded placeholder so empty cards still look intentional (right now it's just the dish's first letter on a gradient — make it pretty).

Each card contains:
- Photo (or placeholder)
- Dish **name**
- Short **description**
- **Price** in ฿ (Thai baht)
- **Portion** (e.g. "200 g")
- **КБЖУ donut** (see E)
- Small **macro badges**: P / C / F (protein/carbs/fat in grams)
- Up to ~3 small **tags** (e.g. "Vegan", "High Protein")
- A **"Featured" badge** for highlighted dishes

### D. Filters panel (diets + allergens)
- A panel with two groups of toggle chips:
  - **Diets** (e.g. High Protein, Vegan, Vegetarian, Paleo, Keto)
  - **Allergens to exclude** (e.g. Gluten, Milk, Nuts, Eggs, Fish…)
- Show selected vs unselected chip states + a "Clear" link.

### E. КБЖУ donut (calorie ring)
- A small circular ring with the **calorie number in the center** ("kcal").
- The ring is split into 3 colored arcs = protein / carbs / fat balance.
- Design how it looks (colors, thickness, size on the card and bigger in the dish window).

### F. Dish window (modal)
- Opens when someone taps a card.
- Big photo (or placeholder) + name + price + portion + full description + bigger КБЖУ donut + all tags + "Contains: …" allergens line + a close (✕) button.

---

## 4. Style direction

- Healthy, fresh, appetizing, premium-but-friendly. Food should look delicious.
- Good reference to study (a competitor we analyzed): **easyhealth.asia** — look at their menu cards, calorie donut, and filter panel. Aim for that level of polish (don't copy — make it Shishka's own).
- Dark or light theme — your call, propose what fits the brand. (Current skeleton is dark.)

---

## 5. Brand foundation (please deliver these)

The developer needs these as the "source of truth". Please provide:

1. **Logo** (SVG or transparent PNG).
2. **Color palette** — pick the brand colors as HEX. As a *starting point* (feel free to change all of it), the current placeholder palette is:
   - Greens: `#2D3F1C`, `#5B7A3D`
   - Red: `#9B1C21`
   - Amber/gold: `#B88830`
   - Cream/text: `#F0EAD6`
   - Dark backgrounds: `#0B0F0A`, `#12170F`, `#1A2114`
3. **Fonts** — pick 1 heading font + 1 body font (and optionally 1 for numbers/prices). Use free Google Fonts if possible (easy for the web). Current placeholders: Alegreya (headings), Geist (body), JetBrains Mono (numbers).
4. **КБЖУ colors** — pick the 3 macro colors (protein / carbs / fat).

> Tip: give the developer a simple "Style" page in your file with all colors (as HEX) and fonts listed clearly. That single page is gold.

---

## 6. What NOT to touch

- Don't worry about the cart, checkout, or ordering — not part of this version.
- Don't design admin/owner screens — this is only the public customer menu.
- Don't invent prices or nutrition numbers — they come from the database.

---

## 7. Deliverables checklist ✅

- [ ] Phone mockups (390 px) of: home menu (header + categories + cards), filters panel open, dish window open.
- [ ] Desktop mockups (1440 px) of the same.
- [ ] Dish card in **both** states (with photo + placeholder).
- [ ] A "Style" page: logo + colors (HEX) + fonts + КБЖУ colors.
- [ ] Send as a **Figma share link** (preferred) or Adobe files + exported assets (SVG/PNG) + the style info from section 5.

---

## 8. How it goes live

You design → Lesia sends the file/link to the developer → developer applies your design to the live site → we review it together on a preview link → publish to shishka.health. You don't need to touch any code or hosting. 🚀

Questions about structure or what's possible — just ask. Have fun, make it delicious! 🥗
