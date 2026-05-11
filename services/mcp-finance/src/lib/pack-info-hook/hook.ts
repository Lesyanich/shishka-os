import type { SupabaseClient } from '@supabase/supabase-js';
import { resolve, type PackInfoDataProvider, type ResolverResult } from '../pack-info-resolver/index.js';
import { hasRecentSkipDecision } from './cooldown.js';
import { writeAutoApply, writePending, writeSkip } from './decisions-writer.js';

const SUSPICIOUS_BASE_UNITS = new Set(['pcs', 'bag', 'bottle', 'pack']);
const COOLDOWN_DAYS = 7;
const RULE_CODE = 'NOMENCLATURE_AUTO_PACK_FILL';
const AUTO_APPLY_CONFIDENCE = 0.9;
const PENDING_CONFIDENCE_FLOOR = 0.5;

interface FoodItemInput {
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  nomenclature_id?: string | null;
}

export interface HookInput {
  expense_id: string;
  food_items: FoodItemInput[];
}

export interface CorrectionReport {
  nomenclature_id: string;
  action: 'auto-applied' | 'pending';
  source: ResolverResult['source'];
  confidence: number;
  resolved_base_unit?: string;
  reason?: string;
}

export interface ErrorReport {
  stage: 'fetch-purchase-logs' | 'fetch-nomenclature' | 'fetch-rule' | 'resolve' | 'write' | 'makro' | 'hook-init';
  level?: 'barcode' | 'fuzzy';
  nomenclature_id?: string;
  message: string;
}

export interface HookResult {
  corrections: CorrectionReport[];
  skipped: Array<{ nomenclature_id: string; reason: string }>;
  errors: ErrorReport[];
}

interface PurchaseLogRow {
  nomenclature_id: string;
  supplier_id: string;
  barcode: string | null;
  price_per_unit: number | null;
}

interface NomenclatureRow {
  id: string;
  base_unit: string | null;
  cost_per_unit: number | null;
  name: string | null;
}

function findInput(food: FoodItemInput[], barcode: string | null, nomenclature_id: string): FoodItemInput | null {
  if (barcode) {
    const byBarcode = food.find((f) => f.barcode === barcode);
    if (byBarcode) return byBarcode;
  }
  const byId = food.find((f) => f.nomenclature_id === nomenclature_id);
  return byId ?? null;
}

export async function runPackInfoHook(
  sb: SupabaseClient,
  provider: PackInfoDataProvider,
  input: HookInput,
): Promise<HookResult> {
  const corrections: CorrectionReport[] = [];
  const skipped: Array<{ nomenclature_id: string; reason: string }> = [];
  const errors: ErrorReport[] = [];

  // 1. Fetch the just-inserted purchase_log rows
  const { data: purchaseLogs, error: plErr } = (await sb
    .from('purchase_logs')
    .select('nomenclature_id, supplier_id, barcode, price_per_unit')
    .eq('expense_id', input.expense_id)) as unknown as { data: PurchaseLogRow[] | null; error: { message: string } | null };

  if (plErr || !purchaseLogs) {
    errors.push({ stage: 'fetch-purchase-logs', message: plErr?.message ?? 'no purchase_logs' });
    return { corrections, skipped, errors };
  }
  if (purchaseLogs.length === 0) {
    return { corrections, skipped, errors };
  }

  // 2. Fetch nomenclature rows for these lines
  const nomIds = Array.from(new Set(purchaseLogs.map((p) => p.nomenclature_id)));
  const { data: noms, error: nomErr } = (await sb
    .from('nomenclature')
    .select('id, base_unit, cost_per_unit, name')
    .in('id', nomIds)) as unknown as { data: NomenclatureRow[] | null; error: { message: string } | null };

  if (nomErr || !noms) {
    errors.push({ stage: 'fetch-nomenclature', message: nomErr?.message ?? 'no nomenclature' });
    return { corrections, skipped, errors };
  }
  const nomById = new Map(noms.map((n) => [n.id, n]));

  // 3. Look up rule_id once
  const { data: ruleRow, error: ruleErr } = (await sb
    .from('data_health_rules')
    .select('id')
    .eq('rule_code', RULE_CODE)
    .single()) as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (ruleErr || !ruleRow) {
    errors.push({ stage: 'fetch-rule', message: ruleErr?.message ?? `rule ${RULE_CODE} not found` });
    return { corrections, skipped, errors };
  }
  const rule_id = ruleRow.id;
  const run_id = input.expense_id;

  // 4. Iterate lines
  for (const line of purchaseLogs) {
    const nom = nomById.get(line.nomenclature_id);
    if (!nom) continue;
    if (!SUSPICIOUS_BASE_UNITS.has(nom.base_unit ?? '')) continue;

    if (await hasRecentSkipDecision(sb, line.nomenclature_id, 'base_unit', COOLDOWN_DAYS)) {
      skipped.push({ nomenclature_id: line.nomenclature_id, reason: '7d-cooldown' });
      continue;
    }

    const food = findInput(input.food_items, line.barcode, line.nomenclature_id);

    let result: ResolverResult;
    try {
      result = await resolve(
        {
          nomenclature_id: line.nomenclature_id,
          supplier_id: line.supplier_id,
          barcode: line.barcode ?? undefined,
          last_price_thb: line.price_per_unit ?? undefined,
          name: food?.name ?? nom.name ?? undefined,
          brand: food?.brand ?? undefined,
          onMakroError: (err, level) => {
            errors.push({
              stage: 'makro',
              level,
              nomenclature_id: line.nomenclature_id,
              message: err.message,
            });
          },
        },
        provider,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'resolve', nomenclature_id: line.nomenclature_id, message: error.message });
      continue;
    }

    if (result.confidence >= AUTO_APPLY_CONFIDENCE && !result.resolved && result.conflicts.length === 0) {
      errors.push({
        stage: 'resolve',
        nomenclature_id: line.nomenclature_id,
        message: 'invariant violated: high-confidence result has no resolved pack info and no conflicts',
      });
      continue;
    }

    try {
      if (result.conflicts.length > 0 || (result.confidence >= PENDING_CONFIDENCE_FLOOR && result.confidence < AUTO_APPLY_CONFIDENCE)) {
        await writePending(sb, { run_id, rule_id, result, current_base_unit: nom.base_unit });
        corrections.push({
          nomenclature_id: line.nomenclature_id,
          action: 'pending',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved?.base_unit,
        });
      } else if (result.confidence >= AUTO_APPLY_CONFIDENCE && result.resolved) {
        await writeAutoApply(sb, {
          run_id,
          rule_id,
          result,
          supplier_id: line.supplier_id,
          current_base_unit: nom.base_unit,
          current_cost_per_unit: nom.cost_per_unit,
        });
        corrections.push({
          nomenclature_id: line.nomenclature_id,
          action: 'auto-applied',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved.base_unit,
        });
      } else {
        await writeSkip(sb, {
          run_id,
          rule_id,
          nomenclature_id: line.nomenclature_id,
          current_base_unit: nom.base_unit,
          reason: 'cascade-fail',
        });
        skipped.push({ nomenclature_id: line.nomenclature_id, reason: 'cascade-fail' });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'write', nomenclature_id: line.nomenclature_id, message: error.message });
    }
  }

  return { corrections, skipped, errors };
}
