import { describe, expect, it } from "vitest";
import type {
  CompanySettings,
  FinancialAnalysisInput,
  ImportedFinancialEntry,
  ImportedOrder,
  ImportedOrderItem,
  MarketingCost,
  Sku,
  SkuAdditionalCosts,
  SkuCostHistory,
  TaxRule,
} from "@avah/shared-types";
import { runFinancialAnalysis } from "./engine.js";

const baseMeta = {
  id: "id-1",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  source: "manual" as const,
  version: 1,
  status: "active" as const,
};

function makeInput(overrides?: Partial<FinancialAnalysisInput>): FinancialAnalysisInput {
  const company: CompanySettings = {
    ...baseMeta,
    company_name: "AVAH",
    cnpj: "00.000.000/0001-00",
    primary_channel: "shopee",
    tax_regime: "Simples",
    effective_tax_rate: 0.1,
    currency: "BRL",
  };

  const taxRule: TaxRule = {
    ...baseMeta,
    id: "tax-1",
    company_id: "company-1",
    tax_regime: "Simples",
    tax_rate: 0.1,
    validity_start: "2026-01-01",
    validity_end: null,
  };

  const marketing: MarketingCost = {
    ...baseMeta,
    id: "mkt-1",
    company_id: "company-1",
    channel: "shopee",
    reference_month: "2026-01",
    investment_total: 0,
    roas: null,
    roas_origin: "manual",
    priority_method: "investment",
  };

  const sku: Sku = {
    ...baseMeta,
    id: "sku-1",
    company_id: "company-1",
    sku: "SKU-1",
    name: "Produto 1",
    family: "Familia A",
    channel: "shopee",
  };

  const cost: SkuCostHistory = {
    ...baseMeta,
    id: "cost-1",
    company_id: "company-1",
    sku: "SKU-1",
    production_unit_cost: 30,
    includes_packaging: true,
    includes_ready_to_ship: false,
    validity_start: "2026-01-01",
    validity_end: null,
  };

  const additional: SkuAdditionalCosts = {
    ...baseMeta,
    id: "add-1",
    company_id: "company-1",
    sku: "SKU-1",
    packaging_extra_cost: 2,
    gift_cost: 0,
    internal_logistics_cost: 1,
    variable_operational_cost: 0,
    validity_start: "2026-01-01",
    validity_end: null,
  };

  const order: ImportedOrder = {
    ...baseMeta,
    id: "order-1",
    company_id: "company-1",
    channel: "shopee",
    order_id: "O-1",
    order_created_at: "2026-01-15",
    payment_approved_at: "2026-01-15",
    payout_released_at: "2026-01-20",
  };

  const orderItem: ImportedOrderItem = {
    ...baseMeta,
    id: "item-1",
    company_id: "company-1",
    channel: "shopee",
    order_id: "O-1",
    sku: "SKU-1",
    product_name: "Produto 1",
    quantity: 1,
    item_gross_revenue: 100,
    item_product_price: 100,
    buyer_shipping_fee: 0,
    refund_value: 0,
    seller_voucher: 0,
    shared_voucher: 0,
    cashback: 0,
    marketplace_ads_fee: 0,
  };

  const financial: ImportedFinancialEntry = {
    ...baseMeta,
    id: "fin-1",
    company_id: "company-1",
    channel: "shopee",
    order_id: "O-1",
    sku: "SKU-1",
    event_date: "2026-01-20",
    event_type: "payout",
    amount: 100,
    net_commission_fee: 10,
    service_fee: 0,
    transaction_fee: 0,
    affiliate_fee: 0,
    logistic_partner_shipping_fee: 0,
    platform_shipping_discount: 0,
    compensation_value: 0,
    buyer_refund: 0,
    payout_real: 80,
    metadata: {},
  };

  return {
    company,
    period_config: {
      range: { start: "2026-01-01", end: "2026-01-31" },
      competence_mode: "payment_approved",
      channel: "shopee",
      include_returns: true,
      include_cancellations: true,
      include_logistic_adjustments: true,
      include_marketplace_ads: true,
      include_external_marketing: true,
    },
    rule_settings: {
      marketing_allocation_mode: "proportional_revenue",
      margin_healthy_threshold: 0.2,
      margin_attention_threshold: 0.1,
    },
    margin_targets: {
      minimum_margin: 0.1,
      ideal_margin: 0.2,
      minimum_roas: 2,
      minimum_safety_price: 60,
    },
    tax_rules: [taxRule],
    marketing_costs: [marketing],
    skus: [sku],
    sku_cost_history: [cost],
    sku_additional_costs: [additional],
    kits: [],
    kit_components: [],
    imported_orders: [order],
    imported_order_items: [orderItem],
    imported_financial_entries: [financial],
    ...overrides,
  };
}

describe("runFinancialAnalysis", () => {
  it("calcula resultado liquido por SKU", () => {
    const report = runFinancialAnalysis(makeInput());
    expect(report.complete).toBe(true);
    expect(report.by_sku).toHaveLength(1);
    expect(report.by_sku[0].result_net).toBeCloseTo(39);
    expect(report.by_sku[0].margin_net).toBeCloseTo(0.39);
  });

  it("sinaliza analise parcial sem imposto", () => {
    const report = runFinancialAnalysis(makeInput({ tax_rules: [] }));
    expect(report.complete).toBe(false);
    expect(report.alerts.some((alert) => alert.code === "MONTH_WITHOUT_TAX")).toBe(true);
  });
});
