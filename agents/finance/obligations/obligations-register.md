# Financial Obligations Register — Shishka Healthy Kitchen

> **Last updated:** 2026-05-30 by finance-agent
> **Currency:** THB (USD debts shown native + THB equiv @ 33)
> **Source:** CEO statements + MC task 06e84930 (cash-crisis baseline)
> This is the single source of truth for what we OWE. Update on every change.

---

## 💳 Cash on hand

| Account | Amount | Note |
|---|---:|---|
| Thai card | 86,000 THB | per CEO |
| + Mazen new loan (~$1,500) | +45,000 THB | received 2026-05-30, added to card |
| **Card available** | **131,000 THB** | ⚠️ if May salaries (35,613) already withdrawn cash from this card → 95,387 |
| Personal reserve (RUB) | 160,000 RUB | 🔒 isolated — house rent Jul+Aug @ 80k. NOT business. |

---

## 📉 Debts we OWE (liabilities)

### THB-denominated
| # | Creditor | Amount | Type | Status / terms |
|---|----------|-------:|------|----------------|
| 1 | **Richie** | 60,000 | Friend/investor | 70k original − 10k paid (May). Balance flexible, ~60-day schedule. |
| 2 | **Sign-board** | 30,000 | Vendor | Creditor non-responsive. **Hold — do not pay proactively.** |
| 3 | **Mazen** (Bas's friend) | 50,000 | Personal loan | + see USD below (same person) |
| 4 | **Blessed Business (Ram)** | 45,000 | Visa/WP agent | Invoice IV-20260500021, **pending, due 2026-06-03** |
| | **Subtotal THB** | **185,000** | | |

### USD-denominated
| # | Creditor | Amount USD | ≈ THB @33 | Type |
|---|----------|-----------:|----------:|------|
| 5 | **Alla** (Bas's friend) | $4,000 | 132,000 | Personal loan |
| 6 | **Mazen** (Bas's friend) | $1,500 | 49,500 | Personal loan (new, 2026-05-30) |
| | **Subtotal USD** | **$5,500** | **181,500** | |

### Internal (director loan)
| # | Creditor | Amount | Note |
|---|----------|-------:|------|
| 7 | **Lesia (CEO)** | 60,000 THB | Tops rent Feb–Apr paid from personal savings → director's loan to company (ref lawyer task 00cf8d54) |

---

## 📊 Totals

| Bucket | Amount |
|---|---:|
| External debt — THB | 185,000 THB |
| External debt — USD | $5,500 (≈181,500 THB) |
| **External debt total** | **≈ 366,500 THB** |
| Internal (director loan) | 60,000 THB |
| **All obligations** | **≈ 426,500 THB** |

> **Mazen total = 50,000 THB + $1,500** (one person, Bas's friend).
> **Alla = $4,000** (another friend of Bas).

---

## 🔜 Immediate (next 7 days)
- **Blessed Business / Ram — 45,000 THB — due 2026-06-03.** Pay BBL Saving 7660180352. Then mark expense `4447d068` paid + attach slip.

## ⏸️ On hold / flexible
- Sign-board 30k — creditor silent, hold.
- Richie 60k — flexible ~60 days.
- Mazen, Alla (personal loans) — terms informal, no fixed date yet (CONFIRM with CEO).

## 🤝 Supplier merge done 2026-05-30
- "Blessed Business Company Limited" = "Ram" (Rammel Cadusale). Confirmed by CEO.
- All 5 legacy "Ram" expenses reassigned to Blessed Business (b8669d0a): company reg 100k, legal 5k+25k, visa/WP 119k (paid) + visa/WP/SSO 45k (pending). Old "Ram" supplier deactivated.
- Historical spend via this agent: 249,000 paid + 45,000 pending.

## 📝 Notes / to confirm
- Exchange rate: USD debts booked @ 33. Mazen's new $1,500 came in as ~45,000 THB cash (effective ~30) — actual received amount used for cash, debt tracked as $1,500.
- Need repayment dates for Mazen & Alla loans.
- Director loan (Lesia 60k) — confirm if any repayment planned or left as equity contribution.
