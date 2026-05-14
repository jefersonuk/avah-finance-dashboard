import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AnalysisPeriodConfig,
  AnalysisReport,
  AnalysisRuleSettings,
  AnalysisSimulationOutput,
  MarginTargetSettings,
} from "@avah/shared-types";
import { MetricCard } from "./components/MetricCard";
import { SectionCard } from "./components/SectionCard";
import { EvolutionDashboard } from "./components/EvolutionDashboard";
import { ForecastDashboard } from "./components/ForecastDashboard";
import { PricingDashboard } from "./components/PricingDashboard";
import { MarketingDashboard } from "./components/MarketingDashboard";
import { HealthMonitor } from "./components/HealthMonitor";
import {
  addKit,
  addMarketingCost,
  addSku,
  addSkuAdditionalCosts,
  addSkuCostHistory,
  addTaxRule,
  fetchMe,
  fetchState,
  importShopeeDocuments,
  importFinancialCsvRaw,
  login,
  resetMockData,
  runAnalysis,
  saveCompany,
  saveMarginTargets,
  saveRules,
  setAuthToken as setApiAuthToken,
  simulatePrice,
  type ShopeeDocumentsImportResponse,
  type AuthUser,
  type BackendState,
} from "./lib/api";

type TabKey =
  | "dashboard"
  | "formularios"
  | "parametros"
  | "importacao"
  | "simulacao"
  | "auditoria"
  | "evolucao"
  | "forecast"
  | "precificacao"
  | "marketing"
  | "saude";

type Channel = AnalysisPeriodConfig["channel"];
type ShopeeGeneratedReport = NonNullable<ShopeeDocumentsImportResponse["report"]>;

interface CompanyFormState {
  company_name: string;
  cnpj: string;
  primary_channel: Channel;
  tax_regime: string;
  effective_tax_rate: number;
  currency: string;
  notes: string;
}

interface NewSkuState {
  sku: string;
  name: string;
  family: string;
  category: string;
  channel: Channel;
  production_cost: number;
  additional_cost: number;
  notes: string;
}

interface MarketingFormState {
  channel: Channel;
  reference_month: string;
  investment_total: number;
  roas: number;
  roas_origin: "manual" | "imported";
  priority_method: "investment" | "roas" | "hybrid";
  notes: string;
}

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${(value * 100).toFixed(2)}%`;
}

function defaultPeriod(): AnalysisPeriodConfig {
  return {
    range: { start: "2026-01-01", end: "2026-12-31" },
    competence_mode: "payment_approved",
    channel: "shopee",
    include_returns: true,
    include_cancellations: true,
    include_logistic_adjustments: true,
    include_marketplace_ads: true,
    include_external_marketing: true,
  };
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [state, setState] = useState<BackendState | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [simulation, setSimulation] = useState<AnalysisSimulationOutput | null>(null);
  const [periodForm, setPeriodForm] = useState<AnalysisPeriodConfig>(defaultPeriod());
  const [companyForm, setCompanyForm] = useState<CompanyFormState>({
    company_name: "",
    cnpj: "",
    primary_channel: "shopee",
    tax_regime: "",
    effective_tax_rate: 0,
    currency: "BRL",
    notes: "",
  });
  const [rulesForm, setRulesForm] = useState<AnalysisRuleSettings>({
    marketing_allocation_mode: "proportional_revenue",
    margin_healthy_threshold: 0.2,
    margin_attention_threshold: 0.1,
  });
  const [marginForm, setMarginForm] = useState<MarginTargetSettings>({
    minimum_margin: 0.1,
    ideal_margin: 0.2,
    minimum_roas: 2,
    minimum_safety_price: 0,
    notes: "",
  });

  const [statusMessage, setStatusMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [newSku, setNewSku] = useState<NewSkuState>({
    sku: "",
    name: "",
    family: "",
    category: "",
    channel: "shopee",
    production_cost: 0,
    additional_cost: 0,
    notes: "",
  });

  const [newKit, setNewKit] = useState({
    kit_sku: "",
    kit_name: "",
    calculated_cost: 0,
    sale_price: 0,
    components_text: "",
    notes: "",
  });

  const [taxRuleForm, setTaxRuleForm] = useState({
    tax_regime: "Simples Nacional",
    tax_rate: 0.09,
    validity_start: "2026-01-01",
    validity_end: "",
    notes: "",
  });

  const [marketingForm, setMarketingForm] = useState<MarketingFormState>({
    channel: "shopee",
    reference_month: "2026-01",
    investment_total: 0,
    roas: 0,
    roas_origin: "manual",
    priority_method: "investment",
    notes: "",
  });

  const [skuCostForm, setSkuCostForm] = useState({
    sku: "",
    production_unit_cost: 0,
    includes_packaging: true,
    includes_ready_to_ship: false,
    validity_start: "2026-01-01",
    validity_end: "",
    notes: "",
  });

  const [skuAdditionalForm, setSkuAdditionalForm] = useState({
    sku: "",
    packaging_extra_cost: 0,
    gift_cost: 0,
    internal_logistics_cost: 0,
    variable_operational_cost: 0,
    validity_start: "2026-01-01",
    validity_end: "",
    notes: "",
  });

  const [importText, setImportText] = useState<string>(
    "ID do pedido,SKU,Nome do produto,Data de criação do pedido,Data de conclusão do pagamento,Quantia total lançada,Preço do produto\nORD-2026-0900,SKU-BOLSA-01,Bolsa Organizadora P,20/02/2026,20/02/2026,59.90,59.90",
  );
  const [shopeeDocumentFiles, setShopeeDocumentFiles] = useState<File[]>([]);
  const [shopeeDocumentsResult, setShopeeDocumentsResult] =
    useState<ShopeeDocumentsImportResponse | null>(null);
  const [shopeeReportConfig, setShopeeReportConfig] = useState({
    month: "2026-03",
    competence_mode: "order_created" as "order_created" | "payment_completed",
    tax_rate: 0.065,
    costs: {
      serum_lavanda: 1.95,
      hortela_pimenta: 3.81,
      lavanda: 3.82,
      melaleuca: 3.76,
      laranja_doce: 2.72,
      soninho_bom: 4.73,
    },
  });

  const [simulationInput, setSimulationInput] = useState({
    sku: "",
    suggested_new_price: 0,
    promo_discount: 0,
    projected_roas: 0,
    expected_tax_rate: 0,
    expected_cost: 0,
    expected_marketplace_take_rate: 0,
  });

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem("avah_auth_token"));
  const [loginForm, setLoginForm] = useState({
    email: "admin@avah.local",
    password: "admin12345",
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await fetchState();
      setState(data);
      setCompanyForm({
        company_name: data.company.company_name,
        cnpj: data.company.cnpj,
        primary_channel: data.company.primary_channel,
        tax_regime: data.company.tax_regime,
        effective_tax_rate: data.company.effective_tax_rate ?? 0,
        currency: data.company.currency,
        notes: data.company.notes ?? "",
      });
      setRulesForm(data.rules);
      setMarginForm(data.margin_targets);
      if (!simulationInput.sku && data.skus.length > 0) {
        setSimulationInput((current) => ({ ...current, sku: data.skus[0].sku }));
      }
    } catch (error) {
      const message = (error as Error).message;
      if (
        message.toLowerCase().includes("token") ||
        message.toLowerCase().includes("401") ||
        message.toLowerCase().includes("credenciais")
      ) {
        localStorage.removeItem("avah_auth_token");
        setApiAuthToken(null);
        setAuthUser(null);
        setStatusMessage("Sessao expirada. Faca login novamente.");
      } else {
        setStatusMessage(`Erro ao carregar dados: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("avah_auth_token");

    if (!token) {
      setStatusMessage("Realize login para acessar o sistema.");
      return;
    }

    setApiAuthToken(token);

    (async () => {
      setLoading(true);
      try {
        const user = await fetchMe();
        setAuthUser(user);
        await refresh();
      } catch {
        localStorage.removeItem("avah_auth_token");
        setApiAuthToken(null);
        setAuthUser(null);
        setStatusMessage("Sessao invalida. Realize login novamente.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleLogin() {
    setLoading(true);
    try {
      const response = await login(loginForm);
      localStorage.setItem("avah_auth_token", response.token);
      setApiAuthToken(response.token);
      setAuthToken(response.token);
      setAuthUser(response.user);
      setStatusMessage(`Login realizado: ${response.user.email}`);
      await refresh();
    } catch (error) {
      setStatusMessage(`Falha no login: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("avah_auth_token");
    setApiAuthToken(null);
    setAuthToken(null);
    setAuthUser(null);
    setState(null);
    setReport(null);
    setSimulation(null);
    setStatusMessage("Sessao encerrada.");
  }

  async function runMainAnalysis() {
    if (!state) {
      return;
    }

    setLoading(true);
    setStatusMessage("Executando análise...");
    try {
      const result = await runAnalysis({
        period_config: periodForm,
        rules: rulesForm,
        margin_targets: marginForm,
      });
      setReport(result);
      setStatusMessage(
        result.complete
          ? "Análise concluída com base completa."
          : "Análise concluída com pendências (veja Alertas e Auditoria).",
      );
      setTab("dashboard");
    } catch (error) {
      setStatusMessage(`Falha na análise: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCompany() {
    setLoading(true);
    try {
      await saveCompany(companyForm);
      setStatusMessage("Configuração da empresa salva.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao salvar empresa: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRulesAndTargets() {
    setLoading(true);
    try {
      await saveRules(rulesForm);
      await saveMarginTargets(marginForm);
      setStatusMessage("Regras analíticas e metas de margem atualizadas.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao salvar regras/metas: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSku() {
    setLoading(true);
    try {
      await addSku({
        sku: newSku.sku,
        name: newSku.name,
        family: newSku.family,
        category: newSku.category,
        channel: newSku.channel,
        notes: newSku.notes,
      });

      await addSkuCostHistory({
        sku: newSku.sku,
        production_unit_cost: Number(newSku.production_cost),
        includes_packaging: true,
        includes_ready_to_ship: false,
        validity_start: periodForm.range.start,
        validity_end: null,
        notes: "Custo informado pelo Formulario C",
      });

      if (Number(newSku.additional_cost) > 0) {
        await addSkuAdditionalCosts({
          sku: newSku.sku,
          packaging_extra_cost: Number(newSku.additional_cost),
          gift_cost: 0,
          internal_logistics_cost: 0,
          variable_operational_cost: 0,
          validity_start: periodForm.range.start,
          validity_end: null,
          notes: "Custo adicional informado pelo Formulario C",
        });
      }

      setStatusMessage(`SKU ${newSku.sku} cadastrado.`);
      setNewSku({
        sku: "",
        name: "",
        family: "",
        category: "",
        channel: "shopee",
        production_cost: 0,
        additional_cost: 0,
        notes: "",
      });
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao cadastrar SKU: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddKit() {
    setLoading(true);
    try {
      const components = newKit.components_text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [component_sku, quantityRaw] = line.split(":");
          return {
            component_sku: component_sku.trim(),
            quantity: Number(quantityRaw ?? 1),
          };
        });

      await addKit({
        kit_sku: newKit.kit_sku,
        kit_name: newKit.kit_name,
        calculated_cost: Number(newKit.calculated_cost),
        sale_price: Number(newKit.sale_price),
        notes: newKit.notes,
        components,
      });

      setStatusMessage(`Kit ${newKit.kit_sku} cadastrado.`);
      setNewKit({
        kit_sku: "",
        kit_name: "",
        calculated_cost: 0,
        sale_price: 0,
        components_text: "",
        notes: "",
      });
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao cadastrar kit: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTaxRule() {
    setLoading(true);
    try {
      await addTaxRule({
        ...taxRuleForm,
        tax_rate: Number(taxRuleForm.tax_rate),
        validity_end: taxRuleForm.validity_end || null,
      });
      setStatusMessage("Regra tributária adicionada.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao adicionar regra tributária: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMarketing() {
    setLoading(true);
    try {
      await addMarketingCost({
        ...marketingForm,
        investment_total: Number(marketingForm.investment_total) || null,
        roas: Number(marketingForm.roas) || null,
      });
      setStatusMessage("Custo de marketing adicionado.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao adicionar marketing: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSkuCostHistory() {
    setLoading(true);
    try {
      await addSkuCostHistory({
        ...skuCostForm,
        production_unit_cost: Number(skuCostForm.production_unit_cost),
        validity_end: skuCostForm.validity_end || null,
      });
      setStatusMessage("Histórico de custo por SKU atualizado.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao adicionar custo SKU: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSkuAdditionalCosts() {
    setLoading(true);
    try {
      await addSkuAdditionalCosts({
        ...skuAdditionalForm,
        packaging_extra_cost: Number(skuAdditionalForm.packaging_extra_cost),
        gift_cost: Number(skuAdditionalForm.gift_cost),
        internal_logistics_cost: Number(skuAdditionalForm.internal_logistics_cost),
        variable_operational_cost: Number(skuAdditionalForm.variable_operational_cost),
        validity_end: skuAdditionalForm.validity_end || null,
      });
      setStatusMessage("Custos adicionais cadastrados.");
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro ao adicionar custos adicionais: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportFinancialCsv() {
    setLoading(true);
    try {
      const result = await importFinancialCsvRaw({
        csv_content: importText,
        channel: periodForm.channel,
      });

      setStatusMessage(
        `Importação concluída: ${result.rows_received} linhas, ${result.orders_created} pedidos, ${result.financial_entries_created} lançamentos financeiros.`,
      );
      await refresh();
    } catch (error) {
      setStatusMessage(`Erro na importação: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportShopeeDocuments() {
    if (!shopeeDocumentFiles.length) {
      setStatusMessage("Selecione pelo menos um arquivo XLSX para importar.");
      return;
    }

    setLoading(true);
    try {
      const result = await importShopeeDocuments(shopeeDocumentFiles, shopeeReportConfig);
      setShopeeDocumentsResult(result);
      if (result.report) {
        setStatusMessage(
          `Documentos processados e relatório de ${result.report.period.month} gerado com sucesso.`,
        );
      } else {
        setStatusMessage(
          `Documentos processados: ${result.consolidated.parsed_files}/${result.consolidated.files_received}.`,
        );
      }
    } catch (error) {
      setStatusMessage(`Erro ao processar XLSX: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunSimulation() {
    setLoading(true);
    try {
      const result = await simulatePrice({
        sku: simulationInput.sku,
        suggested_new_price: Number(simulationInput.suggested_new_price),
        promo_discount: Number(simulationInput.promo_discount),
        projected_roas: Number(simulationInput.projected_roas) || null,
        expected_tax_rate: Number(simulationInput.expected_tax_rate) || null,
        expected_cost: Number(simulationInput.expected_cost) || null,
        expected_marketplace_take_rate: Number(simulationInput.expected_marketplace_take_rate) || null,
      });

      setSimulation(result);
      setStatusMessage(result.complete ? "Simulação concluída." : "Simulação parcial por falta de dados.");
    } catch (error) {
      setStatusMessage(`Erro na simulação: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  const sortedSkuByRisk = useMemo(() => {
    if (!report) {
      return [];
    }

    return [...report.by_sku].sort((a, b) => {
      const marginA = a.margin_net ?? -999;
      const marginB = b.margin_net ?? -999;
      return marginA - marginB;
    });
  }, [report]);

  const shopeeReport: ShopeeGeneratedReport | null = shopeeDocumentsResult?.report ?? null;

  if (!authUser) {
    return (
      <div className="app-shell">
        <header className="hero">
          <div>
            <p className="hero-kicker">AVAH Financial Intelligence</p>
            <h1>Acesso ao Sistema</h1>
            <p>
              Entre com seu usuário para acessar os dashboards e formulários financeiros.
            </p>
          </div>
        </header>

        <main className="grid-1">
          <SectionCard title="Login">
            <div className="form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleLogin} disabled={loading}>
                Entrar
              </button>
              <article className="notice-card full-width">
                <h3>Credencial inicial (ambiente local)</h3>
                <p>Email: admin@avah.local | Senha: admin12345</p>
              </article>
            </div>
            <p className="status-line">{loading ? "Processando..." : statusMessage}</p>
          </SectionCard>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="hero-kicker">AVAH Financial Intelligence</p>
          <h1>Análise Financeira, Precificação e Escalabilidade</h1>
          <p>
            Ferramenta determinística para e-commerce/marketplace com foco em Shopee,
            auditabilidade e regras explícitas de decisão.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={runMainAnalysis} disabled={loading}>
            Rodar Análise
          </button>
          <button className="secondary" onClick={handleLogout}>
            Sair
          </button>
          <button
            className="secondary"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await resetMockData();
                await refresh();
                setReport(null);
                setStatusMessage("Base limpa com sucesso.");
              } finally {
                setLoading(false);
              }
            }}
          >
            Limpar Base
          </button>
        </div>
      </header>

      <nav className="tabs">
        {[
          ["dashboard", "Dashboard"],
          ["formularios", "Formulários"],
          ["parametros", "Parâmetros"],
          ["importacao", "Importação"],
          ["simulacao", "Simulação"],
          ["auditoria", "Auditoria"],
          ["evolucao", "Evolução"],
          ["forecast", "Forecast"],
          ["precificacao", "Precificação"],
          ["marketing", "Marketing ROI"],
          ["saude", "Saúde"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      <p className="status-line">{loading ? "Processando..." : statusMessage}</p>

      {tab === "dashboard" ? (
        <main className="grid-2">
          <SectionCard title="Resumo Executivo" subtitle="Módulo 5.1">
            {report ? (
              <div className="metric-grid">
                <MetricCard
                  label="Receita"
                  value={formatCurrency(report.executive_metrics.revenue_total)}
                />
                <MetricCard
                  label="Payout"
                  value={formatCurrency(report.executive_metrics.payout_total)}
                />
                <MetricCard
                  label="Lucro Líquido"
                  value={formatCurrency(report.executive_metrics.net_profit_total)}
                  tone={
                    report.executive_metrics.net_profit_total >= 0 ? "positive" : "negative"
                  }
                />
                <MetricCard
                  label="Margem Líquida"
                  value={formatPercent(report.executive_metrics.net_margin_total)}
                  tone={
                    (report.executive_metrics.net_margin_total ?? -1) >= rulesForm.margin_attention_threshold
                      ? "positive"
                      : "warning"
                  }
                />
                <MetricCard
                  label="Marketing"
                  value={formatCurrency(report.executive_metrics.marketing_total)}
                />
                <MetricCard
                  label="Impostos"
                  value={formatCurrency(report.executive_metrics.tax_total)}
                />
                <MetricCard
                  label="Take Rate"
                  value={formatPercent(report.executive_metrics.marketplace_take_rate)}
                />
                <MetricCard
                  label="Pedidos"
                  value={String(report.executive_metrics.order_count)}
                />
              </div>
            ) : (
              <p>Rode a análise para visualizar o dashboard executivo.</p>
            )}
          </SectionCard>

          <SectionCard title="Tendência Mensal" subtitle="Margem líquida por mês">
            {report ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={report.monthly_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue_gross" name="Receita" stroke="#005f73" />
                    <Line type="monotone" dataKey="result_net" name="Lucro líquido" stroke="#0a9396" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p>Sem dados de tendência enquanto a análise não for executada.</p>
            )}
          </SectionCard>

          <SectionCard title="Dashboard por SKU" subtitle="Receita, lucro e margem por SKU">
            {report ? (
              <>
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={report.by_sku}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="sku" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="revenue_gross" name="Receita" fill="#94d2bd" />
                      <Bar dataKey="result_net" name="Lucro líquido" fill="#005f73" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Família</th>
                      <th>Lucro</th>
                      <th>Margem</th>
                      <th>Classificação</th>
                      <th>Recomendação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.by_sku.map((row) => (
                      <tr key={row.sku}>
                        <td>{row.sku}</td>
                        <td>{row.family ?? "Sem família"}</td>
                        <td>{formatCurrency(row.result_net)}</td>
                        <td>{formatPercent(row.margin_net)}</td>
                        <td>{row.classification}</td>
                        <td>{row.recommendations.join(", ") || "Sem recomendação"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>Sem análise de SKU disponível.</p>
            )}
          </SectionCard>

          <SectionCard title="Dashboard por Família" subtitle="Share de receita/lucro e prioridade de escala">
            {report ? (
              <table>
                <thead>
                  <tr>
                    <th>Família</th>
                    <th>Receita</th>
                    <th>Lucro</th>
                    <th>Margem</th>
                    <th>Share Receita</th>
                    <th>Share Lucro</th>
                    <th>Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_family.map((row) => (
                    <tr key={row.family}>
                      <td>{row.family}</td>
                      <td>{formatCurrency(row.revenue_gross)}</td>
                      <td>{formatCurrency(row.result_net)}</td>
                      <td>{formatPercent(row.margin_net)}</td>
                      <td>{formatPercent(row.revenue_share)}</td>
                      <td>{formatPercent(row.profit_share)}</td>
                      <td>{row.priority_scale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Sem análise de família disponível.</p>
            )}
          </SectionCard>

          <SectionCard title="Saúde da Operação" subtitle="Alertas e risco de margem">
            {report ? (
              <>
                <ul className="alert-list">
                  {report.alerts.map((alert) => (
                    <li key={`${alert.code}-${alert.message}`} className={`alert-${alert.severity}`}>
                      <strong>{alert.code}</strong>: {alert.message}
                    </li>
                  ))}
                </ul>
                <h3>Ranking de Risco (menor margem primeiro)</h3>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Margem</th>
                      <th>Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSkuByRisk.map((row) => (
                      <tr key={row.sku}>
                        <td>{row.sku}</td>
                        <td>{formatPercent(row.margin_net)}</td>
                        <td>{row.classification}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>Sem alertas enquanto não houver análise.</p>
            )}
          </SectionCard>
        </main>
      ) : null}

      {tab === "formularios" ? (
        <main className="grid-2">
          <SectionCard title="Formulário A - Configuração da Empresa">
            <div className="form-grid">
              <label>
                Nome da empresa
                <input
                  value={companyForm.company_name}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, company_name: event.target.value }))
                  }
                />
              </label>
              <label>
                CNPJ
                <input
                  value={companyForm.cnpj}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, cnpj: event.target.value }))
                  }
                />
              </label>
              <label>
                Canal principal
                <select
                  value={companyForm.primary_channel}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      primary_channel: event.target.value as typeof current.primary_channel,
                    }))
                  }
                >
                  <option value="shopee">Shopee</option>
                  <option value="mercado_livre">Mercado Livre</option>
                  <option value="loja_propria">Loja Própria</option>
                  <option value="omnicanal">Omnichannel</option>
                </select>
              </label>
              <label>
                Regime tributário
                <input
                  value={companyForm.tax_regime}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, tax_regime: event.target.value }))
                  }
                />
              </label>
              <label>
                Alíquota efetiva
                <input
                  type="number"
                  step="0.0001"
                  value={companyForm.effective_tax_rate}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      effective_tax_rate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Moeda
                <input
                  value={companyForm.currency}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, currency: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={companyForm.notes}
                  onChange={(event) =>
                    setCompanyForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleSaveCompany} disabled={loading}>
                Salvar Empresa
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Formulário B - Configuração Analítica do Período">
            <div className="form-grid">
              <label>
                Data inicial
                <input
                  type="date"
                  value={periodForm.range.start}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      range: { ...current.range, start: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Data final
                <input
                  type="date"
                  value={periodForm.range.end}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      range: { ...current.range, end: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Competência
                <select
                  value={periodForm.competence_mode}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      competence_mode: event.target.value as AnalysisPeriodConfig["competence_mode"],
                    }))
                  }
                >
                  <option value="order_created">Pedido criado</option>
                  <option value="payment_approved">Pedido aprovado/pago</option>
                  <option value="payout_released">Valor liberado</option>
                  <option value="custom">Customizado</option>
                </select>
              </label>
              <label>
                Canal analisado
                <select
                  value={periodForm.channel}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      channel: event.target.value as AnalysisPeriodConfig["channel"],
                    }))
                  }
                >
                  <option value="shopee">Shopee</option>
                  <option value="mercado_livre">Mercado Livre</option>
                  <option value="loja_propria">Loja Própria</option>
                  <option value="omnicanal">Omnichannel</option>
                </select>
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={periodForm.include_returns}
                  onChange={(event) =>
                    setPeriodForm((current) => ({ ...current, include_returns: event.target.checked }))
                  }
                />
                Incluir devoluções
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={periodForm.include_cancellations}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      include_cancellations: event.target.checked,
                    }))
                  }
                />
                Incluir cancelamentos
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={periodForm.include_logistic_adjustments}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      include_logistic_adjustments: event.target.checked,
                    }))
                  }
                />
                Incluir ajustes logísticos
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={periodForm.include_marketplace_ads}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      include_marketplace_ads: event.target.checked,
                    }))
                  }
                />
                Incluir ads marketplace
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={periodForm.include_external_marketing}
                  onChange={(event) =>
                    setPeriodForm((current) => ({
                      ...current,
                      include_external_marketing: event.target.checked,
                    }))
                  }
                />
                Incluir marketing externo
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Formulário C - Cadastro de SKU">
            <div className="form-grid">
              <label>
                SKU
                <input
                  value={newSku.sku}
                  onChange={(event) => setNewSku((current) => ({ ...current, sku: event.target.value }))}
                />
              </label>
              <label>
                Nome
                <input
                  value={newSku.name}
                  onChange={(event) => setNewSku((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Família
                <input
                  value={newSku.family}
                  onChange={(event) => setNewSku((current) => ({ ...current, family: event.target.value }))}
                />
              </label>
              <label>
                Categoria
                <input
                  value={newSku.category}
                  onChange={(event) =>
                    setNewSku((current) => ({ ...current, category: event.target.value }))
                  }
                />
              </label>
              <label>
                Custo de produção
                <input
                  type="number"
                  step="0.01"
                  value={newSku.production_cost}
                  onChange={(event) =>
                    setNewSku((current) => ({
                      ...current,
                      production_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Custo adicional
                <input
                  type="number"
                  step="0.01"
                  value={newSku.additional_cost}
                  onChange={(event) =>
                    setNewSku((current) => ({
                      ...current,
                      additional_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={newSku.notes}
                  onChange={(event) => setNewSku((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <button onClick={handleAddSku} disabled={loading}>
                Cadastrar SKU
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Formulário D - Cadastro de Kit">
            <div className="form-grid">
              <label>
                SKU do kit
                <input
                  value={newKit.kit_sku}
                  onChange={(event) =>
                    setNewKit((current) => ({ ...current, kit_sku: event.target.value }))
                  }
                />
              </label>
              <label>
                Nome do kit
                <input
                  value={newKit.kit_name}
                  onChange={(event) =>
                    setNewKit((current) => ({ ...current, kit_name: event.target.value }))
                  }
                />
              </label>
              <label>
                Custo calculado do kit
                <input
                  type="number"
                  step="0.01"
                  value={newKit.calculated_cost}
                  onChange={(event) =>
                    setNewKit((current) => ({
                      ...current,
                      calculated_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Preço de venda do kit
                <input
                  type="number"
                  step="0.01"
                  value={newKit.sale_price}
                  onChange={(event) =>
                    setNewKit((current) => ({
                      ...current,
                      sale_price: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="full-width">
                Itens componentes (`SKU:QTD` por linha)
                <textarea
                  value={newKit.components_text}
                  onChange={(event) =>
                    setNewKit((current) => ({ ...current, components_text: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={newKit.notes}
                  onChange={(event) =>
                    setNewKit((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleAddKit} disabled={loading}>
                Cadastrar Kit
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Formulário E - Meta de Margem">
            <div className="form-grid">
              <label>
                Margem mínima aceitável
                <input
                  type="number"
                  step="0.01"
                  value={marginForm.minimum_margin}
                  onChange={(event) =>
                    setMarginForm((current) => ({
                      ...current,
                      minimum_margin: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Margem ideal
                <input
                  type="number"
                  step="0.01"
                  value={marginForm.ideal_margin}
                  onChange={(event) =>
                    setMarginForm((current) => ({ ...current, ideal_margin: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                ROAS mínimo aceitável
                <input
                  type="number"
                  step="0.01"
                  value={marginForm.minimum_roas}
                  onChange={(event) =>
                    setMarginForm((current) => ({ ...current, minimum_roas: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Preço mínimo de segurança
                <input
                  type="number"
                  step="0.01"
                  value={marginForm.minimum_safety_price}
                  onChange={(event) =>
                    setMarginForm((current) => ({
                      ...current,
                      minimum_safety_price: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={marginForm.notes}
                  onChange={(event) =>
                    setMarginForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleSaveRulesAndTargets} disabled={loading}>
                Salvar Metas e Regras
              </button>
            </div>
          </SectionCard>
        </main>
      ) : null}

      {tab === "parametros" ? (
        <main className="grid-2">
          <SectionCard title="Dados Tributários (1.1)">
            <div className="form-grid">
              <label>
                Regime
                <input
                  value={taxRuleForm.tax_regime}
                  onChange={(event) =>
                    setTaxRuleForm((current) => ({ ...current, tax_regime: event.target.value }))
                  }
                />
              </label>
              <label>
                Alíquota Simples Nacional
                <input
                  type="number"
                  step="0.0001"
                  value={taxRuleForm.tax_rate}
                  onChange={(event) =>
                    setTaxRuleForm((current) => ({ ...current, tax_rate: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Vigência inicial
                <input
                  type="date"
                  value={taxRuleForm.validity_start}
                  onChange={(event) =>
                    setTaxRuleForm((current) => ({ ...current, validity_start: event.target.value }))
                  }
                />
              </label>
              <label>
                Vigência final
                <input
                  type="date"
                  value={taxRuleForm.validity_end}
                  onChange={(event) =>
                    setTaxRuleForm((current) => ({ ...current, validity_end: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={taxRuleForm.notes}
                  onChange={(event) =>
                    setTaxRuleForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleAddTaxRule} disabled={loading}>
                Adicionar Regra Tributária
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Dados de Marketing (1.2)">
            <div className="form-grid">
              <label>
                Mês de referência
                <input
                  type="month"
                  value={marketingForm.reference_month}
                  onChange={(event) =>
                    setMarketingForm((current) => ({
                      ...current,
                      reference_month: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Canal
                <select
                  value={marketingForm.channel}
                  onChange={(event) =>
                    setMarketingForm((current) => ({
                      ...current,
                      channel: event.target.value as typeof current.channel,
                    }))
                  }
                >
                  <option value="shopee">Shopee</option>
                  <option value="mercado_livre">Mercado Livre</option>
                  <option value="loja_propria">Loja Própria</option>
                  <option value="omnicanal">Omnichannel</option>
                </select>
              </label>
              <label>
                Investimento total (R$)
                <input
                  type="number"
                  step="0.01"
                  value={marketingForm.investment_total}
                  onChange={(event) =>
                    setMarketingForm((current) => ({
                      ...current,
                      investment_total: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                ROAS
                <input
                  type="number"
                  step="0.01"
                  value={marketingForm.roas}
                  onChange={(event) =>
                    setMarketingForm((current) => ({ ...current, roas: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Prioridade de cálculo
                <select
                  value={marketingForm.priority_method}
                  onChange={(event) =>
                    setMarketingForm((current) => ({
                      ...current,
                      priority_method: event.target.value as typeof current.priority_method,
                    }))
                  }
                >
                  <option value="investment">Investimento</option>
                  <option value="roas">ROAS</option>
                  <option value="hybrid">Híbrido</option>
                </select>
              </label>
              <label className="full-width">
                Observações
                <textarea
                  value={marketingForm.notes}
                  onChange={(event) =>
                    setMarketingForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleAddMarketing} disabled={loading}>
                Adicionar Marketing
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Custos de Produção por SKU (1.3)">
            <div className="form-grid">
              <label>
                SKU
                <input
                  value={skuCostForm.sku}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({ ...current, sku: event.target.value }))
                  }
                />
              </label>
              <label>
                Custo unitário
                <input
                  type="number"
                  step="0.01"
                  value={skuCostForm.production_unit_cost}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({
                      ...current,
                      production_unit_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={skuCostForm.includes_packaging}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({
                      ...current,
                      includes_packaging: event.target.checked,
                    }))
                  }
                />
                Já considera embalagem?
              </label>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={skuCostForm.includes_ready_to_ship}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({
                      ...current,
                      includes_ready_to_ship: event.target.checked,
                    }))
                  }
                />
                Produto pronto para envio?
              </label>
              <label>
                Vigência inicial
                <input
                  type="date"
                  value={skuCostForm.validity_start}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({
                      ...current,
                      validity_start: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Vigência final
                <input
                  type="date"
                  value={skuCostForm.validity_end}
                  onChange={(event) =>
                    setSkuCostForm((current) => ({ ...current, validity_end: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleAddSkuCostHistory} disabled={loading}>
                Adicionar Custo por Vigência
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Custos Adicionais Opcionais (1.4)">
            <div className="form-grid">
              <label>
                SKU
                <input
                  value={skuAdditionalForm.sku}
                  onChange={(event) =>
                    setSkuAdditionalForm((current) => ({ ...current, sku: event.target.value }))
                  }
                />
              </label>
              <label>
                Embalagem adicional (R$)
                <input
                  type="number"
                  step="0.01"
                  value={skuAdditionalForm.packaging_extra_cost}
                  onChange={(event) =>
                    setSkuAdditionalForm((current) => ({
                      ...current,
                      packaging_extra_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Brinde (R$)
                <input
                  type="number"
                  step="0.01"
                  value={skuAdditionalForm.gift_cost}
                  onChange={(event) =>
                    setSkuAdditionalForm((current) => ({
                      ...current,
                      gift_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Logístico interno (R$)
                <input
                  type="number"
                  step="0.01"
                  value={skuAdditionalForm.internal_logistics_cost}
                  onChange={(event) =>
                    setSkuAdditionalForm((current) => ({
                      ...current,
                      internal_logistics_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Operacional variável (R$)
                <input
                  type="number"
                  step="0.01"
                  value={skuAdditionalForm.variable_operational_cost}
                  onChange={(event) =>
                    setSkuAdditionalForm((current) => ({
                      ...current,
                      variable_operational_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <button onClick={handleAddSkuAdditionalCosts} disabled={loading}>
                Adicionar Custos Opcionais
              </button>
            </div>
          </SectionCard>
        </main>
      ) : null}

      {tab === "importacao" ? (
        <main className="grid-1">
          <SectionCard
            title="Upload Shopee XLSX (Março/2026)"
            subtitle="Income, Shop Stats, Flash Sale, Parent SKU, Product Overview e Traffic Overview"
          >
            <div className="form-grid">
              <label className="full-width">
                Selecione os documentos (.xlsx)
                <input
                  type="file"
                  accept=".xlsx"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    setShopeeDocumentFiles(files);
                  }}
                />
              </label>
              <article className="notice-card full-width">
                <h3>Arquivos esperados</h3>
                <p>
                  `Income...xlsx`,{" "}
                  `avaharomaterapiapura.shopee-shop-stats...`, `In_Shop_Flash_Sale_Metrics...`,
                  `parentskudetail...`, `productoverview...`, `traffic_overview...`
                </p>
              </article>
              <label>
                Mês (YYYY-MM)
                <input
                  value={shopeeReportConfig.month}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({ ...current, month: event.target.value }))
                  }
                />
              </label>
              <label>
                Competência financeira
                <select
                  value={shopeeReportConfig.competence_mode}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      competence_mode: event.target.value as "order_created" | "payment_completed",
                    }))
                  }
                >
                  <option value="order_created">Data de criação do pedido</option>
                  <option value="payment_completed">Data de conclusão do pagamento</option>
                </select>
              </label>
              <label>
                Imposto (%)
                <input
                  type="number"
                  step="0.0001"
                  value={shopeeReportConfig.tax_rate}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      tax_rate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Custo Sérum Lavanda
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.serum_lavanda}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, serum_lavanda: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                Custo Hortelã Pimenta
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.hortela_pimenta}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, hortela_pimenta: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                Custo Lavanda
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.lavanda}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, lavanda: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                Custo Melaleuca
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.melaleuca}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, melaleuca: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                Custo Laranja Doce
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.laranja_doce}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, laranja_doce: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                Custo Soninho Bom
                <input
                  type="number"
                  step="0.01"
                  value={shopeeReportConfig.costs.soninho_bom}
                  onChange={(event) =>
                    setShopeeReportConfig((current) => ({
                      ...current,
                      costs: { ...current.costs, soninho_bom: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <button onClick={handleImportShopeeDocuments} disabled={loading}>
                Processar XLSX + Gerar Relatório
              </button>
            </div>

            {shopeeDocumentsResult ? (
              <div className="section-content">
                <h3>Consolidado da leitura</h3>
                <div className="metric-grid">
                  <MetricCard
                    label="Arquivos recebidos"
                    value={String(shopeeDocumentsResult.consolidated.files_received)}
                  />
                  <MetricCard
                    label="Arquivos processados"
                    value={String(shopeeDocumentsResult.consolidated.parsed_files)}
                  />
                  <MetricCard
                    label="Alertas"
                    value={String(shopeeDocumentsResult.consolidated.warnings.length)}
                    tone={
                      shopeeDocumentsResult.consolidated.warnings.length ? "warning" : "positive"
                    }
                  />
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Tipo detectado</th>
                      <th>Abas</th>
                      <th>Linhas lidas</th>
                      <th>Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopeeDocumentsResult.consolidated.document_types.map((doc) => (
                      <tr key={doc.file_name}>
                        <td>{doc.file_name}</td>
                        <td>{doc.file_type}</td>
                        <td>{doc.sheets}</td>
                        <td>{doc.data_rows}</td>
                        <td>{doc.warnings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {shopeeReport ? (
                  <>
                    <h3>Relatório Mensal {shopeeReport.period.month}</h3>
                    <article className="notice-card full-width">
                      <p>{shopeeReport.pricing_context.note}</p>
                    </article>
                    <div className="metric-grid">
                      <MetricCard
                        label="Receita financeira (Income)"
                        value={formatCurrency(shopeeReport.financial.revenue_product)}
                      />
                      <MetricCard
                        label="Payout real"
                        value={formatCurrency(shopeeReport.financial.payout_total)}
                      />
                      <MetricCard
                        label="Pedidos (Income)"
                        value={String(shopeeReport.financial.orders)}
                      />
                      <MetricCard
                        label="Take rate (comissão+serviço)"
                        value={formatPercent(shopeeReport.financial.take_rate_marketplace)}
                      />
                      <MetricCard
                        label="Ads real"
                        value={formatCurrency(shopeeReport.marketing.ads_spend)}
                      />
                      <MetricCard
                        label="Ads incremental ajustado"
                        value={formatCurrency(shopeeReport.marketing.ads_incremental_adjusted)}
                      />
                      <MetricCard
                        label="Lucro líquido ajustado"
                        value={formatCurrency(shopeeReport.consolidated.net_profit_adjusted)}
                        tone={
                          shopeeReport.consolidated.net_profit_adjusted >= 0
                            ? "positive"
                            : "negative"
                        }
                      />
                      <MetricCard
                        label="Margem líquida ajustada"
                        value={formatPercent(shopeeReport.consolidated.net_margin_adjusted)}
                      />
                    </div>

                    <h3>Comercial e Tráfego</h3>
                    <div className="metric-grid">
                      <MetricCard
                        label="Vendas comerciais (pagas)"
                        value={formatCurrency(shopeeReport.commercial.sales_paid)}
                      />
                      <MetricCard
                        label="Pedidos comerciais"
                        value={String(shopeeReport.commercial.orders_paid)}
                      />
                      <MetricCard
                        label="Ticket comercial"
                        value={formatCurrency(shopeeReport.commercial.ticket_paid)}
                      />
                      <MetricCard
                        label="Conversão de pedidos"
                        value={formatPercent(shopeeReport.commercial.conversion_rate_orders)}
                      />
                      <MetricCard
                        label="Page Views (tráfego)"
                        value={String(shopeeReport.traffic.page_views)}
                      />
                      <MetricCard
                        label="Visitantes (tráfego)"
                        value={String(shopeeReport.traffic.visitors)}
                      />
                      <MetricCard
                        label="Visitantes de produto"
                        value={String(shopeeReport.traffic.product_visitors)}
                      />
                      <MetricCard
                        label="Unidades pagas (produto)"
                        value={String(shopeeReport.traffic.paid_units)}
                      />
                    </div>

                    <h3>Resultado por Categoria (SKU/Família)</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Categoria</th>
                          <th>Receita</th>
                          <th>Payout</th>
                          <th>Unidades</th>
                          <th>Custo</th>
                          <th>Imposto</th>
                          <th>Ads Alocado</th>
                          <th>Lucro Ajustado</th>
                          <th>Margem Ajustada</th>
                          <th>Lucro/Unidade</th>
                          <th>Decisão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopeeReport.by_category.map((row) => (
                          <tr key={row.category}>
                            <td>{row.label}</td>
                            <td>{formatCurrency(row.revenue)}</td>
                            <td>{formatCurrency(row.payout)}</td>
                            <td>{row.units}</td>
                            <td>{formatCurrency(row.production_cost)}</td>
                            <td>{formatCurrency(row.tax)}</td>
                            <td>{formatCurrency(row.ads_allocated_full)}</td>
                            <td>{formatCurrency(row.net_profit_adjusted)}</td>
                            <td>{formatPercent(row.net_margin_adjusted)}</td>
                            <td>{formatCurrency(row.profit_per_unit_adjusted)}</td>
                            <td>{row.decision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <h3>Cobertura e Kit</h3>
                    <div className="metric-grid">
                      <MetricCard
                        label="Receita conhecida"
                        value={formatCurrency(shopeeReport.coverage.known_revenue)}
                      />
                      <MetricCard
                        label="Cobertura da receita"
                        value={formatPercent(shopeeReport.coverage.known_revenue_coverage)}
                      />
                      <MetricCard
                        label="Unidades conhecidas"
                        value={String(shopeeReport.coverage.known_units)}
                      />
                      <MetricCard
                        label="Kit Farmácia (unidades)"
                        value={String(shopeeReport.kit_farmacia.units)}
                      />
                      <MetricCard
                        label="Kit Farmácia receita"
                        value={formatCurrency(shopeeReport.kit_farmacia.revenue)}
                      />
                      <MetricCard
                        label="Kit Farmácia margem ajustada"
                        value={formatPercent(shopeeReport.kit_farmacia.margin_adjusted)}
                      />
                    </div>

                    {shopeeReport.warnings.length ? (
                      <>
                        <h3>Alertas de Base</h3>
                        <ul className="alert-list">
                          {shopeeReport.warnings.map((warning) => (
                            <li key={warning} className="alert-warning">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Importação Financeira (2.1)" subtitle="CSV com mapeamento reprocessável">
            <div className="form-grid">
              <label className="full-width">
                Cole o CSV financeiro (com cabeçalho)
                <textarea
                  rows={10}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                />
              </label>
              <button onClick={handleImportFinancialCsv} disabled={loading}>
                Importar CSV
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Base Atual">
            <div className="metric-grid">
              <MetricCard
                label="SKUs cadastrados"
                value={String(state?.skus.length ?? 0)}
              />
              <MetricCard
                label="Regras tributárias"
                value={String(state?.tax_rules.length ?? 0)}
              />
              <MetricCard
                label="Marketing mensal"
                value={String(state?.marketing_costs.length ?? 0)}
              />
              <MetricCard
                label="Custos por vigência"
                value={String(state?.sku_cost_history.length ?? 0)}
              />
            </div>
          </SectionCard>
        </main>
      ) : null}

      {tab === "simulacao" ? (
        <main className="grid-2">
          <SectionCard title="Simulação de Preço (4.5)">
            <div className="form-grid">
              <label>
                SKU
                <select
                  value={simulationInput.sku}
                  onChange={(event) =>
                    setSimulationInput((current) => ({ ...current, sku: event.target.value }))
                  }
                >
                  {(state?.skus ?? []).map((sku) => (
                    <option key={sku.sku} value={sku.sku}>
                      {sku.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Novo preço sugerido
                <input
                  type="number"
                  step="0.01"
                  value={simulationInput.suggested_new_price}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      suggested_new_price: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Desconto promocional (0 a 1)
                <input
                  type="number"
                  step="0.01"
                  value={simulationInput.promo_discount}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      promo_discount: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                ROAS projetado
                <input
                  type="number"
                  step="0.01"
                  value={simulationInput.projected_roas}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      projected_roas: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Imposto projetado
                <input
                  type="number"
                  step="0.0001"
                  value={simulationInput.expected_tax_rate}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      expected_tax_rate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Custo projetado
                <input
                  type="number"
                  step="0.01"
                  value={simulationInput.expected_cost}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      expected_cost: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Take rate esperado
                <input
                  type="number"
                  step="0.0001"
                  value={simulationInput.expected_marketplace_take_rate}
                  onChange={(event) =>
                    setSimulationInput((current) => ({
                      ...current,
                      expected_marketplace_take_rate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <button onClick={handleRunSimulation} disabled={loading}>
                Simular
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Resultado da Simulação">
            {simulation ? (
              <div className="metric-grid">
                <MetricCard
                  label="Lucro líquido projetado"
                  value={formatCurrency(simulation.projected_net_profit)}
                  tone={
                    (simulation.projected_net_profit ?? 0) >= 0 ? "positive" : "negative"
                  }
                />
                <MetricCard
                  label="Margem líquida projetada"
                  value={formatPercent(simulation.projected_net_margin)}
                />
                <MetricCard
                  label="Preço mínimo de segurança"
                  value={formatCurrency(simulation.safety_min_price)}
                />
                <MetricCard
                  label="Preço ideal para escala"
                  value={formatCurrency(simulation.ideal_scale_price)}
                />
                <MetricCard
                  label="Variação vs preço atual"
                  value={formatCurrency(simulation.delta_vs_current_price)}
                />
                <MetricCard
                  label="Status"
                  value={simulation.complete ? "Completa" : "Parcial"}
                  tone={simulation.complete ? "positive" : "warning"}
                />
                {simulation.missing_reasons.length > 0 ? (
                  <article className="notice-card">
                    <h3>Campos faltantes</h3>
                    <p>{simulation.missing_reasons.join(" | ")}</p>
                  </article>
                ) : null}
              </div>
            ) : (
              <p>Preencha os parâmetros e clique em simular.</p>
            )}
          </SectionCard>
        </main>
      ) : null}

      {tab === "auditoria" ? (
        <main className="grid-1">
          <SectionCard title="Metodologia da Análise">
            {report ? (
              <div className="audit-grid">
                <article>
                  <h3>Fórmula principal</h3>
                  <code>{report.methodology.formula_result_net}</code>
                </article>
                <article>
                  <h3>Margem líquida</h3>
                  <code>{report.methodology.formula_net_margin}</code>
                </article>
                <article>
                  <h3>Alocação de marketing</h3>
                  <code>{report.methodology.marketing_allocation_mode}</code>
                </article>
                <article>
                  <h3>Método de marketing</h3>
                  <code>{report.methodology.marketing_resolution_method}</code>
                </article>
                <article>
                  <h3>Competência</h3>
                  <code>{report.methodology.competence_mode}</code>
                </article>
              </div>
            ) : (
              <p>Rode a análise para gerar trilha de auditoria.</p>
            )}
          </SectionCard>

          <SectionCard title="Pendências de Cadastro">
            {report ? (
              report.pending_data_report.length ? (
                <ul className="alert-list">
                  {report.pending_data_report.map((pending) => (
                    <li key={pending} className="alert-warning">
                      {pending}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Sem pendências detectadas.</p>
              )
            ) : (
              <p>Sem análise para auditar.</p>
            )}
          </SectionCard>

          <SectionCard title="Inconsistências de Dados">
            {report ? (
              report.inconsistencies_report.length ? (
                <ul className="alert-list">
                  {report.inconsistencies_report.map((issue) => (
                    <li key={issue} className="alert-info">
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma inconsistência reportada.</p>
              )
            ) : (
              <p>Sem análise para auditar.</p>
            )}
          </SectionCard>
        </main>
      ) : null}

      {tab === "evolucao" ? (
        <main style={{ padding: 24 }}>
          <EvolutionDashboard authToken={authToken} />
        </main>
      ) : null}

      {tab === "forecast" ? (
        <main style={{ padding: 24 }}>
          <ForecastDashboard authToken={authToken} />
        </main>
      ) : null}

      {tab === "precificacao" ? (
        <main style={{ padding: 24 }}>
          <PricingDashboard authToken={authToken} />
        </main>
      ) : null}

      {tab === "marketing" ? (
        <main style={{ padding: 24 }}>
          <MarketingDashboard authToken={authToken} />
        </main>
      ) : null}

      {tab === "saude" ? (
        <main style={{ padding: 24 }}>
          <HealthMonitor authToken={authToken} />
        </main>
      ) : null}
    </div>
  );
}
