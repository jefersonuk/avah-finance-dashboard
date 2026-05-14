export type UUID = string;

export type SourceType =
  | "manual"
  | "imported"
  | "calculated"
  | "simulated"
  | "integration";

export type EntityStatus = "active" | "inactive" | "draft" | "archived";

export interface BaseEntity {
  id: UUID;
  created_at: string;
  updated_at: string;
  source: SourceType;
  version: number;
  status: EntityStatus;
}

export type SalesChannel = "shopee" | "mercado_livre" | "loja_propria" | "omnicanal";

export type CompetenceMode = "order_created" | "payment_approved" | "payout_released" | "custom";

export interface DateRange {
  start: string;
  end: string;
}

export interface CompanySettings extends BaseEntity {
  company_name: string;
  cnpj: string;
  primary_channel: SalesChannel;
  tax_regime: string;
  effective_tax_rate: number | null;
  currency: string;
  notes?: string;
}

export interface Channel extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  display_name: string;
}

export interface TaxRule extends BaseEntity {
  company_id: UUID;
  tax_regime: string;
  tax_rate: number;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}

export type MarketingRoasOrigin = "manual" | "imported";

export interface MarketingCost extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  reference_month: string;
  investment_total: number | null;
  roas: number | null;
  roas_origin: MarketingRoasOrigin;
  priority_method: "investment" | "roas" | "hybrid";
  notes?: string;
}

export interface Sku extends BaseEntity {
  company_id: UUID;
  sku: string;
  name: string;
  family: string;
  category?: string;
  channel: SalesChannel;
  current_price?: number;
  promo_price?: number;
  notes?: string;
}

export interface SkuCostHistory extends BaseEntity {
  company_id: UUID;
  sku: string;
  production_unit_cost: number;
  includes_packaging: boolean;
  includes_ready_to_ship: boolean;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}

export interface SkuAdditionalCosts extends BaseEntity {
  company_id: UUID;
  sku: string;
  packaging_extra_cost: number;
  gift_cost: number;
  internal_logistics_cost: number;
  variable_operational_cost: number;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}

export interface Kit extends BaseEntity {
  company_id: UUID;
  kit_sku: string;
  kit_name: string;
  calculated_cost?: number;
  sale_price?: number;
  notes?: string;
}

export interface KitComponent extends BaseEntity {
  company_id: UUID;
  kit_sku: string;
  component_sku: string;
  quantity: number;
}

export interface RawImport extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  import_type: "financial" | "commercial" | "catalog";
  original_file_name: string;
  file_hash: string;
  imported_at: string;
  mapping_version: string;
  row_count: number;
  metadata: Record<string, unknown>;
}

export interface ImportedOrder extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  order_id: string;
  refund_id?: string;
  order_created_at: string;
  payment_approved_at?: string;
  payout_released_at?: string;
  order_type?: string;
  payment_method?: string;
  carrier?: string;
  coupon_code?: string;
}

export interface ImportedOrderItem extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  order_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  item_gross_revenue: number;
  item_product_price: number;
  buyer_shipping_fee: number;
  refund_value: number;
  seller_voucher: number;
  shared_voucher: number;
  cashback: number;
  marketplace_ads_fee: number;
  notes?: string;
}

export interface ImportedFinancialEntry extends BaseEntity {
  company_id: UUID;
  channel: SalesChannel;
  order_id?: string;
  sku?: string;
  event_date: string;
  event_type: string;
  amount: number;
  net_commission_fee: number;
  service_fee: number;
  transaction_fee: number;
  affiliate_fee: number;
  logistic_partner_shipping_fee: number;
  platform_shipping_discount: number;
  compensation_value: number;
  buyer_refund: number;
  payout_real: number;
  metadata: Record<string, unknown>;
}

export interface AnalysisPeriodConfig {
  range: DateRange;
  competence_mode: CompetenceMode;
  channel: SalesChannel;
  include_returns: boolean;
  include_cancellations: boolean;
  include_logistic_adjustments: boolean;
  include_marketplace_ads: boolean;
  include_external_marketing: boolean;
}

export type MarketingAllocationMode =
  | "proportional_revenue"
  | "proportional_quantity"
  | "manual_sku"
  | "manual_family"
  | "manual_channel";

export interface MarginTargetSettings {
  minimum_margin: number;
  ideal_margin: number;
  minimum_roas: number;
  minimum_safety_price: number;
  notes?: string;
}

export interface AnalysisRuleSettings {
  marketing_allocation_mode: MarketingAllocationMode;
  margin_healthy_threshold: number;
  margin_attention_threshold: number;
}

export interface SkuLineCalculation {
  order_id: string;
  sku: string;
  product_name: string;
  family: string | null;
  channel: SalesChannel;
  competence_date: string;
  quantity: number;
  revenue_gross: number;
  payout_real: number;
  production_cost: number;
  tax_value: number | null;
  marketing_allocated: number | null;
  additional_variable_costs: number;
  result_net: number | null;
  margin_net: number | null;
  data_complete: boolean;
  missing_reasons: string[];
}

export interface AggregateBySku {
  sku: string;
  product_name: string;
  family: string | null;
  revenue_gross: number;
  payout_real: number;
  production_cost: number;
  tax_value: number;
  marketing_allocated: number;
  additional_variable_costs: number;
  result_net: number;
  margin_net: number | null;
  orders: number;
  quantity: number;
  participation_in_result: number;
  classification: SkuClassification;
  recommendations: RecommendationAction[];
  data_complete: boolean;
}

export interface AggregateByFamily {
  family: string;
  revenue_gross: number;
  payout_real: number;
  result_net: number;
  margin_net: number | null;
  revenue_share: number;
  profit_share: number;
  priority_scale: "high" | "medium" | "low" | "review";
}

export interface ExecutiveDashboardMetrics {
  revenue_total: number;
  payout_total: number;
  production_cost_total: number;
  marketing_total: number;
  tax_total: number;
  net_profit_total: number;
  net_margin_total: number | null;
  average_ticket: number | null;
  order_count: number;
  conversion_rate: number | null;
  cancelled_orders: number;
  returned_orders: number;
  marketplace_take_rate: number | null;
}

export interface DataAlert {
  code:
    | "SKU_WITHOUT_COST"
    | "MONTH_WITHOUT_TAX"
    | "FINANCIAL_WITHOUT_COMMERCIAL"
    | "PRODUCT_WITHOUT_FAMILY"
    | "UNCLASSIFIED_REVENUE"
    | "EXPIRED_COST"
    | "MISSING_MARKETING"
    | "PARTIAL_ANALYSIS";
  severity: "critical" | "warning" | "info";
  message: string;
  reference?: string;
}

export type SkuClassification =
  | "escalar"
  | "escalar_com_atencao"
  | "manter"
  | "revisar_preco"
  | "revisar_oferta"
  | "kitizar"
  | "pausar_midia"
  | "dados_insuficientes";

export type RecommendationAction =
  | "aumentar_preco"
  | "reduzir_desconto"
  | "migrar_para_kit"
  | "priorizar_midia"
  | "retirar_de_campanha"
  | "revisar_custo"
  | "revisar_cadastro_logistico"
  | "revisar_frete"
  | "revisar_classificacao_tributaria";

export interface AnalysisSimulationInput {
  sku: string;
  suggested_new_price: number;
  promo_discount: number;
  projected_roas: number | null;
  expected_tax_rate: number | null;
  expected_cost: number | null;
  expected_marketplace_take_rate: number | null;
}

export interface AnalysisSimulationOutput {
  sku: string;
  projected_net_profit: number | null;
  projected_net_margin: number | null;
  safety_min_price: number | null;
  ideal_scale_price: number | null;
  delta_vs_current_price: number | null;
  method: string;
  complete: boolean;
  missing_reasons: string[];
}

export interface MonthlyTrendPoint {
  month: string;
  revenue_gross: number;
  result_net: number;
  net_margin: number | null;
}

export interface AnalysisReport {
  generated_at: string;
  period: AnalysisPeriodConfig;
  methodology: {
    formula_result_net: string;
    formula_net_margin: string;
    marketing_allocation_mode: MarketingAllocationMode;
    marketing_resolution_method: string;
    competence_mode: CompetenceMode;
  };
  executive_metrics: ExecutiveDashboardMetrics;
  by_sku: AggregateBySku[];
  by_family: AggregateByFamily[];
  line_results: SkuLineCalculation[];
  monthly_trend: MonthlyTrendPoint[];
  alerts: DataAlert[];
  pending_data_report: string[];
  inconsistencies_report: string[];
  complete: boolean;
}

export interface FinancialAnalysisInput {
  company: CompanySettings;
  period_config: AnalysisPeriodConfig;
  rule_settings: AnalysisRuleSettings;
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
  manual_marketing_allocation?: Record<string, number>;
}

export interface CompanyFormInput {
  nome_empresa: string;
  cnpj: string;
  canal_principal: SalesChannel;
  regime_tributario: string;
  aliquota_efetiva: number | null;
  moeda: string;
  observacoes?: string;
}

export interface PeriodFormInput {
  data_inicial: string;
  data_final: string;
  competencia: CompetenceMode;
  canal_analisado: SalesChannel;
  incluir_devolucoes: boolean;
  incluir_cancelamentos: boolean;
  incluir_ajustes_logisticos: boolean;
  incluir_ads_marketplace: boolean;
  incluir_marketing_externo: boolean;
}

export interface SkuFormInput {
  sku: string;
  nome: string;
  familia: string;
  categoria?: string;
  custo_producao: number;
  custo_adicional: number;
  observacoes?: string;
}

export interface KitFormInput {
  sku_kit: string;
  nome_kit: string;
  itens_componentes: Array<{ sku: string; quantidade: number }>;
  custo_calculado: number;
  preco_venda: number;
  observacoes?: string;
}

export interface MarginGoalFormInput {
  margem_minima_aceitavel: number;
  margem_ideal: number;
  roas_minimo_aceitavel: number;
  preco_minimo_seguranca: number;
  observacoes?: string;
}

export interface ImportColumnMapping {
  source_column: string;
  normalized_field: string;
  required: boolean;
}

export interface ParsedImportResult<T> {
  raw_rows: Record<string, unknown>[];
  normalized_rows: T[];
  mapping: ImportColumnMapping[];
  warnings: string[];
}
