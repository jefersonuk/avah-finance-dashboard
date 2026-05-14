-- Schema inicial sugerido para evoluir de JSON para Postgres/SQLite.
-- Todas as tabelas possuem campos de auditoria: id, created_at, updated_at, source, version, status.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  tax_regime TEXT NOT NULL,
  tax_rate REAL NOT NULL,
  validity_start TEXT NOT NULL,
  validity_end TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_costs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  reference_month TEXT NOT NULL,
  investment_total REAL,
  roas REAL,
  roas_origin TEXT,
  priority_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  family TEXT,
  category TEXT,
  channel TEXT,
  current_price REAL,
  promo_price REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sku_cost_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  production_unit_cost REAL NOT NULL,
  includes_packaging INTEGER NOT NULL,
  includes_ready_to_ship INTEGER NOT NULL,
  validity_start TEXT NOT NULL,
  validity_end TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kits (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  kit_sku TEXT NOT NULL,
  kit_name TEXT NOT NULL,
  calculated_cost REAL,
  sale_price REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kit_components (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  kit_sku TEXT NOT NULL,
  component_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_imports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  import_type TEXT NOT NULL,
  original_file_name TEXT,
  file_hash TEXT,
  imported_at TEXT NOT NULL,
  mapping_version TEXT,
  row_count INTEGER NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imported_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  order_id TEXT NOT NULL,
  refund_id TEXT,
  order_created_at TEXT,
  payment_approved_at TEXT,
  payout_released_at TEXT,
  order_type TEXT,
  payment_method TEXT,
  carrier TEXT,
  coupon_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imported_order_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  quantity REAL NOT NULL,
  item_gross_revenue REAL NOT NULL,
  item_product_price REAL,
  buyer_shipping_fee REAL,
  refund_value REAL,
  seller_voucher REAL,
  shared_voucher REAL,
  cashback REAL,
  marketplace_ads_fee REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imported_financial_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  order_id TEXT,
  sku TEXT,
  event_date TEXT,
  event_type TEXT,
  amount REAL,
  net_commission_fee REAL,
  service_fee REAL,
  transaction_fee REAL,
  affiliate_fee REAL,
  logistic_partner_shipping_fee REAL,
  platform_shipping_discount REAL,
  compensation_value REAL,
  buyer_refund REAL,
  payout_real REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_analyses (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  competence_mode TEXT,
  total_revenue REAL,
  total_payout REAL,
  total_profit REAL,
  total_margin REAL,
  methodology_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_results_by_sku (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  family TEXT,
  revenue REAL,
  payout REAL,
  production_cost REAL,
  tax_value REAL,
  marketing_allocated REAL,
  net_profit REAL,
  net_margin REAL,
  classification TEXT,
  recommendations_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_results_by_family (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  family TEXT NOT NULL,
  revenue REAL,
  profit REAL,
  margin REAL,
  revenue_share REAL,
  profit_share REAL,
  priority_scale TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopee_monthly_reports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  month TEXT NOT NULL,
  report_json TEXT NOT NULL,
  ads_spend_real REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
