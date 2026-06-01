# Shishka print-bridge

Tiny HTTP → ESC/POS gateway for the **Xprinter XP-Q90EC (LAN)**. The cashier web
app can't open a raw TCP socket to the printer, so it POSTs an order here and the
bridge forwards ESC/POS bytes to the printer on TCP:9100. Shares the printer with
Loyverse (jobs print sequentially).

Zero dependencies — needs only Node ≥ 18.

## Run (dev / validation on the Mac, same LAN as the printer)

```bash
PRINTER_IP=192.168.x.x node services/print-bridge/print-bridge.mjs
```

Then print a test slip:

```bash
curl -X POST http://localhost:7777/test
```

Print a real order:

```bash
curl -X POST http://localhost:7777/print -H 'content-type: application/json' -d '{
  "orderCode": "A-237",
  "fulfillmentType": "pickup",
  "customerName": "Lesia",
  "items": [
    { "name": "Chicken Bowl", "quantity": 2, "price": 150 },
    { "name": "Green Smoothie", "quantity": 1, "price": 120 }
  ],
  "total": 420
}'
```

## Config (env)

| Var | Default | Notes |
|-----|---------|-------|
| `PRINTER_IP` | — (required) | XP-Q90EC LAN address |
| `PRINTER_PORT` | `9100` | raw ESC/POS port |
| `PORT` | `7777` | bridge HTTP port |
| `CHARS` | `32` | chars/line — 32 for 58mm, 48 for 80mm |
| `CUT` | `true` | auto-cut on (XP-Q90EC has a cutter); set `false` to disable |

## Endpoints

- `GET /health` — status + config
- `POST /test` — print a test slip
- `POST /print` — body = order JSON (see above)

## Production note

A cloud HTTPS page (shishka.health) can't call this over plain HTTP on a LAN IP
(mixed-content block). Options:
1. **Run the bridge on the cashier device**, call it via `http://localhost:7777`
   (localhost is a secure context — allowed from HTTPS pages).
2. Wrap the cashier UI as a small native app that talks ESC/POS directly.
For dev, run on the Mac and call from a local `http://localhost` dev server.
