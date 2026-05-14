import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchEvolution, type EvolutionMonth } from "../lib/api";
import { MetricCard } from "./MetricCard";
import { SectionCard } from "./SectionCard";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtPct(v: number | null) {
  return v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";
}
function momColor(rate: number | null) {
  if (rate === null) return "neutral";
  return rate >= 0.3 ? "positive" : rate >= 0 ? "neutral" : "negative";
}

function calcMom(curr: number, prev: number | undefined): number | null {
  if (!prev || prev === 0) return null;
  return (curr - prev) / prev;
}

interface Props {
  authToken: string | null;
}

export function EvolutionDashboard({ authToken }: Props) {
  const [data, setData] = useState<EvolutionMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchEvolution()
      .then((r) => setData(r.evolution))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  if (loading) return <p style={{ padding: 24 }}>Carregando evolução histórica…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>Erro: {error}</p>;
  if (data.length === 0)
    return (
      <p style={{ padding: 24 }}>
        Nenhum relatório mensal importado ainda. Use "Importação → Documentos Shopee" para cada mês.
      </p>
    );

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const momGmv = calcMom(last.gmv_paid, prev?.gmv_paid);
  const momOrders = calcMom(last.orders_paid, prev?.orders_paid);

  const chartData = data.map((m, i) => ({
    mes: m.month,
    "GMV (R$)": m.gmv_paid,
    "Payout (R$)": m.payout_total,
    "Margem %": m.net_margin_adjusted !== null ? +(m.net_margin_adjusted * 100).toFixed(1) : null,
    "Cancelamentos %": +(m.cancelled_rate * 100).toFixed(1),
    mom: i > 0 ? calcMom(m.gmv_paid, data[i - 1].gmv_paid) : null,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MetricCard label="GMV Último Mês" value={fmtCur(last.gmv_paid)} tone="neutral" />
        <MetricCard
          label="Crescimento MoM (GMV)"
          value={momGmv !== null ? `${(momGmv * 100).toFixed(1)}%` : "N/A"}
          tone={momColor(momGmv)}
        />
        <MetricCard label="Pedidos Último Mês" value={String(last.orders_paid)} tone="neutral" />
        <MetricCard
          label="Crescimento MoM (Pedidos)"
          value={momOrders !== null ? `${(momOrders * 100).toFixed(1)}%` : "N/A"}
          tone={momColor(momOrders)}
        />
        <MetricCard label="Ticket Médio" value={fmtCur(last.ticket_avg)} tone="neutral" />
        <MetricCard
          label="Margem Líquida"
          value={fmtPct(last.net_margin_adjusted)}
          tone={
            last.net_margin_adjusted === null
              ? "neutral"
              : last.net_margin_adjusted >= 0.35
              ? "positive"
              : last.net_margin_adjusted >= 0.2
              ? "warning"
              : "negative"
          }
        />
        <MetricCard
          label="Cancelamentos"
          value={fmtPct(last.cancelled_rate)}
          tone={last.cancelled_rate > 0.05 ? "negative" : last.cancelled_rate > 0.03 ? "warning" : "positive"}
        />
      </div>

      <SectionCard title="GMV e Payout por Mês" subtitle="Receita bruta vs valor efetivamente recebido">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmtCur(v)} />
            <Legend />
            <Line type="monotone" dataKey="GMV (R$)" stroke="#4f87ff" strokeWidth={2} dot />
            <Line type="monotone" dataKey="Payout (R$)" stroke="#22c55e" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Margem Líquida % por Mês" subtitle="Alvo: ≥ 35% = verde, 20–35% = amarelo, < 20% = vermelho">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis tickFormatter={(v) => `${v}%`} domain={[0, "dataMax + 5"]} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar
              dataKey="Margem %"
              fill="#4f87ff"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Histórico Mensal Completo">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Mês", "GMV", "Pedidos", "Ticket Médio", "Payout", "Custo Prod.", "Margem Líq.", "Cancelam. %", "MoM"].map(
                  (h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((m, i) => {
                const mom = i > 0 ? calcMom(m.gmv_paid, data[i - 1].gmv_paid) : null;
                const marginPct = m.net_margin_adjusted;
                const marginColor =
                  marginPct === null
                    ? "#6b7280"
                    : marginPct >= 0.35
                    ? "#16a34a"
                    : marginPct >= 0.2
                    ? "#ca8a04"
                    : "#dc2626";
                const cancelColor = m.cancelled_rate > 0.05 ? "#dc2626" : m.cancelled_rate > 0.03 ? "#ca8a04" : "#16a34a";
                return (
                  <tr key={m.month} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{m.month}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(m.gmv_paid)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{m.orders_paid}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(m.ticket_avg)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(m.payout_total)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(m.production_cost_total)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: marginColor, fontWeight: 600 }}>
                      {fmtPct(m.net_margin_adjusted)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: cancelColor }}>
                      {(m.cancelled_rate * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: mom !== null ? (mom >= 0 ? "#16a34a" : "#dc2626") : "#6b7280" }}>
                      {mom !== null ? `${mom >= 0 ? "+" : ""}${(mom * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
