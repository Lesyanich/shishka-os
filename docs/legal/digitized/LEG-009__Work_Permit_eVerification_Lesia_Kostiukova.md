# LEG-009 — e-Work Permit verification · Olesia Kostiukova

> Electronic verification printout from the Department of Employment's e-WorkPermit system
> (ระบบอนุญาตทำงานของคนต่างด้าวทางอิเล็กทรอนิกส์), confirming the work permit already on file as
> **LEG-002** is valid. This is the *verification*, not the permit itself.

| Field | Value |
|---|---|
| Register ID | LEG-009 |
| Doc type | `work_permit` (verification printout) |
| System | e-WorkPermit v1.4.0 — กรมการจัดหางาน กระทรวงแรงงาน (Department of Employment, Ministry of Labour) |
| Result | **ได้รับใบอนุญาตทำงาน · Valid Work Permit · ตรวจสอบสำเร็จ** |
| Data as at | 28 กรกฎาคม 2569 = **28 July 2026** |
| Verifies | LEG-002 (Work Permit 0769830000874) |
| Source file | `e-WorkPermit · ตรวจสอบใบอนุญาตทำงาน.pdf` (2 pages) |
| Status | active |

---

## ข้อมูลคนต่างด้าว · Foreigner information

| Field | Thai | Value |
|---|---|---|
| Full name | นางสาว โอลีเซีย โคสติอูโควา | **Miss Olesia Kostiukova** |
| Nationality | รัสเซีย | **Russian** |
| Date of birth | 2 มกราคม 2533 | **2 January 1990** |

> Note the spelling on the official record: **Olesia Kostiukova**. Our register (LEG-002) carries
> "Lesia Kostiukova". Same person — but for anything filed with a Thai authority, bank, or platform,
> use the spelling exactly as it appears here, character for character.

## ข้อมูลใบอนุญาตทำงานในประเทศไทย · Work permit information

| Field | Thai | Value |
|---|---|---|
| Foreigner reference no. | หมายเลขประจำตัวคนต่างด้าว | **6983000019055** |
| Work permit no. | ใบอนุญาตทำงานเลขที่ | **0769830000874** |
| Permitted category / position | ประเภทงานที่ได้รับอนุญาต | **ผู้จัดการทั่วไป** (General Manager) |
| Date of issue | วันที่ออกใบอนุญาต | 25 เมษายน 2569 = **25 April 2026** |
| Valid until | วันสิ้นสุดใบอนุญาต | 24 เมษายน 2570 = **24 April 2027** |
| Serial card no. | หมายเลขบัตร | **0117206060006** |
| Issuer name | ชื่อผู้ออกบัตร | นายสมชาย มรกตศรีวรรณ |
| Issuer place | สถานที่ออกบัตร | **ภูเก็ต** (Phuket) |

## ข้อมูลเอกสารเข้าราชอาณาจักร · Entry document

| Field | Value |
|---|---|
| Document type | หนังสือเดินทาง (**Passport**) |
| Document no. | **776420509** |
| Issued | 4 มิถุนายน 2568 = **4 June 2025** |
| Expires | 4 มิถุนายน 2578 = **4 June 2035** |

## ข้อมูลการจ้างงาน · Employment information

**นายจ้างหลัก · Primary employer**

| Field | Thai | Value |
|---|---|---|
| Company / employer | บริษัท ชีซกา เฮลท์ตี้ ฟู้ด จำกัด | **SHISHKA HEALTHY FOOD CO., LTD.** |
| Permitted position | ผู้จัดการทั่วไป | General Manager |
| Working description | ควบคุมดูแลบริหารงานตลอดจนรับผิดชอบดูแลธุรกิจ | Supervising, managing and being responsible for the business |
| **Workplace** | **86/139 7 ตำบลราไวย์ อำเภอเมืองภูเก็ต จังหวัดภูเก็ต 83130** | 86/139 M.7, Rawai, Mueang Phuket, Phuket 83130 |

---

## Legal notes

### The permit is tied to three things at once — all of them changeable

Under the **Royal Decree on Managing the Work of Aliens B.E. 2560 (as amended B.E. 2561)**, this
permit authorises Olesia Kostiukova to perform **one position** (General Manager), for **one employer**
(Shishka Healthy Food Co., Ltd.), at **one workplace** (86/139 M.7 Rawai).

Change any of the three and the permit must be varied **before** the change takes effect:

| Change | Consequence |
|---|---|
| New/second workplace (e.g. the branch at 31/83 M.1 Rawai, or an L2 site) | Working there without adding it to the permit is **working outside the permitted conditions** |
| Change of position or duties | Requires variation |
| Change of employer | Requires a **new** permit, not a variation |

> [!warning] The branch office is not on this permit
> บอจ.3 ข้อ 8 ([[LEG-006]]) registers a **branch at 31/83 หมู่ที่ 1 ต.ราไวย์**. This work permit lists
> **only 86/139 M.7** as the workplace. If any work is being performed at 31/83, the permit needs the
> second location added. Penalty for working outside permitted conditions: fine **THB 5,000–50,000**,
> plus possible deportation and a **2-year bar** on obtaining a new permit.

### Workplace address = the L1 lease premises = the registered head office

All three point at 86/139 M.7 Rawai. That address is leased **personally by Mr. Anuphap**
([[LEG-007]]), not by the company. If the lease were ever terminated under clause 8, it would take
the registered office **and** the work-permit workplace with it. That is the quiet dependency worth
noting.

### Visa is a separate track

A work permit is not a visa. The Non-B / extension of stay under the **Immigration Act B.E. 2522** runs
on its own clock and must be extended separately, plus **90-day reporting** (§37(5)). **No visa
document has been provided** — `00_Legal/03_Visas/` is empty. See open questions.

### Renewal timing

Permit expires **24 April 2027**. Renewal should be filed at **T-60 = 24 February 2027** at the latest;
DOE will not accept a renewal after expiry — a lapsed permit means a fresh application.
MC task `af2b6166` already carries this deadline.

---

## Open questions

1. **Where is the visa?** No Non-B or extension-of-stay document is on file, and `03_Visas/` is empty.
   The work permit is valid to 24 Apr 2027, but permission to *stay* is a separate document with a
   separate expiry — and it is usually the shorter of the two. **Obtain and file.**
2. **When is the next 90-day report due?** Immigration Act §37(5). Not derivable from this document.
3. **Is Basel Al Saleem working?** He witnesses the L1 lease ([[LEG-007]]) and is described by the CEO
   as a co-owner. If he performs any work in Thailand he needs his own permit — there is none on file.
   *Working without a permit:* fine **THB 5,000–50,000** and deportation.
4. Should the branch at 31/83 M.1 be added as a second workplace?
5. Register spelling — align LEG-002 to the official **"Olesia Kostiukova"**, or note both.

## Cross-references

- **LEG-002** — the underlying work permit 0769830000874 (this document verifies it)
- [[LEG-006]] — DBD file: employer identity, registered offices incl. the unlisted branch
- [[LEG-007]] — L1 lease: the workplace address, leased personally by a third party
- MC `af2b6166` — Work Permit renewal deadline (2027-02-24)
- Register: `docs/operations/company-documents-register.md`
