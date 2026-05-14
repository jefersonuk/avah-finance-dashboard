import type { AnalysisSimulationInput, AnalysisSimulationOutput } from "@avah/shared-types";
import { roundCurrency, safeDivide } from "./utils.js";

export function runPriceSimulation(
  input: AnalysisSimulationInput,
  currentPrice: number | null,
): AnalysisSimulationOutput {
  const missingReasons: string[] = [];

  const priceAfterDiscount = roundCurrency(
    input.suggested_new_price * (1 - Math.max(0, input.promo_discount)),
  );

  if (input.expected_tax_rate === null) {
    missingReasons.push("Aliquota de imposto projetada nao informada");
  }

  if (input.expected_cost === null) {
    missingReasons.push("Custo projetado nao informado");
  }

  if (input.expected_marketplace_take_rate === null) {
    missingReasons.push("Take rate esperado nao informado");
  }

  if (missingReasons.length > 0) {
    return {
      sku: input.sku,
      projected_net_profit: null,
      projected_net_margin: null,
      safety_min_price: null,
      ideal_scale_price: null,
      delta_vs_current_price: currentPrice !== null ? roundCurrency(priceAfterDiscount - currentPrice) : null,
      method: "incomplete",
      complete: false,
      missing_reasons: missingReasons,
    };
  }

  const tax = priceAfterDiscount * (input.expected_tax_rate as number);
  const takeRate = priceAfterDiscount * (input.expected_marketplace_take_rate as number);
  const projectedNetProfit =
    priceAfterDiscount - tax - takeRate - (input.expected_cost as number);

  const projectedNetMargin = safeDivide(projectedNetProfit, priceAfterDiscount);
  const safetyMinPrice =
    (input.expected_cost as number) /
    Math.max(
      1e-9,
      1 - (input.expected_tax_rate as number) - (input.expected_marketplace_take_rate as number),
    );

  const idealScalePrice = safetyMinPrice * 1.15;

  return {
    sku: input.sku,
    projected_net_profit: roundCurrency(projectedNetProfit),
    projected_net_margin: projectedNetMargin === null ? null : roundCurrency(projectedNetMargin),
    safety_min_price: roundCurrency(safetyMinPrice),
    ideal_scale_price: roundCurrency(idealScalePrice),
    delta_vs_current_price: currentPrice !== null ? roundCurrency(priceAfterDiscount - currentPrice) : null,
    method: "configured_formula",
    complete: true,
    missing_reasons: [],
  };
}
