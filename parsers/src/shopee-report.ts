import XLSX from "xlsx";
import { normalizeHeader, normalizeNumber } from "./normalize.js";

export type ShopeeCostCategoryKey =
  | "serum_lavanda"
  | "hortela_pimenta"
  | "lavanda"
  | "melaleuca"
  | "laranja_doce"
  | "soninho_bom";

export interface ShopeeMonthlyReportConfig {
  month: string;
  competence_mode: "order_created" | "payment_completed";
  tax_rate: number;
  costs: Partial<Record<ShopeeCostCategoryKey, number>>;
}

export interface ShopeeCategoryResult {
  category: ShopeeCostCategoryKey;
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
}

export interface ShopeeMonthlyReport {
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
  by_category: ShopeeCategoryResult[];
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
}

interface ParsedWorkbookFile {
  file_name: string;
  workbook: XLSX.WorkBook;
}

interface IncomeRow {
  type: string;
  order_id: string;
  product_name: string;
  order_created_at: string;
  payment_completed_at: string;
  payout: number;
  price: number;
  refund_value: number;
  commission: number;
  service_fee: number;
  ads_fee: number;
}

interface ParentRow {
  item_id: string;
  product_name: string;
  variation_id: string;
  units_paid: number;
}

interface CategoryDefinition {
  key: ShopeeCostCategoryKey;
  label: string;
  matchers: RegExp[];
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: "serum_lavanda",
    label: "Sérum Lavanda",
    matchers: [/serum\s+lavanda/i],
  },
  {
    key: "soninho_bom",
    label: "Sono Profundo / Soninho Bom",
    matchers: [/soninho\s+bom/i, /sono\s+profundo/i, /roll\s*on\s+avah\s+sono\s+profundo/i],
  },
  {
    key: "melaleuca",
    label: "Melaleuca",
    matchers: [/melaleuca/i, /tea\s*tree/i],
  },
  {
    key: "hortela_pimenta",
    label: "Hortelã Pimenta",
    matchers: [/hortela\s+pimenta/i],
  },
  {
    key: "laranja_doce",
    label: "Laranja Doce",
    matchers: [/laranja\s+doce/i, /laranja/i],
  },
  {
    key: "lavanda",
    label: "Lavanda",
    matchers: [/oleo\s+essencial\s+lavanda\s+para\s+dormir/i, /lavanda\s+para\s+dormir\s+e\s+ansiedade/i],
  },
];

const DEFAULT_COSTS: Record<ShopeeCostCategoryKey, number> = {
  serum_lavanda: 1.95,
  hortela_pimenta: 3.81,
  lavanda: 3.82,
  melaleuca: 3.76,
  laranja_doce: 2.72,
  soninho_bom: 4.73,
};

const DEFAULT_CONFIG: ShopeeMonthlyReportConfig = {
  month: "2026-03",
  competence_mode: "order_created",
  tax_rate: 0.065,
  costs: DEFAULT_COSTS,
};

function toAsciiText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function parseRangeDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return null;
}

function isInMonth(dateString: string, month: string): boolean {
  return dateString.startsWith(`${month}-`) || dateString.startsWith(month);
}

function detectFileKind(parsed: ParsedWorkbookFile):
  | "income"
  | "shop_stats"
  | "flash_sale"
  | "parent_sku"
  | "product_overview"
  | "traffic_overview"
  | "unknown" {
  const fileName = toAsciiText(parsed.file_name);
  const sheetNames = parsed.workbook.SheetNames.map((sheet) => toAsciiText(sheet));

  if (fileName.includes("income") || sheetNames.includes("renda")) {
    return "income";
  }

  if (fileName.includes("shop-stats")) {
    return "shop_stats";
  }

  if (fileName.includes("flash_sale") || fileName.includes("flash-sale")) {
    return "flash_sale";
  }

  if (fileName.includes("parentskudetail")) {
    return "parent_sku";
  }

  if (fileName.includes("productoverview")) {
    return "product_overview";
  }

  if (fileName.includes("traffic_overview")) {
    return "traffic_overview";
  }

  return "unknown";
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  }) as unknown[][];
}

function findHeaderIndex(rows: unknown[][], headerName: string): number {
  const expected = normalizeHeader(headerName);
  return rows.findIndex((row) => normalizeHeader(String(row[0] ?? "")) === expected);
}

function buildRowObject(headers: unknown[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const key = String(header ?? "").trim();
    out[key] = row[index];
  });
  return out;
}

function findSheetByNameContains(workbook: XLSX.WorkBook, text: string): string | null {
  const needle = toAsciiText(text);
  const found = workbook.SheetNames.find((sheet) => toAsciiText(sheet).includes(needle));
  return found ?? null;
}

function classifyCategory(productName: string): ShopeeCostCategoryKey | null {
  const normalized = toAsciiText(productName);

  for (const definition of CATEGORY_DEFINITIONS) {
    if (definition.matchers.some((matcher) => matcher.test(normalized))) {
      return definition.key;
    }
  }

  return null;
}

function computeDecision(row: ShopeeCategoryResult): string {
  if (row.units < 5) {
    return "aguardar mais dados";
  }

  if ((row.net_margin_adjusted ?? -1) < 0.18) {
    return "revisar preço / mix / promoção";
  }

  if (row.category === "laranja_doce" || row.category === "soninho_bom") {
    return "usar em mix e kits";
  }

  if ((row.net_margin_adjusted ?? -1) >= 0.22) {
    return "escalar com prioridade";
  }

  return "escalar com atenção";
}

function parseIncomeRows(workbook: XLSX.WorkBook): IncomeRow[] {
  const sheetName = findSheetByNameContains(workbook, "renda");
  if (!sheetName) {
    return [];
  }

  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = rows.findIndex((row) => {
    const first = toAsciiText(row[0]);
    const third = toAsciiText(row[2]);
    return first === "numero da sequencia" && third === "id do pedido";
  });

  if (headerIndex < 0) {
    return [];
  }

  const headers = rows[headerIndex] ?? [];
  const payload = rows.slice(headerIndex + 1).filter((row) => String(row[0] ?? "").trim());

  const out: IncomeRow[] = [];

  for (const row of payload) {
    const obj = buildRowObject(headers, row);
    out.push({
      type: String(obj["Ver"] ?? "").trim(),
      order_id: String(obj["ID do pedido"] ?? "").trim(),
      product_name: String(obj["Nome do produto"] ?? "").trim(),
      order_created_at: String(obj["Data de criação do pedido"] ?? "").trim(),
      payment_completed_at: String(obj["Data de conclusão do pagamento"] ?? "").trim(),
      payout: normalizeNumber(obj["Quantia total lançada (R$)"]),
      price: normalizeNumber(obj["Preço do produto"]),
      refund_value: normalizeNumber(obj["Valor do Reembolso"]),
      commission: normalizeNumber(obj["Taxa de comissão líquida"]),
      service_fee: normalizeNumber(obj["Taxa de serviço líquida"]),
      ads_fee: normalizeNumber(obj["sp_income_detail_ads_escrow_top_up_fee_BR"]),
    });
  }

  return out;
}

function extractCommercialSummary(workbook: XLSX.WorkBook): ShopeeMonthlyReport["commercial"] {
  const sheetName = findSheetByNameContains(workbook, "produto pago") ?? workbook.SheetNames[0];
  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = findHeaderIndex(rows, "Data");

  if (headerIndex < 0) {
    return {
      sales_paid: 0,
      orders_paid: 0,
      ticket_paid: 0,
      product_clicks: 0,
      visitors: 0,
      conversion_rate_orders: 0,
      cancelled_orders: 0,
      cancelled_sales: 0,
      returned_orders: 0,
      returned_sales: 0,
    };
  }

  const headers = rows[headerIndex] ?? [];
  const summaryRow = rows
    .slice(headerIndex + 1)
    .find((row) => /^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/.test(String(row[0] ?? "").trim()));

  if (!summaryRow) {
    return {
      sales_paid: 0,
      orders_paid: 0,
      ticket_paid: 0,
      product_clicks: 0,
      visitors: 0,
      conversion_rate_orders: 0,
      cancelled_orders: 0,
      cancelled_sales: 0,
      returned_orders: 0,
      returned_sales: 0,
    };
  }

  const obj = buildRowObject(headers, summaryRow);

  return {
    sales_paid: roundCurrency(normalizeNumber(obj["Vendas (BRL)"])),
    orders_paid: Math.round(normalizeNumber(obj["Pedidos"])),
    ticket_paid: roundCurrency(normalizeNumber(obj["Vendas por Pedido"])),
    product_clicks: Math.round(normalizeNumber(obj["Cliques Por Produto"])),
    visitors: Math.round(normalizeNumber(obj["Visitantes"])),
    conversion_rate_orders: normalizeNumber(obj["Taxa de Conversão de Pedidos"]) / 100,
    cancelled_orders: Math.round(normalizeNumber(obj["Pedidos Cancelados"])),
    cancelled_sales: roundCurrency(normalizeNumber(obj["Vendas Canceladas"])),
    returned_orders: Math.round(normalizeNumber(obj["Pedidos Devolvidos / Reembolsados"])),
    returned_sales: roundCurrency(normalizeNumber(obj["Vendas Devolvidas / Reembolsadas"])),
  };
}

function extractMarketingFromShopStats(workbook: XLSX.WorkBook): ShopeeMonthlyReport["marketing"] {
  const sheetName =
    findSheetByNameContains(workbook, "pedidos pagos") ??
    findSheetByNameContains(workbook, "fontes") ??
    workbook.SheetNames[0];
  const rows = readSheetRows(workbook, sheetName);

  let adsSales = 0;

  const firstRow = rows.find((row) => /^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/.test(String(row[0] ?? "").trim()));
  if (firstRow && firstRow.length >= 8) {
    adsSales = normalizeNumber(firstRow[7]);
  }

  let adsSpend = 0;

  const trafficHeaderIndex = rows.findIndex((row) => {
    const first = toAsciiText(row[0]);
    const line = row.map((cell) => toAsciiText(cell)).join("|");
    return first === "fontes de trafego" && line.includes("despesa com anuncios");
  });

  if (trafficHeaderIndex >= 0) {
    const headerRow = rows[trafficHeaderIndex] ?? [];
    const spendColumn = headerRow.findIndex(
      (cell) => toAsciiText(cell) === "despesa com anuncios",
    );
    const salesColumn = headerRow.findIndex((cell) => toAsciiText(cell) === "vendas (brl)");

    let rollingSales = 0;

    for (let index = trafficHeaderIndex + 1; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      const first = String(row[0] ?? "").trim();
      if (!first) {
        break;
      }

      if (toAsciiText(first) === "data" || toAsciiText(first) === "card do produto") {
        break;
      }

      adsSpend += spendColumn >= 0 ? normalizeNumber(row[spendColumn]) : 0;
      rollingSales += salesColumn >= 0 ? normalizeNumber(row[salesColumn]) : 0;
    }

    if (adsSales <= 0 && rollingSales > 0) {
      adsSales = rollingSales;
    }
  }

  const roas = safeDivide(adsSales, adsSpend);

  return {
    ads_sales: roundCurrency(adsSales),
    ads_spend: roundCurrency(adsSpend),
    roas: roas === null ? null : roundCurrency(roas),
    ads_incremental_adjusted: 0,
  };
}

function extractTrafficSummary(workbook: XLSX.WorkBook): ShopeeMonthlyReport["traffic"] {
  const sheetName = findSheetByNameContains(workbook, "todos") ?? workbook.SheetNames[0];
  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = findHeaderIndex(rows, "Data");

  if (headerIndex < 0) {
    return {
      page_views: 0,
      visitors: 0,
      return_rate: 0,
      new_followers: 0,
      product_visitors: 0,
      product_page_views: 0,
      cart_visitors: 0,
      paid_buyers: 0,
      paid_units: 0,
    };
  }

  const headers = rows[headerIndex] ?? [];
  const summaryRow = rows
    .slice(headerIndex + 1)
    .find((row) => /^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/.test(String(row[0] ?? "").trim()));

  if (!summaryRow) {
    return {
      page_views: 0,
      visitors: 0,
      return_rate: 0,
      new_followers: 0,
      product_visitors: 0,
      product_page_views: 0,
      cart_visitors: 0,
      paid_buyers: 0,
      paid_units: 0,
    };
  }

  const obj = buildRowObject(headers, summaryRow);

  return {
    page_views: Math.round(normalizeNumber(obj["Visualizações da Página"])),
    visitors: Math.round(normalizeNumber(obj["Visitantes"])),
    return_rate: normalizeNumber(obj["Taxa de Devolução"]) / 100,
    new_followers: Math.round(normalizeNumber(obj["Novos Seguidores"])),
    product_visitors: 0,
    product_page_views: 0,
    cart_visitors: 0,
    paid_buyers: 0,
    paid_units: 0,
  };
}

function extractProductOverviewSummary(workbook: XLSX.WorkBook): Pick<
  ShopeeMonthlyReport["traffic"],
  "product_visitors" | "product_page_views" | "cart_visitors" | "paid_buyers" | "paid_units"
> {
  const sheetName = workbook.SheetNames[0];
  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = findHeaderIndex(rows, "Data");

  if (headerIndex < 0) {
    return {
      product_visitors: 0,
      product_page_views: 0,
      cart_visitors: 0,
      paid_buyers: 0,
      paid_units: 0,
    };
  }

  const headers = rows[headerIndex] ?? [];
  const payload = rows.slice(headerIndex + 1).filter((row) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(row[0] ?? "").trim()));

  let productVisitors = 0;
  let productPageViews = 0;
  let cartVisitors = 0;
  let paidBuyers = 0;
  let paidUnits = 0;

  for (const row of payload) {
    const obj = buildRowObject(headers, row);
    productVisitors += normalizeNumber(obj["Visitantes do Produto (Visita)"]);
    productPageViews += normalizeNumber(obj["Visualizações da Página do Produto"]);
    cartVisitors += normalizeNumber(obj["Visitantes do Produto (Adicionar ao Carrinho)"]);
    paidBuyers += normalizeNumber(obj["Compradores (Pedidos pago)"]);
    paidUnits += normalizeNumber(obj["Unidades (Pedido pago)"]);
  }

  return {
    product_visitors: Math.round(productVisitors),
    product_page_views: Math.round(productPageViews),
    cart_visitors: Math.round(cartVisitors),
    paid_buyers: Math.round(paidBuyers),
    paid_units: Math.round(paidUnits),
  };
}

function extractParentRows(workbook: XLSX.WorkBook): ParentRow[] {
  const sheetName = findSheetByNameContains(workbook, "produtos com melhor desempenho") ?? workbook.SheetNames[0];
  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = rows.findIndex((row) => toAsciiText(row[0]) === "id do item");

  if (headerIndex < 0) {
    return [];
  }

  const headers = rows[headerIndex] ?? [];
  const payload = rows.slice(headerIndex + 1).filter((row) => String(row[0] ?? "").trim());

  return payload.map((row) => {
    const obj = buildRowObject(headers, row);
    return {
      item_id: String(obj["ID do Item"] ?? "").trim(),
      product_name: String(obj["Produto"] ?? "").trim(),
      variation_id: String(obj["ID da Variação"] ?? "").trim(),
      units_paid: normalizeNumber(obj["Unidades (Pedido pago)"]),
    };
  });
}

function extractFlashSaleActive(workbook: XLSX.WorkBook): boolean {
  const summarySheet = findSheetByNameContains(workbook, "metricas principais") ?? workbook.SheetNames[0];
  const rows = readSheetRows(workbook, summarySheet);
  if (rows.length < 2) {
    return false;
  }

  const header = rows[0] ?? [];
  const values = rows[1] ?? [];

  const salesPaidIndex = header.findIndex((cell) => toAsciiText(cell) === "vendas (pedidos pagos)(r$)");
  const ordersPaidIndex = header.findIndex((cell) => toAsciiText(cell) === "pedidos (pedidos pagos)");

  const paidSales = salesPaidIndex >= 0 ? normalizeNumber(values[salesPaidIndex]) : 0;
  const paidOrders = ordersPaidIndex >= 0 ? normalizeNumber(values[ordersPaidIndex]) : 0;

  return paidSales > 0 && paidOrders > 0;
}

export function buildShopeeMonthlyReport(
  files: Array<{ file_name: string; buffer: Buffer }>,
  config?: Partial<ShopeeMonthlyReportConfig>,
): ShopeeMonthlyReport {
  const mergedConfig: ShopeeMonthlyReportConfig = {
    month: config?.month ?? DEFAULT_CONFIG.month,
    competence_mode: config?.competence_mode ?? DEFAULT_CONFIG.competence_mode,
    tax_rate: config?.tax_rate ?? DEFAULT_CONFIG.tax_rate,
    costs: {
      ...DEFAULT_COSTS,
      ...(config?.costs ?? {}),
    },
  };

  const parsedFiles: ParsedWorkbookFile[] = files.map((file) => ({
    file_name: file.file_name,
    workbook: XLSX.read(file.buffer, {
      type: "buffer",
      raw: false,
      cellDates: true,
    }),
  }));

  const byKind = new Map<string, ParsedWorkbookFile>();

  for (const parsed of parsedFiles) {
    const kind = detectFileKind(parsed);
    if (kind !== "unknown" && !byKind.has(kind)) {
      byKind.set(kind, parsed);
    }
  }

  const warnings: string[] = [];

  const incomeWorkbook = byKind.get("income")?.workbook;
  const shopStatsWorkbook = byKind.get("shop_stats")?.workbook;
  const parentWorkbook = byKind.get("parent_sku")?.workbook;
  const productOverviewWorkbook = byKind.get("product_overview")?.workbook;
  const trafficWorkbook = byKind.get("traffic_overview")?.workbook;
  const flashWorkbook = byKind.get("flash_sale")?.workbook;

  if (!incomeWorkbook) {
    warnings.push("Arquivo de Income não encontrado. A camada financeira ficará zerada.");
  }

  if (!shopStatsWorkbook) {
    warnings.push("Arquivo Shop Stats não encontrado. A camada comercial/marketing ficará parcial.");
  }

  if (!parentWorkbook) {
    warnings.push("Arquivo Parent SKU Detail não encontrado. As unidades por categoria podem ficar parciais.");
  }

  if (!productOverviewWorkbook) {
    warnings.push("Arquivo Product Overview não encontrado. Métricas de vitrine ficarão parciais.");
  }

  if (!trafficWorkbook) {
    warnings.push("Arquivo Traffic Overview não encontrado. Métricas de tráfego ficarão parciais.");
  }

  const incomeRows = incomeWorkbook ? parseIncomeRows(incomeWorkbook) : [];

  const month = mergedConfig.month;
  const competenceField =
    mergedConfig.competence_mode === "order_created" ? "order_created_at" : "payment_completed_at";

  const monthOrderRows = incomeRows.filter(
    (row) => row.type === "Order" && isInMonth(row[competenceField], month),
  );
  const monthSkuRows = incomeRows.filter(
    (row) => row.type === "Sku" && isInMonth(row[competenceField], month),
  );

  const orders = new Set(monthOrderRows.map((row) => row.order_id).filter(Boolean));

  const revenueProduct = roundCurrency(monthOrderRows.reduce((sum, row) => sum + row.price, 0));
  const payoutTotal = roundCurrency(monthOrderRows.reduce((sum, row) => sum + row.payout, 0));
  const refundTotal = roundCurrency(
    Math.abs(monthOrderRows.reduce((sum, row) => sum + row.refund_value, 0)),
  );
  const commissionTotal = roundCurrency(
    Math.abs(monthOrderRows.reduce((sum, row) => sum + row.commission, 0)),
  );
  const serviceFeeTotal = roundCurrency(
    Math.abs(monthOrderRows.reduce((sum, row) => sum + row.service_fee, 0)),
  );
  const adsInIncome = roundCurrency(
    Math.abs(monthOrderRows.reduce((sum, row) => sum + row.ads_fee, 0)),
  );

  const commercial = shopStatsWorkbook
    ? extractCommercialSummary(shopStatsWorkbook)
    : {
        sales_paid: 0,
        orders_paid: 0,
        ticket_paid: 0,
        product_clicks: 0,
        visitors: 0,
        conversion_rate_orders: 0,
        cancelled_orders: 0,
        cancelled_sales: 0,
        returned_orders: 0,
        returned_sales: 0,
      };

  const marketingBase = shopStatsWorkbook
    ? extractMarketingFromShopStats(shopStatsWorkbook)
    : {
        ads_sales: 0,
        ads_spend: 0,
        roas: null,
        ads_incremental_adjusted: 0,
      };

  const trafficBase = trafficWorkbook
    ? extractTrafficSummary(trafficWorkbook)
    : {
        page_views: 0,
        visitors: 0,
        return_rate: 0,
        new_followers: 0,
        product_visitors: 0,
        product_page_views: 0,
        cart_visitors: 0,
        paid_buyers: 0,
        paid_units: 0,
      };

  const productSummary = productOverviewWorkbook
    ? extractProductOverviewSummary(productOverviewWorkbook)
    : {
        product_visitors: 0,
        product_page_views: 0,
        cart_visitors: 0,
        paid_buyers: 0,
        paid_units: 0,
      };

  const parentRows = parentWorkbook ? extractParentRows(parentWorkbook) : [];

  const byCategoryRevenue = new Map<ShopeeCostCategoryKey, { revenue: number; payout: number }>();
  const byCategoryUnits = new Map<ShopeeCostCategoryKey, number>();

  for (const definition of CATEGORY_DEFINITIONS) {
    byCategoryRevenue.set(definition.key, { revenue: 0, payout: 0 });
    byCategoryUnits.set(definition.key, 0);
  }

  let totalScopeRevenue = 0;

  for (const row of monthSkuRows) {
    if (row.product_name && row.product_name !== "-") {
      totalScopeRevenue += row.price;
    }

    const category = classifyCategory(row.product_name);
    if (!category) {
      continue;
    }

    const bucket = byCategoryRevenue.get(category);
    if (!bucket) {
      continue;
    }

    bucket.revenue += row.price;
    bucket.payout += row.payout;
  }

  const parentRowsOnly = parentRows.filter((row) => row.variation_id === "-" || row.variation_id === "");
  const parentItems = new Set(parentRowsOnly.map((row) => row.item_id).filter(Boolean));

  for (const row of parentRowsOnly) {
    if (row.units_paid <= 0) {
      continue;
    }

    const category = classifyCategory(row.product_name);
    if (!category) {
      continue;
    }

    byCategoryUnits.set(category, (byCategoryUnits.get(category) ?? 0) + row.units_paid);
  }

  const knownRevenue = roundCurrency(
    Array.from(byCategoryRevenue.values()).reduce((sum, row) => sum + row.revenue, 0),
  );
  const knownUnits = Math.round(
    Array.from(byCategoryUnits.values()).reduce((sum, value) => sum + value, 0),
  );

  const adsIncremental = roundCurrency(Math.max(marketingBase.ads_spend - adsInIncome, 0));

  const byCategory: ShopeeCategoryResult[] = CATEGORY_DEFINITIONS.map((definition) => {
    const revenueBucket = byCategoryRevenue.get(definition.key) ?? { revenue: 0, payout: 0 };
    const revenue = roundCurrency(revenueBucket.revenue);
    const payout = roundCurrency(revenueBucket.payout);
    const units = Math.round(byCategoryUnits.get(definition.key) ?? 0);
    const unitCost = mergedConfig.costs[definition.key] ?? 0;
    const productionCost = roundCurrency(units * unitCost);
    const tax = roundCurrency(revenue * mergedConfig.tax_rate);

    const share = knownRevenue > 0 ? revenue / knownRevenue : 0;
    const adsAllocatedFull = roundCurrency(marketingBase.ads_spend * share);
    const adsAllocatedAdjusted = roundCurrency(adsIncremental * share);

    const netConservative = roundCurrency(payout - productionCost - tax - adsAllocatedFull);
    const netAdjusted = roundCurrency(payout - productionCost - tax - adsAllocatedAdjusted);

    const marginConservative = safeDivide(netConservative, revenue);
    const marginAdjusted = safeDivide(netAdjusted, revenue);

    const result: ShopeeCategoryResult = {
      category: definition.key,
      label: definition.label,
      revenue,
      payout,
      units,
      production_cost: productionCost,
      tax,
      ads_allocated_full: adsAllocatedFull,
      ads_allocated_adjusted: adsAllocatedAdjusted,
      net_profit_conservative: netConservative,
      net_profit_adjusted: netAdjusted,
      net_margin_conservative:
        marginConservative === null ? null : roundCurrency(marginConservative),
      net_margin_adjusted: marginAdjusted === null ? null : roundCurrency(marginAdjusted),
      profit_per_unit_adjusted:
        units > 0 ? roundCurrency(netAdjusted / units) : null,
      decision: "",
    };

    result.decision = computeDecision(result);
    return result;
  }).sort((a, b) => b.net_profit_adjusted - a.net_profit_adjusted);

  const productionCostTotal = roundCurrency(
    byCategory.reduce((sum, row) => sum + row.production_cost, 0),
  );
  const payoutKnownTotal = roundCurrency(byCategory.reduce((sum, row) => sum + row.payout, 0));
  const taxTotal = roundCurrency(knownRevenue * mergedConfig.tax_rate);
  const netConservativeTotal = roundCurrency(
    payoutKnownTotal - productionCostTotal - taxTotal - marketingBase.ads_spend,
  );
  const netAdjustedTotal = roundCurrency(
    payoutKnownTotal - productionCostTotal - taxTotal - adsIncremental,
  );

  const flashSaleActive = flashWorkbook ? extractFlashSaleActive(flashWorkbook) : false;

  const kitRows = monthSkuRows.filter((row) =>
    /kit\s+farmacia\s+natural\s+com\s+4\s+oleos\s+essenciais\s+puros/i.test(
      toAsciiText(row.product_name),
    ),
  );

  const kitParentUnits = parentRowsOnly
    .filter((row) =>
      /kit\s+farmacia\s+natural\s+com\s+4\s+oleos\s+essenciais\s+puros/i.test(
        toAsciiText(row.product_name),
      ),
    )
    .reduce((sum, row) => sum + row.units_paid, 0);

  const kitRevenue = roundCurrency(kitRows.reduce((sum, row) => sum + row.price, 0));
  const kitPayout = roundCurrency(kitRows.reduce((sum, row) => sum + row.payout, 0));
  const kitUnits = Math.round(kitParentUnits);

  const kitUnitCost = roundCurrency(
    (mergedConfig.costs.laranja_doce ?? DEFAULT_COSTS.laranja_doce) +
      (mergedConfig.costs.lavanda ?? DEFAULT_COSTS.lavanda) +
      (mergedConfig.costs.melaleuca ?? DEFAULT_COSTS.melaleuca) +
      (mergedConfig.costs.hortela_pimenta ?? DEFAULT_COSTS.hortela_pimenta),
  );

  const kitAdsFull = knownRevenue > 0 ? (marketingBase.ads_spend * kitRevenue) / knownRevenue : 0;
  const kitAdsAdjusted = knownRevenue > 0 ? (adsIncremental * kitRevenue) / knownRevenue : 0;

  const kitNetConservative = kitPayout - kitUnits * kitUnitCost - kitRevenue * mergedConfig.tax_rate - kitAdsFull;
  const kitNetAdjusted = kitPayout - kitUnits * kitUnitCost - kitRevenue * mergedConfig.tax_rate - kitAdsAdjusted;

  return {
    period: {
      month,
      competence_mode: mergedConfig.competence_mode,
    },
    pricing_context: {
      flash_sale_active: flashSaleActive,
      note: flashSaleActive
        ? "Mês com oferta relâmpago identificada: preço médio realizado não deve ser usado como preço-base estrutural."
        : "Sem sinal forte de oferta relâmpago no período importado.",
    },
    commercial,
    traffic: {
      ...trafficBase,
      ...productSummary,
    },
    financial: {
      orders: orders.size,
      revenue_product: revenueProduct,
      payout_total: payoutTotal,
      refund_total: refundTotal,
      commission_total: commissionTotal,
      service_fee_total: serviceFeeTotal,
      ads_in_income: adsInIncome,
      take_rate_marketplace:
        revenueProduct > 0 ? roundCurrency((commissionTotal + serviceFeeTotal) / revenueProduct) : null,
      payout_ratio: revenueProduct > 0 ? roundCurrency(payoutTotal / revenueProduct) : null,
    },
    marketing: {
      ...marketingBase,
      ads_incremental_adjusted: adsIncremental,
    },
    coverage: {
      known_revenue: knownRevenue,
      total_revenue_in_classifiable_scope: roundCurrency(totalScopeRevenue),
      known_revenue_coverage:
        totalScopeRevenue > 0 ? roundCurrency(knownRevenue / totalScopeRevenue) : null,
      known_units: knownUnits,
    },
    consolidated: {
      production_cost_total: productionCostTotal,
      tax_total: taxTotal,
      net_profit_conservative: netConservativeTotal,
      net_profit_adjusted: netAdjustedTotal,
      net_margin_conservative:
        knownRevenue > 0 ? roundCurrency(netConservativeTotal / knownRevenue) : null,
      net_margin_adjusted: knownRevenue > 0 ? roundCurrency(netAdjustedTotal / knownRevenue) : null,
    },
    by_category: byCategory,
    catalog: {
      parent_rows: parentRowsOnly.length,
      parent_items: parentItems.size,
    },
    kit_farmacia: {
      units: kitUnits,
      revenue: kitRevenue,
      payout: kitPayout,
      unit_price_realized: kitUnits > 0 ? roundCurrency(kitRevenue / kitUnits) : null,
      unit_payout_realized: kitUnits > 0 ? roundCurrency(kitPayout / kitUnits) : null,
      unit_cost: kitUnitCost,
      margin_conservative: kitRevenue > 0 ? roundCurrency(kitNetConservative / kitRevenue) : null,
      margin_adjusted: kitRevenue > 0 ? roundCurrency(kitNetAdjusted / kitRevenue) : null,
    },
    warnings,
  };
}
