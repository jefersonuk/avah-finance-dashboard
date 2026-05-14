import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="section-card">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="section-content">{children}</div>
    </section>
  );
}
