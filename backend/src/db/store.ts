import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ImportedFinancialEntry,
  ImportedOrder,
  ImportedOrderItem,
  Kit,
  KitComponent,
  MarketingCost,
  Sku,
  SkuAdditionalCosts,
  SkuCostHistory,
  TaxRule,
} from "@avah/shared-types";
import type { AppState } from "./types.js";
import { defaultState } from "./default-state.js";

const MODULE_FILE = fileURLToPath(import.meta.url);
const DB_DIRNAME = dirname(MODULE_FILE);
const BACKEND_ROOT = resolve(DB_DIRNAME, "..", "..");

const DB_PATH = resolve(BACKEND_ROOT, "data/avah.sqlite");
const SCHEMA_PATH = resolve(DB_DIRNAME, "schema.sql");
const LEGACY_STORE_PATH = resolve(BACKEND_ROOT, "data/store.json");

const DB_DIR = dirname(DB_PATH);
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

let initialized = false;

function runSchema() {
  const schemaSql = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schemaSql);
}

function baseEntityColumns(entity: {
  id: string;
  created_at: string;
  updated_at: string;
  source: string;
  version: number;
  status: string;
}) {
  return {
    id: entity.id,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    source: entity.source,
    version: entity.version,
    status: entity.status,
  };
}

function withNullable<T extends Record<string, unknown>>(row: T, nullableKeys: string[]) {
  const output: Record<string, unknown> = { ...row };
  for (const key of nullableKeys) {
    if (!(key in output) || output[key] === undefined) {
      output[key] = null;
    }
  }
  return output as T;
}

function upsertSettings(companyId: string, key: string, value: unknown) {
  const existing = db
    .prepare("SELECT id FROM settings WHERE company_id = ? AND key = ? LIMIT 1")
    .get(companyId, key) as { id: string } | undefined;

  const now = new Date().toISOString().slice(0, 10);

  if (!existing) {
    db.prepare(
      `INSERT INTO settings
      (id, company_id, key, value_json, created_at, updated_at, source, version, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), companyId, key, JSON.stringify(value), now, now, "manual", 1, "active");
    return;
  }

  db.prepare(
    `UPDATE settings
     SET value_json = ?, updated_at = ?, version = version + 1
     WHERE id = ?`
  ).run(JSON.stringify(value), now, existing.id);
}

function clearAnalyticalTables() {
  const tables = [
    "companies",
    "tax_rules",
    "marketing_costs",
    "skus",
    "sku_cost_history",
    "kits",
    "kit_components",
    "imported_orders",
    "imported_order_items",
    "imported_financial_entries",
  ];

  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  db.prepare(
    "DELETE FROM settings WHERE key IN ('analysis_rules', 'margin_targets', 'company_profile') OR key LIKE 'sku_additional_costs:%'"
  ).run();
}

function saveStateSync(state: AppState): void {
  const transaction = db.transaction((payload: AppState) => {
    clearAnalyticalTables();

    db.prepare(
      `INSERT INTO companies
      (id, name, cnpj, currency, created_at, updated_at, source, version, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      payload.company.id,
      payload.company.company_name,
      payload.company.cnpj,
      payload.company.currency,
      payload.company.created_at,
      payload.company.updated_at,
      payload.company.source,
      payload.company.version,
      payload.company.status,
    );

    upsertSettings(payload.company.id, "analysis_rules", payload.rules);
    upsertSettings(payload.company.id, "margin_targets", payload.margin_targets);
    upsertSettings(payload.company.id, "company_profile", {
      primary_channel: payload.company.primary_channel,
      tax_regime: payload.company.tax_regime,
      effective_tax_rate: payload.company.effective_tax_rate,
      notes: payload.company.notes ?? "",
    });

    const insertTaxRule = db.prepare(
      `INSERT INTO tax_rules
      (id, company_id, tax_regime, tax_rate, validity_start, validity_end, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @tax_regime, @tax_rate, @validity_start, @validity_end, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.tax_rules) {
      insertTaxRule.run(withNullable({ ...baseEntityColumns(row), ...row }, ["notes"]));
    }

    const insertMarketing = db.prepare(
      `INSERT INTO marketing_costs
      (id, company_id, channel, reference_month, investment_total, roas, roas_origin, priority_method, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @channel, @reference_month, @investment_total, @roas, @roas_origin, @priority_method, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.marketing_costs) {
      insertMarketing.run(
        withNullable({ ...baseEntityColumns(row), ...row }, [
          "investment_total",
          "roas",
          "notes",
        ]),
      );
    }

    const insertSku = db.prepare(
      `INSERT INTO skus
      (id, company_id, sku, name, family, category, channel, current_price, promo_price, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @sku, @name, @family, @category, @channel, @current_price, @promo_price, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.skus) {
      insertSku.run(
        withNullable({ ...baseEntityColumns(row), ...row }, [
          "family",
          "category",
          "channel",
          "current_price",
          "promo_price",
          "notes",
        ]),
      );
    }

    const insertSkuCost = db.prepare(
      `INSERT INTO sku_cost_history
      (id, company_id, sku, production_unit_cost, includes_packaging, includes_ready_to_ship, validity_start, validity_end, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @sku, @production_unit_cost, @includes_packaging, @includes_ready_to_ship, @validity_start, @validity_end, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.sku_cost_history) {
      insertSkuCost.run(
        withNullable(
          {
            ...baseEntityColumns(row),
            ...row,
            includes_packaging: row.includes_packaging ? 1 : 0,
            includes_ready_to_ship: row.includes_ready_to_ship ? 1 : 0,
          },
          ["notes"],
        ),
      );
    }

    const insertSkuAdditional = db.prepare(
      `INSERT INTO imported_financial_entries
      (id, company_id, channel, order_id, sku, event_date, event_type, amount, net_commission_fee, service_fee, transaction_fee, affiliate_fee, logistic_partner_shipping_fee, platform_shipping_discount, compensation_value, buyer_refund, payout_real, metadata_json, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @channel, @order_id, @sku, @event_date, @event_type, @amount, @net_commission_fee, @service_fee, @transaction_fee, @affiliate_fee, @logistic_partner_shipping_fee, @platform_shipping_discount, @compensation_value, @buyer_refund, @payout_real, @metadata_json, @created_at, @updated_at, @source, @version, @status)`
    );

    const insertAdditionalCosts = db.prepare(
      `INSERT INTO settings
      (id, company_id, key, value_json, created_at, updated_at, source, version, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of payload.sku_additional_costs) {
      insertAdditionalCosts.run(
        row.id,
        row.company_id,
        `sku_additional_costs:${row.id}`,
        JSON.stringify(row),
        row.created_at,
        row.updated_at,
        row.source,
        row.version,
        row.status,
      );
    }

    const insertKit = db.prepare(
      `INSERT INTO kits
      (id, company_id, kit_sku, kit_name, calculated_cost, sale_price, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @kit_sku, @kit_name, @calculated_cost, @sale_price, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.kits) {
      insertKit.run(
        withNullable({ ...baseEntityColumns(row), ...row }, [
          "calculated_cost",
          "sale_price",
          "notes",
        ]),
      );
    }

    const insertKitComponent = db.prepare(
      `INSERT INTO kit_components
      (id, company_id, kit_sku, component_sku, quantity, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @kit_sku, @component_sku, @quantity, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.kit_components) {
      insertKitComponent.run({ ...baseEntityColumns(row), ...row });
    }

    const insertOrder = db.prepare(
      `INSERT INTO imported_orders
      (id, company_id, channel, order_id, refund_id, order_created_at, payment_approved_at, payout_released_at, order_type, payment_method, carrier, coupon_code, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @channel, @order_id, @refund_id, @order_created_at, @payment_approved_at, @payout_released_at, @order_type, @payment_method, @carrier, @coupon_code, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.imported_orders) {
      insertOrder.run(
        withNullable({ ...baseEntityColumns(row), ...row }, [
          "refund_id",
          "payment_approved_at",
          "payout_released_at",
          "order_type",
          "payment_method",
          "carrier",
          "coupon_code",
        ]),
      );
    }

    const insertOrderItem = db.prepare(
      `INSERT INTO imported_order_items
      (id, company_id, channel, order_id, sku, product_name, quantity, item_gross_revenue, item_product_price, buyer_shipping_fee, refund_value, seller_voucher, shared_voucher, cashback, marketplace_ads_fee, notes, created_at, updated_at, source, version, status)
      VALUES (@id, @company_id, @channel, @order_id, @sku, @product_name, @quantity, @item_gross_revenue, @item_product_price, @buyer_shipping_fee, @refund_value, @seller_voucher, @shared_voucher, @cashback, @marketplace_ads_fee, @notes, @created_at, @updated_at, @source, @version, @status)`
    );

    for (const row of payload.imported_order_items) {
      insertOrderItem.run(withNullable({ ...baseEntityColumns(row), ...row }, ["notes"]));
    }

    for (const row of payload.imported_financial_entries) {
      insertSkuAdditional.run(
        withNullable(
          {
            ...baseEntityColumns(row),
            ...row,
            metadata_json: JSON.stringify(row.metadata ?? {}),
          },
          ["order_id", "sku", "event_date", "event_type", "metadata_json"],
        ),
      );
    }
  });

  transaction(state);
}

function readSettingsValue<T>(companyId: string, key: string): T | null {
  const row = db
    .prepare("SELECT value_json FROM settings WHERE company_id = ? AND key = ? LIMIT 1")
    .get(companyId, key) as { value_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.value_json) as T;
}

function readAdditionalCosts(companyId: string): SkuAdditionalCosts[] {
  const rows = db
    .prepare(
      "SELECT value_json FROM settings WHERE company_id = ? AND key LIKE 'sku_additional_costs:%' ORDER BY created_at ASC"
    )
    .all(companyId) as Array<{ value_json: string }>;

  return rows.map((row) => JSON.parse(row.value_json) as SkuAdditionalCosts);
}

type CompanyRow = {
  id: string;
  name: string;
  cnpj: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
  source: AppState["company"]["source"];
  version: number;
  status: AppState["company"]["status"];
};

type SkuCostHistoryRow = Omit<
  SkuCostHistory,
  "includes_packaging" | "includes_ready_to_ship"
> & {
  includes_packaging: number;
  includes_ready_to_ship: number;
};

function loadStateSync(): AppState {
  const companyRow = db.prepare("SELECT * FROM companies LIMIT 1").get() as CompanyRow | undefined;

  if (!companyRow) {
    saveStateSync(defaultState);
    return structuredClone(defaultState);
  }

  const rules =
    readSettingsValue<AppState["rules"]>(companyRow.id, "analysis_rules") ??
    defaultState.rules;
  const marginTargets =
    readSettingsValue<AppState["margin_targets"]>(companyRow.id, "margin_targets") ??
    defaultState.margin_targets;
  const companyProfile =
    readSettingsValue<{
      primary_channel: AppState["company"]["primary_channel"];
      tax_regime: string;
      effective_tax_rate: number | null;
      notes?: string;
    }>(companyRow.id, "company_profile") ?? {
      primary_channel: defaultState.company.primary_channel,
      tax_regime: defaultState.company.tax_regime,
      effective_tax_rate: defaultState.company.effective_tax_rate,
      notes: defaultState.company.notes,
    };

  const taxRules = db
    .prepare("SELECT * FROM tax_rules ORDER BY validity_start ASC")
    .all() as TaxRule[];

  const marketingCosts = db
    .prepare("SELECT * FROM marketing_costs ORDER BY reference_month ASC")
    .all() as MarketingCost[];

  const skus = db.prepare("SELECT * FROM skus ORDER BY sku ASC").all() as Sku[];

  const skuCostHistoryRows = db
    .prepare("SELECT * FROM sku_cost_history ORDER BY validity_start ASC")
    .all() as SkuCostHistoryRow[];

  const skuCostHistory: SkuCostHistory[] = skuCostHistoryRows.map((row) => ({
    ...row,
    includes_packaging: Boolean(row.includes_packaging),
    includes_ready_to_ship: Boolean(row.includes_ready_to_ship),
  }));

  const kits = db.prepare("SELECT * FROM kits ORDER BY kit_sku ASC").all() as Kit[];
  const kitComponents = db
    .prepare("SELECT * FROM kit_components ORDER BY kit_sku ASC")
    .all() as KitComponent[];

  const importedOrders = db
    .prepare("SELECT * FROM imported_orders ORDER BY order_created_at ASC")
    .all() as ImportedOrder[];

  const importedOrderItems = db
    .prepare("SELECT * FROM imported_order_items ORDER BY created_at ASC")
    .all() as ImportedOrderItem[];

  const importedFinancialRows = db
    .prepare("SELECT * FROM imported_financial_entries ORDER BY event_date ASC")
    .all() as Array<ImportedFinancialEntry & { metadata_json: string | null }>;

  const importedFinancialEntries: ImportedFinancialEntry[] = importedFinancialRows.map(
    ({ metadata_json, ...row }) => ({
      ...row,
      metadata: metadata_json ? JSON.parse(metadata_json) : {},
    }),
  );

  return {
    company: {
      id: companyRow.id,
      company_name: companyRow.name,
      cnpj: companyRow.cnpj ?? "",
      primary_channel: companyProfile.primary_channel,
      tax_regime: companyProfile.tax_regime,
      effective_tax_rate: companyProfile.effective_tax_rate,
      currency: companyRow.currency,
      notes: companyProfile.notes,
      created_at: companyRow.created_at,
      updated_at: companyRow.updated_at,
      source: companyRow.source,
      version: companyRow.version,
      status: companyRow.status,
    },
    rules,
    margin_targets: marginTargets,
    tax_rules: taxRules,
    marketing_costs: marketingCosts,
    skus,
    sku_cost_history: skuCostHistory,
    sku_additional_costs: readAdditionalCosts(companyRow.id),
    kits,
    kit_components: kitComponents,
    imported_orders: importedOrders,
    imported_order_items: importedOrderItems,
    imported_financial_entries: importedFinancialEntries,
  };
}

interface DbUser {
  id: string;
  company_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
  source: string;
  version: number;
  status: string;
}

function ensureSeedUser() {
  const existing = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
  if (existing) {
    return;
  }

  const company = db.prepare("SELECT id FROM companies LIMIT 1").get() as { id: string } | undefined;
  if (!company) {
    return;
  }

  const now = new Date().toISOString().slice(0, 10);
  const email = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@avah.local";
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin12345";
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users
    (id, company_id, name, email, password_hash, role, created_at, updated_at, source, version, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    company.id,
    "Administrador",
    email,
    passwordHash,
    "admin",
    now,
    now,
    "manual",
    1,
    "active",
  );
}

export async function initStore(): Promise<void> {
  if (initialized) {
    return;
  }

  runSchema();

  const companyExists = db.prepare("SELECT id FROM companies LIMIT 1").get() as
    | { id: string }
    | undefined;

  if (!companyExists) {
    if (existsSync(LEGACY_STORE_PATH)) {
      try {
        const legacy = JSON.parse(readFileSync(LEGACY_STORE_PATH, "utf-8")) as AppState;
        saveStateSync(legacy);
      } catch {
        saveStateSync(defaultState);
      }
    } else {
      saveStateSync(defaultState);
    }
  }

  ensureSeedUser();
  initialized = true;
}

export async function loadState(): Promise<AppState> {
  await initStore();
  return loadStateSync();
}

export async function saveState(state: AppState): Promise<void> {
  await initStore();
  saveStateSync(state);
}

export async function resetStateWithMockData(): Promise<AppState> {
  await initStore();
  saveStateSync(defaultState);
  ensureSeedUser();
  return loadStateSync();
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  await initStore();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND status = 'active' LIMIT 1")
    .get(email) as DbUser | undefined;
  return row ?? null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  await initStore();
  const row = db
    .prepare("SELECT * FROM users WHERE id = ? AND status = 'active' LIMIT 1")
    .get(id) as DbUser | undefined;
  return row ?? null;
}

export async function createUser(input: {
  company_id: string;
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<DbUser> {
  await initStore();

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new Error("Email ja cadastrado.");
  }

  const now = new Date().toISOString().slice(0, 10);
  const user: DbUser = {
    id: randomUUID(),
    company_id: input.company_id,
    name: input.name,
    email: input.email,
    password_hash: bcrypt.hashSync(input.password, 10),
    role: input.role ?? "admin",
    created_at: now,
    updated_at: now,
    source: "manual",
    version: 1,
    status: "active",
  };

  db.prepare(
    `INSERT INTO users
    (id, company_id, name, email, password_hash, role, created_at, updated_at, source, version, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user.id,
    user.company_id,
    user.name,
    user.email,
    user.password_hash,
    user.role,
    user.created_at,
    user.updated_at,
    user.source,
    user.version,
    user.status,
  );

  return user;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return bcrypt.compareSync(password, passwordHash);
}

export async function countUsers(): Promise<number> {
  await initStore();
  const row = db.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
  return row.total;
}

export function saveShopeeMonthlyReport(companyId: string, month: string, report: unknown, adsSpendReal?: number): void {
  const now = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT id FROM shopee_monthly_reports WHERE company_id = ? AND month = ? LIMIT 1').get(companyId, month) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE shopee_monthly_reports SET report_json = ?, ads_spend_real = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(report), adsSpendReal ?? null, now, existing.id);
  } else {
    db.prepare('INSERT INTO shopee_monthly_reports (id, company_id, month, report_json, ads_spend_real, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), companyId, month, JSON.stringify(report), adsSpendReal ?? null, now, now);
  }
}

export function listShopeeMonthlyReports(companyId: string): Array<{ month: string; report: unknown; ads_spend_real: number | null }> {
  const rows = db.prepare('SELECT month, report_json, ads_spend_real FROM shopee_monthly_reports WHERE company_id = ? ORDER BY month ASC').all(companyId) as Array<{ month: string; report_json: string; ads_spend_real: number | null }>;
  return rows.map(r => ({ month: r.month, report: JSON.parse(r.report_json), ads_spend_real: r.ads_spend_real }));
}

export function updateAdsSpend(companyId: string, month: string, adsSpendReal: number): boolean {
  const now = new Date().toISOString().slice(0, 10);
  const result = db.prepare('UPDATE shopee_monthly_reports SET ads_spend_real = ?, updated_at = ? WHERE company_id = ? AND month = ?').run(adsSpendReal, now, companyId, month);
  return (result as { changes: number }).changes > 0;
}
