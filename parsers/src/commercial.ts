import { parse } from "csv-parse/sync";
import type { ImportColumnMapping, ParsedImportResult } from "@avah/shared-types";
import { normalizeDate, normalizeHeader, normalizeNumber } from "./normalize.js";

export interface ParsedCommercialRow {
  date: string;
  gross_sales: number;
  gross_sales_without_platform_discount: number;
  orders: number;
  average_ticket: number;
  clicks: number;
  visitors: number;
  conversion_rate: number;
  cancelled_orders: number;
  cancelled_sales: number;
  returned_orders: number;
  returned_sales: number;
  raw: Record<string, unknown>;
}

const FIELD_ALIASES: Record<string, string[]> = {
  date: ["data", "date"],
  gross_sales: ["vendas_brutas", "gross_sales"],
  gross_sales_without_platform_discount: [
    "vendas_sem_desconto_da_plataforma",
    "gross_sales_without_platform_discount",
  ],
  orders: ["pedidos", "orders"],
  average_ticket: ["ticket_medio", "average_ticket"],
  clicks: ["cliques", "clicks"],
  visitors: ["visitantes", "visitors"],
  conversion_rate: ["taxa_de_conversao", "conversion_rate"],
  cancelled_orders: ["pedidos_cancelados", "cancelled_orders"],
  cancelled_sales: ["vendas_canceladas", "cancelled_sales"],
  returned_orders: ["pedidos_devolvidos_reembolsados", "returned_orders"],
  returned_sales: ["vendas_devolvidas_reembolsadas", "returned_sales"],
};

function getValue(row: Record<string, unknown>, field: string): unknown {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === alias);
    if (key) {
      return row[key];
    }
  }
  return undefined;
}

export function parseCommercialCsv(content: string): ParsedImportResult<ParsedCommercialRow> {
  const rawRows = parse(content, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const mapping: ImportColumnMapping[] = headers.map((header) => ({
    source_column: header,
    normalized_field: normalizeHeader(header),
    required: normalizeHeader(header) === "data",
  }));

  const warnings: string[] = [];
  const normalizedRows: ParsedCommercialRow[] = rawRows.map((raw) => ({
    date: normalizeDate(getValue(raw, "date")),
    gross_sales: normalizeNumber(getValue(raw, "gross_sales")),
    gross_sales_without_platform_discount: normalizeNumber(
      getValue(raw, "gross_sales_without_platform_discount"),
    ),
    orders: normalizeNumber(getValue(raw, "orders")),
    average_ticket: normalizeNumber(getValue(raw, "average_ticket")),
    clicks: normalizeNumber(getValue(raw, "clicks")),
    visitors: normalizeNumber(getValue(raw, "visitors")),
    conversion_rate: normalizeNumber(getValue(raw, "conversion_rate")),
    cancelled_orders: normalizeNumber(getValue(raw, "cancelled_orders")),
    cancelled_sales: normalizeNumber(getValue(raw, "cancelled_sales")),
    returned_orders: normalizeNumber(getValue(raw, "returned_orders")),
    returned_sales: normalizeNumber(getValue(raw, "returned_sales")),
    raw,
  }));

  if (!normalizedRows.length) {
    warnings.push("Nenhuma linha comercial encontrada no arquivo.");
  }

  return {
    raw_rows: rawRows,
    normalized_rows: normalizedRows,
    mapping,
    warnings,
  };
}
