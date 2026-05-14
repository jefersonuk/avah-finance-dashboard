import { randomUUID } from "node:crypto";
import { parseFinancialCsv } from "@avah/parsers";
import type { ImportedFinancialEntry, ImportedOrder, ImportedOrderItem, SalesChannel } from "@avah/shared-types";
import type { AppState } from "../db/types.js";

function meta(source: "manual" | "imported" | "calculated" = "imported") {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    created_at: now.slice(0, 10),
    updated_at: now.slice(0, 10),
    source,
    version: 1,
    status: "active" as const,
  };
}

export interface FinancialImportOutcome {
  rows_received: number;
  orders_created: number;
  items_created: number;
  financial_entries_created: number;
  warnings: string[];
  mapping: Array<{ source_column: string; normalized_field: string; required: boolean }>;
}

export function importFinancialCsvIntoState(
  state: AppState,
  csvContent: string,
  channel: SalesChannel,
): FinancialImportOutcome {
  const parsed = parseFinancialCsv(csvContent);

  let ordersCreated = 0;
  let itemsCreated = 0;
  let financialEntriesCreated = 0;

  for (const row of parsed.normalized_rows) {
    if (!row.order_id || !row.sku) {
      continue;
    }

    const orderExists = state.imported_orders.some((order) => order.order_id === row.order_id);

    if (!orderExists) {
      const order: ImportedOrder = {
        ...meta("imported"),
        company_id: state.company.id,
        channel,
        order_id: row.order_id,
        refund_id: row.refund_id,
        order_created_at: row.order_created_at || new Date().toISOString().slice(0, 10),
        payment_approved_at: row.payment_completed_at,
        payout_released_at: row.payment_completed_at,
        order_type: row.order_type,
        payment_method: row.payment_method,
        carrier: row.carrier,
        coupon_code: row.coupon_code,
      };

      state.imported_orders.push(order);
      ordersCreated += 1;
    }

    const item: ImportedOrderItem = {
      ...meta("imported"),
      company_id: state.company.id,
      channel,
      order_id: row.order_id,
      sku: row.sku,
      product_name: row.product_name,
      quantity: 1,
      item_gross_revenue: row.total_amount,
      item_product_price: row.product_price || row.total_amount,
      buyer_shipping_fee: row.buyer_shipping_fee,
      refund_value: row.refund_value,
      seller_voucher: row.seller_voucher,
      shared_voucher: row.shared_voucher,
      cashback: row.cashback,
      marketplace_ads_fee: row.platform_ads_fee,
      notes: "Importado de CSV financeiro",
    };

    state.imported_order_items.push(item);
    itemsCreated += 1;

    const financialEntry: ImportedFinancialEntry = {
      ...meta("imported"),
      company_id: state.company.id,
      channel,
      order_id: row.order_id,
      sku: row.sku,
      event_date: row.payment_completed_at || row.order_created_at || new Date().toISOString().slice(0, 10),
      event_type: "financial_import",
      amount: row.total_amount,
      net_commission_fee: row.net_commission,
      service_fee: row.service_fee,
      transaction_fee: row.transaction_fee,
      affiliate_fee: row.affiliate_fee,
      logistic_partner_shipping_fee: row.partner_shipping_fee,
      platform_shipping_discount: row.platform_shipping_discount,
      compensation_value: row.compensation,
      buyer_refund: row.buyer_refund,
      payout_real: row.payout_real,
      metadata: {
        coupon_code: row.coupon_code,
        order_type: row.order_type,
        payment_method: row.payment_method,
        carrier: row.carrier,
      },
    };

    state.imported_financial_entries.push(financialEntry);
    financialEntriesCreated += 1;
  }

  return {
    rows_received: parsed.normalized_rows.length,
    orders_created: ordersCreated,
    items_created: itemsCreated,
    financial_entries_created: financialEntriesCreated,
    warnings: parsed.warnings,
    mapping: parsed.mapping,
  };
}
