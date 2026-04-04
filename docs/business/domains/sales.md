# Sales & Customer — Domain Context

## Scope
Menu pricing, menu engineering (ABC analysis), delivery platforms, customer reviews, allergen management, loyalty, upselling.

## Key Systems
- **SYRVE**: POS, menu items, order history, sales data
- **Admin Panel**: Order Manager, BOM Hub (pricing)
- **Chef Agent**: `suggest_price`, `audit_all_dishes`

## Pricing Strategy
- Target margin: >= 70% per dish
- Price rounding: to nearest 5 or 10 THB
- Delivery markup: +15-20% to cover platform commission

## Platforms
- Dine-in (primary)
- Grab Food
- LINE MAN
- Direct delivery (future)

## Allergen Management
- Every SALE item must declare allergens
- Common: gluten, dairy, nuts, soy
- Cascaded from RAW ingredients through BOM

## Typical Tasks
- Analyze dish profitability (ABC analysis)
- Adjust pricing based on food cost changes
- Respond to customer review
- Update allergen declarations after recipe change
- Add new dish to delivery platforms
- Design seasonal promotion
- Analyze sales trends (what sells when)

## Customer Segments
- Health-conscious expats
- Tourists (seasonal peak: Dec-Mar)
- Local Thai customers
- Delivery customers (different behavior)
