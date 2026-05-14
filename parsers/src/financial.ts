import { parse } from "csv-parse/sync";
import type { ImportColumnMapping, ParsedImportResult } from "@avah/shared-types";
import { normalizeDate, normalizeHeader, normalizeNumber } from "./normalize.js";

export interface ParsedFinancialRow {
  order_id: string;
  refund_id?: string;
  sku: string;
  product_name: string;
  order_created_at: string;
  payment_completed_at?: string;
  total_amount: number;
  product_price: number;
  refund_value: number;
  buyer_shipping_fee: number;
  partner_shipping_fee: number;
  platform_shipping_discount: number;
  seller_voucher: number;
  shared_voucher: number;
  cashback: number;
  net_commission: number;
  service_fee: number;
  transaction_fee: number;
  affiliate_fee: number;
  platform_ads_fee: number;
  compensation: number;
  buyer_refund: number;
  coupon_code?: string;
  order_type?: string;
  payment_method?: string;
  carrier?: string;
  payout_real: number;
  raw: Record<string, unknown>;
}

const DICTIONARY: Record<string, string[]> = {
  order_id: ["id_do_pedido", "order_id", "pedido_id"],
  refund_id: ["id_do_reembolso", "refund_id"],
  sku: ["sku", "seller_sku"],
  product_name: ["nome_do_produto", "product_name", "produto"],
  order_created_at: ["data_de_criacao_do_pedido", "order_created_at", "data_pedido"],
  payment_completed_at: [
    "data_de_conclusao_do_pagamento",
    "payment_completed_at",
    "data_pagamento",
  ],
  total_amount: ["quantia_total_lancada", "total_amount", "valor_total"],
  product_price: ["preco_do_produto", "product_price", "valor_produto"],
  refund_value: ["valor_do_reembolso", "refund_value"],
  buyer_shipping_fee: ["frete_pago_pelo_comprador", "buyer_shipping_fee"],
  partner_shipping_fee: ["frete_cobrado_pelo_parceiro_logistico", "partner_shipping_fee"],
  platform_shipping_discount: [
    "desconto_de_frete_da_plataforma",
    "platform_shipping_discount",
  ],
  seller_voucher: ["voucher_subsidiado_pelo_seller", "seller_voucher"],
  shared_voucher: ["voucher_compartilhado", "shared_voucher"],
  cashback: ["cashback"],
  net_commission: ["comissao_liquida", "net_commission_fee"],
  service_fee: ["taxa_de_servico_liquida", "service_fee"],
  transaction_fee: ["taxa_de_transacao", "transaction_fee"],
  affiliate_fee: ["taxa_de_afiliado", "affiliate_fee"],
  platform_ads_fee: ["taxa_de_ads_dentro_da_plataforma", "platform_ads_fee"],
  compensation: ["compensacoes", "compensation"],
  buyer_refund: ["reembolsos_ao_comprador", "buyer_refund"],
  coupon_code: ["codigo_de_cupom", "coupon_code"],
  order_type: ["tipo_de_pedido", "order_type"],
  payment_method: ["metodo_de_pagamento", "payment_method"],
  carrier: ["transportadora", "carrier"],
  payout_real: ["payout_real", "valor_liquido_recebido", "quantia_total_lancada"],
};

function resolveColumn(row: Record<string, unknown>, normalizedKey: string): unknown {
  const aliases = DICTIONARY[normalizedKey] ?? [];

  for (const alias of aliases) {
    const sourceKey = Object.keys(row).find((key) => normalizeHeader(key) === alias);
    if (sourceKey) {
      return row[sourceKey];
    }
  }

  return undefined;
}

function buildMapping(headers: string[]): ImportColumnMapping[] {
  const normalizedHeaders = headers.map((header) => ({
    source: header,
    normalized: normalizeHeader(header),
  }));

  const output: ImportColumnMapping[] = [];

  for (const [field, aliases] of Object.entries(DICTIONARY)) {
    const match = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (match) {
      output.push({
        source_column: match.source,
        normalized_field: field,
        required: ["order_id", "sku", "order_created_at", "total_amount"].includes(field),
      });
    }
  }

  return output;
}

export function parseFinancialCsv(content: string): ParsedImportResult<ParsedFinancialRow> {
  const rawRows = parse(content, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const mapping = buildMapping(headers);

  const warnings: string[] = [];
  const normalizedRows: ParsedFinancialRow[] = rawRows.map((raw) => {
    const orderId = String(resolveColumn(raw, "order_id") ?? "").trim();
    const sku = String(resolveColumn(raw, "sku") ?? "").trim();

    if (!orderId) {
      warnings.push("Linha sem order_id foi importada com order_id vazio.");
    }

    if (!sku) {
      warnings.push(`Pedido ${orderId || "(sem id)"} sem SKU identificado.`);
    }

    return {
      order_id: orderId,
      refund_id: String(resolveColumn(raw, "refund_id") ?? "").trim() || undefined,
      sku,
      product_name: String(resolveColumn(raw, "product_name") ?? "").trim(),
      order_created_at: normalizeDate(resolveColumn(raw, "order_created_at")),
      payment_completed_at:
        normalizeDate(resolveColumn(raw, "payment_completed_at")) || undefined,
      total_amount: normalizeNumber(resolveColumn(raw, "total_amount")),
      product_price: normalizeNumber(resolveColumn(raw, "product_price")),
      refund_value: normalizeNumber(resolveColumn(raw, "refund_value")),
      buyer_shipping_fee: normalizeNumber(resolveColumn(raw, "buyer_shipping_fee")),
      partner_shipping_fee: normalizeNumber(resolveColumn(raw, "partner_shipping_fee")),
      platform_shipping_discount: normalizeNumber(
        resolveColumn(raw, "platform_shipping_discount"),
      ),
      seller_voucher: normalizeNumber(resolveColumn(raw, "seller_voucher")),
      shared_voucher: normalizeNumber(resolveColumn(raw, "shared_voucher")),
      cashback: normalizeNumber(resolveColumn(raw, "cashback")),
      net_commission: normalizeNumber(resolveColumn(raw, "net_commission")),
      service_fee: normalizeNumber(resolveColumn(raw, "service_fee")),
      transaction_fee: normalizeNumber(resolveColumn(raw, "transaction_fee")),
      affiliate_fee: normalizeNumber(resolveColumn(raw, "affiliate_fee")),
      platform_ads_fee: normalizeNumber(resolveColumn(raw, "platform_ads_fee")),
      compensation: normalizeNumber(resolveColumn(raw, "compensation")),
      buyer_refund: normalizeNumber(resolveColumn(raw, "buyer_refund")),
      coupon_code: String(resolveColumn(raw, "coupon_code") ?? "").trim() || undefined,
      order_type: String(resolveColumn(raw, "order_type") ?? "").trim() || undefined,
      payment_method:
        String(resolveColumn(raw, "payment_method") ?? "").trim() || undefined,
      carrier: String(resolveColumn(raw, "carrier") ?? "").trim() || undefined,
      payout_real:
        normalizeNumber(resolveColumn(raw, "payout_real")) ||
        normalizeNumber(resolveColumn(raw, "total_amount")),
      raw,
    };
  });

  if (!mapping.some((item) => item.normalized_field === "order_id")) {
    warnings.push("Coluna de order_id nao encontrada no arquivo.");
  }

  if (!mapping.some((item) => item.normalized_field === "sku")) {
    warnings.push("Coluna de SKU nao encontrada no arquivo.");
  }

  return {
    raw_rows: rawRows,
    normalized_rows: normalizedRows,
    mapping,
    warnings,
  };
}
