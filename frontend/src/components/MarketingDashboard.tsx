import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchEvolution, updateAdsSpend, type EvolutionMonth } from "../lib/api";
import { MetricCard } from "./MetricCard";
import { SectionCard } from "./SectionCard";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function roasColor(roas: number | null): string {
  if (roas === null) return "#6b7280";
  if (roas >= 10) return "#16a34a";
  if (roas >= 5) return "#ca8a04";
  return "#dc2626";
}

interface MonthEdit {
  ads_spend_input: string;
  saving: boolean;
  saved: boolean;
}

interface Props {
  authToken: string | null;
}

export function MarketingDashboard({ authToken }: Props) {
  const [data, setData] = useState<EvolutionMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, MonthEdit>>({});

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchEvolution()
      .then((r) => {
        setData(r.evolution);
        const initial: Record<string, MonthEdit> = {};
        for (const m of r.evolution) {
          initial[m.month] = {
            ads_spend_input: m.ads_spend_real !== null ? String(m.ads_spend_real) : "",
            saving: false,
            saved: false,
          };
        }
        setEdits(initial);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  async function handleSave(month: string) {
    const edit = edits[month];
    if (!edit) return;
    const value = parseFloat(edit.ads_spend_input.replace(",", "."));
    if (isNaN(value) || value < 0) return;
    setEdits((prev) => ({ ...prev, [month]: { ...prev[month], saving: true } }));
    try {
      await updateAdsSpend(month, value);
      setData((prev) =>
        prev.map((m) => (m.month === month ? { ...m, ads_spend_real: value } : m)),
      );
      setEdits((prev) => ({ ...prev, [month]: { ...prev[month], saving: false, saved: true } }));
      setTimeout(() => {
        setEdits((prev) => ({ ...prev, [month]: { ...prev[month], saved: false } }));
      }, 2000);
    } catch {
      setEdits((prev) => ({ ...prev, [month]: { ...prev[month], saving: false } }));
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Carregando dados de marketing…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>Erro: {error}</p>;
  if (data.length === 0)
    return <p style={{ padding: 24 }}>Nenhum relatório mensal importado ainda.</p>;

  const totalAdsReal = data.reduce((s, m) => s + (m.ads_spend_real ?? 0), 0);
  const totalAdsSales = data.reduce((s, m) => s + m.ads_sales, 0);
  const globalRoas = totalAdsReal > 0 ? totalAdsSales / totalAdsReal : null;

  const chartData = data.map((m) => ({
    mes: m.month,
    ROAS: m.ads_spend_real && m.ads_spend_real > 0 ? +(m.ads_sales / m.ads_spend_real).toFixed(1) : null,
    "Vendas via Ads (R$)": m.ads_sales,
    "Invest. Real (R$)": m.ads_spend_real ?? 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MetricCard label="Invest. Real Total Ads" value={fmtCur(totalAdsReal)} tone="neutral" />
        <MetricCard label="Vendas via Ads (Total)" value={fmtCur(totalAdsSales)} tone="positive" />
        <MetricCard
          label="ROAS Global"
          value={globalRoas !== null ? `${globalRoas.toFixed(1)}x` : "N/A"}
          tone={globalRoas === null ? "neutral" : globalRoas >= 10 ? "positive" : globalRoas >= 5 ? "warning" : "negative"}
        />
      </div>

      <SectionCard title="ROAS por Mês" subtitle="ROAS = Vendas via Ads / Investimento Real. Inserir investimento real abaixo.">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="ROAS" fill="#4f87ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Investimento Real em Ads por Mês" subtitle="O valor do Income Report é subestimado. Insira o valor real gasto em Ads.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Mês", "Vendas via Ads", "Invest. (Shopee)", "Invest. REAL", "ROAS Real", ""].map(
                  (h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((m) => {
                const edit = edits[m.month] ?? { ads_spend_input: "", saving: false, saved: false };
                const spendReal = m.ads_spend_real;
                const roas = spendReal && spendReal > 0 ? m.ads_sales / spendReal : null;
                return (
                  <tr key={m.month} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{m.month}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(m.ads_sales)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#9ca3af" }}>
                      {fmtCur(m.ads_spend_reported)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={edit.ads_spend_input}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [m.month]: { ...prev[m.month], ads_spend_input: e.target.value, saved: false },
                          }))
                        }
                        style={{
                          width: 100,
                          padding: "4px 8px",
                          border: "1px solid #d1d5db",
                          borderRadius: 4,
                          textAlign: "right",
                        }}
                        placeholder="0.00"
                      />
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: roasColor(roas),
                      }}
                    >
                      {roas !== null ? `${roas.toFixed(1)}x` : "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={() => handleSave(m.month)}
                        disabled={edit.saving}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 4,
                          border: "none",
                          background: edit.saved ? "#22c55e" : "#4f87ff",
                          color: "#fff",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {edit.saving ? "…" : edit.saved ? "Salvo!" : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          ROAS ≥ 10x = excelente | 5–10x = aceitável | &lt; 5x = revisar campanha
        </p>
      </SectionCard>
    </div>
  );
}
