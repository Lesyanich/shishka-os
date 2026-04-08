# L1 WiFi Installer Brief

> MC Task: 9487bb8c-7ef0-471b-8ab4-8f73a701196c
> Author: COO
> Date: 2026-04-07
> Audience: CEO (for the installer call) + Bas (for on-site coordination)

## Why this is critical

L1 central kitchen has zero internet today. This blocks: POS, admin panel, Kitchen Live wall iPad, Dashboard realtime, label printer (WiFi model), receipt OCR uploads to Supabase Storage, staff Telegram, supplier WhatsApp. Single largest opening blocker — must be resolved before any other L1 deployment.

## Spec for installer

**Location:** L1 central kitchen, Bangkok — exact address: TBD by CEO before calling

**Service type:** Fiber broadband, business contract preferred

**Speed minimum:** 100/50 Mbps (download/upload). Supports ~10 concurrent devices, video uploads from receipt camera, Kitchen Live realtime feed.

**Speed recommended:** 300/300 Mbps fiber. Bangkok providers to compare:
- **AIS Fibre** — usually best uptime in central Bangkok, business plans clean
- **True Online** — wide coverage, weaker support
- **3BB** — cheapest, residential-leaning, slower repair SLA

### Equipment needed at site

- ONT (provided by ISP)
- Business-grade router with 4+ LAN ports + WiFi 6
- WiFi access point coverage: kitchen floor + storage + outdoor receiving area (mesh if single AP can't cover)
- UPS for router — cooks cannot lose connection mid-service

### Cabling drops

Ethernet drops to:
1. Wall iPad mount → Kitchen Live display
2. POS terminal location
3. Label printer location
4. Admin laptop / office corner

## Decision points before calling installer

CEO must answer these before the call so the installer can quote accurately:

1. **Provider preference?** Depends on which providers actually serve the L1 address. Survey needed.
2. **Static IP needed now?** ~+500 THB/month. Useful for VPN remote admin later. Recommended: yes if budget allows, otherwise add later.
3. **Business plan vs residential?** Business = SLA + faster repairs, ~2x cost. Recommended: business — kitchen downtime during service hours is unacceptable.
4. **Installation date target?** Need before opening day. Lead time: typically 7 days for survey + install in Bangkok. Earlier = safer.
5. **Who meets the installer on site?** Bas? Lesia? Someone needs to be there for the survey and again for the install (2 visits typical).

## After install — sub-tasks (spawn as separate MC tasks)

- WiFi SSID + password → `docs/keys-config.md` (encrypted section)
- Test: receipt upload from iPhone in kitchen → reaches Supabase Storage successfully
- Test: Kitchen Live page loads on wall iPad without buffering
- Mount wall iPad + cable management
- Configure label printer + test print
- Add WiFi network name to staff onboarding doc

## Downstream unblocks

When this is done, the following can move:
- Kitchen UX v2 Phase D (`3b3a6e5b`) — Kitchen Live + Manager Dashboard
- Receipt Inbox L1 deployment — current flow assumes uploads from outside L1
- All 11 procurement deliveries needing barcode scanning at receiving (`736b5ac8` initiative)
- Label printer integration (separate procurement task)
- Staff Telegram bot for shift updates

## Cost ballpark

| Item | Approx THB/month | Notes |
|---|---|---|
| Fiber 300/300 business | 1,500–2,500 | Varies by provider |
| Static IP | +500 | Optional |
| Business router (one-off) | 5,000–12,000 | UniFi / Mikrotik recommended |
| WiFi 6 AP × 1–2 | 4,000–8,000 each | Depends on kitchen layout |
| UPS for router | 2,500 | 600VA is enough |
| Installation | 1,000–3,000 one-off | Sometimes waived on annual contract |

**Total upfront:** ~15,000–30,000 THB
**Monthly:** ~2,000–3,000 THB

## Open questions for CEO

- Is the L1 lease finalized with internet rights? (some Bangkok commercial leases restrict cabling)
- Do we want a backup 4G/5G failover router from day 1, or add later?
- Mesh WiFi vs single strong AP — depends on kitchen square footage and walls

---

When ready, COO can spawn the post-install sub-tasks based on this brief.
