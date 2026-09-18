import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
  className?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
}

export function StatCard({
  label,
  value,
  subtitle,
  accent = false,
  className,
  trend,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 sm:p-5 shadow-xs transition-colors",
        accent ? "border-amber-300 bg-amber-50/50 dark:border-amber-900/50" : "border-border",
        className,
      )}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate"
        title={label}
      >
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <p
          className="text-xl sm:text-2xl font-bold tabular-nums text-card-foreground truncate"
          title={value}
        >
          {value}
        </p>
        {trend && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              trend.isPositive ? "text-emerald-600" : "text-rose-600",
            )}
            title={trend.value}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground truncate" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
