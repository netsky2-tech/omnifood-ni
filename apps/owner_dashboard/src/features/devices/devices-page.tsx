import { useState } from "react";
import { Plus, RefreshCw, RotateCw, Smartphone } from "lucide-react";
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
import { ReactivationChallengesCard } from "@/features/onboarding/reactivation-challenges-card";
import { useDevices } from "./use-devices";
import { RevokeDeviceModal } from "./revoke-device-modal";
import { ReactivateDeviceModal } from "./reactivate-device-modal";
import { AddTerminalKitDialog } from "./add-terminal-kit-dialog";
import type {
  DeviceSyncStatus,
  TerminalCredentialVersion,
  TerminalDevice,
} from "./types";

interface BadgeTone {
  label: string;
  className: string;
  dotClassName: string;
}

/** §46: color is never the only signal — every badge carries its label. */
const STATUS_BADGES: Record<DeviceSyncStatus, BadgeTone> = {
  ACTIVE: {
    label: "Activa",
    className: "border-transparent bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  PENDING: {
    label: "Pendiente",
    className: "border-transparent bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  REVOKED: {
    label: "Revocada",
    className: "border-transparent bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  RETIRED: {
    label: "Reemplazada",
    className: "border-transparent bg-slate-100 text-slate-700",
    dotClassName: "bg-slate-500",
  },
};

const LINEAGE_REASON_LABELS: Record<string, string> = {
  reinstall: "Reinstalación",
  replaced: "Reemplazo",
};

function formatLineageReason(reason: string | null): string | null {
  if (!reason) return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  return LINEAGE_REASON_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("es-NI", {
    timeZone: "America/Managua",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

/**
 * Formats monotonic credential lineage (`v1 (Reemplazada · Reinstalación · 19 nov) → v2 (Activa · 19 nov)`).
 */
export function formatCredentialLineage(
  history: TerminalCredentialVersion[],
): string | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.version - b.version);
  return sorted
    .map((entry) => {
      const statusLabel = STATUS_BADGES[entry.status]?.label ?? entry.status;
      const reason = formatLineageReason(entry.revocationReason);
      const eventDate = formatShortDate(
        entry.rotatedAt ?? entry.revokedAt ?? entry.issuedAt,
      );
      const details = [statusLabel, reason, eventDate].filter(
        (part): part is string => Boolean(part),
      );
      return `v${entry.version} (${details.join(" · ")})`;
    })
    .join(" → ");
}

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
  onReactivate: (device: TerminalDevice) => void;
}

function DevicesTable({
  devices,
  canRevoke,
  onRevoke,
  onReactivate,
}: DevicesTableProps) {
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
            const lineageText = formatCredentialLineage(device.credentialHistory);
            const canReactivateRow =
              device.status === "ACTIVE" || device.status === "RETIRED";
            const canRevokeRow =
              device.status === "ACTIVE" || device.status === "PENDING";
            const hasRowAction = canReactivateRow || canRevokeRow;
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
                  <div className="space-y-1">
                    <StateBadge tone={statusTone} />
                    {device.status === "REVOKED" && device.revocationReason && (
                      <p
                        data-testid={`revocation-reason-${device.terminalId}`}
                        className="text-xs text-muted-foreground max-w-[200px]"
                      >
                        {device.revocationReason}
                      </p>
                    )}
                  </div>
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
                  {lineageText && (
                    <p
                      data-testid={`credential-lineage-${device.terminalId}`}
                      className="mt-1 text-[11px] font-mono text-muted-foreground leading-snug"
                    >
                      {lineageText}
                    </p>
                  )}
                </TableCell>
                {canRevoke && (
                  <TableCell className="text-right">
                    {hasRowAction ? (
                      <div className="inline-flex items-center justify-end gap-1">
                        {canReactivateRow && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => onReactivate(device)}
                            aria-label={`Reactivar terminal ${device.terminalId}`}
                          >
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reactivar
                          </Button>
                        )}
                        {canRevokeRow && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onRevoke(device)}
                            aria-label={`Revocar terminal ${device.terminalId}`}
                          >
                            Revocar
                          </Button>
                        )}
                      </div>
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
  const [reactivatingDevice, setReactivatingDevice] =
    useState<TerminalDevice | null>(null);
  const [addKitOpen, setAddKitOpen] = useState(false);
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
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            size="sm"
            data-testid="add-terminal-header-btn"
            onClick={() => setAddKitOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar terminal
          </Button>
        </div>
      </div>

      {/* Issue #566: pending/approved terminal reactivation alerts surfaced in Dispositivos too */}
      <ReactivationChallengesCard canManage={canRevoke} />

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
          <div className="mt-4">
            <Button
              size="sm"
              data-testid="add-terminal-empty-btn"
              onClick={() => setAddKitOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar terminal
            </Button>
          </div>
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
              onReactivate={(device) => setReactivatingDevice(device)}
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

      <ReactivateDeviceModal
        device={reactivatingDevice}
        open={reactivatingDevice !== null}
        onOpenChange={(open) => {
          if (!open) setReactivatingDevice(null);
        }}
      />

      <AddTerminalKitDialog open={addKitOpen} onOpenChange={setAddKitOpen} />
    </div>
  );
}
