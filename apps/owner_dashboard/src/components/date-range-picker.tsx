import { useState, useEffect } from "react";

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
}

const PRESETS = [
  { label: "Hoy", getRange: () => singleDay(0) },
  { label: "Ayer", getRange: () => singleDay(-1) },
  { label: "Últimos 7 días", getRange: () => lastDays(7) },
  { label: "Últimos 30 días", getRange: () => lastDays(30) },
  { label: "Este mes", getRange: () => currentMonth() },
  { label: "Mes anterior", getRange: () => previousMonth() },
] as const;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function singleDay(offset: number): DateRangeValue {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const iso = toISODate(d);
  return { startDate: iso, endDate: iso };
}

function lastDays(n: number): DateRangeValue {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (n - 1));
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function currentMonth(): DateRangeValue {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: toISODate(start), endDate: toISODate(now) };
}

function previousMonth(): DateRangeValue {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleStartDateChange = (newStart: string) => {
    if (!newStart) return;
    if (value.endDate && newStart > value.endDate) {
      onChange({ startDate: newStart, endDate: newStart });
    } else {
      onChange({ ...value, startDate: newStart });
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    if (!newEnd) return;
    if (value.startDate && newEnd < value.startDate) {
      onChange({ startDate: newEnd, endDate: newEnd });
    } else {
      onChange({ ...value, endDate: newEnd });
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-colors shadow-xs"
        aria-expanded={open}
        aria-label="Seleccionar rango de fechas"
      >
        <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="tabular-nums">{value.startDate}</span>
        <span className="text-muted-foreground">—</span>
        <span className="tabular-nums">{value.endDate}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 sm:right-auto sm:left-0 top-full z-40 mt-1.5 w-64 rounded-lg border border-border bg-card shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="p-1.5 space-y-0.5">
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Periodos Rápidos
              </p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(preset.getRange());
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-2.5 bg-muted/30">
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Personalizado</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={value.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Fecha inicio"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <input
                  type="date"
                  value={value.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Fecha fin"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
