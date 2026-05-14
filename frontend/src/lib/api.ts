import type {
  AnalysisPeriodConfig,
  AnalysisReport,
  AnalysisRuleSettings,
  AnalysisSimulationInput,
  AnalysisSimulationOutput,
  CompanySettings,
  MarginTargetSettings,
  MarketingCost,
  Sku,
  SkuAdditionalCosts,
  SkuCostHistory,
  TaxRule,
} from "@avah/shared-types";

const API_BASE = "http://localhost:3333/api";
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function jsonHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

function authHeaders() {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

export interface BackendState {
  company: CompanySettings;
  rules: AnalysisRuleSettings;
  margin_targets: MarginTargetSettings;
  tax_rules: TaxRule[];
  marketing_costs: MarketingCost[];
  skus: Sku[];
  sku_cost_history: SkuCostHistory[];
  sku_additional_costs: SkuAdditionalCosts[];
}

export interface ShopeeParsedDocument {
  file_name: string;
  file_type: string;
  sheets: string[];
  summary: Record<string, unknown>;
  data_rows: Record<string, unknown>[];
  warnings: string[];
}

export interface ShopeeDocumentsImportResponse {
  consolidated: {
    files_received: number;
    parsed_files: number;
    document_types: Array<{
      file_name: string;
      file_type: string;
      sheets: number;
      data_rows: number;
      warnings: number;
    }>;
    warnings: string[];
  };
  documents: ShopeeParsedDocument[];
  report?: {
    period: {
      month: string;
      competence_mode: "order_created" | "payment_completed";
    };
    pricing_context: {
      flash_sale_active: boolean;
      note: string;
    };
    commercial: {
      sales_paid: number;
      orders_paid: number;
      ticket_paid: number;
      product_clicks: number;
      visitors: number;
      conversion_rate_orders: number;
      cancelled_orders: number;
      cancelled_sales: number;
      returned_orders: number;
      returned_sales: number;
    };
    traffic: {
      page_views: number;
      visitors: number;
      return_rate: number;
      new_followers: number;
      product_visitors: number;
      product_page_views: number;
      cart_visitors: number;
      paid_buyers: number;
      paid_units: number;
    };
    financial: {
      orders: number;
      revenue_product: number;
      payout_total: number;
      refund_total: number;
      commission_total: number;
      service_fee_total: number;
      ads_in_income: number;
      take_rate_marketplace: number | null;
      payout_ratio: number | null;
    };
    marketing: {
      ads_sales: number;
      ads_spend: number;
      roas: number | null;
      ads_incremental_adjusted: number;
    };
    coverage: {
      known_revenue: number;
      total_revenue_in_classifiable_scope: number;
      known_revenue_coverage: number | null;
      known_units: number;
    };
    consolidated: {
      production_cost_total: number;
      tax_total: number;
      net_profit_conservative: number;
      net_profit_adjusted: number;
      net_margin_conservative: number | null;
      net_margin_adjusted: number | null;
    };
    by_category: Array<{
      category: string;
      label: string;
      revenue: number;
      payout: number;
      units: number;
      production_cost: number;
      tax: number;
      ads_allocated_full: number;
      ads_allocated_adjusted: number;
      net_profit_conservative: number;
      net_profit_adjusted: number;
      net_margin_conservative: number | null;
      net_margin_adjusted: number | null;
      profit_per_unit_adjusted: number | null;
      decision: string;
    }>;
    catalog: {
      parent_rows: number;
      parent_items: number;
    };
    kit_farmacia: {
      units: number;
      revenue: number;
      payout: number;
      unit_price_realized: number | null;
      unit_payout_realized: number | null;
      unit_cost: number;
      margin_conservative: number | null;
      margin_adjusted: number | null;
    };
    warnings: string[];
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  company_id: string;
}

export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Erro desconhecido" }));
    throw new Error(payload.message ?? "Erro na API");
  }

  return response.json() as Promise<T>;
}

export async function fetchState(): Promise<BackendState> {
  const response = await fetch(`${API_BASE}/state`, { headers: authHeaders() });
  return handle<BackendState>(response);
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<AuthLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  return handle<AuthLoginResponse>(response);
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });
  return handle<AuthUser>(response);
}

export async function saveCompany(input: Partial<CompanySettings>): Promise<CompanySettings> {
  const response = await fetch(`${API_BASE}/forms/company`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<CompanySettings>(response);
}

export async function saveMarginTargets(
  input: MarginTargetSettings,
): Promise<MarginTargetSettings> {
  const response = await fetch(`${API_BASE}/forms/margin-targets`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<MarginTargetSettings>(response);
}

export async function saveRules(input: AnalysisRuleSettings): Promise<AnalysisRuleSettings> {
  const response = await fetch(`${API_BASE}/forms/rules`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<AnalysisRuleSettings>(response);
}

export async function addTaxRule(input: {
  tax_regime: string;
  tax_rate: number;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE}/parameters/tax-rules`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<TaxRule[]>(response);
}

export async function addMarketingCost(input: {
  channel: "shopee" | "mercado_livre" | "loja_propria" | "omnicanal";
  reference_month: string;
  investment_total: number | null;
  roas: number | null;
  roas_origin: "manual" | "imported";
  priority_method: "investment" | "roas" | "hybrid";
  notes?: string;
}) {
  const response = await fetch(`${API_BASE}/parameters/marketing-costs`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<MarketingCost[]>(response);
}

export async function addSku(input: {
  sku: string;
  name: string;
  family: string;
  category?: string;
  channel: "shopee" | "mercado_livre" | "loja_propria" | "omnicanal";
  current_price?: number;
  promo_price?: number;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE}/catalog/skus`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Sku[]>(response);
}

export async function addSkuCostHistory(input: {
  sku: string;
  production_unit_cost: number;
  includes_packaging: boolean;
  includes_ready_to_ship: boolean;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE}/parameters/sku-cost-history`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<SkuCostHistory[]>(response);
}

export async function addSkuAdditionalCosts(input: {
  sku: string;
  packaging_extra_cost: number;
  gift_cost: number;
  internal_logistics_cost: number;
  variable_operational_cost: number;
  validity_start: string;
  validity_end: string | null;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE}/parameters/sku-additional-costs`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<SkuAdditionalCosts[]>(response);
}

export async function addKit(input: {
  kit_sku: string;
  kit_name: string;
  calculated_cost: number;
  sale_price: number;
  notes?: string;
  components: Array<{ component_sku: string; quantity: number }>;
}) {
  const response = await fetch(`${API_BASE}/kits`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return handle<{ kits: unknown[]; components: unknown[] }>(response);
}

export async function runAnalysis(payload: {
  period_config: AnalysisPeriodConfig;
  rules: AnalysisRuleSettings;
  margin_targets: MarginTargetSettings;
  manual_marketing_allocation?: Record<string, number>;
}): Promise<AnalysisReport> {
  const response = await fetch(`${API_BASE}/analysis/run`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle<AnalysisReport>(response);
}

export async function simulatePrice(
  payload: AnalysisSimulationInput,
): Promise<AnalysisSimulationOutput> {
  const response = await fetch(`${API_BASE}/analysis/simulate-price`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle<AnalysisSimulationOutput>(response);
}

export async function importFinancialCsvRaw(payload: {
  csv_content: string;
  channel: "shopee" | "mercado_livre" | "loja_propria" | "omnicanal";
}) {
  const response = await fetch(`${API_BASE}/imports/financial/raw`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return handle<{
    rows_received: number;
    orders_created: number;
    items_created: number;
    financial_entries_created: number;
    warnings: string[];
  }>(response);
}

export async function resetMockData() {
  const response = await fetch(`${API_BASE}/reset-mocks`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handle<{ message: string }>(response);
}

export async function importShopeeDocuments(
  files: File[],
  config?: {
    month?: string;
    competence_mode?: "order_created" | "payment_completed";
    tax_rate?: number;
    costs?: {
      serum_lavanda?: number;
      hortela_pimenta?: number;
      lavanda?: number;
      melaleuca?: number;
      laranja_doce?: number;
      soninho_bom?: number;
    };
  },
): Promise<ShopeeDocumentsImportResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  if (config?.month) {
    formData.append("month", config.month);
  }

  if (config?.competence_mode) {
    formData.append("competence_mode", config.competence_mode);
  }

  if (typeof config?.tax_rate === "number") {
    formData.append("tax_rate", String(config.tax_rate));
  }

  if (config?.costs) {
    if (typeof config.costs.serum_lavanda === "number") {
      formData.append("cost_serum_lavanda", String(config.costs.serum_lavanda));
    }
    if (typeof config.costs.hortela_pimenta === "number") {
      formData.append("cost_hortela_pimenta", String(config.costs.hortela_pimenta));
    }
    if (typeof config.costs.lavanda === "number") {
      formData.append("cost_lavanda", String(config.costs.lavanda));
    }
    if (typeof config.costs.melaleuca === "number") {
      formData.append("cost_melaleuca", String(config.costs.melaleuca));
    }
    if (typeof config.costs.laranja_doce === "number") {
      formData.append("cost_laranja_doce", String(config.costs.laranja_doce));
    }
    if (typeof config.costs.soninho_bom === "number") {
      formData.append("cost_soninho_bom", String(config.costs.soninho_bom));
    }
  }

  const response = await fetch(`${API_BASE}/imports/shopee/documents`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  return handle<ShopeeDocumentsImportResponse>(response);
}

// ── Tipos para os novos módulos ─────────────────────────────────────────────

export interface EvolutionMonth {
  month: string;
  gmv_paid: number;
  orders_paid: number;
  ticket_avg: number;
  conversion_rate: number;
  visitors: number;
  cancelled_orders: number;
  cancelled_rate: number;
  returned_orders: number;
  payout_total: number;
  ads_spend_reported: number;
  ads_spend_real: number | null;
  ads_sales: number;
  roas: number | null;
  production_cost_total: number;
  net_profit_conservative: number;
  net_profit_adjusted: number;
  net_margin_adjusted: number | null;
  by_category: Array<{
    category: string;
    label: string;
    revenue: number;
    payout: number;
    units: number;
    net_margin_adjusted: number | null;
    decision: string;
  }>;
  new_buyers: number;
}

export interface ForecastData {
  base_month: string;
  scenario: string;
  growth_rate: number;
  historical_growth_rate: number;
  last_gmv: number;
  projected: Array<{ month: string; gmv_forecast: number; net_profit_forecast: number }>;
}

export interface PricingRecommendation {
  category: string;
  label: string;
  current_avg_price: number;
  production_cost: number;
  take_rate: number;
  tax_rate: number;
  min_safe_price: number;
  recommended_price: number;
  current_net_margin: number | null;
  status: "ok" | "attention" | "critical";
}

export interface PricingData {
  recommendations: PricingRecommendation[];
  take_rate: number;
  tax_rate: number;
}

export interface HealthScoreData {
  score: number | null;
  grade: string | null;
  latest_month: string;
  metrics: Record<string, { value: number | null; status: string }>;
  alerts: string[];
}

// ── Funções de API para os novos módulos ────────────────────────────────────

export async function fetchEvolution(): Promise<{
  evolution: EvolutionMonth[];
  total_months: number;
}> {
  const response = await fetch(`${API_BASE}/evolution`, { headers: authHeaders() });
  return handle<{ evolution: EvolutionMonth[]; total_months: number }>(response);
}

export async function fetchForecast(
  months = 6,
  scenario = "realistic",
): Promise<ForecastData> {
  const response = await fetch(
    `${API_BASE}/forecast?months=${months}&scenario=${scenario}`,
    { headers: authHeaders() },
  );
  return handle<ForecastData>(response);
}

export async function fetchPricingRecommendations(): Promise<PricingData> {
  const response = await fetch(`${API_BASE}/pricing/recommendations`, {
    headers: authHeaders(),
  });
  return handle<PricingData>(response);
}

export async function updateAdsSpend(
  month: string,
  ads_spend_real: number,
): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_BASE}/marketing/ads-spend`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ month, ads_spend_real }),
  });
  return handle<{ ok: boolean }>(response);
}

export async function fetchHealthScore(): Promise<HealthScoreData> {
  const response = await fetch(`${API_BASE}/health/score`, { headers: authHeaders() });
  return handle<HealthScoreData>(response);
}
