# LEG-010 — Thai National ID card · Mr. Lamphoei Nakhowong (sole director)

> [!info] Why this is in the legal archive
> Mr. Lamphoei Nakhowong is the **sole director** of Shishka Healthy Food Co., Ltd. and, per the
> incorporation บอจ.5, holder of 24,500 shares (49%). His ID is the standard KYC attachment for
> bank account opening, DBD filings, supplier contracts and platform onboarding (GrabFood).

> [!caution] Personal data — PDPA
> ID numbers below are **masked** in DBD style (first 4 / last 4). The unmasked card is on the
> original PDF in Drive. Do not copy the full number into tickets, chats, or any repo file.
> Lawful basis for holding it: contractual necessity + legal obligation (PDPA §24(3), §24(6)).

| Field | Value |
|---|---|
| Register ID | LEG-010 |
| Doc type | `registration` (director / shareholder KYC) |
| Instrument | บัตรประจำตัวประชาชน — Thai National ID Card |
| Source file | `ID mr L.pdf` (1 page, photocopy) |
| Status | active |

---

## Card data

| Field | Thai | Value |
|---|---|---|
| Identification number | เลขประจำตัวประชาชน | **3 4711 XXXXX 76 2** (masked; DBD form: `3471XXXXX7762`) |
| Name | ชื่อตัวและชื่อสกุล | **นาย ลำเพย นาโควงค์** |
| Name (English, as printed) | — | **Mr. Lamphoei** / Last name **Nakhowong** |
| Date of birth | เกิดวันที่ | 11 ม.ค. 2514 = **11 January 1971** |
| Religion | ศาสนา | พุทธ (Buddhist) |
| Address | ที่อยู่ | **197 หมู่ที่ 3 ต.นาสวรรค์ อ.เมืองบึงกาฬ จ.บึงกาฬ** |
| Date of issue | วันออกบัตร | 25 พ.ค. 2567 = **25 May 2024** |
| Date of expiry | วันบัตรหมดอายุ | 10 ม.ค. 2575 = **10 January 2032** |
| Card serial | — | **8301-05-05251456** |

The English transliteration **"Lamphoei Nakhowong"** is taken from the card's own English line — use
this spelling in all English-language documents rather than any re-romanisation.

---

## Consistency check against other records

| Field | This card (LEG-010) | บอจ.2 / บอจ.5 ([[LEG-006]]) | House registration ([[LEG-011]]) | Match |
|---|---|---|---|---|
| ID number | `3 4711 …76 2` | `3471XXXXX7762` | `3-4711-00417-76-2` | ✅ |
| Name | นาย ลำเพย นาโควงค์ | นายลำเพย นาโควงค์ | นายลำเพย นาโควงค์ | ✅ |
| DOB | 11 Jan 1971 | age 54 (at Dec 2025) | เกิดเมื่อ 11 ม.ค. 2514 | ✅ |
| Address | 197 ม.3 ต.นาสวรรค์ อ.เมืองบึงกาฬ จ.บึงกาฬ | 197 หมู่ที่ 3 ต.นาสวรรค์ อ.เมืองบึงกาฬ จ.บึงกาฬ 38000 | 197 หมู่ที่ 3 ต.นาสวรรค์ อ.เมืองบึงกาฬ จ.บึงกาฬ | ✅ |

All three sources agree. Identity is consistent across the incorporation file, the ID card and the
house registration.

> Note the ตำบล: the house-registration scan is faint and can read as "ผาสวรรค์", but the ID card
> renders it clearly as **นาสวรรค์ (Na Sawan)**. The ID card governs.

---

## Legal notes

### Role: director, and only director

**บอจ.3 ข้อ 5** ([[LEG-006]]) records **one director**. **ข้อ 6** gives signing authority as *"one
director signs and affixes the company seal"*. Mr. Lamphoei is the director who signed the
registration application.

Practical consequence: **he alone can bind the company.** With no bespoke articles (บอจ.3 ข้อ 11 —
the CCC applies by default), there is no second-signature requirement, no board quorum to satisfy, and
no reserved-matters list. Every contract, bank mandate and filing runs through one signature plus the
seal.

### Certified copies

For DBD, banks and GrabFood, a photocopy is not enough — each copy must be signed
**"สำเนาถูกต้อง"** (certified true copy) by the cardholder, ideally with the purpose written across
the copy (e.g. *"ใช้สำหรับสมัคร GrabFood เท่านั้น"* — for GrabFood application only). Writing the
purpose on the copy is the standard Thai practice to stop a copy being reused elsewhere.

**This scan is not certified** — it carries no "สำเนาถูกต้อง" endorsement. Compare
[[LEG-007]] page 2, where the lessor's ID copy *is* properly certified. A certified copy will need to
be obtained from Mr. Lamphoei before it can be filed with anyone.

### Expiry

Card valid to **10 January 2032** — no near-term action. Thai ID cards are renewed on the holder's
birthday cycle; this one runs 8 years from issue.

### Address is not local

Registered in **Bueng Kan province (38000)**, ~1,600 km from Phuket. Not a legal defect in itself —
a director need not reside where the company operates — but it is a practical constraint: every
document requiring his wet signature has to travel, or he has to. Worth planning around for the
overdue AGM and any DBD filing.

---

## Open questions

1. **Obtain a certified true copy** (สำเนาถูกต้อง, signed, purpose annotated) — needed for GrabFood
   onboarding (MC `eb96d421`) and any bank mandate.
2. **Is he still the director?** The register data is from December 2025. A director change is filed on
   **form บอจ.4**, separately from any share transfer. Included in the questions put to Mr. Ram
   2026-07-29.
3. **Does he hold a house-registration book (ทะเบียนบ้าน) entry in Phuket?** He is registered in Bueng
   Kan — relevant if any permit requires a locally-registered director.

## Cross-references

- [[LEG-006]] — DBD incorporation file: sole director, 24,500 shares (49%) at incorporation
- [[LEG-011]] — his house registration (ทะเบียนบ้าน), same address
- MC `eb96d421` — GRAB-2: assemble the GrabFood document pack (certified copies)
- MC `0cd16ad1` — compliance status with Ram
