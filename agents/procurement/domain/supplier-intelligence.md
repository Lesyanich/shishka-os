# Supplier Intelligence

> Accumulated knowledge about suppliers. Updated by Procurement Agent after each research session.
> Language: English (RULE-LANGUAGE-CONTRACT).

---

## Known Suppliers

### Makro (Phuket)

- **Type:** Wholesale / cash-and-carry
- **Location:** Phuket (multiple branches)
- **Strengths:** Bulk ingredients, competitive pricing on staples, some kitchen equipment
- **Weaknesses:** Limited specialty items, membership required
- **Delivery:** Self-pickup; delivery options may be available for large orders
- **Payment:** Cash, card, transfer
- **Notes:** Primary source for bulk dry goods, oils, and basic proteins
- **MCP Tool:** `search_makro_catalog` — real-time prices, barcodes, ST166 Rawai stock

### Sangdamrong

- **Type:** Kitchenware / packaging / supplies wholesaler
- **Location:** Thailand (online + physical)
- **Strengths:** Kitchenware, trays, glassware, porcelain, food display items, Tupperware, Ocean Glass, Superware
- **Weaknesses:** Limited online catalog (~100 featured items), no search API, Thai-only product names
- **Delivery:** Verify shipping to Rawai
- **Payment:** TBD
- **Supabase ID:** `668b3d36-b3f3-4a6a-81b0-133153bf1311`
- **MCP Tool:** `search_sangdamrong_catalog` — browse homepage featured products (18 categories)
- **Notes:** Already an active supplier with purchase history. Website is Remix SSR, no public search — scraper returns homepage products only.

### HomePro

- **Type:** Home improvement retail chain (Thai equivalent of Home Depot)
- **Location:** Thailand-wide, stores in Phuket
- **Strengths:** Security cameras, kitchen equipment, tools, hardware, appliances, faucets, lighting. Full search API with English+Thai names.
- **Weaknesses:** Retail pricing (not wholesale), may be more expensive than online alternatives
- **Delivery:** Delivery to Rawai available, store pickup option
- **Payment:** Cash, card, installments
- **MCP Tool:** `search_homepro_catalog` — full-text search via suggest API, prices, SKUs, stock status
- **Notes:** Best for equipment, hardware, and security cameras. Compare with Lazada/Shopee for better pricing on same items.

### Lazada

- **Type:** Online marketplace
- **Coverage:** Thailand-wide, delivery to Rawai
- **Strengths:** Wide equipment selection, frequent promotions, buyer protection
- **Weaknesses:** Variable seller quality, delivery times can be unpredictable
- **Delivery:** 3-7 days typical to Phuket/Rawai
- **Payment:** Card, transfer, COD
- **Notes:** Good for small kitchen tools, equipment accessories, packaging supplies. Always check seller ratings and reviews.

### Shopee

- **Type:** Online marketplace
- **Coverage:** Thailand-wide, delivery to Rawai
- **Strengths:** Competitive pricing, flash sales, wide selection
- **Weaknesses:** Similar to Lazada — variable quality, shipping delays possible
- **Delivery:** 3-7 days typical to Phuket/Rawai
- **Payment:** Card, transfer, COD
- **Notes:** Compare prices with Lazada for the same item. Sometimes cheaper due to seller competition.

### AliExpress

- **Type:** International online marketplace (China-based)
- **Coverage:** International shipping to Thailand
- **Strengths:** Lowest prices for equipment, massive selection
- **Weaknesses:** Long delivery (2-6 weeks), voltage may differ (check 220V/50Hz!), warranty claims difficult, customs fees possible
- **Delivery:** 2-6 weeks to Thailand
- **Payment:** Card
- **Notes:** **Always verify voltage compatibility (220V/50Hz).** Some listings ship 110V versions. Check plug type (Thai uses Type A/B/C). Good for non-urgent equipment purchases where price is priority.

### Local Phuket Suppliers

- **Type:** Fresh markets, seafood vendors, specialty shops
- **Coverage:** Phuket / Rawai area
- **Strengths:** Freshest produce, seafood, herbs; same-day availability; relationship pricing
- **Weaknesses:** No formal catalogs, variable pricing, seasonal availability
- **Delivery:** Self-pickup or local delivery (negotiable)
- **Payment:** Cash, transfer
- **Notes:** To be discovered and documented as relationships develop. Key for daily fresh ingredients.

---

## Supplier Rulings Log

> Add new rulings here as they are discovered. Format: `YYYY-MM-DD: ruling`

_No rulings yet. Will accumulate from procurement research sessions._

---

## Negative Knowledge

> Things that DON'T work — equally valuable as positive knowledge.

_No entries yet. Will accumulate from procurement research sessions._
