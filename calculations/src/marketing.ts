import type { MarketingAllocationMode, MarketingCost, SalesChannel } from "@avah/shared-types";
import { roundCurrency } from "./utils.js";

export interface MarketingResolution {
  resolvedTotal: number;
  method: string;
}

export function resolveMonthlyMarketingTotal(marketing: MarketingCost, grossRevenue: number): MarketingResolution {
  const investment = marketing.investment_total;
  const roas = marketing.roas;

  if (investment !== null && roas !== null) {
    if (marketing.priority_method === "investment") {
      return { resolvedTotal: roundCurrency(investment), method: "investment_priority" };
    }

    if (marketing.priority_method === "roas") {
      return {
        resolvedTotal: grossRevenue > 0 ? roundCurrency(grossRevenue / roas) : 0,
        method: "roas_priority",
      };
    }

    return {
      resolvedTotal: roundCurrency((investment + (grossRevenue > 0 ? grossRevenue / roas : 0)) / 2),
      method: "hybrid_average",
    };
  }

  if (investment !== null) {
    return { resolvedTotal: roundCurrency(investment), method: "investment_only" };
  }

  if (roas !== null) {
    return {
      resolvedTotal: grossRevenue > 0 ? roundCurrency(grossRevenue / roas) : 0,
      method: "roas_only",
    };
  }

  return { resolvedTotal: 0, method: "no_marketing_data" };
}

export interface AllocationLine {
  line_key: string;
  sku: string;
  family: string | null;
  channel: SalesChannel;
  quantity: number;
  revenue_gross: number;
}

interface AllocationInput {
  lines: AllocationLine[];
  mode: MarketingAllocationMode;
  monthlyMarketingTotal: number;
  manualAllocation?: Record<string, number>;
}

export function allocateMarketingByItem({
  lines,
  mode,
  monthlyMarketingTotal,
  manualAllocation,
}: AllocationInput): Record<string, number> {
  const output: Record<string, number> = {};

  if (lines.length === 0 || monthlyMarketingTotal === 0) {
    return output;
  }

  if (mode === "proportional_revenue") {
    const totalRevenue = lines.reduce((sum, row) => sum + row.revenue_gross, 0);
    for (const line of lines) {
      const share = totalRevenue > 0 ? line.revenue_gross / totalRevenue : 0;
      output[line.line_key] = roundCurrency(share * monthlyMarketingTotal);
    }

    return output;
  }

  if (mode === "proportional_quantity") {
    const totalQuantity = lines.reduce((sum, row) => sum + row.quantity, 0);
    for (const line of lines) {
      const share = totalQuantity > 0 ? line.quantity / totalQuantity : 0;
      output[line.line_key] = roundCurrency(share * monthlyMarketingTotal);
    }

    return output;
  }

  if (mode === "manual_sku") {
    for (const line of lines) {
      const allocation = manualAllocation?.[line.sku] ?? 0;
      output[line.line_key] = roundCurrency(allocation * line.quantity);
    }

    return output;
  }

  if (mode === "manual_family") {
    for (const line of lines) {
      const family = line.family ?? "SEM_FAMILIA";
      const allocation = manualAllocation?.[family] ?? 0;
      output[line.line_key] = roundCurrency(allocation * line.quantity);
    }

    return output;
  }

  if (mode === "manual_channel") {
    for (const line of lines) {
      const allocation = manualAllocation?.[line.channel] ?? 0;
      output[line.line_key] = roundCurrency(allocation * line.quantity);
    }

    return output;
  }

  return output;
}
