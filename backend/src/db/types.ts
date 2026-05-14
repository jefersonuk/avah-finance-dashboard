import type {
  AnalysisRuleSettings,
  CompanySettings,
  ImportedFinancialEntry,
  ImportedOrder,
  ImportedOrderItem,
  Kit,
  KitComponent,
  MarginTargetSettings,
  MarketingCost,
  Sku,
  SkuAdditionalCosts,
  SkuCostHistory,
  TaxRule,
} from "@avah/shared-types";

export interface AppState {
  company: CompanySettings;
  rules: AnalysisRuleSettings;
  margin_targets: MarginTargetSettings;
  tax_rules: TaxRule[];
  marketing_costs: MarketingCost[];
  skus: Sku[];
  sku_cost_history: SkuCostHistory[];
  sku_additional_costs: SkuAdditionalCosts[];
  kits: Kit[];
  kit_components: KitComponent[];
  imported_orders: ImportedOrder[];
  imported_order_items: ImportedOrderItem[];
  imported_financial_entries: ImportedFinancialEntry[];
}
