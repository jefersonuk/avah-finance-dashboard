import { parse } from "csv-parse/sync";
import type { ImportColumnMapping, ParsedImportResult, SalesChannel, SkuFormInput } from "@avah/shared-types";
import { normalizeHeader, normalizeNumber } from "./normalize.js";

export interface ParsedCatalogRow {
  sku: string;
  name: string;
  family: string;
  category?: string;
  status?: string;
  channel: SalesChannel;
  current_price: number;
  promotional_price: number;
  notes?: string;
  raw: Record<string, unknown>;
}

const FIELD_ALIASES: Record<string, string[]> = {
  sku: ["sku"],
  name: ["nome_do_produto", "nome", "name"],
  family: ["familia", "family"],
  category: ["categoria", "category"],
  status: ["status"],
  channel: ["canal", "channel"],
  current_price: ["preco_atual", "current_price"],
  promotional_price: ["preco_promocional", "promotional_price"],
  notes: ["observacoes", "notes"],
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

function normalizeChannel(raw: unknown): SalesChannel {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("mercado")) {
    return "mercado_livre";
  }
  if (value.includes("loja")) {
    return "loja_propria";
  }
  if (value.includes("omni")) {
    return "omnicanal";
  }
  return "shopee";
}

export function parseCatalogCsv(content: string): ParsedImportResult<ParsedCatalogRow> {
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
    required: ["sku", "nome_do_produto"].includes(normalizeHeader(header)),
  }));

  const warnings: string[] = [];
  const normalizedRows: ParsedCatalogRow[] = rawRows.map((raw) => {
    const sku = String(getValue(raw, "sku") ?? "").trim();
    const name = String(getValue(raw, "name") ?? "").trim();

    if (!sku || !name) {
      warnings.push("Linha de catalogo sem SKU ou nome de produto.");
    }

    return {
      sku,
      name,
      family: String(getValue(raw, "family") ?? "").trim(),
      category: String(getValue(raw, "category") ?? "").trim() || undefined,
      status: String(getValue(raw, "status") ?? "").trim() || undefined,
      channel: normalizeChannel(getValue(raw, "channel")),
      current_price: normalizeNumber(getValue(raw, "current_price")),
      promotional_price: normalizeNumber(getValue(raw, "promotional_price")),
      notes: String(getValue(raw, "notes") ?? "").trim() || undefined,
      raw,
    };
  });

  return {
    raw_rows: rawRows,
    normalized_rows: normalizedRows,
    mapping,
    warnings,
  };
}

export function catalogRowToSkuForm(row: ParsedCatalogRow): SkuFormInput {
  return {
    sku: row.sku,
    nome: row.name,
    familia: row.family,
    categoria: row.category,
    custo_producao: 0,
    custo_adicional: 0,
    observacoes: row.notes,
  };
}
