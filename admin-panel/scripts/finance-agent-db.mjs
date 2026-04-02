#!/usr/bin/env node
/**
 * Finance Agent DB Helper v2
 *
 * Executes fn_approve_receipt RPC calls, verifies writes, and looks up Makro products.
 * Used by the Shishka Finance Agent skill.
 *
 * Usage:
 *   node scripts/finance-agent-db.mjs <payload.json>                    Execute & verify
 *   node scripts/finance-agent-db.mjs --verify <expense_id>             Verify existing entry
 *   node scripts/finance-agent-db.mjs --query nomenclature              List RAW/PF items
 *   node scripts/finance-agent-db.mjs --query suppliers                 List active suppliers
 *   node scripts/finance-agent-db.mjs --query categories                List fin_categories + sub
 *   node scripts/finance-agent-db.mjs --query ledger-check --supplier "Makro" --date "2026-03-15"
 *   node scripts/finance-agent-db.mjs --makro <barcode>                 Look up product on makro.pro
 *   node scripts/finance-agent-db.mjs --makro-batch <payload.json>      Look up all unmatched items
 *
 * Environment: reads from .env in admin-panel root
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Config ───────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const match = line.match(/^(\w+)=["']?(.+?)["']?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ─── Query commands ────────────────────────────────────────────────

async function queryNomenclature() {
  const { data, error } = await supabase
    .from('nomenclature')
    .select('id, product_code, name, base_unit, cost_per_unit')
    .or('product_code.like.RAW-%,product_code.like.PF-%')
    .order('name');
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
  console.log(`\n--- ${data.length} items ---`);
}

async function querySuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, category_code')
    .eq('is_deleted', false)
    .order('name');
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
  console.log(`\n--- ${data.length} suppliers ---`);
}

async function queryCategories() {
  const { data: cats, error: e1 } = await supabase
    .from('fin_categories').select('code, name').order('code');
  const { data: subs, error: e2 } = await supabase
    .from('fin_sub_categories').select('sub_code, category_code, name').order('sub_code');
  if (e1) throw e1;
  if (e2) throw e2;
  console.log('=== Categories ===');
  console.log(JSON.stringify(cats, null, 2));
  console.log('\n=== Sub-categories ===');
  console.log(JSON.stringify(subs, null, 2));
}

async function checkDuplicate(supplierName, date) {
  const { data, error } = await supabase
    .from('expense_ledger')
    .select('id, transaction_date, details, amount_original, currency')
    .eq('transaction_date', date)
    .ilike('details', `%${supplierName}%`)
    .limit(10);
  if (error) throw error;
  if (data.length === 0) {
    console.log('✅ No duplicates found.');
  } else {
    console.log(`⚠️  Found ${data.length} potential duplicate(s):`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ─── Verify writes ─────────────────────────────────────────────────

async function verifyExpense(expenseId) {
  console.log(`\n🔍 Verifying expense_id: ${expenseId}`);
  console.log('━'.repeat(60));

  // 1. Hub record (expense_ledger)
  const { data: hub, error: e1 } = await supabase
    .from('expense_ledger')
    .select('*')
    .eq('id', expenseId)
    .single();
  if (e1) { console.error('❌ Hub not found:', e1.message); return; }

  console.log('\n📒 EXPENSE_LEDGER (Hub):');
  console.log(`   ID:          ${hub.id}`);
  console.log(`   Date:        ${hub.transaction_date}`);
  console.log(`   Flow:        ${hub.flow_type}`);
  console.log(`   Details:     ${hub.details}`);
  console.log(`   Amount:      ${hub.amount_original} ${hub.currency} (THB: ${hub.amount_thb})`);
  console.log(`   Category:    ${hub.category_code} / ${hub.sub_category_code || '—'}`);
  console.log(`   Supplier:    ${hub.supplier_id || '—'}`);
  console.log(`   Paid by:     ${hub.paid_by} (${hub.payment_method})`);
  console.log(`   Status:      ${hub.status}`);
  console.log(`   Invoice:     ${hub.invoice_number || '—'}`);
  console.log(`   Tax invoice: ${hub.has_tax_invoice}`);
  console.log(`   Discount:    ${hub.discount_total}`);
  console.log(`   VAT:         ${hub.vat_amount}`);
  console.log(`   Delivery:    ${hub.delivery_fee}`);

  // Resolve supplier name
  if (hub.supplier_id) {
    const { data: sup } = await supabase
      .from('suppliers').select('name').eq('id', hub.supplier_id).single();
    if (sup) console.log(`   Supplier →   ${sup.name}`);
  }

  // Resolve category name
  if (hub.category_code) {
    const { data: cat } = await supabase
      .from('fin_categories').select('name').eq('code', hub.category_code).single();
    if (cat) console.log(`   Category →   ${cat.name}`);
  }

  // 2. Spoke 1: purchase_logs
  const { data: food, error: e2 } = await supabase
    .from('purchase_logs')
    .select('id, nomenclature_id, quantity, price_per_unit, total_price, invoice_date, notes')
    .eq('expense_id', expenseId)
    .order('created_at');
  if (e2) console.error('  purchase_logs error:', e2.message);

  if (food?.length > 0) {
    console.log(`\n🍎 PURCHASE_LOGS (Spoke 1): ${food.length} rows`);
    let foodTotal = 0;
    for (const row of food) {
      // Resolve nomenclature name
      let nomName = '?';
      if (row.nomenclature_id) {
        const { data: nom } = await supabase
          .from('nomenclature').select('product_code, name').eq('id', row.nomenclature_id).single();
        if (nom) nomName = `${nom.product_code} (${nom.name})`;
      }
      console.log(`   ${nomName}: ${row.quantity} × ${row.price_per_unit} = ${row.total_price} THB`);
      foodTotal += Number(row.total_price);
    }
    console.log(`   ─── Food total: ${foodTotal.toFixed(2)} THB`);
  }

  // 3. Spoke 2: capex_transactions
  const { data: capex, error: e3 } = await supabase
    .from('capex_transactions')
    .select('id, name, quantity, unit_price, total_price')
    .eq('expense_id', expenseId);
  if (e3) console.error('  capex_transactions error:', e3.message);

  if (capex?.length > 0) {
    console.log(`\n🔧 CAPEX_TRANSACTIONS (Spoke 2): ${capex.length} rows`);
    for (const row of capex) {
      console.log(`   ${row.name}: ${row.quantity} × ${row.unit_price} = ${row.total_price} THB`);
    }
  }

  // 4. Spoke 3: opex_items
  const { data: opex, error: e4 } = await supabase
    .from('opex_items')
    .select('id, description, quantity, unit, unit_price, total_price')
    .eq('expense_id', expenseId);
  if (e4) console.error('  opex_items error:', e4.message);

  if (opex?.length > 0) {
    console.log(`\n📦 OPEX_ITEMS (Spoke 3): ${opex.length} rows`);
    let opexTotal = 0;
    for (const row of opex) {
      console.log(`   ${row.description}: ${row.quantity} ${row.unit} × ${row.unit_price} = ${row.total_price} THB`);
      opexTotal += Number(row.total_price);
    }
    console.log(`   ─── OpEx total: ${opexTotal.toFixed(2)} THB`);
  }

  // 5. Receiving record (v11 audit trail)
  const { data: recv } = await supabase
    .from('receiving_records')
    .select('id, source, status, created_at')
    .eq('expense_id', expenseId);
  if (recv?.length > 0) {
    console.log(`\n📦 RECEIVING_RECORDS: ${recv.length} row(s)`);
    for (const r of recv) {
      console.log(`   ID: ${r.id}, source: ${r.source}, status: ${r.status}`);
    }
  }

  // Summary
  const totalSpokes = (food?.length || 0) + (capex?.length || 0) + (opex?.length || 0);
  console.log('\n' + '━'.repeat(60));
  console.log(`✅ Verification complete: Hub + ${totalSpokes} spoke rows`);
  console.log(`   purchase_logs: ${food?.length || 0}`);
  console.log(`   capex_transactions: ${capex?.length || 0}`);
  console.log(`   opex_items: ${opex?.length || 0}`);
  console.log(`   receiving_records: ${recv?.length || 0}`);
}

// ─── Makro product lookup ──────────────────────────────────────────

async function makroLookup(barcode) {
  console.log(`🔎 Looking up barcode ${barcode} on makro.pro...`);
  try {
    const searchUrl = `https://www.makro.pro/api/product/search?keyword=${barcode}&limit=3`;
    const resp = await fetch(searchUrl);
    if (!resp.ok) {
      // Try alternative: direct product page scrape
      console.log('  API search failed, trying sitemap approach...');
      const altUrl = `https://www.makro.pro/en/c/search?keyword=${barcode}`;
      const resp2 = await fetch(altUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await resp2.text();
      // Extract product info from HTML
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        console.log(`  Page title: ${titleMatch[1]}`);
      }
      // Try to find product JSON in page
      const jsonMatch = html.match(/"name"\s*:\s*"([^"]+)"/);
      const priceMatch = html.match(/"price"\s*:\s*(\d+\.?\d*)/);
      if (jsonMatch) console.log(`  Product: ${jsonMatch[1]}`);
      if (priceMatch) console.log(`  Price: ${priceMatch[1]} THB`);
      return;
    }
    const data = await resp.json();
    if (data?.products?.length > 0) {
      for (const p of data.products) {
        console.log(`\n  📦 ${p.name || p.title}`);
        if (p.brand) console.log(`     Brand: ${p.brand}`);
        if (p.price) console.log(`     Price: ${p.price} THB`);
        if (p.packSize) console.log(`     Pack: ${p.packSize}`);
        if (p.ean || p.barcode) console.log(`     Barcode: ${p.ean || p.barcode}`);
        if (p.category) console.log(`     Category: ${p.category}`);
      }
    } else {
      console.log('  No products found for this barcode.');
    }
  } catch (err) {
    console.log(`  ⚠️  Network error: ${err.message}`);
    console.log('  Tip: Try opening https://www.makro.pro/en/c/search?keyword=' + barcode);
  }
}

async function makroBatchLookup(payloadPath) {
  const raw = readFileSync(resolve(payloadPath), 'utf-8');
  const payload = JSON.parse(raw);
  const unmatched = payload.food_items.filter(f => !f.nomenclature_id && f.barcode);
  if (unmatched.length === 0) {
    console.log('✅ All food items already have nomenclature_id. Nothing to look up.');
    return;
  }
  console.log(`🔎 Found ${unmatched.length} unmatched food items with barcodes:\n`);
  for (const item of unmatched) {
    console.log(`━━━ ${item.name} (${item.barcode}) ━━━`);
    await makroLookup(item.barcode);
    console.log('');
  }
}

// ─── Approve receipt (with auto-verify) ────────────────────────────

async function approveReceipt(payloadPath) {
  const raw = readFileSync(resolve(payloadPath), 'utf-8');
  const payload = JSON.parse(raw);

  // Pre-flight: check for duplicates
  const supplierName = payload.supplier_name || payload.details?.split('—')[0]?.trim() || '';
  if (supplierName && payload.transaction_date) {
    const { data: dupes } = await supabase
      .from('expense_ledger')
      .select('id, details, amount_original')
      .eq('transaction_date', payload.transaction_date)
      .ilike('details', `%${supplierName}%`);
    if (dupes?.length > 0) {
      console.log('⚠️  POTENTIAL DUPLICATES FOUND:');
      for (const d of dupes) {
        console.log(`   ${d.id}: ${d.details} — ${d.amount_original} THB`);
      }
      console.log('   Proceeding anyway (use --query ledger-check to investigate)\n');
    }
  }

  console.log('📋 Payload summary:');
  console.log(`   Supplier:    ${payload.supplier_name || payload.details || 'N/A'}`);
  console.log(`   Date:        ${payload.transaction_date}`);
  console.log(`   Total:       ${payload.amount_original} ${payload.currency}`);
  console.log(`   Discount:    ${payload.discount_total}`);
  console.log(`   Food items:  ${payload.food_items?.length || 0}`);
  console.log(`   CapEx items: ${payload.capex_items?.length || 0}`);
  console.log(`   OpEx items:  ${payload.opex_items?.length || 0}`);
  console.log(`   Paid by:     ${payload.paid_by} (${payload.payment_method})`);
  console.log('');

  // Execute RPC
  console.log('⏳ Calling fn_approve_receipt...');
  const { data, error } = await supabase.rpc('fn_approve_receipt', { p_payload: payload });

  if (error) {
    console.error('❌ RPC Error:', error.message);
    console.error('   Details:', error.details);
    console.error('   Hint:', error.hint);
    process.exit(1);
  }

  console.log('\n✅ fn_approve_receipt SUCCESS!');
  console.log(`   expense_id:              ${data.expense_id}`);
  console.log(`   food_count:              ${data.food_count}`);
  console.log(`   capex_count:             ${data.capex_count}`);
  console.log(`   opex_count:              ${data.opex_count}`);
  if (data.auto_created > 0) console.log(`   auto_created nomenclature: ${data.auto_created}`);
  if (data.sku_auto_created > 0) console.log(`   auto_created SKU:         ${data.sku_auto_created}`);
  if (data.receiving_id) console.log(`   receiving_id:             ${data.receiving_id}`);

  // Auto-verify
  await verifyExpense(data.expense_id);

  // Write result to file (for agent to read back)
  const resultPath = payloadPath.replace('.json', '.result.json');
  const result = {
    ...data,
    verified_at: new Date().toISOString(),
    payload_file: payloadPath,
  };
  writeFileSync(resolve(resultPath), JSON.stringify(result, null, 2));
  console.log(`\n📄 Result saved to: ${resultPath}`);

  return data;
}

// ─── Main ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--query') {
  const cmd = args[1];
  try {
    switch (cmd) {
      case 'nomenclature': await queryNomenclature(); break;
      case 'suppliers': await querySuppliers(); break;
      case 'categories': await queryCategories(); break;
      case 'ledger-check': {
        const si = args.indexOf('--supplier'), di = args.indexOf('--date');
        const supplier = si >= 0 ? args[si + 1] : '';
        const date = di >= 0 ? args[di + 1] : '';
        if (!supplier || !date) { console.error('Usage: --query ledger-check --supplier "Name" --date "YYYY-MM-DD"'); process.exit(1); }
        await checkDuplicate(supplier, date);
        break;
      }
      default:
        console.error('Unknown query:', cmd);
        console.error('Available: nomenclature, suppliers, categories, ledger-check');
        process.exit(1);
    }
  } catch (err) { console.error('Error:', err.message); process.exit(1); }

} else if (args[0] === '--verify') {
  if (!args[1]) { console.error('Usage: --verify <expense_id>'); process.exit(1); }
  try { await verifyExpense(args[1]); } catch (err) { console.error('Error:', err.message); process.exit(1); }

} else if (args[0] === '--makro') {
  if (!args[1]) { console.error('Usage: --makro <barcode>'); process.exit(1); }
  try { await makroLookup(args[1]); } catch (err) { console.error('Error:', err.message); process.exit(1); }

} else if (args[0] === '--makro-batch') {
  if (!args[1]) { console.error('Usage: --makro-batch <payload.json>'); process.exit(1); }
  try { await makroBatchLookup(args[1]); } catch (err) { console.error('Error:', err.message); process.exit(1); }

} else if (args[0] && !args[0].startsWith('--')) {
  try { await approveReceipt(args[0]); } catch (err) { console.error('Error:', err.message); process.exit(1); }

} else {
  console.log(`
Finance Agent DB Helper v2
━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  node scripts/finance-agent-db.mjs <payload.json>
    → Execute fn_approve_receipt + auto-verify all tables + save result

  node scripts/finance-agent-db.mjs --verify <expense_id>
    → Verify existing entry: show Hub + all Spoke rows + receiving record

  node scripts/finance-agent-db.mjs --query nomenclature
    → List all RAW/PF items with IDs

  node scripts/finance-agent-db.mjs --query suppliers
    → List active suppliers

  node scripts/finance-agent-db.mjs --query categories
    → List fin_categories + fin_sub_categories

  node scripts/finance-agent-db.mjs --query ledger-check --supplier "Makro" --date "2026-02-27"
    → Check for duplicate entries

  node scripts/finance-agent-db.mjs --makro <barcode>
    → Look up a single barcode on makro.pro

  node scripts/finance-agent-db.mjs --makro-batch <payload.json>
    → Look up all unmatched food items from a payload
  `);
}
