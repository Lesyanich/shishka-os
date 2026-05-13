# Template: Supplier Agreement — Standard T&C

> Thai contract law per Civil & Commercial Code. Slot fields `{{slot}}`.
> Save filled drafts to `00_Legal/_drafts/`.

---

## SUPPLIER AGREEMENT / สัญญาการจัดหาสินค้า

This Agreement is made on {{contract_date}} between:

**Buyer:** Shishka Healthy Food Co., Ltd.
Registration No. 0835568025951
Address: {{buyer_address}}
Represented by: {{buyer_signatory}}, {{buyer_signatory_title}}

**Supplier:** {{supplier_name}}
Registration / Tax ID: {{supplier_tax_id}}
Address: {{supplier_address}}
Represented by: {{supplier_signatory}}, {{supplier_signatory_title}}

### 1. Scope of supply
Supplier shall supply Buyer with the following:
{{products_list_with_specs}}

### 2. Pricing
Unit prices as per attached price list (Schedule A), valid until {{price_validity_date}}.
Price changes: Supplier must give {{price_change_notice_days}} days written notice.
Currency: Thai Baht (THB), VAT-inclusive / -exclusive: {{vat_treatment}}.

### 3. Order and delivery
- Buyer issues purchase orders (PO) by email to {{supplier_order_email}}.
- Supplier confirms within {{order_confirm_hours}} hours.
- Delivery lead time: {{lead_time}} from PO confirmation.
- Delivery location: {{delivery_address}} (Buyer's L1 / L2 kitchen).
- Partial deliveries: {{partial_delivery_permitted_yn}}

### 4. Quality and inspection
- Supplier warrants goods conform to attached specifications.
- Buyer has {{inspection_period}} hours after delivery to inspect and reject defective goods.
- Rejected goods: Supplier collects at own cost within 48 hours; replacement or refund within 7 days.

### 5. Payment terms
- Invoice issued upon delivery acceptance.
- Payment: {{payment_terms}} (e.g., 30 days from invoice, COD, advance).
- Method: bank transfer to {{supplier_bank_account}}.
- Late payment: {{late_payment_interest}}% per month (statutory max 15%/year per CCC).
- Withholding tax: per Revenue Code — Buyer withholds {{wht_rate}}% per relevant category and remits to Revenue Department; issues PND certificate.

### 6. Force majeure
Neither party liable for delays caused by acts of God, government action, war, pandemic, or other events beyond reasonable control. Notification within 7 days of event; performance suspended until force majeure ends.

### 7. Term and termination
- Term: {{contract_term}} from signing date.
- Termination for breach: {{breach_notice_days}} days written notice + opportunity to cure.
- Termination for convenience: {{convenience_notice_days}} days written notice by either party.

### 8. Confidentiality
Each party shall maintain confidentiality of the other's pricing, customer lists, recipes, and trade secrets. Survives termination by 2 years.

### 9. Governing law and dispute resolution
- Governed by the laws of the Kingdom of Thailand.
- Disputes: first negotiation in good faith; then mediation; then Thai courts in {{forum_province}}.
- (Optional arbitration clause if contract > THB 500k — escalate to Mr. Ram.)

### 10. Entire agreement
This document and Schedule A (price list) constitute the entire agreement. Amendments in writing signed by both parties.

### Signatures

Buyer: ___________________________ Date: ___________
{{buyer_signatory}}, {{buyer_signatory_title}}

Supplier: ___________________________ Date: ___________
{{supplier_signatory}}, {{supplier_signatory_title}}

---

## Sol's drafting checklist

- [ ] Counterparty exists (verify via DBD search if Thai company)
- [ ] Counterparty has tax ID and VAT registration (if applicable)
- [ ] Contract value: if total annual > THB 500k → hard escalation, Mr. Ram before signing
- [ ] Withholding tax rate correct per Revenue Code category (services 3%, professional fees 5%, advertising 2%, etc.)
- [ ] Force majeure clause covers Shishka's known risks (Thai floods, immigration changes, FDA action)
- [ ] Late payment interest ≤ 15%/year (statutory cap)
- [ ] Forum province: Phuket for current operations, but check supplier's preferred jurisdiction
