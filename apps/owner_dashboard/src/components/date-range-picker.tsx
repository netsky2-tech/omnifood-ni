import { useState } from "react";

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

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
      >
        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{value.startDate}</span>
        <span className="text-muted-foreground">—</span>
        <span>{value.endDate}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-card shadow-md">
            <div className="p-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(preset.getRange());
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={value.startDate}
                  onChange={(e) => onChange({ ...value, startDate: e.target.value })}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-xs"
                />
                <input
                  type="date"
                  value={value.endDate}
                  onChange={(e) => onChange({ ...value, endDate: e.target.value })}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
