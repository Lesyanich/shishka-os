/**
 * Lazada order-confirmation exporter for Shishka.
 *
 * WHO RUNS THIS: log into https://script.google.com using the Gmail account
 * that actually receives the Lazada order emails. For Shishka that is
 * basalsaleem@gmail.com (Bas), NOT lesia@shishka.health.
 *
 * SETUP:
 *   1. Open https://script.google.com → New project.
 *   2. Replace Code.gs with this file.
 *   3. Save (Ctrl/Cmd-S). Name the project "Lazada Exporter".
 *   4. Click Run → exportLazadaOrders. First run prompts for permission to
 *      read Gmail + write to Drive — accept (review the scope: scoped to
 *      Gmail readonly + Drive write).
 *   5. When it finishes, the Logger panel prints a Drive folder URL.
 *      Right-click that folder in Drive → Share → add lesia@shishka.health,
 *      then paste the folder URL into MC task e39dcf23.
 *
 * WHAT YOU GET:
 *   Lazada-export-<timestamp>/
 *     orders/<order_id>_<msgIdPrefix>.html    -- full HTML body per email
 *     images/<order_id>_<n>.<ext>             -- every inline product image
 *     index.json                              -- metadata for all orders
 *
 * WHY NOT TAKEOUT:
 *   Takeout exports everything matching a Gmail label and ignores attachments
 *   structure. This script (a) tight-filters to Lazada confirmations only
 *   (skips Alibaba noise, shipping pings, review nags, promos) by requiring a
 *   16+ digit Lazada order ID in subject or body, and (b) extracts inline
 *   product images so they can be linked to nomenclature later.
 *
 * RUN AGAIN LATER:
 *   Each run creates a fresh timestamped folder — safe to re-run; nothing is
 *   overwritten. Adjust CONFIG.DAYS to change the lookback window.
 */

const CONFIG = {
  // Lookback window in days. 120 = ~4 months, plenty for the 1-3 month backfill.
  DAYS: 120,
  // Output folder name prefix. A "-YYYY-MM-DD_HHMM" timestamp is appended.
  FOLDER_PREFIX: 'Lazada-export',
  // Safety cap on threads scanned per run. Bump if you ever hit it.
  MAX_THREADS: 500,
  // From-address filter. Lazada Thailand uses several subdomains; add more if
  // your account receives Lazada mail from a domain not listed here.
  FROM_FILTER:
    'from:(@lazada.co.th OR @my.lazada.co.th OR @mail.lazada.co.th OR @e.lazada.co.th)',
};

// Lazada Thailand order IDs are 16+ digit numbers. The presence of one in the
// subject or body is what distinguishes a real order confirmation from
// promotional / shipping / review-request mails.
const ORDER_ID_RE = /\b(\d{16,})\b/;

function exportLazadaOrders() {
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd_HHmm');
  const root = DriveApp.createFolder(CONFIG.FOLDER_PREFIX + '-' + stamp);
  const orders = root.createFolder('orders');
  const images = root.createFolder('images');

  const query = CONFIG.FROM_FILTER + ' newer_than:' + CONFIG.DAYS + 'd';
  Logger.log('Search query: %s', query);

  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS);
  Logger.log('Threads matched: %d', threads.length);

  const index = [];
  let totalImages = 0;
  let skippedNoOrderId = 0;

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      const subject = msg.getSubject() || '';
      const body = msg.getBody() || '';

      const m = subject.match(ORDER_ID_RE) || body.match(ORDER_ID_RE);
      if (!m) {
        skippedNoOrderId += 1;
        return;
      }

      const orderId = m[1];
      const msgId = msg.getId();
      const slug = orderId + '_' + msgId.substring(0, 8);

      orders.createFile(slug + '.html', body, 'text/html');

      const attachments = msg.getAttachments({
        includeInlineImages: true,
        includeAttachments: true,
      });
      const imageNames = [];
      attachments.forEach(function (att, i) {
        const ct = att.getContentType() || '';
        if (ct.indexOf('image/') !== 0) return;
        const ext = (ct.split('/')[1] || 'jpg').split(';')[0];
        const name = slug + '_' + i + '.' + ext;
        images.createFile(att.copyBlob().setName(name));
        imageNames.push(name);
        totalImages += 1;
      });

      index.push({
        order_id: orderId,
        message_id: msgId,
        slug: slug,
        subject: subject,
        from: msg.getFrom(),
        date: msg.getDate().toISOString(),
        thread_id: thread.getId(),
        images: imageNames,
      });
    });
  });

  root.createFile(
    'index.json',
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        query: query,
        order_count: index.length,
        image_count: totalImages,
        skipped_no_order_id: skippedNoOrderId,
        orders: index,
      },
      null,
      2,
    ),
    'application/json',
  );

  const url = root.getUrl();
  Logger.log(
    'Done. orders=%d images=%d skipped(no order id)=%d folder=%s',
    index.length,
    totalImages,
    skippedNoOrderId,
    url,
  );
  return url;
}
