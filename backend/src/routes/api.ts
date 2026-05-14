import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  buildShopeeMonthlyReport,
  parseCatalogCsv,
  parseCommercialCsv,
  parseShopeeDocumentBuffer,
} from "@avah/parsers";
import { requireAuth } from "../middleware/auth.js";
import type { AppState } from "../db/types.js";
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  loadState,
  resetStateWithMockData,
  saveState,
  verifyPassword,
} from "../db/store.js";
import { saveShopeeMonthlyReport, listShopeeMonthlyReports, updateAdsSpend } from "../db/store.js";
import { runAnalysisFromState, simulatePriceFromState } from "../services/analysis-service.js";
import { importFinancialCsvIntoState } from "../services/import-service.js";
import { signAuthToken } from "../services/auth-service.js";

const upload = multer({ storage: multer.memoryStorage() });

const channelEnum = z.enum(["shopee", "mercado_livre", "loja_propria", "omnicanal"]);

const periodSchema = z.object({
  range: z.object({
    start: z.string().min(10),
    end: z.string().min(10),
  }),
  competence_mode: z.enum(["order_created", "payment_approved", "payout_released", "custom"]),
  channel: channelEnum,
  include_returns: z.boolean(),
  include_cancellations: z.boolean(),
  include_logistic_adjustments: z.boolean(),
  include_marketplace_ads: z.boolean(),
  include_external_marketing: z.boolean(),
});

const runAnalysisSchema = z.object({
  period_config: periodSchema,
  rules: z
    .object({
      marketing_allocation_mode: z.enum([
        "proportional_revenue",
        "proportional_quantity",
        "manual_sku",
        "manual_family",
        "manual_channel",
      ]),
      margin_healthy_threshold: z.number(),
      margin_attention_threshold: z.number(),
    })
    .optional(),
  margin_targets: z
    .object({
      minimum_margin: z.number(),
      ideal_margin: z.number(),
      minimum_roas: z.number(),
      minimum_safety_price: z.number(),
      notes: z.string().optional(),
    })
    .optional(),
  manual_marketing_allocation: z.record(z.number()).optional(),
});

const simulationSchema = z.object({
  sku: z.string().min(1),
  suggested_new_price: z.number().positive(),
  promo_discount: z.number().min(0).max(1),
  projected_roas: z.number().positive().nullable(),
  expected_tax_rate: z.number().min(0).max(1).nullable(),
  expected_cost: z.number().min(0).nullable(),
  expected_marketplace_take_rate: z.number().min(0).max(1).nullable(),
});

const authRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const shopeeReportConfigSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  competence_mode: z.enum(["order_created", "payment_completed"]).optional(),
  tax_rate: z
    .number()
    .min(0)
    .max(1)
    .optional(),
  costs: z
    .object({
      serum_lavanda: z.number().min(0).optional(),
      hortela_pimenta: z.number().min(0).optional(),
      lavanda: z.number().min(0).optional(),
      melaleuca: z.number().min(0).optional(),
      laranja_doce: z.number().min(0).optional(),
      soninho_bom: z.number().min(0).optional(),
    })
    .optional(),
});

async function withState<T>(handler: (state: AppState) => Promise<T> | T): Promise<T> {
  const state = await loadState();
  return handler(state);
}

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "avah-backend", timestamp: new Date().toISOString() });
});

apiRouter.post("/auth/register", async (req, res, next) => {
  try {
    const payload = authRegisterSchema.parse(req.body);
    const state = await loadState();

    const usersCount = await countUsers();
    if (usersCount > 0) {
      res.status(403).json({
        message: "Registro aberto indisponivel. Use um usuario administrador para criar novos acessos.",
      });
      return;
    }

    const user = await createUser({
      company_id: state.company.id,
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
    });

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/auth/login", async (req, res, next) => {
  try {
    const payload = authLoginSchema.parse(req.body);
    const user = await findUserByEmail(payload.email);

    if (!user || !verifyPassword(payload.password, user.password_hash)) {
      res.status(401).json({ message: "Credenciais invalidas." });
      return;
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.use(requireAuth);

apiRouter.get("/auth/me", async (req, res, next) => {
  try {
    const userId = (req as { auth_user?: { sub?: string } }).auth_user?.sub;
    if (!userId) {
      res.status(401).json({ message: "Sessao invalida." });
      return;
    }

    const user = await findUserById(userId);
    if (!user) {
      res.status(401).json({ message: "Usuario nao encontrado." });
      return;
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/auth/users", async (req, res, next) => {
  try {
    const auth = (req as { auth_user?: { role?: string; company_id?: string } }).auth_user;
    if (auth?.role !== "admin") {
      res.status(403).json({ message: "Apenas administradores podem criar usuarios." });
      return;
    }

    const payload = authRegisterSchema.parse(req.body);
    const user = await createUser({
      company_id: auth.company_id ?? (await loadState()).company.id,
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "analyst",
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/state", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/reset-mocks", async (_req, res, next) => {
  try {
    const state = await resetStateWithMockData();
    res.json({ message: "Base limpa com sucesso.", state });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/forms/company", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.company);
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/forms/company", async (req, res, next) => {
  try {
    const payload = z
      .object({
        company_name: z.string().min(1),
        cnpj: z.string().min(1),
        primary_channel: channelEnum,
        tax_regime: z.string().min(1),
        effective_tax_rate: z.number().nullable(),
        currency: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    state.company = {
      ...state.company,
      ...payload,
      updated_at: new Date().toISOString().slice(0, 10),
      version: state.company.version + 1,
    };

    await saveState(state);
    res.json(state.company);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/forms/margin-targets", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.margin_targets);
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/forms/margin-targets", async (req, res, next) => {
  try {
    const payload = z
      .object({
        minimum_margin: z.number(),
        ideal_margin: z.number(),
        minimum_roas: z.number(),
        minimum_safety_price: z.number(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    state.margin_targets = payload;
    await saveState(state);
    res.json(state.margin_targets);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/forms/rules", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.rules);
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/forms/rules", async (req, res, next) => {
  try {
    const payload = z
      .object({
        marketing_allocation_mode: z.enum([
          "proportional_revenue",
          "proportional_quantity",
          "manual_sku",
          "manual_family",
          "manual_channel",
        ]),
        margin_healthy_threshold: z.number(),
        margin_attention_threshold: z.number(),
      })
      .parse(req.body);

    const state = await loadState();
    state.rules = payload;
    await saveState(state);
    res.json(state.rules);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/parameters/tax-rules", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.tax_rules);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/parameters/tax-rules", async (req, res, next) => {
  try {
    const payload = z
      .object({
        tax_regime: z.string().min(1),
        tax_rate: z.number().min(0).max(1),
        validity_start: z.string().min(10),
        validity_end: z.string().nullable(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);
    state.tax_rules.push({
      id: randomUUID(),
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      ...payload,
    });

    await saveState(state);
    res.status(201).json(state.tax_rules);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/parameters/marketing-costs", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.marketing_costs);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/parameters/marketing-costs", async (req, res, next) => {
  try {
    const payload = z
      .object({
        channel: channelEnum,
        reference_month: z.string().regex(/^\d{4}-\d{2}$/),
        investment_total: z.number().nullable(),
        roas: z.number().nullable(),
        roas_origin: z.enum(["manual", "imported"]),
        priority_method: z.enum(["investment", "roas", "hybrid"]),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);
    state.marketing_costs.push({
      id: randomUUID(),
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      ...payload,
    });
    await saveState(state);
    res.status(201).json(state.marketing_costs);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/parameters/sku-cost-history", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.sku_cost_history);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/parameters/sku-cost-history", async (req, res, next) => {
  try {
    const payload = z
      .object({
        sku: z.string().min(1),
        production_unit_cost: z.number().min(0),
        includes_packaging: z.boolean(),
        includes_ready_to_ship: z.boolean(),
        validity_start: z.string().min(10),
        validity_end: z.string().nullable(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);
    state.sku_cost_history.push({
      id: randomUUID(),
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      ...payload,
    });

    await saveState(state);
    res.status(201).json(state.sku_cost_history);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/parameters/sku-additional-costs", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.sku_additional_costs);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/parameters/sku-additional-costs", async (req, res, next) => {
  try {
    const payload = z
      .object({
        sku: z.string().min(1),
        packaging_extra_cost: z.number().min(0),
        gift_cost: z.number().min(0),
        internal_logistics_cost: z.number().min(0),
        variable_operational_cost: z.number().min(0),
        validity_start: z.string().min(10),
        validity_end: z.string().nullable(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);
    state.sku_additional_costs.push({
      id: randomUUID(),
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      ...payload,
    });

    await saveState(state);
    res.status(201).json(state.sku_additional_costs);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/catalog/skus", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json(state.skus);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/catalog/skus", async (req, res, next) => {
  try {
    const payload = z
      .object({
        sku: z.string().min(1),
        name: z.string().min(1),
        family: z.string().min(1),
        category: z.string().optional(),
        channel: channelEnum,
        current_price: z.number().optional(),
        promo_price: z.number().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);

    state.skus.push({
      id: randomUUID(),
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      ...payload,
    });

    await saveState(state);
    res.status(201).json(state.skus);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/kits", async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json({ kits: state.kits, components: state.kit_components });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/kits", async (req, res, next) => {
  try {
    const payload = z
      .object({
        kit_sku: z.string().min(1),
        kit_name: z.string().min(1),
        calculated_cost: z.number().min(0),
        sale_price: z.number().min(0),
        notes: z.string().optional(),
        components: z.array(
          z.object({
            component_sku: z.string().min(1),
            quantity: z.number().int().positive(),
          }),
        ),
      })
      .parse(req.body);

    const state = await loadState();
    const now = new Date().toISOString().slice(0, 10);
    const kitId = randomUUID();

    state.kits.push({
      id: kitId,
      company_id: state.company.id,
      created_at: now,
      updated_at: now,
      source: "manual",
      version: 1,
      status: "active",
      kit_sku: payload.kit_sku,
      kit_name: payload.kit_name,
      calculated_cost: payload.calculated_cost,
      sale_price: payload.sale_price,
      notes: payload.notes,
    });

    for (const component of payload.components) {
      state.kit_components.push({
        id: randomUUID(),
        company_id: state.company.id,
        created_at: now,
        updated_at: now,
        source: "manual",
        version: 1,
        status: "active",
        kit_sku: payload.kit_sku,
        component_sku: component.component_sku,
        quantity: component.quantity,
      });
    }

    await saveState(state);
    res.status(201).json({ kits: state.kits, components: state.kit_components });
  } catch (error) {
    next(error);
  }
});

apiRouter.post(
  "/imports/financial",
  upload.single("file"),
  async (req, res, next) => {
    try {
      const state = await loadState();
      if (!req.file?.buffer) {
        res.status(400).json({ message: "Arquivo nao enviado em multipart file." });
        return;
      }

      const channel = channelEnum.parse(req.body.channel ?? "shopee");
      const csv = req.file.buffer.toString("utf-8");
      const outcome = importFinancialCsvIntoState(state, csv, channel);
      await saveState(state);

      res.status(201).json(outcome);
    } catch (error) {
      next(error);
    }
  },
);

apiRouter.post("/imports/financial/raw", async (req, res, next) => {
  try {
    const payload = z
      .object({
        csv_content: z.string().min(1),
        channel: channelEnum.default("shopee"),
      })
      .parse(req.body);

    const state = await loadState();
    const outcome = importFinancialCsvIntoState(state, payload.csv_content, payload.channel);
    await saveState(state);
    res.status(201).json(outcome);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/imports/commercial/raw", async (req, res, next) => {
  try {
    const payload = z
      .object({
        csv_content: z.string().min(1),
      })
      .parse(req.body);

    const parsed = parseCommercialCsv(payload.csv_content);
    res.json({
      rows_received: parsed.normalized_rows.length,
      warnings: parsed.warnings,
      mapping: parsed.mapping,
      preview: parsed.normalized_rows.slice(0, 20),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/imports/catalog/raw", async (req, res, next) => {
  try {
    const payload = z
      .object({
        csv_content: z.string().min(1),
      })
      .parse(req.body);

    const parsed = parseCatalogCsv(payload.csv_content);
    res.json({
      rows_received: parsed.normalized_rows.length,
      warnings: parsed.warnings,
      mapping: parsed.mapping,
      preview: parsed.normalized_rows.slice(0, 20),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post(
  "/imports/shopee/documents",
  upload.array("files", 20),
  async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        res.status(400).json({ message: "Nenhum arquivo enviado. Use o campo 'files'." });
        return;
      }

      const parsed = files.map((file) => parseShopeeDocumentBuffer(file.originalname, file.buffer));
      const rawCosts = {
        serum_lavanda: req.body.cost_serum_lavanda
          ? Number(req.body.cost_serum_lavanda)
          : undefined,
        hortela_pimenta: req.body.cost_hortela_pimenta
          ? Number(req.body.cost_hortela_pimenta)
          : undefined,
        lavanda: req.body.cost_lavanda ? Number(req.body.cost_lavanda) : undefined,
        melaleuca: req.body.cost_melaleuca ? Number(req.body.cost_melaleuca) : undefined,
        laranja_doce: req.body.cost_laranja_doce ? Number(req.body.cost_laranja_doce) : undefined,
        soninho_bom: req.body.cost_soninho_bom ? Number(req.body.cost_soninho_bom) : undefined,
      };

      const sanitizedCosts = Object.fromEntries(
        Object.entries(rawCosts).filter(
          ([, value]) => typeof value === "number" && Number.isFinite(value),
        ),
      );

      const config = shopeeReportConfigSchema.parse({
        month: req.body.month,
        competence_mode: req.body.competence_mode,
        tax_rate: req.body.tax_rate ? Number(req.body.tax_rate) : undefined,
        costs: Object.keys(sanitizedCosts).length ? sanitizedCosts : undefined,
      });

      const report = buildShopeeMonthlyReport(
        files.map((file) => ({
          file_name: file.originalname,
          buffer: file.buffer,
        })),
        config,
      );

      // persist the report
      if (report && report.period?.month) {
        const state = await loadState();
        saveShopeeMonthlyReport(state.company.id, report.period.month, report);
      }

      const consolidated = {
        files_received: files.length,
        parsed_files: parsed.length,
        document_types: parsed.map((entry) => ({
          file_name: entry.file_name,
          file_type: entry.file_type,
          sheets: entry.sheets.length,
          data_rows: entry.data_rows.length,
          warnings: entry.warnings.length,
        })),
        warnings: parsed.flatMap((entry) =>
          entry.warnings.map((warning) => `${entry.file_name}: ${warning}`),
        ),
      };

      res.json({
        consolidated,
        documents: parsed,
        report,
      });
    } catch (error) {
      next(error);
    }
  },
);

apiRouter.post("/analysis/run", async (req, res, next) => {
  try {
    const payload = runAnalysisSchema.parse(req.body);

    const report = await withState(async (state) =>
      runAnalysisFromState(state, {
        period_config: payload.period_config,
        rules: payload.rules,
        margin_targets: payload.margin_targets,
        manual_marketing_allocation: payload.manual_marketing_allocation,
      }),
    );

    res.json(report);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/evolution", async (_req, res, next) => {
  try {
    const state = await loadState();
    const reports = listShopeeMonthlyReports(state.company.id);
    const evolution = reports.map(({ month, report, ads_spend_real }) => {
      const r = report as any;
      return {
        month,
        gmv_paid: r?.commercial?.sales_paid ?? 0,
        orders_paid: r?.commercial?.orders_paid ?? 0,
        ticket_avg: r?.commercial?.ticket_paid ?? 0,
        conversion_rate: r?.commercial?.conversion_rate_orders ?? 0,
        visitors: r?.commercial?.visitors ?? 0,
        clicks: r?.commercial?.product_clicks ?? 0,
        cancelled_orders: r?.commercial?.cancelled_orders ?? 0,
        cancelled_rate: r?.commercial?.orders_paid > 0
          ? (r?.commercial?.cancelled_orders ?? 0) / ((r?.commercial?.orders_paid ?? 0) + (r?.commercial?.cancelled_orders ?? 0))
          : 0,
        returned_orders: r?.commercial?.returned_orders ?? 0,
        revenue_product: r?.financial?.revenue_product ?? 0,
        payout_total: r?.financial?.payout_total ?? 0,
        commission_total: r?.financial?.commission_total ?? 0,
        service_fee_total: r?.financial?.service_fee_total ?? 0,
        take_rate: r?.financial?.take_rate_marketplace ?? null,
        ads_spend_reported: r?.financial?.ads_in_income ?? 0,
        ads_spend_real: ads_spend_real ?? null,
        ads_sales: r?.marketing?.ads_sales ?? 0,
        roas: ads_spend_real && ads_spend_real > 0
          ? (r?.marketing?.ads_sales ?? 0) / ads_spend_real
          : r?.marketing?.roas ?? null,
        production_cost_total: r?.consolidated?.production_cost_total ?? 0,
        tax_total: r?.consolidated?.tax_total ?? 0,
        net_profit_conservative: r?.consolidated?.net_profit_conservative ?? 0,
        net_profit_adjusted: r?.consolidated?.net_profit_adjusted ?? 0,
        net_margin_conservative: r?.consolidated?.net_margin_conservative ?? null,
        net_margin_adjusted: r?.consolidated?.net_margin_adjusted ?? null,
        by_category: r?.by_category ?? [],
        new_buyers: r?.commercial?.new_buyers ?? 0,
      };
    });
    res.json({ evolution, total_months: evolution.length });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/forecast", async (req, res, next) => {
  try {
    const state = await loadState();
    const reports = listShopeeMonthlyReports(state.company.id);
    const months_ahead = Math.min(Number(req.query.months ?? 6), 12);
    const scenario = (req.query.scenario as string) ?? "realistic";

    const growth_map = { conservative: 0.30, realistic: 0.44, optimistic: 0.80 };
    const growth_rate = growth_map[scenario as keyof typeof growth_map] ?? 0.44;

    // compute actual historical MoM growth
    let hist_rate = growth_rate;
    if (reports.length >= 2) {
      const rates: number[] = [];
      for (let i = 1; i < reports.length; i++) {
        const prev = (reports[i - 1].report as any)?.commercial?.sales_paid ?? 0;
        const curr = (reports[i].report as any)?.commercial?.sales_paid ?? 0;
        if (prev > 0) rates.push((curr - prev) / prev);
      }
      if (rates.length > 0) {
        hist_rate = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    }

    const last = reports[reports.length - 1];
    const last_gmv = last ? (last.report as any)?.commercial?.sales_paid ?? 0 : 0;
    const last_month = last?.month ?? new Date().toISOString().slice(0, 7);
    const last_margin = last ? (last.report as any)?.consolidated?.net_margin_adjusted ?? 0.35 : 0.35;

    const [year, month] = last_month.split("-").map(Number);
    const projected: Array<{ month: string; gmv_forecast: number; net_profit_forecast: number }> = [];
    let base = last_gmv;

    for (let i = 1; i <= months_ahead; i++) {
      base = base * (1 + growth_rate);
      const m = month - 1 + i;
      const y = year + Math.floor(m / 12);
      const mo = ((m - 1) % 12) + 1;
      projected.push({
        month: `${y}-${String(mo).padStart(2, "0")}`,
        gmv_forecast: Math.round(base),
        net_profit_forecast: Math.round(base * last_margin * 0.589),
      });
    }

    res.json({
      base_month: last_month,
      scenario,
      growth_rate,
      historical_growth_rate: hist_rate,
      last_gmv,
      projected,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/pricing/recommendations", async (_req, res, next) => {
  try {
    const state = await loadState();
    const reports = listShopeeMonthlyReports(state.company.id);
    const last = reports[reports.length - 1];
    const tax_rate = 0.065;
    const take_rate = (last?.report as any)?.financial?.take_rate_marketplace ?? 0.411;

    const default_costs: Record<string, number> = {
      lavanda: 3.82,
      hortela_pimenta: 3.81,
      melaleuca: 3.76,
      laranja_doce: 2.72,
      serum_lavanda: 1.95,
      soninho_bom: 4.73,
    };

    const categories: Array<{ category: string; label: string; avg_price: number }> = last
      ? ((last.report as any)?.by_category ?? []).map((c: any) => ({
          category: c.category,
          label: c.label,
          avg_price: c.units > 0 ? c.revenue / c.units : 0,
        }))
      : [];

    const recommendations = categories.map(({ category, label, avg_price }) => {
      const prod_cost = default_costs[category] ?? 3.82;
      // price = prod_cost / (1 - take_rate - tax_rate - target_margin)
      const min_safe = prod_cost / (1 - take_rate - tax_rate - 0.20);
      const recommended = prod_cost / (1 - take_rate - tax_rate - 0.35);
      const current_payout = avg_price * (1 - take_rate);
      const current_net = avg_price > 0
        ? (current_payout - prod_cost - avg_price * tax_rate) / avg_price
        : null;
      const status = current_net === null ? "attention"
        : current_net < 0.20 ? "critical"
        : current_net < 0.30 ? "attention"
        : "ok";

      return {
        category,
        label,
        current_avg_price: Math.round(avg_price * 100) / 100,
        production_cost: prod_cost,
        take_rate: Math.round(take_rate * 1000) / 10,
        tax_rate: tax_rate * 100,
        min_safe_price: Math.round(min_safe * 100) / 100,
        recommended_price: Math.round(recommended * 100) / 100,
        current_net_margin: current_net !== null ? Math.round(current_net * 1000) / 10 : null,
        status,
      };
    });

    res.json({ recommendations, take_rate, tax_rate: tax_rate * 100 });
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/marketing/ads-spend", async (req, res, next) => {
  try {
    const payload = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      ads_spend_real: z.number().nonnegative(),
    }).parse(req.body);

    const state = await loadState();
    const updated = updateAdsSpend(state.company.id, payload.month, payload.ads_spend_real);
    if (!updated) {
      res.status(404).json({ message: `Nenhum relatorio encontrado para o mes ${payload.month}` });
      return;
    }
    res.json({ ok: true, month: payload.month, ads_spend_real: payload.ads_spend_real });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/health/score", async (_req, res, next) => {
  try {
    const state = await loadState();
    const reports = listShopeeMonthlyReports(state.company.id);
    if (reports.length === 0) {
      res.json({ score: null, grade: null, metrics: {}, alerts: ["Nenhum relatorio importado ainda."] });
      return;
    }
    const last = reports[reports.length - 1];
    const r = last.report as any;
    const commercial = r?.commercial ?? {};
    const total_orders = (commercial.orders_paid ?? 0) + (commercial.cancelled_orders ?? 0);
    const cancel_rate = total_orders > 0 ? commercial.cancelled_orders / total_orders : 0;
    const return_rate = commercial.orders_paid > 0 ? commercial.returned_orders / commercial.orders_paid : 0;
    const margin = r?.consolidated?.net_margin_adjusted ?? null;

    // compute MoM growth
    let growth_rate = null;
    if (reports.length >= 2) {
      const prev_gmv = (reports[reports.length - 2].report as any)?.commercial?.sales_paid ?? 0;
      const curr_gmv = commercial.sales_paid ?? 0;
      growth_rate = prev_gmv > 0 ? (curr_gmv - prev_gmv) / prev_gmv : null;
    }

    const score_components = [
      cancel_rate <= 0.03 ? 25 : cancel_rate <= 0.05 ? 15 : cancel_rate <= 0.10 ? 5 : 0,
      return_rate <= 0.02 ? 20 : return_rate <= 0.05 ? 10 : 5,
      margin === null ? 10 : margin >= 0.35 ? 30 : margin >= 0.20 ? 20 : margin >= 0.10 ? 10 : 0,
      growth_rate === null ? 15 : growth_rate >= 0.30 ? 25 : growth_rate >= 0.10 ? 15 : growth_rate >= 0 ? 10 : 0,
    ];
    const score = score_components.reduce((a, b) => a + b, 0);
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

    const alerts: string[] = [];
    if (cancel_rate > 0.05) alerts.push(`Taxa de cancelamento critica: ${(cancel_rate * 100).toFixed(1)}% (meta: < 5%)`);
    if (return_rate > 0.05) alerts.push(`Taxa de devolucao elevada: ${(return_rate * 100).toFixed(1)}%`);
    if (margin !== null && margin < 0.20) alerts.push(`Margem liquida abaixo de 20%: ${(margin * 100).toFixed(1)}%`);

    res.json({
      score,
      grade,
      latest_month: last.month,
      metrics: {
        cancellation_rate: { value: Math.round(cancel_rate * 1000) / 10, status: cancel_rate <= 0.03 ? "ok" : cancel_rate <= 0.05 ? "warning" : "critical" },
        return_rate: { value: Math.round(return_rate * 1000) / 10, status: return_rate <= 0.02 ? "ok" : return_rate <= 0.05 ? "warning" : "critical" },
        net_margin: { value: margin !== null ? Math.round(margin * 1000) / 10 : null, status: margin === null ? "warning" : margin >= 0.35 ? "ok" : margin >= 0.20 ? "warning" : "critical" },
        growth_rate_mom: { value: growth_rate !== null ? Math.round(growth_rate * 1000) / 10 : null, status: growth_rate === null ? "warning" : growth_rate >= 0.20 ? "ok" : growth_rate >= 0 ? "warning" : "critical" },
      },
      alerts,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/analysis/simulate-price", async (req, res, next) => {
  try {
    const payload = simulationSchema.parse(req.body);
    const simulation = await withState(async (state) => simulatePriceFromState(state, payload));
    res.json(simulation);
  } catch (error) {
    next(error);
  }
});
