-- 373_kb_working_hours_page.sql
-- Handbook page: working hours, clocking in, and what lateness costs.
--
-- LEG-004 §5 only holds up if the employee knew the rule (that is the
-- employer's burden of proof), and "knew" cannot mean an English PDF handed to
-- a Burmese cook. This is the staff-facing plain-language version of the
-- policy, trilingual, on a page they already use — the evidence that the rule
-- was published, alongside the signed acknowledgment (Appendix B).
--
-- Translations are written offline and stored (RULE: never a live paid LLM per
-- view). Thai and Burmese are accurate working drafts — have a native speaker
-- confirm before treating them as served notice.

INSERT INTO public.kb_pages (parent_id, slug, sort_order, min_role, created_by)
SELECT p.id, 'working-hours-and-punctuality', 15, 'cook', 'claude-code'
FROM public.kb_pages p
WHERE p.slug = 'company'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.kb_page_translations (page_id, lang, title, body_md)
SELECT pg.id, 'en', 'Working hours & clocking in',
$md$## Your schedule
Your shifts are in the app: **My Schedule**. Standard hours are up to 8 hours a
day, 48 hours a week. If your schedule changes, you are told at least a day
ahead.

## Clock in — every shift
When you arrive, open the app and press **Start shift**. At the end, press
**End shift**. A banner reminds you 30 minutes before your shift starts.

**This is how your hours are recorded.** Not a notebook, not memory — the app.

- You can only clock in as yourself. The button knows who you are.
- Forgot to press it? Tell the owner **the same day** and it can be corrected.

## Being late
There is a **10-minute grace period**. Arriving later than that counts as late,
and late minutes are counted from your shift start time.

Minutes you did not work are **not paid**. This is not a fine — Thai law does
not allow fines. You are simply paid for the time you work. The amount appears
on your payslip as **"hours not worked"**.

## If something happens
Life happens: illness, a sick child, transport. **Tell us before your shift** —
a message is enough. If the reason is genuine and you told us, the owner marks
the day **excused**: it does not count against you and your pay is not touched.

Sick leave is your legal right and is **paid** — it is not lateness and is
never treated as one. See the attendance policy for details.

## If lateness keeps happening
Repeated lateness **without a reason and without telling us**:

1. Verbal warning
2. Written warning
3. Final written warning
4. Termination

A written warning stays on file for one year. Under Thai labour law (§119(4)),
continued breach after a written warning allows dismissal without severance
pay. Nobody wants that — tell us when something goes wrong, and it will not
get there.

## Questions
Ask the owner. If anything here is unclear in your language, ask and we will
explain it in person.$md$
FROM public.kb_pages pg
WHERE pg.slug = 'working-hours-and-punctuality'
ON CONFLICT DO NOTHING;

INSERT INTO public.kb_page_translations (page_id, lang, title, body_md)
SELECT pg.id, 'th', 'เวลาทำงานและการลงเวลา',
$md$## ตารางงานของคุณ
กะของคุณอยู่ในแอป: **ตารางงานของฉัน** เวลาทำงานปกติไม่เกิน 8 ชั่วโมงต่อวัน
และ 48 ชั่วโมงต่อสัปดาห์ หากตารางเปลี่ยน เราจะแจ้งล่วงหน้าอย่างน้อย 1 วัน

## ลงเวลาทุกกะ
เมื่อมาถึง เปิดแอปแล้วกด **เริ่มกะ** เมื่อเลิกงานกด **จบกะ**
จะมีข้อความเตือน 30 นาทีก่อนกะเริ่ม

**นี่คือวิธีบันทึกชั่วโมงทำงานของคุณ** ไม่ใช่สมุด ไม่ใช่ความจำ — แต่เป็นแอป

- คุณลงเวลาได้เฉพาะของตัวเองเท่านั้น ระบบรู้ว่าคุณเป็นใคร
- ลืมกด? แจ้งเจ้าของ **ในวันเดียวกัน** เพื่อแก้ไขได้

## การมาสาย
มีการ **ผ่อนผัน 10 นาที** หากมาช้ากว่านั้นถือว่าสาย
และนับนาทีที่สายจากเวลาเริ่มกะ

นาทีที่ไม่ได้ทำงาน **จะไม่ได้รับค่าจ้าง** นี่ไม่ใช่ค่าปรับ —
กฎหมายไทยไม่อนุญาตให้ปรับเงิน คุณได้รับค่าจ้างตามเวลาที่ทำงานจริง
จำนวนเงินจะแสดงในสลิปเงินเดือนว่า **"ชั่วโมงที่ไม่ได้ทำงาน"**

## หากมีเหตุจำเป็น
เรื่องไม่คาดคิดเกิดขึ้นได้: เจ็บป่วย ลูกไม่สบาย รถมีปัญหา
**แจ้งเราก่อนเริ่มกะ** — ส่งข้อความก็พอ หากมีเหตุอันสมควรและแจ้งล่วงหน้า
เจ้าของจะทำเครื่องหมายว่า **มีเหตุอันสมควร**: จะไม่นับเป็นความผิด
และไม่กระทบค่าจ้างของคุณ

การลาป่วยเป็นสิทธิตามกฎหมายของคุณและ **ได้รับค่าจ้าง** —
ไม่ถือเป็นการมาสายและจะไม่ถูกนับเป็นการมาสาย ดูรายละเอียดในนโยบายการลา

## หากมาสายซ้ำ
การมาสายซ้ำ **โดยไม่มีเหตุผลและไม่แจ้ง**:

1. ตักเตือนด้วยวาจา
2. หนังสือเตือน
3. หนังสือเตือนครั้งสุดท้าย
4. เลิกจ้าง

หนังสือเตือนมีผลหนึ่งปี ตามพระราชบัญญัติคุ้มครองแรงงาน มาตรา 119(4)
การฝ่าฝืนซ้ำหลังได้รับหนังสือเตือน บริษัทสามารถเลิกจ้างโดยไม่จ่ายค่าชดเชยได้
ไม่มีใครอยากให้ถึงจุดนั้น — แจ้งเราเมื่อมีปัญหา แล้วจะไม่ไปถึงตรงนั้น

## มีคำถาม
ถามเจ้าของได้เลย หากมีสิ่งใดไม่ชัดเจนในภาษาของคุณ
บอกเรา แล้วเราจะอธิบายให้ฟังด้วยตนเอง$md$
FROM public.kb_pages pg
WHERE pg.slug = 'working-hours-and-punctuality'
ON CONFLICT DO NOTHING;

INSERT INTO public.kb_page_translations (page_id, lang, title, body_md)
SELECT pg.id, 'my', 'အလုပ်ချိန်နှင့် အချိန်မှတ်တမ်းတင်ခြင်း',
$md$## သင့်အလုပ်ဇယား
သင့်အလှည့်များကို အက်ပ်ထဲတွင် ကြည့်ပါ: **ကျွန်ုပ်၏အလုပ်ဇယား**။
ပုံမှန်အလုပ်ချိန်မှာ တစ်ရက်လျှင် ၈ နာရီ၊ တစ်ပတ်လျှင် ၄၈ နာရီအထိဖြစ်သည်။
ဇယားပြောင်းလဲပါက အနည်းဆုံး တစ်ရက်ကြိုတင်၍ အကြောင်းကြားပါမည်။

## အလှည့်တိုင်း အချိန်မှတ်ပါ
ရောက်သည်နှင့် အက်ပ်ကိုဖွင့်၍ **အလှည့်စတင်ရန်** ကိုနှိပ်ပါ။
အလုပ်ဆင်းချိန်တွင် **အလှည့်ပြီးဆုံးရန်** ကိုနှိပ်ပါ။
အလှည့်မစမီ ၃၀ မိနစ်အလိုတွင် သတိပေးချက်ပေါ်လာပါမည်။

**ဤသည်မှာ သင့်အလုပ်ချိန်ကို မှတ်တမ်းတင်သည့်နည်းဖြစ်သည်။**
စာအုပ်မဟုတ်၊ မှတ်ဉာဏ်မဟုတ် — အက်ပ်ဖြစ်သည်။

- သင်ကိုယ်တိုင်အတွက်သာ အချိန်မှတ်နိုင်သည်။ စနစ်က သင်မည်သူဖြစ်ကြောင်း သိသည်။
- နှိပ်ရန်မေ့သွားပါသလား? **တစ်နေ့တည်းအတွင်း** ပိုင်ရှင်ကို ပြောပါ၊ ပြင်ဆင်ပေးနိုင်သည်။

## နောက်ကျခြင်း
**၁၀ မိနစ် ခွင့်လွှတ်ချိန်** ရှိသည်။ ထိုအချိန်ထက်နောက်ကျပါက နောက်ကျသည်ဟု သတ်မှတ်ပြီး၊
နောက်ကျသည့်မိနစ်များကို အလှည့်စချိန်မှစ၍ ရေတွက်သည်။

အလုပ်မလုပ်ခဲ့သည့် မိနစ်များအတွက် **လုပ်ခမရပါ**။ ဤသည်မှာ ဒဏ်ငွေမဟုတ်ပါ —
ထိုင်းဥပဒေအရ ဒဏ်ငွေရိုက်ခွင့်မရှိပါ။ သင်အလုပ်လုပ်သည့်အချိန်အတွက်သာ လုပ်ခရသည်။
ထိုပမာဏကို လစာစာရွက်တွင် **"အလုပ်မလုပ်ရသေးသောနာရီများ"** အဖြစ် ဖော်ပြပါမည်။

## တစ်စုံတစ်ရာ ဖြစ်ပွားပါက
ဘဝတွင် အခက်အခဲများရှိတတ်သည်: ဖျားနာခြင်း၊ ကလေးဖျားခြင်း၊ ကားပျက်ခြင်း။
**အလှည့်မတိုင်မီ ကျွန်ုပ်တို့ကို အကြောင်းကြားပါ** — မက်ဆေ့ခ်ျတစ်စောင်ဖြင့် လုံလောက်သည်။
အကြောင်းရင်းမှန်ကန်ပြီး ကြိုတင်အကြောင်းကြားထားပါက ပိုင်ရှင်က ထိုနေ့ကို
**ခွင့်ပြုထားသည်** ဟု မှတ်သားပါမည်: သင့်အပေါ် အပြစ်မတင်ပါ၊ လုပ်ခလည်း မထိခိုက်ပါ။

နာမကျန်းခွင့်သည် သင့်ဥပဒေဆိုင်ရာအခွင့်အရေးဖြစ်ပြီး **လုပ်ခရရှိသည်** —
၎င်းသည် နောက်ကျခြင်းမဟုတ်ဘဲ ထိုသို့လည်း ဘယ်သောအခါမျှ မသတ်မှတ်ပါ။

## နောက်ကျမှု ဆက်လက်ဖြစ်ပွားပါက
**အကြောင်းရင်းမရှိဘဲ၊ အကြောင်းမကြားဘဲ** နောက်ကျမှုများ ထပ်ခါထပ်ခါဖြစ်ပါက:

၁။ နှုတ်ဖြင့် သတိပေးခြင်း
၂။ စာဖြင့် သတိပေးခြင်း
၃။ နောက်ဆုံးအကြိမ် စာဖြင့် သတိပေးခြင်း
၄။ အလုပ်မှ ထုတ်ပယ်ခြင်း

စာဖြင့်သတိပေးချက်သည် တစ်နှစ်ကြာ မှတ်တမ်းတွင်ရှိနေမည်။ ထိုင်းအလုပ်သမားဥပဒေ
ပုဒ်မ ၁၁၉(၄) အရ စာဖြင့်သတိပေးပြီးနောက် ဆက်လက်ဖောက်ဖျက်ပါက နစ်နာကြေးမပေးဘဲ
အလုပ်မှထုတ်ပယ်နိုင်သည်။ မည်သူမျှ ထိုသို့မဖြစ်စေလိုပါ —
ပြဿနာရှိလျှင် ကျွန်ုပ်တို့ကို ပြောပါ၊ ထိုအခြေအနေအထိ ရောက်မည်မဟုတ်ပါ။

## မေးခွန်းများ
ပိုင်ရှင်ကို မေးပါ။ ဤစာတွင် သင့်ဘာသာစကားဖြင့် နားမလည်သည့်အရာရှိပါက
ပြောပါ၊ ကိုယ်တိုင်ရှင်းပြပါမည်။$md$
FROM public.kb_pages pg
WHERE pg.slug = 'working-hours-and-punctuality'
ON CONFLICT DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '373_kb_working_hours_page.sql',
  'claude-code',
  NULL,
  'Handbook page working-hours-and-punctuality (EN/TH/MY) — staff-facing LEG-004; publication evidence for the §119(4) ladder (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
