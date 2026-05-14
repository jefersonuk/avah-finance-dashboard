import type {
  AggregateByFamily,
  AggregateBySku,
  AnalysisReport,
  DataAlert,
  ExecutiveDashboardMetrics,
  FinancialAnalysisInput,
  RecommendationAction,
  SkuLineCalculation,
} from "@avah/shared-types";
import { classifySku, recommendationByClassification } from "./classification.js";
import { findAdditionalCostAtDate, findSkuCostAtDate, findTaxRuleAtDate, financialEntryByOrder, getCompetenceDate, resolvePayoutForItem } from "./lookup.js";
import { allocateMarketingByItem, resolveMonthlyMarketingTotal } from "./marketing.js";
import { monthFromDate, parseDate, roundCurrency, safeDivide, unique } from "./utils.js";

interface PreLine {
  line_key: string;
  month: string;
  competence_date: string;
  sku: string;
  product_name: string;
  family: string | null;
  channel: FinancialAnalysisInput["period_config"]["channel"];
  order_id: string;
  quantity: number;
  revenue_gross: number;
  payout_real: number;
  production_cost: number;
  tax_value: number | null;
  additional_variable_costs: number;
  missing_reasons: string[];
}

function inPeriod(date: string, start: string, end: string): boolean {
  const target = parseDate(date).getTime();
  const startMs = parseDate(start).getTime();
  const endMs = parseDate(end).getTime();
  return target >= startMs && target <= endMs;
}

function createAlert(
  code: DataAlert["code"],
  severity: DataAlert["severity"],
  message: string,
  reference?: string,
): DataAlert {
  return { code, severity, message, reference };
}

export function runFinancialAnalysis(input: FinancialAnalysisInput): AnalysisReport {
  const alerts: DataAlert[] = [];
  const ordersById = new Map(input.imported_orders.map((order) => [order.order_id, order]));
  const financialByOrder = financialEntryByOrder(input.imported_financial_entries);

  const preLines: PreLine[] = [];

  for (const [index, item] of input.imported_order_items.entries()) {
    const order = ordersById.get(item.order_id);

    if (!order) {
      alerts.push(
        createAlert(
          "FINANCIAL_WITHOUT_COMMERCIAL",
          "warning",
          `Pedido ${item.order_id} existe em itens mas nao foi encontrado na base de pedidos.`,
          item.order_id,
        ),
      );
      continue;
    }

    const competenceDate = getCompetenceDate(order, input.period_config.competence_mode);

    if (!inPeriod(competenceDate, input.period_config.range.start, input.period_config.range.end)) {
      continue;
    }

    const skuMeta = input.skus.find((sku) => sku.sku === item.sku);
    const family = skuMeta?.family ?? null;

    const missingReasons: string[] = [];

    if (!family) {
      missingReasons.push("Produto sem familia definida");
      alerts.push(
        createAlert(
          "PRODUCT_WITHOUT_FAMILY",
          "warning",
          `SKU ${item.sku} sem familia cadastrada.`,
          item.sku,
        ),
      );
    }

    const skuCost = findSkuCostAtDate(item.sku, competenceDate, input.sku_cost_history);
    if (!skuCost) {
      missingReasons.push("SKU sem custo vigente para a data");
      alerts.push(
        createAlert(
          "SKU_WITHOUT_COST",
          "critical",
          `SKU ${item.sku} sem custo vigente em ${competenceDate}.`,
          item.sku,
        ),
      );
    }

    const additionalCost = findAdditionalCostAtDate(
      item.sku,
      competenceDate,
      input.sku_additional_costs,
    );

    const taxRule = findTaxRuleAtDate(competenceDate, input.tax_rules);
    if (!taxRule) {
      missingReasons.push("Mes sem imposto cadastrado");
      alerts.push(
        createAlert(
          "MONTH_WITHOUT_TAX",
          "critical",
          `Nao existe aliquota tributaria para ${monthFromDate(competenceDate)}.`,
          monthFromDate(competenceDate),
        ),
      );
    }

    const revenueGross = roundCurrency(item.item_gross_revenue);
    const payoutReal = resolvePayoutForItem(
      item.order_id,
      item.sku,
      item.quantity,
      revenueGross,
      financialByOrder,
    );

    const productionCost = roundCurrency((skuCost?.production_unit_cost ?? 0) * item.quantity);
    const taxValue = taxRule ? roundCurrency(payoutReal * taxRule.tax_rate) : null;
    const additionalVariableCosts = roundCurrency(
      ((additionalCost?.packaging_extra_cost ?? 0) +
        (additionalCost?.gift_cost ?? 0) +
        (additionalCost?.internal_logistics_cost ?? 0) +
        (additionalCost?.variable_operational_cost ?? 0)) *
        item.quantity,
    );

    preLines.push({
      line_key: `${item.order_id}::${item.sku}::${index}`,
      month: monthFromDate(competenceDate),
      competence_date: competenceDate,
      sku: item.sku,
      product_name: item.product_name,
      family,
      channel: item.channel,
      order_id: item.order_id,
      quantity: item.quantity,
      revenue_gross: revenueGross,
      payout_real: payoutReal,
      production_cost: productionCost,
      tax_value: taxValue,
      additional_variable_costs: additionalVariableCosts,
      missing_reasons: missingReasons,
    });
  }

  const months = unique(preLines.map((line) => line.month));
  const marketingByLine: Record<string, number | null> = {};
  const marketingMethods = new Set<string>();

  for (const month of months) {
    const monthLines = preLines.filter((line) => line.month === month);
    const grossRevenue = monthLines.reduce((sum, line) => sum + line.revenue_gross, 0);

    if (!input.period_config.include_external_marketing) {
      for (const line of monthLines) {
        marketingByLine[line.line_key] = 0;
      }
      marketingMethods.add("marketing_disabled");
      continue;
    }

    const marketingConfig = input.marketing_costs.find(
      (row) => row.reference_month === month && row.channel === input.period_config.channel,
    );

    if (!marketingConfig) {
      alerts.push(
        createAlert(
          "MISSING_MARKETING",
          "warning",
          `Sem custo de marketing cadastrado para ${month}.`,
          month,
        ),
      );
      for (const line of monthLines) {
        marketingByLine[line.line_key] = null;
      }
      continue;
    }

    const resolvedMarketing = resolveMonthlyMarketingTotal(marketingConfig, grossRevenue);
    marketingMethods.add(resolvedMarketing.method);

    const allocations = allocateMarketingByItem({
      lines: monthLines.map((line) => ({
        line_key: line.line_key,
        sku: line.sku,
        family: line.family,
        channel: line.channel,
        quantity: line.quantity,
        revenue_gross: line.revenue_gross,
      })),
      mode: input.rule_settings.marketing_allocation_mode,
      monthlyMarketingTotal: resolvedMarketing.resolvedTotal,
      manualAllocation: input.manual_marketing_allocation,
    });

    for (const line of monthLines) {
      marketingByLine[line.line_key] = allocations[line.line_key] ?? 0;
    }
  }

  const lineResults: SkuLineCalculation[] = preLines.map((line) => {
    const marketingAllocated = marketingByLine[line.line_key] ?? null;
    const missingReasons = [...line.missing_reasons];

    if (marketingAllocated === null) {
      missingReasons.push("Marketing nao cadastrado para o mes");
    }

    const hasRequiredValues = line.tax_value !== null && marketingAllocated !== null;

    const resultNet = hasRequiredValues
      ? roundCurrency(
          line.payout_real -
            line.production_cost -
            (line.tax_value as number) -
            (marketingAllocated as number) -
            line.additional_variable_costs,
        )
      : null;

    const marginNet = resultNet === null ? null : safeDivide(resultNet, line.revenue_gross);

    return {
      order_id: line.order_id,
      sku: line.sku,
      product_name: line.product_name,
      family: line.family,
      channel: line.channel,
      competence_date: line.competence_date,
      quantity: line.quantity,
      revenue_gross: line.revenue_gross,
      payout_real: line.payout_real,
      production_cost: line.production_cost,
      tax_value: line.tax_value,
      marketing_allocated: marketingAllocated,
      additional_variable_costs: line.additional_variable_costs,
      result_net: resultNet,
      margin_net: marginNet === null ? null : roundCurrency(marginNet),
      data_complete: missingReasons.length === 0,
      missing_reasons: missingReasons,
    };
  });

  if (lineResults.some((line) => !line.data_complete)) {
    alerts.push(
      createAlert(
        "PARTIAL_ANALYSIS",
        "critical",
        "Analise parcial: existem linhas sem todos os dados obrigatorios.",
      ),
    );
  }

  const bySkuMap = new Map<string, AggregateBySku>();

  for (const line of lineResults) {
    const existing = bySkuMap.get(line.sku);

    if (!existing) {
      bySkuMap.set(line.sku, {
        sku: line.sku,
        product_name: line.product_name,
        family: line.family,
        revenue_gross: line.revenue_gross,
        payout_real: line.payout_real,
        production_cost: line.production_cost,
        tax_value: line.tax_value ?? 0,
        marketing_allocated: line.marketing_allocated ?? 0,
        additional_variable_costs: line.additional_variable_costs,
        result_net: line.result_net ?? 0,
        margin_net: null,
        orders: 1,
        quantity: line.quantity,
        participation_in_result: 0,
        classification: "dados_insuficientes",
        recommendations: [],
        data_complete: line.data_complete,
      });
      continue;
    }

    existing.revenue_gross = roundCurrency(existing.revenue_gross + line.revenue_gross);
    existing.payout_real = roundCurrency(existing.payout_real + line.payout_real);
    existing.production_cost = roundCurrency(existing.production_cost + line.production_cost);
    existing.tax_value = roundCurrency(existing.tax_value + (line.tax_value ?? 0));
    existing.marketing_allocated = roundCurrency(
      existing.marketing_allocated + (line.marketing_allocated ?? 0),
    );
    existing.additional_variable_costs = roundCurrency(
      existing.additional_variable_costs + line.additional_variable_costs,
    );
    existing.result_net = roundCurrency(existing.result_net + (line.result_net ?? 0));
    existing.orders += 1;
    existing.quantity += line.quantity;
    existing.data_complete = existing.data_complete && line.data_complete;
  }

  const totalNetProfit = Array.from(bySkuMap.values()).reduce(
    (sum, row) => sum + row.result_net,
    0,
  );

  const bySku = Array.from(bySkuMap.values()).map((row) => {
    const margin = safeDivide(row.result_net, row.revenue_gross);
    row.margin_net = margin === null ? null : roundCurrency(margin);
    row.participation_in_result =
      totalNetProfit !== 0 ? roundCurrency(row.result_net / totalNetProfit) : 0;

    const relatedRoas = input.marketing_costs.find(
      (m) => m.channel === input.period_config.channel && m.reference_month === input.period_config.range.start.slice(0, 7),
    )?.roas;

    row.classification = classifySku(
      {
        margin: row.margin_net,
        dataComplete: row.data_complete,
        roas: relatedRoas ?? null,
        minimumRoas: input.margin_targets.minimum_roas,
      },
      input.rule_settings,
    );

    row.recommendations = recommendationByClassification(row.classification) as RecommendationAction[];

    return row;
  });

  const totalRevenue = bySku.reduce((sum, row) => sum + row.revenue_gross, 0);

  const byFamilyMap = new Map<string, AggregateByFamily>();
  for (const sku of bySku) {
    const family = sku.family ?? "SEM_FAMILIA";
    const current = byFamilyMap.get(family);

    if (!current) {
      byFamilyMap.set(family, {
        family,
        revenue_gross: sku.revenue_gross,
        payout_real: sku.payout_real,
        result_net: sku.result_net,
        margin_net: null,
        revenue_share: 0,
        profit_share: 0,
        priority_scale: "review",
      });
      continue;
    }

    current.revenue_gross = roundCurrency(current.revenue_gross + sku.revenue_gross);
    current.payout_real = roundCurrency(current.payout_real + sku.payout_real);
    current.result_net = roundCurrency(current.result_net + sku.result_net);
  }

  const byFamily = Array.from(byFamilyMap.values()).map((family) => {
    family.margin_net =
      family.revenue_gross === 0 ? null : roundCurrency(family.result_net / family.revenue_gross);
    family.revenue_share = totalRevenue === 0 ? 0 : roundCurrency(family.revenue_gross / totalRevenue);
    family.profit_share = totalNetProfit === 0 ? 0 : roundCurrency(family.result_net / totalNetProfit);

    if ((family.margin_net ?? -1) >= input.rule_settings.margin_healthy_threshold) {
      family.priority_scale = "high";
    } else if ((family.margin_net ?? -1) >= input.rule_settings.margin_attention_threshold) {
      family.priority_scale = "medium";
    } else if ((family.margin_net ?? -1) >= 0) {
      family.priority_scale = "low";
    } else {
      family.priority_scale = "review";
    }

    return family;
  });

  const marketingTotal = lineResults.reduce(
    (sum, line) => sum + (line.marketing_allocated ?? 0),
    0,
  );
  const payoutTotal = lineResults.reduce((sum, line) => sum + line.payout_real, 0);

  const executiveMetrics: ExecutiveDashboardMetrics = {
    revenue_total: roundCurrency(totalRevenue),
    payout_total: roundCurrency(payoutTotal),
    production_cost_total: roundCurrency(
      lineResults.reduce((sum, line) => sum + line.production_cost, 0),
    ),
    marketing_total: roundCurrency(marketingTotal),
    tax_total: roundCurrency(lineResults.reduce((sum, line) => sum + (line.tax_value ?? 0), 0)),
    net_profit_total: roundCurrency(totalNetProfit),
    net_margin_total:
      totalRevenue > 0 ? roundCurrency(totalNetProfit / totalRevenue) : null,
    average_ticket:
      lineResults.length > 0 ? roundCurrency(totalRevenue / lineResults.length) : null,
    order_count: unique(lineResults.map((line) => line.order_id)).length,
    conversion_rate: null,
    cancelled_orders: 0,
    returned_orders: 0,
    marketplace_take_rate:
      totalRevenue > 0 ? roundCurrency((totalRevenue - payoutTotal) / totalRevenue) : null,
  };

  const monthlyMap = new Map<string, { revenue: number; profit: number }>();
  for (const line of lineResults) {
    const month = monthFromDate(line.competence_date);
    const current = monthlyMap.get(month) ?? { revenue: 0, profit: 0 };
    current.revenue = roundCurrency(current.revenue + line.revenue_gross);
    current.profit = roundCurrency(current.profit + (line.result_net ?? 0));
    monthlyMap.set(month, current);
  }

  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, values]) => ({
      month,
      revenue_gross: values.revenue,
      result_net: values.profit,
      net_margin: values.revenue === 0 ? null : roundCurrency(values.profit / values.revenue),
    }));

  if (Math.abs(executiveMetrics.revenue_total - executiveMetrics.payout_total) > 0.01) {
    alerts.push(
      createAlert(
        "UNCLASSIFIED_REVENUE",
        "info",
        "Existe diferenca entre venda comercial e payout financeiro; revisar taxas, frete e ajustes.",
      ),
    );
  }

  const pendingDataReport = unique(
    lineResults.flatMap((line) => line.missing_reasons),
  );

  const inconsistenciesReport = unique(
    alerts
      .filter((alert) => alert.code !== "PARTIAL_ANALYSIS")
      .map((alert) => `${alert.code}: ${alert.message}`),
  );

  return {
    generated_at: new Date().toISOString(),
    period: input.period_config,
    methodology: {
      formula_result_net:
        "resultado_liquido = payout_real - custo_producao - imposto - marketing_alocado - custos_variaveis_adicionais",
      formula_net_margin: "margem_liquida = resultado_liquido / receita_produto",
      marketing_allocation_mode: input.rule_settings.marketing_allocation_mode,
      marketing_resolution_method: Array.from(marketingMethods).join(" | ") || "not_applied",
      competence_mode: input.period_config.competence_mode,
    },
    executive_metrics: executiveMetrics,
    by_sku: bySku.sort((a, b) => b.result_net - a.result_net),
    by_family: byFamily.sort((a, b) => b.result_net - a.result_net),
    line_results: lineResults,
    monthly_trend: monthlyTrend,
    alerts: unique(alerts.map((alert) => JSON.stringify(alert))).map((raw) => JSON.parse(raw) as DataAlert),
    pending_data_report: pendingDataReport,
    inconsistencies_report: inconsistenciesReport,
    complete: !lineResults.some((line) => !line.data_complete),
  };
}
