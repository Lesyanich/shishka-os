# LEG-011 — House registration (ทะเบียนบ้าน) · Mr. Lamphoei Nakhowong

> Extract from the Thai house-registration book (Tabien Baan) for the sole director's registered
> residence in Bueng Kan. Filed as the companion KYC document to [[LEG-010]].

> [!caution] Personal data — PDPA
> Contains third-party personal data (the director's parents' names, a family member's ID number).
> ID numbers are **masked** below; the unmasked scan is on the original PDF in Drive.
> Do not redistribute beyond the KYC purpose it was collected for.

| Field | Value |
|---|---|
| Register ID | LEG-011 |
| Doc type | `registration` (director / shareholder KYC) |
| Instrument | ทะเบียนบ้าน — รายการเกี่ยวกับบ้าน (house registration, house particulars + person entry) |
| Source file | `20260729-2207.pdf` (1 page, photocopy of 2 book pages) |
| Status | active |

---

## Part 1 — รายการเกี่ยวกับบ้าน · House particulars

| Field | Thai | Value |
|---|---|---|
| Volume | เล่มที่ | 1 |
| House code | เลขรหัสประจำบ้าน | **3801-002268-3** |
| Registrar office | สำนักทะเบียน | **อำเภอเมืองบึงกาฬ** (Mueang Bueng Kan District) |
| Address | รายการที่อยู่ | **197 หมู่ที่ 3, ต.นาสวรรค์, อ.เมืองบึงกาฬ, จ.บึงกาฬ** |
| Village name | ชื่อหมู่บ้าน | บ้านโนนสวาก |
| Householder | ชื่อบ้าน (เจ้าบ้าน) | **น.ส. รัสมี ศรีกุดหล้า** |
| House type | ประเภทบ้าน | บ้าน (house) |
| Building character | ลักษณะบ้าน | ตึกเดี่ยว (detached) |
| House number assigned | วันเดือนปีที่กำหนดเลขที่ | 19 กันยายน 2556 = **19 September 2013** |
| Book printed | วันเดือนปีที่พิมพ์ทะเบียนบ้าน | 13 พฤศจิกายน 2557 = **13 November 2014** |
| Registrar signature | นายทะเบียน | (น.ส. รจวรรณ จันทรวิจิตรกุล) |

> The **householder (เจ้าบ้าน) is น.ส. รัสมี ศรีกุดหล้า**, not Mr. Lamphoei. He is registered at this
> address as a **resident**, not as the householder — see Part 2.

## Part 2 — รายการบุคคลในบ้าน · Person entry

| Field | Thai | Value |
|---|---|---|
| Volume / entry no. | เล่มที่ / ลำดับที่ | 1 / **8** |
| House code | เลขรหัสประจำบ้าน | 3801-002268-3 |
| Name | ชื่อ | **นายลำเพย นาโควงค์** (Mr. Lamphoei Nakhowong) |
| Nationality | สัญชาติ | ไทย (Thai) |
| Sex | เพศ | ชาย (male) |
| ID number | เลขประจำตัวประชาชน | **3-4711-XXXXX-76-2** (masked) |
| Status in household | สถานภาพ | **ผู้อาศัย** (resident, not householder) |
| Date of birth | เกิดเมื่อ | 11 ม.ค. 2514 = **11 January 1971** |
| Father | บิดาชื่อ | เล้วย (nationality ไทย) |
| Mother | มารดาชื่อ | กองอินทร์ — ID 3-4711-XXXXX-73-8 (nationality ไทย) |
| Source of entry | มาจาก | ฐานข้อมูลการทะเบียนราษฎร (civil registration database) |
| Moved in on | เข้ามาอยู่ในบ้านนี้เมื่อ | 13 พ.ย. 2557 = **13 November 2014** |

---

## Consistency check

| Field | This document | ID card ([[LEG-010]]) | บอจ.5 ([[LEG-006]]) | Match |
|---|---|---|---|---|
| Name | นายลำเพย นาโควงค์ | นาย ลำเพย นาโควงค์ | นายลำเพย นาโควงค์ | ✅ |
| ID | `3-4711-…-76-2` | `3 4711 …76 2` | `3471XXXXX7762` | ✅ |
| DOB | 11 Jan 1971 | 11 Jan 1971 | age 54 at Dec 2025 | ✅ |
| Address | 197 ม.3 ต.นาสวรรค์ อ.เมืองบึงกาฬ | same | same + postcode 38000 | ✅ |

Identity confirmed across all three sources.

> The parents' ID prefix `3-4711-…` is a **Sakon Nakhon** series, while the current registration is in
> **Bueng Kan (38xxx)**. This is expected: Bueng Kan was split off from Nong Khai in 2011, and family
> ID series predate current provincial boundaries. Not a discrepancy.

---

## Legal notes

### What a Tabien Baan does and does not prove

The house registration under the **Civil Registration Act B.E. 2534** proves **registered residence**,
not ownership. Mr. Lamphoei is recorded as **ผู้อาศัย (resident)**, not เจ้าบ้าน (householder) — so this
document says nothing about his property holdings and should not be read as a statement of means.

Its use here is narrow and standard: banks, DBD and platform onboarding routinely require a director's
ID **plus** Tabien Baan as the address-verification pair.

### Householder duties printed on the reverse

The statutory notice reproduced on the page (per the Civil Registration Act) obliges the **householder**
to notify: a birth within **15 days**, a death within **24 hours**, and any move in or out within
**15 days**. Fine up to **THB 1,000** for non-compliance. These duties fall on น.ส. รัสมี ศรีกุดหล้า,
not on Mr. Lamphoei — noted only so the obligations are not misattributed.

### Certification status

Like [[LEG-010]], this is a **plain photocopy with no "สำเนาถูกต้อง" endorsement**. For any filing it
must be certified by the cardholder — and, where the householder's page is included, ideally by the
householder as well.

---

## Open questions

1. **Obtain a certified true copy** for the GrabFood pack and bank KYC (MC `eb96d421`).
2. **Who is น.ส. รัสมี ศรีกุดหล้า** to Mr. Lamphoei? Not legally required for our purposes, but if a
   bank asks why the director is a resident rather than the householder, the answer should be ready.
3. This copy was **printed 13 November 2014**. Banks frequently require a Tabien Baan extract issued
   within the last 3–6 months. A **fresh extract** will likely be needed — obtainable at any district
   office (ที่ว่าการอำเภอ) by the householder or the registered person.

## Cross-references

- [[LEG-010]] — his Thai national ID card (same person, same address)
- [[LEG-006]] — DBD incorporation file: sole director, 24,500 shares (49%) at incorporation
- MC `eb96d421` — GRAB-2: assemble the GrabFood document pack (certified copies)
