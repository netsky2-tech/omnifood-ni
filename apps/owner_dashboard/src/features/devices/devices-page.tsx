import { useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api-error";
import { useCanRevokeDevice } from "@/features/auth/permissions";
import { useDevices } from "./use-devices";
import { RevokeDeviceModal } from "./revoke-device-modal";
import type { DeviceSyncStatus, TerminalDevice } from "./types";

interface BadgeTone {
  label: string;
  className: string;
  dotClassName: string;
}

/** §46: color is never the only signal — every badge carries its label. */
const STATUS_BADGES: Record<DeviceSyncStatus, BadgeTone> = {
  ACTIVE: {
    label: "Activo",
    className: "border-transparent bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  PENDING: {
    label: "Pendiente",
    className: "border-transparent bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  REVOKED: {
    label: "Revocado",
    className: "border-transparent bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  RETIRED: {
    label: "Retirado",
    className: "border-transparent bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
};

const FRESHNESS_TONES = {
  green: {
    className: "border-transparent bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  amber: {
    className: "border-transparent bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  orange: {
    className: "border-transparent bg-orange-50 text-orange-700",
    dotClassName: "bg-orange-500",
  },
  blue: {
    className: "border-transparent bg-blue-50 text-blue-700",
    dotClassName: "bg-blue-500",
  },
  gray: {
    className: "border-transparent bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
} as const;

function freshnessTone(device: TerminalDevice): BadgeTone {
  // A retired/revoked credential is out of the sync loop by definition —
  // never present its missing receipts as a stale-data warning.
  if (device.status === "REVOKED" || device.status === "RETIRED") {
    return { label: "Sin sincronizar", ...FRESHNESS_TONES.gray };
  }
  switch (device.freshnessState) {
    case "COMPLETE":
      return { label: "En sincronía", ...FRESHNESS_TONES.green };
    case "STALE":
      return { label: "Desactualizado", ...FRESHNESS_TONES.amber };
    case "PARTIAL":
      return { label: "Parcial", ...FRESHNESS_TONES.orange };
    case "PENDING":
      return { label: "Pendiente", ...FRESHNESS_TONES.blue };
    // UNKNOWN (malformed wire value) or null (no backend verdict yet):
    // no freshness claim is made, only that sync is pending.
    default:
      return { label: "Pendiente", ...FRESHNESS_TONES.gray };
  }
}

function StateBadge({ tone }: { tone: BadgeTone }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", tone.className)}>
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dotClassName)}
      />
      {tone.label}
    </Badge>
  );
}

/** §34: a missing evidence value is —, never a fabricated one. */
function formatOrDash(value: string | null, format: (v: string) => string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(value);
}

function SummaryCard({
  label,
  count,
  toneClassName,
}: {
  label: string;
  count: number;
  toneClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          toneClassName ?? "text-foreground",
        )}
      >
        {count}
      </p>
    </div>
  );
}

function DevicesSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando terminales..."
      data-testid="devices-loading-state"
      className="space-y-2 rounded-md border border-border bg-card p-4 shadow-sm"
    >
      <div className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 w-full animate-pulse rounded-md bg-muted/40"
          style={{ animationDelay: `${i * 75}ms` }}
        />
      ))}
    </div>
  );
}

interface DevicesTableProps {
  devices: TerminalDevice[];
  canRevoke: boolean;
  onRevoke: (device: TerminalDevice) => void;
}

function DevicesTable({ devices, canRevoke, onRevoke }: DevicesTableProps) {
  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <Table
        className="min-w-[880px]"
        role="table"
        aria-label="Listado de terminales de punto de venta"
        data-testid="devices-table"
      >
        <TableHeader>
          <TableRow>
            <TableHead>Terminal</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Frescura</TableHead>
            <TableHead>Última Sincronización</TableHead>
            <TableHead>Versión POS</TableHead>
            <TableHead>Credencial</TableHead>
            {canRevoke && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => {
            const statusTone = STATUS_BADGES[device.status];
            const freshTone = freshnessTone(device);
            return (
              <TableRow key={device.credentialId}>
                <TableCell>
                  <p className="font-medium text-foreground">
                    {device.terminalId || "—"}
                  </p>
                  {device.label && (
                    <p className="text-xs text-muted-foreground">{device.label}</p>
                  )}
                </TableCell>
                <TableCell>
                  <StateBadge tone={statusTone} />
                </TableCell>
                <TableCell>
                  <StateBadge tone={freshTone} />
                </TableCell>
                <TableCell>
                  <p className="tabular-nums text-foreground">
                    {device.lastReceiptAt
                      ? formatOrDash(device.lastReceiptAt, formatDateTime)
                      : "Nunca"}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {device.acceptedThroughSequence !== null
                      ? `#${device.acceptedThroughSequence}`
                      : "—"}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {device.posBuild ?? "—"}
                </TableCell>
                <TableCell>
                  <p className="tabular-nums text-foreground">
                    {device.expiresAt
                      ? `Vence ${formatOrDash(device.expiresAt, formatDate)}`
                      : "—"}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {device.issuedAt
                      ? `Emitida ${formatOrDash(device.issuedAt, formatDate)}`
                      : "—"}
                  </p>
                </TableCell>
                {canRevoke && (
                  <TableCell className="text-right">
                    {device.status === "ACTIVE" || device.status === "PENDING" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRevoke(device)}
                        aria-label={`Revocar terminal ${device.terminalId}`}
                      >
                        Revocar
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function DevicesPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useDevices();
  const devices = data ?? [];
  const [revokingDevice, setRevokingDevice] = useState<TerminalDevice | null>(null);
  const canRevoke = useCanRevokeDevice();

  const activeCount = devices.filter((d) => d.status === "ACTIVE").length;
  const revokedCount = devices.filter((d) => d.status === "REVOKED").length;
  const inSyncCount = devices.filter((d) => d.freshnessState === "COMPLETE").length;

  return (
    <div className="space-y-6" data-testid="devices-page">
      {/* §7.1: where am I */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dispositivos
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Monitoreo en tiempo real del estado de sincronización y ciclo de vida
            de las terminales de punto de venta.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Actualizar
        </Button>
      </div>

      {/* §41 P0: SUMMARY → DETAIL. Executive counts first, device rows below. */}
      {data && (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Resumen de terminales"
        >
          <SummaryCard label="Total" count={devices.length} />
          <SummaryCard
            label="Activas"
            count={activeCount}
            toneClassName="text-emerald-700"
          />
          <SummaryCard
            label="Revocadas"
            count={revokedCount}
            toneClassName="text-destructive"
          />
          <SummaryCard label="En sincronía" count={inSyncCount} />
        </div>
      )}

      {/* §30: error explains impact + meaningful retry */}
      {isError && (
        <Alert variant="destructive" data-testid="devices-error-state">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {getApiErrorMessage(
                error,
                "No pudimos cargar las terminales. El monitoreo de sincronización se reintentará automáticamente.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <DevicesSkeleton />
      ) : !isError && data && devices.length === 0 ? (
        /* §29 first-use empty: what belongs here, why it matters */
        <div
          className="rounded-md border border-border bg-card px-6 py-12 text-center shadow-sm"
          data-testid="devices-empty-state"
        >
          <Smartphone
            className="mx-auto mb-4 h-12 w-12 stroke-[1.5] text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="text-lg font-semibold text-foreground">
            No hay terminales vinculadas
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Actualmente no existen terminales asociadas a este negocio.
          </p>
        </div>
      ) : (
        devices.length > 0 && (
          <>
            {/* §28.3: refetch keeps valid data visible, no full-page reset */}
            {isFetching && (
              <p className="text-xs text-muted-foreground" role="status">
                Actualizando…
              </p>
            )}
            <DevicesTable
              devices={devices}
              canRevoke={canRevoke}
              onRevoke={(device) => setRevokingDevice(device)}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Mostrando {devices.length}{" "}
              {devices.length === 1 ? "terminal" : "terminales"}
            </p>
          </>
        )
      )}

      <RevokeDeviceModal
        device={revokingDevice}
        open={revokingDevice !== null}
        onOpenChange={(open) => {
          if (!open) setRevokingDevice(null);
        }}
      />
    </div>
  );
}
