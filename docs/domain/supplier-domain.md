# Supplier Domain

## Supplier Model

Each supplier has:
- `id` (UUID)
- `name` (e.g., "Makro Samui", "Local Market")
- `supplier_type` (wholesale, market, online, farm)
- Contact info, payment terms

## Supplier Catalog (`supplier_catalog`)

SSoT for "what can we buy and where":
- Links a supplier to a product (RAW)
- Stores: `supplier_sku`, `pack_size`, `pack_unit`, `price_per_pack`
- WAC (Weighted Average Cost) calculated from purchase history

## SKU Layer

Each product can have multiple supplier SKUs:
- `product_id` -> `supplier_catalog.product_id`
- Barcodes stored in `sku_barcodes` table
- Used for receiving station scanning

## Key Suppliers

| Name | Type | Notes |
|------|------|-------|
| Makro | Wholesale | Parsed via `tools/makro-parser/` |
| Local markets | Market | Manual receipt entry |
| Online suppliers | Online | Delivery receipts |
