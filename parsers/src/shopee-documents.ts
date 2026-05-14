import XLSX from "xlsx";
import { normalizeHeader, normalizeNumber } from "./normalize.js";

export type ShopeeDocumentType =
  | "income_financial"
  | "shop_stats"
  | "flash_sale_metrics"
  | "parent_sku_detail"
  | "product_overview"
  | "traffic_overview"
  | "unknown";

export interface ParsedShopeeDocument {
  file_name: string;
  file_type: ShopeeDocumentType;
  sheets: string[];
  summary: Record<string, unknown>;
  data_rows: Record<string, unknown>[];
  warnings: string[];
}

function normalizeValueByHeader(header: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const text = String(value).trim();
  if (text === "" || text === "-") {
    return null;
  }

  const normalizedHeader = normalizeHeader(header);
  const isIdentifierColumn =
    normalizedHeader === "id" ||
    normalizedHeader.startsWith("id_") ||
    normalizedHeader.endsWith("_id");

  const isTextualColumn =
    normalizedHeader === "produto" ||
    normalizedHeader === "nome_da_variacao" ||
    normalizedHeader === "status_atual_do_item" ||
    normalizedHeader === "status_atual_da_variacao" ||
    normalizedHeader === "tipo_de_pedido" ||
    normalizedHeader === "fontes_de_trafego" ||
    normalizedHeader === "card_do_produto";

  if (
    isIdentifierColumn ||
    normalizedHeader.includes("sku") ||
    isTextualColumn ||
    normalizedHeader.includes("periodo") ||
    normalizedHeader === "data" ||
    normalizedHeader.includes("data_de_criacao")
  ) {
    return text;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    const [hours, minutes, seconds] = text.split(":").map((part) => Number(part));
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (text.includes("%")) {
    const parsed = normalizeNumber(text.replace("%", ""));
    return parsed / 100;
  }

  if (/^-?\d+[\d.,]*$/.test(text)) {
    return normalizeNumber(text);
  }

  return text;
}

function rowToObject(headers: string[], row: unknown[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    output[header] = normalizeValueByHeader(header, row[index]);
  });
  return output;
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    return [];
  }

  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  }) as unknown[][];
}

function findHeaderRowIndex(rows: unknown[][], expectedFirstHeader: string): number {
  const normalizedExpected = normalizeHeader(expectedFirstHeader);
  return rows.findIndex((row) => normalizeHeader(String(row[0] ?? "")) === normalizedExpected);
}

function parseSummaryAndDailyByDate(rows: unknown[][]): {
  summary: Record<string, unknown>;
  dataRows: Record<string, unknown>[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const headerIndex = findHeaderRowIndex(rows, "Data");

  if (headerIndex < 0) {
    return { summary: {}, dataRows: [], warnings: ["Cabecalho 'Data' nao encontrado."] };
  }

  const headers = (rows[headerIndex] ?? []).map((item) => String(item ?? "").trim());
  const payloadRows = rows.slice(headerIndex + 1);
  const validRows = payloadRows.filter((row) => {
    const first = String(row[0] ?? "").trim();
    if (!first) {
      return false;
    }

    if (normalizeHeader(first) === "data") {
      return false;
    }

    return true;
  });

  const objects = validRows.map((row) => rowToObject(headers, row));

  const summary =
    objects.find((row) => {
      const dateValue = String(row["Data"] ?? row["Período"] ?? "");
      return /\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}/.test(dateValue);
    }) ?? {};

  const dataRows = objects.filter((row) => {
    const dateValue = String(row["Data"] ?? row["Período"] ?? "");
    return /\d{2}\/\d{2}\/\d{4}$/.test(dateValue);
  });

  if (!dataRows.length) {
    warnings.push("Nenhuma linha diaria encontrada.");
  }

  return { summary, dataRows, warnings };
}

function detectDocumentType(fileName: string): ShopeeDocumentType {
  const normalized = fileName.toLowerCase();

  if (normalized.includes("income")) {
    return "income_financial";
  }

  if (normalized.includes("shop-stats")) {
    return "shop_stats";
  }

  if (normalized.includes("flash_sale") || normalized.includes("flash-sale")) {
    return "flash_sale_metrics";
  }

  if (normalized.includes("parentskudetail")) {
    return "parent_sku_detail";
  }

  if (normalized.includes("productoverview")) {
    return "product_overview";
  }

  if (normalized.includes("traffic_overview")) {
    return "traffic_overview";
  }

  return "unknown";
}

function parseIncomeFinancial(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "renda");
  if (!sheetName) {
    return {
      file_name: fileName,
      file_type: "income_financial",
      sheets: workbook.SheetNames,
      summary: {},
      data_rows: [],
      warnings: ["Planilha 'Renda' não encontrada no arquivo de Income."],
    };
  }

  const rows = readSheetRows(workbook, sheetName);
  const headerIndex = rows.findIndex(
    (row) =>
      normalizeHeader(String(row[0] ?? "")) === "numero_da_sequencia" &&
      normalizeHeader(String(row[2] ?? "")) === "id_do_pedido",
  );

  if (headerIndex < 0) {
    return {
      file_name: fileName,
      file_type: "income_financial",
      sheets: workbook.SheetNames,
      summary: {},
      data_rows: [],
      warnings: ["Cabeçalho principal do Income não encontrado em 'Renda'."],
    };
  }

  const headers = (rows[headerIndex] ?? []).map((item) => String(item ?? "").trim());
  const payload = rows
    .slice(headerIndex + 1)
    .filter((row) => String(row[0] ?? "").trim())
    .map((row) => rowToObject(headers, row));

  const orderRows = payload.filter((row) => String(row["Ver"] ?? "").trim() === "Order");
  const skuRows = payload.filter((row) => String(row["Ver"] ?? "").trim() === "Sku");

  return {
    file_name: fileName,
    file_type: "income_financial",
    sheets: workbook.SheetNames,
    summary: {
      order_rows: orderRows.length,
      sku_rows: skuRows.length,
      unique_orders: new Set(
        orderRows.map((row) => String(row["ID do pedido"] ?? "").trim()).filter(Boolean),
      ).size,
    },
    data_rows: payload,
    warnings: [],
  };
}

function parseShopStats(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const warnings: string[] = [];
  const madeRows = readSheetRows(workbook, "Pedido Feito");
  const paidRows = readSheetRows(workbook, "Produto Pago");

  const made = parseSummaryAndDailyByDate(madeRows);
  const paid = parseSummaryAndDailyByDate(paidRows);

  warnings.push(...made.warnings.map((message) => `[Pedido Feito] ${message}`));
  warnings.push(...paid.warnings.map((message) => `[Produto Pago] ${message}`));

  const dataRows = [...made.dataRows.map((row) => ({ sheet: "Pedido Feito", ...row })), ...paid.dataRows.map((row) => ({ sheet: "Produto Pago", ...row }))];

  return {
    file_name: fileName,
    file_type: "shop_stats",
    sheets: workbook.SheetNames,
    summary: {
      pedido_feito: made.summary,
      produto_pago: paid.summary,
    },
    data_rows: dataRows,
    warnings,
  };
}

function parseFlashSale(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const warnings: string[] = [];
  const summaryRows = readSheetRows(workbook, "Métricas Principais");
  const trendRows = readSheetRows(workbook, "Tendência de Métrica");

  const parseByPeriodo = (rows: unknown[][]) => {
    const headerIndex = findHeaderRowIndex(rows, "Período");
    if (headerIndex < 0) {
      return { summary: {}, dataRows: [] as Record<string, unknown>[] };
    }

    const headers = (rows[headerIndex] ?? []).map((item) => String(item ?? "").trim());
    const payload = rows.slice(headerIndex + 1).filter((row) => String(row[0] ?? "").trim());
    const objects = payload.map((row) => rowToObject(headers, row));

    const summary =
      objects.find((row) => /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(String(row["Período"] ?? ""))) ?? {};

    const dataRows = objects.filter((row) => /\d{2}\/\d{2}\/\d{4}$/.test(String(row["Período"] ?? "")));

    return { summary, dataRows };
  };

  const summary = parseByPeriodo(summaryRows);
  const trend = parseByPeriodo(trendRows);

  if (!trend.dataRows.length) {
    warnings.push("Tendência de Métrica sem linhas diarias.");
  }

  return {
    file_name: fileName,
    file_type: "flash_sale_metrics",
    sheets: workbook.SheetNames,
    summary: {
      metricas_principais: summary.summary,
    },
    data_rows: trend.dataRows,
    warnings,
  };
}

function parseParentSku(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const warnings: string[] = [];
  const aggregatedRows: Record<string, unknown>[] = [];
  const summary: Record<string, unknown> = {};

  for (const sheet of workbook.SheetNames) {
    const rows = readSheetRows(workbook, sheet);
    const headerIndex = rows.findIndex((row) => String(row[0] ?? "").trim() === "ID do Item");

    if (headerIndex < 0) {
      warnings.push(`Planilha '${sheet}' sem cabecalho ID do Item.`);
      continue;
    }

    const headers = (rows[headerIndex] ?? []).map((item) => String(item ?? "").trim());
    const dataRows = rows
      .slice(headerIndex + 1)
      .filter((row) => String(row[0] ?? "").trim())
      .map((row) => ({ sheet, ...rowToObject(headers, row) }));

    aggregatedRows.push(...dataRows);
    summary[sheet] = {
      linhas: dataRows.length,
    };
  }

  return {
    file_name: fileName,
    file_type: "parent_sku_detail",
    sheets: workbook.SheetNames,
    summary,
    data_rows: aggregatedRows,
    warnings,
  };
}

function parseProductOverview(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const sheetName = workbook.SheetNames[0] ?? "overview";
  const rows = readSheetRows(workbook, sheetName);
  const parsed = parseSummaryAndDailyByDate(rows);

  return {
    file_name: fileName,
    file_type: "product_overview",
    sheets: workbook.SheetNames,
    summary: parsed.summary,
    data_rows: parsed.dataRows,
    warnings: parsed.warnings,
  };
}

function parseTrafficOverview(fileName: string, workbook: XLSX.WorkBook): ParsedShopeeDocument {
  const warnings: string[] = [];
  const summary: Record<string, unknown> = {};
  const dataRows: Record<string, unknown>[] = [];

  for (const sheet of workbook.SheetNames) {
    const rows = readSheetRows(workbook, sheet);
    const parsed = parseSummaryAndDailyByDate(rows);

    summary[sheet] = parsed.summary;
    dataRows.push(...parsed.dataRows.map((row) => ({ sheet, ...row })));
    warnings.push(...parsed.warnings.map((message) => `[${sheet}] ${message}`));
  }

  return {
    file_name: fileName,
    file_type: "traffic_overview",
    sheets: workbook.SheetNames,
    summary,
    data_rows: dataRows,
    warnings,
  };
}

export function parseShopeeDocumentBuffer(fileName: string, buffer: Buffer): ParsedShopeeDocument {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: true,
  });

  const fileType = detectDocumentType(fileName);

  if (fileType === "income_financial") {
    return parseIncomeFinancial(fileName, workbook);
  }

  if (fileType === "shop_stats") {
    return parseShopStats(fileName, workbook);
  }

  if (fileType === "flash_sale_metrics") {
    return parseFlashSale(fileName, workbook);
  }

  if (fileType === "parent_sku_detail") {
    return parseParentSku(fileName, workbook);
  }

  if (fileType === "product_overview") {
    return parseProductOverview(fileName, workbook);
  }

  if (fileType === "traffic_overview") {
    return parseTrafficOverview(fileName, workbook);
  }

  return {
    file_name: fileName,
    file_type: "unknown",
    sheets: workbook.SheetNames,
    summary: {},
    data_rows: [],
    warnings: [
      "Tipo de documento nao reconhecido. Nome esperado: income, shop-stats, flash_sale_metrics, parentskudetail, productoverview ou traffic_overview.",
    ],
  };
}
