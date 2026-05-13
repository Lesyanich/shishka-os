# Template: Letter to Government Agency

> Bilingual EN/TH. Slot fields use `{{slot_name}}` for substitution.
> Common destinations: DBD, Revenue Department, Department of Employment, FDA (อย.), Tessaban.

---

## English version

**To:** {{agency_name}}
**Attn:** {{recipient_name_or_dept}}
**From:** Shishka Healthy Food Co., Ltd.
   Registration No: 0835568025951
   Address: {{registered_address}}
   Tel: {{phone}} | Email: {{email}}
**Date:** {{date}}
**Re:** {{subject}}
**Ref:** {{reference_number_if_any}}

Dear Sir/Madam,

{{body_paragraph_1_purpose}}

{{body_paragraph_2_details}}

{{body_paragraph_3_request_or_action}}

Should you require additional information or documentation, please contact the undersigned at {{contact_method}}.

Thank you for your attention to this matter.

Yours faithfully,

_________________________
{{signatory_name}}
{{signatory_title}} (Work Permit No. 0769830000874)
Shishka Healthy Food Co., Ltd.

---

## Thai version (Sol drafts in parallel)

เรียน {{agency_name_th}}

ที่: {{reference_th}}
เรื่อง: {{subject_th}}
วันที่: {{date_th}}

ด้วย บริษัท ชีชกา เฮลท์ตี้ ฟู้ด จำกัด ทะเบียนเลขที่ 0835568025951 มีความประสงค์ {{purpose_th}}

{{body_th}}

จึงเรียนมาเพื่อโปรดพิจารณา

ขอแสดงความนับถือ

___________________________
{{signatory_name_th}}
{{signatory_title_th}}
ใบอนุญาตทำงานเลขที่ 0769830000874

---

## Slot-filling guide for Sol

| Slot | Where to find / decide |
|---|---|
| `{{agency_name}}` | CEO specifies (e.g. "Department of Business Development") |
| `{{registered_address}}` | LEG-001 register entry |
| `{{date}}` | Today's date in `D Month YYYY` (English) / `วันที่ DD เดือน YYYY พ.ศ. BE` (Thai) |
| `{{subject}}` | Sol drafts from purpose |
| `{{signatory_name}}` | Default Lesia Kostiukova; CEO can override |
| `{{signatory_title}}` | "General Manager" (per LEG-002 permitted category) |

Always save filled draft to `00_Legal/_drafts/YYYY-MM-DD__Letter_to_<agency>__<purpose>.pdf` before sending to CEO for review.
