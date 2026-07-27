# Google review replies + review-ask asset (A2)

> Sprint A item A2 of [`aeo-kickoff-2026-07.md`](aeo-kickoff-2026-07.md) § 3; WP-2 of
> [`geo-aio-plan.md`](geo-aio-plan.md). Drafted 2026-07-27. **Nothing has been posted** —
> these are drafts for the CEO to post (or to approve for in-session posting).

## Why this is the cheapest lever on the board

Baseline evidence (plan § 5): the engines answer local-food queries from Google Places,
TripAdvisor and Reddit — **not from anybody's website**. A competitor entered Perplexity's answer
*prose* on 4.2★ with **five** reviews while we sat in the Places panel at 5.0★ with two. The gate
into the answer text is a handful of descriptive reviews, not hundreds. Review language quality
beats volume (80 descriptive reviews outrank 300 generic five-stars), and **owner replies are part
of the indexed text** — they are our only chance to put our own vocabulary into the review corpus
the engines read.

Both live reviews already do our keyword work for us unprompted: *potato dough, gluten free, no
seed oil, manakish, hummus, healthy smoothies, avo cocoa smoothie, calorie count*. The replies
below restate those terms naturally and add the two the reviews are missing — **Rawai** and
**Nai Harn** — because "near me / near the beach" prompts are where we score `absent`.

## Live state (verified 2026-07-27 on Google Maps, logged-in read-only pass)

`SHiSHKA Healthy kitchen` · **5.0★ · 2 reviews · both still unanswered.** Reply rate 0% against
WP-2's target of 100% within 24 h. No third review has landed since the 2026-07-15 audit — the
"new" review noted then is Mazen H's, which the panel now shows as "3 weeks ago".

Review keyword chips Google itself surfaces on the profile: `manakish 2` · `smoothies 2` ·
`dough 2` — i.e. Google has already extracted our product vocabulary from two reviews. That is
exactly the signal WP-2 is trying to grow.

> ⚠ **Both review texts are truncated in the public Maps panel** (Google fetches the tail only on
> a real "More" expand, which does not fire under automation). The visible text is quoted below;
> the CEO will see each review in full in the merchant Reviews panel when posting. If a tail
> contains a complaint or a factual error, adjust the reply before posting.

---

## Reply 1 — Mazen H · 5★ · ~3 weeks ago

> "We ordered a mix of thier specialty 'potatoe dough, glutten free, no seed oil' manakeesh and
> every single one was different and full of flavor ! The hummus and healthy smoothies are on a
> different level. …"

**Draft reply (post as-is):**

> Thank you, Mazen — a mixed plate is exactly how we hope people try them. The potato dough is
> what makes our manakish gluten-free, and everything here is cooked in olive oil and butter,
> never seed oils. Glad the hummus and the smoothies landed too. There are 12+ toppings, so
> there's always one you haven't had yet — see you in Rawai.

*(363 characters. Restates: potato dough, gluten-free, manakish, no seed oils, olive oil & butter,
hummus, smoothies, Rawai. Every claim is already public on the GBP description — nothing new is
asserted.)*

> ⚠ **Before posting — affiliation check (CEO only).** "Mazen H" may be the Mazen in the
> obligations register (creditor, $1.5k + ฿50k). Google's content policy prohibits reviews from
> anyone with a conflict of interest, and a flagged review can cost more than it earns. This is a
> decision, not an action item: (a) if it is a different Mazen — post the reply, nothing further;
> (b) if it is the creditor — do **not** reply in a way that thanks him as an ordinary customer,
> and decide separately whether the review should stand. Either way: **do not solicit further
> reviews from him or from any affiliated party.** Agent will not act on this without an answer.

---

## Reply 2 — Kate So · 5★ · ~1 month ago

> "such a cute new spot!!! healthy smoothies and food, finally something new 😍 I loved the
> Manakish (Eastern cuisine). It's like tiny healthy pizzas made with potato dough (what!!) and
> the avo cocoa smoothie. They've also got the calorie count everywhere 💪🏼 …"

**Draft reply (post as-is):**

> Thank you, Kate! "Tiny healthy pizzas" might be the best description of our potato manakish
> anyone has given us — the potato dough is what keeps them gluten-free, and they're cooked in
> olive oil and butter, no seed oils. Happy the choco-avocado smoothie was a hit. The calories are
> on everything on purpose: you should be able to see what you're eating before you order.
> See you again in Rawai, just up from Nai Harn.

*(437 characters. Restates: potato manakish, potato dough, gluten-free, olive oil & butter, no seed
oils, choco-avocado smoothie, calorie counts, Rawai, Nai Harn.)*

---

### Vocabulary note — "manakish" vs "Potato Tacos"

Both replies use **manakish**, because that is the word both guests used and because it is our
established searchable synonym (decision D4's recommendation). The DB has already renamed the
section to **Potato Tacos** and revamp `abe7301a` is still in flight, so the new name is
deliberately *not* introduced here — a reply is a bad place to debut a name the guest never saw
and the GBP menu does not yet carry. Once the revamp lands and GBP is resynced (A1), append to
either reply:

> …you'll see them on the menu as Potato Tacos now — same potato dough, same gluten-free.

Keeping both words in the same reply is the AEO win: it links the two terms in text an engine reads.

---

## Review-ask asset (table / bag QR)

**Constraint that shapes the wording:** the ask may never be incentivized — no discount, no free
item, no "leave 5 stars". That is platform policy (Google, TripAdvisor), and it is also why the
asset asks for *what you ate* rather than for *stars*: descriptive reviews are the ones that get
us into AI answer prose.

**Primary line (recommended):**

> **Enjoyed it? Tell people what you ate.** → *(QR)*

**Alternates:**

- *Loved something today? Scan and name the dish — it's how people find us.*
- *Two lines about what you ordered helps the next person choose. Scan to review.*

**Placement + production notes:**

- QR target = the **review short link** from the GBP merchant panel ("Ask for reviews" generator —
  confirmed present in the 2026-07-15 audit, so this is unblocked).
- Print on the bag sticker and a small table card. Grab-and-go is the primary format, so the
  **bag** is the higher-volume surface.
- Design-system tokens per `shishka-health/design-system/MASTER.md` — royal-green on cream, not
  a default-Tailwind card.
- Staff line, spoken, matching the card: *"If you liked it, there's a QR on the bag — just say
  what you ate."* Never "give us five stars".

## Acceptance status

- [x] Drafts delivered for **all** unanswered reviews (2 of 2 — live count re-checked, no third)
- [x] Review-ask line drafted, non-incentivized
- [ ] Replies live within 48 h — **CEO action** (or explicit in-session approval to post)
- [ ] Mazen affiliation question answered — **CEO action**, blocks reply 1
