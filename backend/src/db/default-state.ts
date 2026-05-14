import type { AppState } from "./types.js";

const now = "2026-01-01T00:00:00.000Z";

function baseMeta(id: string, source: "manual" | "imported" | "calculated" = "manual") {
  return {
    id,
    created_at: now,
    updated_at: now,
    source,
    version: 1,
    status: "active" as const,
  };
}

export const defaultState: AppState = {
  company: {
    ...baseMeta("company-1"),
    company_name: "",
    cnpj: "",
    primary_channel: "shopee",
    tax_regime: "",
    effective_tax_rate: null,
    currency: "BRL",
    notes: "Base inicial vazia",
  },
  rules: {
    marketing_allocation_mode: "proportional_revenue",
    margin_healthy_threshold: 0.2,
    margin_attention_threshold: 0.1,
  },
  margin_targets: {
    minimum_margin: 0.1,
    ideal_margin: 0.2,
    minimum_roas: 2,
    minimum_safety_price: 0,
    notes: "",
  },
  tax_rules: [],
  marketing_costs: [],
  skus: [],
  sku_cost_history: [],
  sku_additional_costs: [],
  kits: [],
  kit_components: [],
  imported_orders: [],
  imported_order_items: [],
  imported_financial_entries: [],
};
