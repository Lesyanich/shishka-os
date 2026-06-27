# Runbook — POS Receipt Printer Network Setup / Recovery

**When to use:** Loyverse (or the print-bridge) says the receipt printer is offline / "can't find printer" — almost always **after the shop WiFi or router changed**. Also use when installing a new identical printer.

## TL;DR (the one fact that matters)

The receipt printer holds a **STATIC IP**. When the WiFi/router changes the LAN subnet, that static IP no longer matches the network → the printer becomes unreachable. **The router, LAN port, and cable are almost always fine.** Fix = log into the printer's web config and set its static IP to match the new subnet.

> We burned an entire evening (2026-06-27) chasing cables, LAN ports, and router config before realizing it was just the printer's IP on the wrong subnet.

## Hardware / identity

| | |
|---|---|
| Printer | **Xprinter XP-Q90EC** (LAN, ESC/POS over **TCP port 9100**), auto-cutter |
| Network module | J-Speed **"Ethernet WebConfig 1.02"** (web UI on port 80) |
| Printer MAC | `00-61-AB-65-3C-67` |
| Current static IP | **`192.168.1.50` / `255.255.255.0` / gateway `192.168.1.1`**, DHCP **Disabled** |
| Router | **Huawei HG8045X6 (AIS Fibre)** — LAN `192.168.1.0/24`, gw `192.168.1.1`, WiFi `Shishka_2.4G`/`Shishka_5G`, admin `admin`/`aisadmin` (captcha; web session drops if you switch WiFi mid-session) |
| Consumers | **Loyverse** (tablet, prints to printer IP:9100) and **print-bridge** (`services/print-bridge`, env `PRINTER_IP`, served at `localhost:7777`) |

> Not to be confused with the **label** printer (Xprinter **XP-420B**, USB/RawBT) — different device, different workflow.

## Fix / setup procedure (~5 min)

1. **Reach the printer's web config.** Put a laptop on the *same subnet as the printer's current static IP*. If the printer is stranded on an old subnet (e.g. `172.16.0.x`), either join the old router, or add a temporary alias on a Mac:
   ```bash
   sudo ifconfig en0 alias 172.16.0.99 255.255.0.0   # use an address in the printer's subnet
   ```
2. **Find it.** Ping-sweep then `arp -a -n | grep -i 0:61:ab:65:3c:67`, or scan TCP 9100. (The printer self-test also prints its current IP — see below.)
3. **Reconfigure.** Open `http://<printer-ip>/` → **Configuration** → select **Fixed IP Address** → set IP / Subnet Mask / Gateway to match the NEW network → **Save** → **Restart**. If the web page hangs, **power-cycle the printer** and reload once (the module is flaky under repeated hits; one clean pass works).
4. **Use STATIC, not DHCP.** ⚠️ This module, set to DHCP, obtains a lease then *converts it to a static* (self-test afterward shows `DHCP Disabled`) — so DHCP is unreliable. Set a fixed IP **outside the router's DHCP pool** (AIS pool appeared to start ~`.100`, so `.50` is safe).
5. **Verify.** Plug the printer into the target router (any LAN port — all 4 work), then from a host on that subnet: `ping <new-ip>` and `nc -z -v <new-ip> 9100`. Test print by piping ESC/POS bytes to `<new-ip>:9100`.
6. **Update consumers.** In **Loyverse** (tablet, on the same WiFi): Settings → Printers → the receipt printer → set IP = new IP, port `9100` → Save → test print. Also update `PRINTER_IP` for `services/print-bridge` if it is in use.

## Printer self-test (prints live network config)

Power **OFF** → press & **hold FEED** → power **ON** → keep holding ~2–3 s → release. It prints model/firmware + **IP / Netmask / Gateway / DHCP / MAC**.

- A short FEED *tap* only advances blank paper — that is NOT the self-test.
- Holding FEED at power-on can instead enter **hex-dump mode** (prints incoming bytes as hex). Exit with a normal power cycle (off → on, no buttons).

## Gotchas (each one cost us time)

- **RX = 0 is a red herring.** A printer sitting on a foreign subnet shows `RX = 0` on the router's *Status → Eth Port Information* port stats and is unreachable — it looks exactly like a dead/one-way cable, but it's the **IP mismatch**, not the cable. Fix the IP, don't swap cables.
- **AIS LAN ports work fine.** All four are Enabled (verified). They were a red herring. The `admin` account *cannot* edit WAN↔LAN binding (telecomadmin-only) — and you don't need to.
- **Scanning the wrong subnet finds nothing.** If the printer is static on the old subnet, scanning the new subnet returns empty. Always read the self-test IP first, or scan by MAC.
- **Buying a NEW identical XP-Q90EC:** it will have a different MAC and likely ship on DHCP / its own default IP. Same procedure — reach its web config, set a STATIC IP (`192.168.1.51` or next free), point Loyverse at it.

## Related

- `services/print-bridge/print-bridge.mjs` — HTTP→ESC/POS gateway that forwards to `PRINTER_IP:9100`.
- Memory: `runbook_pos_printer_network_setup` (native auto-memory mirror of this doc).
