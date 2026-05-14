import { runFinancialAnalysis, runPriceSimulation } from "@avah/calculations";
import type {
  AnalysisPeriodConfig,
  AnalysisRuleSettings,
  AnalysisSimulationInput,
  AnalysisSimulationOutput,
  FinancialAnalysisInput,
  MarginTargetSettings,
} from "@avah/shared-types";
import type { AppState } from "../db/types.js";

interface RunAnalysisParams {
  period_config: AnalysisPeriodConfig;
  rules?: AnalysisRuleSettings;
  margin_targets?: MarginTargetSettings;
  manual_marketing_allocation?: Record<string, number>;
}

export function buildInputFromState(state: AppState, params: RunAnalysisParams): FinancialAnalysisInput {
  return {
    company: state.company,
    period_config: params.period_config,
    rule_settings: params.rules ?? state.rules,
    margin_targets: params.margin_targets ?? state.margin_targets,
    tax_rules: state.tax_rules,
    marketing_costs: state.marketing_costs,
    skus: state.skus,
    sku_cost_history: state.sku_cost_history,
    sku_additional_costs: state.sku_additional_costs,
    kits: state.kits,
    kit_components: state.kit_components,
    imported_orders: state.imported_orders,
    imported_order_items: state.imported_order_items,
    imported_financial_entries: state.imported_financial_entries,
    manual_marketing_allocation: params.manual_marketing_allocation,
  };
}

export function runAnalysisFromState(state: AppState, params: RunAnalysisParams) {
  return runFinancialAnalysis(buildInputFromState(state, params));
}

export function simulatePriceFromState(
  state: AppState,
  payload: AnalysisSimulationInput,
): AnalysisSimulationOutput {
  const sku = state.skus.find((item) => item.sku === payload.sku);
  const currentPrice = sku?.promo_price ?? sku?.current_price ?? null;
  return runPriceSimulation(payload, currentPrice ?? null);
}
