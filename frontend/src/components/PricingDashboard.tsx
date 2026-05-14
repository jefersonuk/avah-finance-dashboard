import { useEffect, useState } from "react";
import { fetchPricingRecommendations, type PricingRecommendation, type PricingData } from "../lib/api";
import { MetricCard } from "./MetricCard";
import { SectionCard } from "./SectionCard";

function fmtCur(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const STATUS_MAP = {
  ok: { label: "OK", color: "#16a34a", bg: "#dcfce7" },
  attention: { label: "Atenção", color: "#ca8a04", bg: "#fef9c3" },
  critical: { label: "Crítico", color: "#dc2626", bg: "#fee2e2" },
} as const;

interface Props {
  authToken: string | null;
}

export function PricingDashboard({ authToken }: Props) {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchPricingRecommendations()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  if (loading) return <p style={{ padding: 24 }}>Calculando recomendações de precificação…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>Erro: {error}</p>;
  if (!data || data.recommendations.length === 0)
    return <p style={{ padding: 24 }}>Nenhum dado disponível. Importe os relatórios mensais primeiro.</p>;

  const criticals = data.recommendations.filter((r) => r.status === "critical").length;
  const attentions = data.recommendations.filter((r) => r.status === "attention").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MetricCard label="Take Rate Shopee" value={`${data.take_rate.toFixed(1)}%`} tone="neutral" />
        <MetricCard label="Imposto (Simples)" value={`${data.tax_rate.toFixed(1)}%`} tone="neutral" />
        <MetricCard
          label="Produtos com Status Crítico"
          value={String(criticals)}
          tone={criticals > 0 ? "negative" : "positive"}
        />
        <MetricCard
          label="Produtos em Atenção"
          value={String(attentions)}
          tone={attentions > 0 ? "warning" : "positive"}
        />
      </div>

      <SectionCard
        title="Recomendações de Preço por Produto"
        subtitle="Preço mínimo = margem 20% | Preço recomendado = margem 35%"
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {[
                  "Produto",
                  "Custo Prod.",
                  "Preço Médio Atual",
                  "Margem Atual",
                  "Preço Mínimo (20%)",
                  "Preço Recomendado (35%)",
                  "Status",
                ].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recommendations.map((r: PricingRecommendation) => {
                const s = STATUS_MAP[r.status];
                const marginColor =
                  r.current_net_margin === null
                    ? "#6b7280"
                    : r.current_net_margin >= 35
                    ? "#16a34a"
                    : r.current_net_margin >= 20
                    ? "#ca8a04"
                    : "#dc2626";
                return (
                  <tr key={r.category} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.label}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCur(r.production_cost)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>
                      {r.current_avg_price > 0 ? fmtCur(r.current_avg_price) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: marginColor, fontWeight: 600 }}>
                      {r.current_net_margin !== null ? `${r.current_net_margin.toFixed(1)}%` : "N/A"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#ca8a04" }}>
                      {fmtCur(r.min_safe_price)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                      {fmtCur(r.recommended_price)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          color: s.color,
                          background: s.bg,
                        }}
                      >
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Fórmula de Precificação">
        <div style={{ fontFamily: "monospace", fontSize: 13, background: "#f8fafc", padding: 16, borderRadius: 8, lineHeight: 2 }}>
          <div>Payout = Preço × (1 − Take Rate Shopee)</div>
          <div>Imposto = Preço × Taxa Simples Nacional</div>
          <div>Margem Líquida = (Payout − Custo Produção − Imposto) / Preço</div>
          <div style={{ marginTop: 8, color: "#4f87ff", fontWeight: 600 }}>
            Preço Recomendado = Custo Produção / (1 − Take Rate − Imposto − Margem Alvo)
          </div>
          <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
            Take Rate atual: {data.take_rate.toFixed(1)}% | Imposto: {data.tax_rate.toFixed(1)}%
          </div>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          ⚠ Take rate derivado do último Income Report importado. Revalide mensalmente pois pode variar com nível de serviço e campanhas da Shopee.
        </p>
      </SectionCard>
    </div>
  );
}
