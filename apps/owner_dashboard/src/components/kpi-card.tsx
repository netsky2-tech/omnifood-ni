interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: { value: number; label: string } | null;
}

function formatTrend(trend: number): { text: string; color: string; icon: string } {
  const pct = Math.abs(trend).toFixed(1);
  if (trend > 0) return { text: `+${pct}%`, color: "text-secondary", icon: "↑" };
  if (trend < 0) return { text: `-${pct}%`, color: "text-destructive", icon: "↓" };
  return { text: "0%", color: "text-muted-foreground", icon: "—" };
}

export function KpiCard({ label, value, subtitle, trend }: KpiCardProps) {
  const trendInfo = trend ? formatTrend(trend.value) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-card-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
      {trendInfo && (
        <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${trendInfo.color}`}>
          <span>{trendInfo.icon}</span>
          <span>{trendInfo.text}</span>
          {trend!.label && (
            <span className="text-muted-foreground font-normal">vs periodo anterior</span>
          )}
        </div>
      )}
    </div>
  );
}
