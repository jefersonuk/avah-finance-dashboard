import type {
  CompetenceMode,
  ImportedFinancialEntry,
  ImportedOrder,
  SkuAdditionalCosts,
  SkuCostHistory,
  TaxRule,
} from "@avah/shared-types";
import { isWithinRange, roundCurrency } from "./utils.js";

export function getCompetenceDate(order: ImportedOrder, mode: CompetenceMode): string {
  if (mode === "order_created") {
    return order.order_created_at;
  }

  if (mode === "payment_approved") {
    return order.payment_approved_at ?? order.order_created_at;
  }

  if (mode === "payout_released") {
    return order.payout_released_at ?? order.payment_approved_at ?? order.order_created_at;
  }

  return order.order_created_at;
}

export function findSkuCostAtDate(
  sku: string,
  date: string,
  costHistory: SkuCostHistory[],
): SkuCostHistory | null {
  const valid = costHistory
    .filter((row) => row.sku === sku)
    .filter((row) => isWithinRange(date, row.validity_start, row.validity_end))
    .sort((a, b) => b.validity_start.localeCompare(a.validity_start));

  return valid[0] ?? null;
}

export function findAdditionalCostAtDate(
  sku: string,
  date: string,
  additionalCosts: SkuAdditionalCosts[],
): SkuAdditionalCosts | null {
  const valid = additionalCosts
    .filter((row) => row.sku === sku)
    .filter((row) => isWithinRange(date, row.validity_start, row.validity_end))
    .sort((a, b) => b.validity_start.localeCompare(a.validity_start));

  return valid[0] ?? null;
}

export function findTaxRuleAtDate(date: string, taxRules: TaxRule[]): TaxRule | null {
  const valid = taxRules
    .filter((rule) => isWithinRange(date, rule.validity_start, rule.validity_end))
    .sort((a, b) => b.validity_start.localeCompare(a.validity_start));

  return valid[0] ?? null;
}

export function financialEntryByOrder(entries: ImportedFinancialEntry[]): Map<string, ImportedFinancialEntry[]> {
  const map = new Map<string, ImportedFinancialEntry[]>();

  for (const entry of entries) {
    if (!entry.order_id) {
      continue;
    }

    const existing = map.get(entry.order_id) ?? [];
    existing.push(entry);
    map.set(entry.order_id, existing);
  }

  return map;
}

export function resolvePayoutForItem(
  orderId: string,
  sku: string,
  quantity: number,
  revenueGross: number,
  financialByOrder: Map<string, ImportedFinancialEntry[]>,
): number {
  const orderEntries = financialByOrder.get(orderId) ?? [];

  if (orderEntries.length === 0) {
    return 0;
  }

  const skuEntries = orderEntries.filter((entry) => entry.sku === sku);

  if (skuEntries.length > 0) {
    return roundCurrency(skuEntries.reduce((sum, row) => sum + row.payout_real, 0));
  }

  const totalOrderPayout = orderEntries.reduce((sum, row) => sum + row.payout_real, 0);
  const totalOrderGross = orderEntries.reduce((sum, row) => sum + Math.abs(row.amount), 0);

  if (totalOrderGross <= 0) {
    return roundCurrency(totalOrderPayout / quantity);
  }

  const share = Math.max(revenueGross, 0) / totalOrderGross;
  return roundCurrency(totalOrderPayout * share);
}
