import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { fetchEvolution, fetchForecast, type EvolutionMonth, type ForecastData } from "../lib/api";
import { MetricCard } from "./MetricCard";
import { SectionCard } from "./SectionCard";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const SCENARIOS = [
  { key: "conservative", label: "Conservador", rate: "30% MoM", color: "#6b7280" },
  { key: "realistic", label: "Realista", rate: "44% MoM", color: "#4f87ff" },
  { key: "optimistic", label: "Otimista", rate: "80% MoM", color: "#22c55e" },
] as const;

interface Props {
  authToken: string | null;
}

export function ForecastDashboard({ authToken }: Props) {
  const [scenario, setScenario] = useState<"conservative" | "realistic" | "optimistic">("realistic");
  const [months, setMonths] = useState(6);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [historical, setHistorical] = useState<EvolutionMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    Promise.all([fetchEvolution(), fetchForecast(months, scenario)])
      .then(([evo, fc]) => {
        setHistorical(evo.evolution);
        setForecast(fc);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken, scenario, months]);

  if (loading) return <p style={{ padding: 24 }}>Calculando projeções…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>Erro: {error}</p>;
  if (!forecast) return null;

  const histChart = historical.map((m) => ({
    mes: m.month,
    "GMV Histórico": m.gmv_paid,
    "GMV Projetado": undefined as number | undefined,
  }));

  const projChart = forecast.projected.map((p) => ({
    mes: p.month,
    "GMV Histórico": undefined as number | undefined,
    "GMV Projetado": p.gmv_forecast,
  }));

  const combined = [...histChart, ...projChart];
  const splitMonth = forecast.base_month;

  const totalProjectedGmv = forecast.projected.reduce((s, p) => s + p.gmv_forecast, 0);
  const totalProjectedProfit = forecast.projected.reduce((s, p) => s + p.net_profit_forecast, 0);
  const scenarioInfo = SCENARIOS.find((s) => s.key === scenario)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ marginRight: 8 }}>Cenário:</strong>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => setScenario(s.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `2px solid ${s.color}`,
              background: scenario === s.key ? s.color : "transparent",
              color: scenario === s.key ? "#fff" : s.color,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {s.label} ({s.rate})
          </button>
        ))}
        <span style={{ marginLeft: 16, marginRight: 8 }}>
          <strong>Horizonte:</strong>
        </span>
        {[3, 6, 9, 12].map((m) => (
          <button
            key={m}
            onClick={() => setMonths(m)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "2px solid #4f87ff",
              background: months === m ? "#4f87ff" : "transparent",
              color: months === m ? "#fff" : "#4f87ff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m}m
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MetricCard label="Base de Cálculo" value={fmtCur(forecast.last_gmv)} tone="neutral" />
        <MetricCard label={`GMV Projetado (${months}m)`} value={fmtCur(totalProjectedGmv)} tone="positive" />
        <MetricCard label={`Lucro Líquido Est. (${months}m)`} value={fmtCur(totalProjectedProfit)} tone="positive" />
        <MetricCard
          label="Crescimento Histórico Real"
          value={`${(forecast.historical_growth_rate * 100).toFixed(0)}% MoM`}
          tone={forecast.historical_growth_rate >= 0.3 ? "positive" : "neutral"}
        />
      </div>

      <SectionCard
        title={`Projeção de GMV — Cenário ${scenarioInfo.label}`}
        subtitle="Linha pontilhada = projetado. Sem ajuste de sazonalidade."
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={combined} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmtCur(v)} />
            <Legend />
            <ReferenceLine x={splitMonth} stroke="#e5e7eb" strokeDasharray="6 3" label="Hoje" />
            <Line
              type="monotone"
              dataKey="GMV Histórico"
              stroke="#4f87ff"
              strokeWidth={2}
              dot
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="GMV Projetado"
              stroke={scenarioInfo.color}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Tabela de Projeção Mensal">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Mês", "GMV Projetado", "Lucro Líquido Est.", "MoM vs Base"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.projected.map((p, i) => {
                const prevGmv = i === 0 ? forecast.last_gmv : forecast.projected[i - 1].gmv_forecast;
                const mom = prevGmv > 0 ? (p.gmv_forecast - prevGmv) / prevGmv : null;
                return (
                  <tr key={p.month} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{p.month}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(p.gmv_forecast)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#16a34a" }}>
                      {fmtCur(p.net_profit_forecast)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#4f87ff" }}>
                      {mom !== null ? `+${(mom * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                <td style={{ padding: "8px 12px" }}>TOTAL {months}m</td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(totalProjectedGmv)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "#16a34a" }}>
                  {fmtCur(totalProjectedProfit)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          ⚠ Projeção baseada em taxa MoM histórica ({(forecast.historical_growth_rate * 100).toFixed(0)}%) e ajustada para o cenário {scenarioInfo.label} ({(forecast.growth_rate * 100).toFixed(0)}% MoM). Não considera sazonalidade, concorrência ou choques externos.
        </p>
      </SectionCard>
    </div>
  );
}
