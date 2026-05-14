import { useEffect, useState } from "react";
import { fetchHealthScore, type HealthScoreData } from "../lib/api";
import { SectionCard } from "./SectionCard";

interface Props {
  authToken: string | null;
}

const METRIC_LABELS: Record<string, { label: string; unit: string; description: string }> = {
  cancellation_rate: {
    label: "Taxa de Cancelamento",
    unit: "%",
    description: "Meta: < 3% | Atenção: 3–5% | Crítico: > 5%",
  },
  return_rate: {
    label: "Taxa de Devolução",
    unit: "%",
    description: "Meta: < 2% | Atenção: 2–5% | Crítico: > 5%",
  },
  net_margin: {
    label: "Margem Líquida",
    unit: "%",
    description: "Meta: ≥ 35% | Atenção: 20–35% | Crítico: < 20%",
  },
  growth_rate_mom: {
    label: "Crescimento MoM",
    unit: "%",
    description: "Meta: ≥ 20% | Atenção: 0–20% | Crítico: < 0%",
  },
};

const STATUS_STYLES = {
  ok: { color: "#16a34a", bg: "#dcfce7", label: "OK" },
  warning: { color: "#ca8a04", bg: "#fef9c3", label: "Atenção" },
  critical: { color: "#dc2626", bg: "#fee2e2", label: "Crítico" },
};

function GradeGauge({ score, grade }: { score: number; grade: string }) {
  const gradeColors: Record<string, string> = {
    A: "#16a34a", B: "#22c55e", C: "#ca8a04", D: "#f97316", F: "#dc2626",
  };
  const color = gradeColors[grade] ?? "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: 24 }}>
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          border: `6px solid ${color}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 32, fontWeight: 900, color }}>{grade}</span>
      </div>
      <div>
        <div style={{ fontSize: 48, fontWeight: 900, color }}>{score}</div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>Score de Saúde Operacional (0–100)</div>
        <div style={{ marginTop: 8, background: "#e5e7eb", borderRadius: 6, height: 12, width: 240 }}>
          <div
            style={{
              height: 12,
              borderRadius: 6,
              background: color,
              width: `${score}%`,
              transition: "width 0.5s",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function HealthMonitor({ authToken }: Props) {
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchHealthScore()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  if (loading) return <p style={{ padding: 24 }}>Calculando score de saúde operacional…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>Erro: {error}</p>;
  if (!data || data.score === null)
    return <p style={{ padding: 24 }}>Nenhum relatório mensal importado ainda. Importe os documentos Shopee para ver o score.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionCard
        title="Score de Saúde Operacional"
        subtitle={`Último mês analisado: ${data.latest_month}`}
      >
        <GradeGauge score={data.score} grade={data.grade ?? "F"} />
      </SectionCard>

      {data.alerts.length > 0 && (
        <div>
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 8,
                color: "#991b1b",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⚠ {alert}
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Métricas de Saúde Detalhadas">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(data.metrics).map(([key, metric]) => {
            const meta = METRIC_LABELS[key];
            if (!meta) return null;
            const st = STATUS_STYLES[metric.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.warning;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 16,
                  border: `1px solid ${st.color}20`,
                  borderRadius: 8,
                  background: st.bg,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#1f2937" }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{meta.description}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: st.color }}>
                    {metric.value !== null ? `${metric.value}${meta.unit}` : "N/A"}
                  </div>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                      color: st.color,
                      border: `2px solid ${st.color}`,
                      background: "#fff",
                    }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Como o Score é Calculado">
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "4px 12px", textAlign: "left" }}>Métrica</th>
                <th style={{ padding: "4px 12px", textAlign: "right" }}>Pontos (OK)</th>
                <th style={{ padding: "4px 12px", textAlign: "right" }}>Pontos (Atenção)</th>
                <th style={{ padding: "4px 12px", textAlign: "right" }}>Pontos (Crítico)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Cancelamento", "25", "5–15", "0"],
                ["Devolução", "20", "10", "5"],
                ["Margem Líquida", "30", "10–20", "0"],
                ["Crescimento MoM", "25", "10–15", "0"],
              ].map(([m, ok, at, cr]) => (
                <tr key={m} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 12px" }}>{m}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right", color: "#16a34a" }}>{ok}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right", color: "#ca8a04" }}>{at}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right", color: "#dc2626" }}>{cr}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                <td style={{ padding: "4px 12px" }}>TOTAL</td>
                <td style={{ padding: "4px 12px", textAlign: "right", color: "#16a34a" }}>100</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
