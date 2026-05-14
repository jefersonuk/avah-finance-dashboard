interface MetricCardProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}

export function MetricCard({ label, value, tone = "neutral" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <h3>{label}</h3>
      <p>{value}</p>
    </article>
  );
}
