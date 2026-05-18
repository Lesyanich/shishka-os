# Food Safety Rules — Hard Limits

> Non-negotiable safety constraints that override culinary creativity.
> Chef Agent MUST load this file for WF-1, WF-3, WF-7 (any R&D or dish creation).
> Sources: McGee On Food and Cooking, FDA Food Code 2022, USDA FSIS, Modernist Cuisine, peer-reviewed food science.

---

## A. Microbiology Hazards

Every cooked TCS (Time/Temperature Control for Safety) food is a potential growth medium. Know the key pathogens.

| Pathogen | High-risk foods | Growth range | Key danger | Kill temp |
|----------|----------------|-------------|------------|-----------|
| Bacillus cereus | Cooked rice, grains, pasta, starchy foods | 10-50°C | Emetic toxin is **heat-stable** — reheating won't help | Vegetative cells: 74°C; spores survive boiling |
| Staphylococcus aureus | Dairy, cream-based, manual-handled foods | 7-48°C | Enterotoxin is heat-stable (survives 100°C/30min) | Cells: 60°C; toxin: irreversible |
| Clostridium botulinum | Vacuum-packed, oil-submerged, anaerobic (garlic-in-oil) | 3-45°C | Neurotoxin; anaerobic environments | Cells: 80°C; spores: 121°C (pressure) |
| Listeria monocytogenes | Ready-to-eat, smoked fish, soft cheese | -0.4-45°C | **Grows at fridge temp** (cold-tolerant) | 74°C core |
| Salmonella | Poultry, eggs, sprouts, raw leafy greens | 5-47°C | Low infectious dose (~100 cells for some serovars) | 74°C core |

**Rule:** If a dish involves any high-risk food + holding time > 2h at ambient → flag to CEO.

---

## B. Shelf-Life Maximums (at 0-4°C)

Conservative limits for Shishka prep-ahead model (L1 production → L2 sale).

| Item category | Max storage (4°C) | Notes |
|--------------|-------------------|-------|
| Cooked rice / grains | 24h | B. cereus spore risk; USDA says up to 4 days but Shishka conservative due to prep-ahead chain |
| Cooked pasta | 3 days | Lower B. cereus risk than rice (lower pH after cooking) |
| Cooked chicken / poultry | 3-4 days | USDA guideline; use within 72h for Shishka |
| Cooked fish | 2 days | Histamine risk in some species (tuna, mackerel) |
| Raw fish (sushi-grade) | 24h | Must be previously frozen to -20°C/7d or -35°C/15h for parasite kill |
| Cut fruit | 24h | Oxidation + surface microflora |
| Cooked vegetables | 3 days | Varies by type; leafy = shorter |
| Cream-based sauces | 48h | Staph aureus risk with dairy |
| Fresh dressings (no preservatives) | 72h | Acid (vinegar/citrus) extends slightly |
| Hummus / dips | 72h | Opened commercial = 7d; house-made = 72h |
| Cooked legumes | 3 days | Rinse before storing; surface moisture = risk |

**Rule:** When designing a prep-ahead item, state the shelf-life explicitly. If unsure → WebSearch "[item] shelf life refrigerated food safety" BEFORE stating a number.

---

## C. Temperature Thresholds

| Process | Temperature | Notes |
|---------|-------------|-------|
| **Danger zone** | 5-60°C (FDA: 5-57°C) | Pathogen multiplication; minimize time in this range |
| **2-hour rule** | ambient >5°C | No TCS food at room temp for >2h; >1h if ambient >32°C |
| **Hot holding minimum** | 57°C (135°F) | FDA Food Code 2022 |
| **Cold holding maximum** | 4°C (41°F) | FDA Food Code 2022 |
| **Cooling stage 1** | 57°C → 21°C in 2h | FDA 2-stage cooling |
| **Cooling stage 2** | 21°C → 5°C in 4h more | Total 6h from start; discard if not reached |
| **Reheating minimum** | 74°C (165°F) core | Must reach within 2h of starting reheat |
| **Chicken safe core** | 74°C | Also: ground meat 71°C, whole cuts 63°C+3min rest |
| **Salmon medium** | 52°C core | Sous-vide; must hold 52°C for pasteurization time |
| **Honey enzyme kill** | >40°C onset, >50°C significant | Diastase/invertase denatured; expensive raw honey becomes plain sugar syrup |
| **Maillard onset** | 140°C | Cross-ref: `culinary-knowledge.md` |

**Rule:** Never recommend a holding temperature in the danger zone without explicit time limit and safety justification.

---

## D. Starch Chemistry

| Principle | Details | Practical implication |
|-----------|---------|----------------------|
| **Retrogradation (amylose)** | Crystallization begins ~3h after cooling; significant by 24-48h at 0-4°C | Texture collapse, syneresis (water release), staling |
| **Retrogradation (amylopectin)** | Slow phase, days to weeks | Bread staling over days; worst at 0-4°C |
| **Al dente rule** | Cook to 85% for prep-ahead; regeneration (reheat) finishes cooking | Prevents mush in L1→L2 chain |
| **Resistant starch (RS3)** | Cooked + cooled starch = retrograded RS3 (lower GI) | Shishka health angle: cooled rice/potato has more RS3 |
| **Gelatinization** | Starch granules absorb water + swell at 60-80°C | Irreversible; sets the texture baseline |
| **Freezing accelerates retrogradation** | 0-4°C is the worst range for staling | Freeze quickly (-18°C) if long storage needed; skip fridge range |

**Rule:** Any starchy prep-ahead item (rice bowls, grain bases, porridge) must account for retrogradation. State expected texture at time of service. If >24h hold → test or document retrogradation mitigation (fat coating, acid, modified starch).

---

## E. Enzyme Behavior

| Enzyme | Source | Optimal temp | Kill temp | Practical effect |
|--------|--------|-------------|-----------|-----------------|
| **Diastase** (amylase) | Honey | 35-40°C | >50°C (significant loss after 5d) | Quality marker for raw honey; heating honey above 40°C degrades it |
| **Invertase** | Honey | 35-45°C | >50°C (most heat-sensitive) | Converts sucrose→glucose+fructose; lost with heating |
| **Papain** | Papaya (esp. green) | 60-70°C | >80°C | Meat tenderizer; active in marinades below 70°C |
| **Bromelain** | Pineapple (stem + fruit) | 50°C | >70°C (83% remains at 50°C/1h; near-zero at 80°C/8min) | Prevents gelatin setting if raw; cook/can pineapple to neutralize |
| **Polyphenol oxidase** | All cut fruit/veg | ambient | >70°C (blanching) | Browning enzyme; inhibit with acid (lemon) or blanch |
| **Myrosinase** | Cruciferous veg (broccoli, kale) | 30-40°C | >70°C | Converts glucosinolates to beneficial sulforaphane; brief cooking preserves some |

**Rule:** When a recipe uses honey, papaya, or pineapple with heat → check this table. Honey in baking/hot drinks = no enzyme benefit (state this to CEO if relevant to health positioning).

---

## F. Wild Microflora & Soaking Safety

| Rule | Details |
|------|---------|
| **Dry grains/seeds/nuts** | Surface contamination assumed (Bacillus, molds, yeasts) unless heat-treated |
| **Soaking without heat** | Multiplies microflora, does NOT kill; warm-soak (25-40°C) is worst case |
| **Sprouting** | Amplifies risk: warmth + moisture + nutrients = ideal growth medium |
| **Overnight oats / chia** | Acid (yogurt pH <4.6) or refrigeration (<4°C) mitigates; document which |
| **Raw grain/seed in final dish** | Must have documented safety rationale; if none → require heat step |
| **Nut milks (house-made)** | No pasteurization → 48h shelf life max at 4°C; label accordingly |

**Rule:** Any grain, seed, or nut served without a cooking step → Chef must document the safety rationale in the recipe flow notes. "It's traditional" is not sufficient — cite the mitigation (acid, cold, short hold time).

---

## Usage Protocol

1. **Load this file** at the start of WF-1, WF-3, WF-7
2. **Cross-check** every ingredient/method against relevant sections
3. **If a hard limit is hit** → flag to CEO BEFORE proceeding with the recipe
4. **If uncertain about a shelf-life or safety claim** → WebSearch BEFORE stating a number
5. **Never extrapolate** from one food to another (rice safety ≠ pasta safety)
