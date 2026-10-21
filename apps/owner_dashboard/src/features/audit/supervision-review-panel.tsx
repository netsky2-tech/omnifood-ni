import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { RefreshCw } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  supervisionFlowLabels,
  credentialMethodLabels,
} from "@/lib/labels";
import type {
  SupervisionReviewClassCount,
  SupervisionReviewEntry,
  SupervisionFlow,
} from "./types";

/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy.
 *
 * The copy answers the question the policy exists for — "who signed this,
 * and was a supervisor involved?" — in the owner's words, and never in the
 * terminal's codes.
 *
 * The summary comes FIRST (progressive disclosure: counts before rows), and
 * the numbers are honest: a failed load says so instead of showing zero
 * (§16: unknown is `—`, not `0`).
 */

const FLOW_ORDER: readonly SupervisionFlow[] = [
  "CLOSE_BOX",
  "MANUAL_DISCOUNT",
  "CASH_DRAWER",
  "MODIFIER_QUANTITY",
];

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("es-NI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CountCell({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-medium text-foreground">{value}</span>;
}

function SupervisionSummary({
  byClass,
  selfAuthorizedTotal,
  total,
}: {
  byClass: SupervisionReviewClassCount[];
  selfAuthorizedTotal: number;
  total: number;
}) {
  const counts = new Map(byClass.map((entry) => [entry.flow, entry]));
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Operaciones sensibles firmadas en el período
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground">
          {total}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            en total
          </span>
        </p>
        <p className="mt-2 text-sm text-foreground">
          {selfAuthorizedTotal === 0
            ? "Ninguna la firmó el propio operador: todas tuvieron la firma de un supervisor."
            : `${selfAuthorizedTotal} la firmó el propio operador, sin supervisor presente.`}
        </p>
      </div>
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Resumen por operación"
      >
        {FLOW_ORDER.map((flow) => {
          const entry = counts.get(flow);
          return (
            <div key={flow} className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {supervisionFlowLabels[flow]}
              </p>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Con supervisor</dt>
                  <dd>
                    <CountCell value={entry?.supervised ?? 0} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Por el operador</dt>
                  <dd>
                    <CountCell value={entry?.selfAuthorized ?? 0} />
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewRow({ entry }: { entry: SupervisionReviewEntry }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {formatWhen(entry.occurredAt)}
      </td>
      <td className="px-3 py-2 text-sm text-foreground">
        {supervisionFlowLabels[entry.flow]}
      </td>
      <td className="px-3 py-2 text-sm text-foreground">
        {entry.actorEmail ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-foreground">
        {entry.hadSupervisor
          ? (entry.authorizerEmail ?? "Un supervisor")
          : "El propio operador"}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {entry.method ? (credentialMethodLabels[entry.method] ?? entry.method) : "—"}
      </td>
    </tr>
  );
}

interface SupervisionReviewPanelProps {
  isLoading: boolean;
  error: unknown;
  total: number;
  selfAuthorizedTotal: number;
  byClass: SupervisionReviewClassCount[];
  entries: SupervisionReviewEntry[];
  truncated: boolean;
  onRetry: () => void;
}

export function SupervisionReviewPanel({
  isLoading,
  error,
  total,
  selfAuthorizedTotal,
  byClass,
  entries,
  truncated,
  onRetry,
}: SupervisionReviewPanelProps) {
  if (isLoading) {
    return <LoadingState message="Cargando la revisión de supervisiones..." />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            {getApiErrorMessage(
              error,
              "No pudimos cargar la revisión de supervisiones. Los registros de sus terminales no se vio afectados.",
            )}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reintentar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="supervision-review-empty">
        En este período no se firmó ninguna operación sensible.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SupervisionSummary
        byClass={byClass}
        selfAuthorizedTotal={selfAuthorizedTotal}
        total={total}
      />

      {truncated && (
        <p className="text-xs text-muted-foreground" role="status">
          Se muestran las primeras {entries.length} de {total} operaciones del
          período. Acorte el rango de fechas para ver el resto.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left">
          <caption className="sr-only">
            Operaciones sensibles firmadas en el período, con quién las firmó
            y con qué credencial
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Cuándo
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Operación
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Quién operó
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Quién firmó
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Credencial
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <ReviewRow
                key={`${entry.occurredAt}-${entry.action}-${entry.deviceId}`}
                entry={entry}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
