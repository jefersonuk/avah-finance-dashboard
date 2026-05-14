import { describe, expect, it } from "vitest";
import { runPriceSimulation } from "./simulation.js";

describe("runPriceSimulation", () => {
  it("retorna simulacao completa com todos parametros", () => {
    const output = runPriceSimulation(
      {
        sku: "SKU-1",
        suggested_new_price: 120,
        promo_discount: 0,
        projected_roas: 3,
        expected_tax_rate: 0.1,
        expected_cost: 40,
        expected_marketplace_take_rate: 0.15,
      },
      100,
    );

    expect(output.complete).toBe(true);
    expect(output.projected_net_profit).toBeCloseTo(50);
    expect(output.delta_vs_current_price).toBe(20);
  });

  it("retorna faltas quando parametros obrigatorios nao existem", () => {
    const output = runPriceSimulation(
      {
        sku: "SKU-1",
        suggested_new_price: 120,
        promo_discount: 0,
        projected_roas: null,
        expected_tax_rate: null,
        expected_cost: null,
        expected_marketplace_take_rate: null,
      },
      100,
    );

    expect(output.complete).toBe(false);
    expect(output.missing_reasons.length).toBeGreaterThan(0);
  });
});
