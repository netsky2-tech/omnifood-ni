import { useState } from "react";
import {
  useOnboardingSession,
  useOnboardingCatalogSummary,
} from "./use-onboarding";
import { isVersionConflictError } from "./onboarding-api";
import { OnboardingLifecycleState, type OnboardingStepKey } from "./types";
import { CatalogAcquisitionModal } from "./catalog-acquisition-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Store,
  FileSpreadsheet,
  Sparkles,
  Landmark,
  ShieldCheck,
  Zap,
  Layers,
  History,
  Info,
  Package,
} from "lucide-react";

interface SetupCenterViewProps {
  onNavigateToTab?: (tab: "fiscal" | "templates" | "import") => void;
}

export function SetupCenterView({ onNavigateToTab }: SetupCenterViewProps) {
  const { session, readiness, progress, isLoading, isError, error, refetch, isFetching } =
    useOnboardingSession();
  const { data: catalogSummary } = useOnboardingCatalogSummary();

  const [catalogModalOpen, setCatalogModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        data-testid="setup-center-loading"
        className="flex flex-col items-center justify-center p-12 space-y-4 text-muted-foreground"
      >
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Cargando estado del Setup Center...</p>
      </div>
    );
  }

  if (isError && isVersionConflictError(error)) {
    return (
      <div className="space-y-6" data-testid="version-conflict-banner">
        <Alert variant="destructive" className="border-amber-500 bg-amber-50/20 text-amber-900">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-amber-800">
            Conflicto de concurrencia detectado (VERSION_CONFLICT)
          </AlertTitle>
          <AlertDescription className="space-y-3 mt-2 text-sm text-amber-800/90">
            <p>
              La sesión de onboarding fue actualizada concurrentemente desde otra pestaña, dispositivo
              o por soporte asistido.
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                data-testid="reconcile-session-button"
                onClick={() => refetch()}
                className="flex items-center gap-2 border-amber-600 text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Recargar y reconciliar sesión
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error al consultar sesión de Onboarding</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>{error instanceof Error ? error.message : "Error desconocido"}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getLifecycleBadgeVariant = (state: OnboardingLifecycleState) => {
    switch (state) {
      case OnboardingLifecycleState.ACTIVATED:
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case OnboardingLifecycleState.SALE_READY:
        return "bg-blue-100 text-blue-800 border-blue-300";
      case OnboardingLifecycleState.ACTIVATION_IN_PROGRESS:
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      default:
        return "bg-amber-100 text-amber-800 border-amber-300";
    }
  };

  const handleStepAction = (actionKey: OnboardingStepKey) => {
    if (actionKey === "catalog") {
      setCatalogModalOpen(true);
      return;
    }
    if (onNavigateToTab) {
      if (actionKey === "fiscal") onNavigateToTab("fiscal");
    }
  };

  return (
    <div className="space-y-6" data-testid="setup-center-view">
      {/* Header & Lifecycle State */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border rounded-lg p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Store className="h-6 w-6 text-primary" />
              Setup Center & Activación
            </h2>
            <Badge
              variant="outline"
              data-testid="lifecycle-badge"
              className={`font-semibold uppercase tracking-wider text-xs px-2.5 py-0.5 border ${getLifecycleBadgeVariant(
                progress.currentLifecycle,
              )}`}
            >
              {progress.currentLifecycle}
            </Badge>
            <Badge variant="secondary" data-testid="optimistic-version-badge" className="font-mono text-xs">
              v{progress.optimisticVersion}
            </Badge>
            {progress.isLegacyBaseline && (
              <Badge
                data-testid="legacy-baseline-badge"
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 text-xs"
              >
                <History className="h-3 w-3" />
                Tenant Histórico (Sin métrica TTFSS)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Control de preparación operativa de tu negocio para operar en caja registradora POS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{progress.percentage}% Completado</div>
            <div className="text-xs text-muted-foreground">
              {progress.completedStepsCount} de {progress.totalStepsCount} pasos listos
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5"
            title="Sincronizar con backend"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Next Recommended Action Banner */}
      <Card data-testid="next-recommended-action" className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Próxima Acción Recomendada: {progress.nextRecommendedAction.label}
              </CardTitle>
            </div>
            {progress.isSaleReady && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                ¡Listo para Venta (SALE_READY)!
              </Badge>
            )}
          </div>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            {progress.nextRecommendedAction.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            {progress.nextRecommendedAction.actionKey === "fiscal" && (
              <Button
                size="sm"
                onClick={() => handleStepAction("fiscal")}
                className="flex items-center gap-2"
              >
                <Landmark className="h-4 w-4" />
                Ir a Configuración Fiscal
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {progress.nextRecommendedAction.actionKey === "catalog" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setCatalogModalOpen(true)}
                  className="flex items-center gap-2"
                  data-testid="open-catalog-acquisition-btn"
                >
                  <Sparkles className="h-4 w-4" />
                  Adquirir Catálogo (Plantilla / CSV / Manual)
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {progress.nextRecommendedAction.actionKey === "activation" && (
              <Button
                size="sm"
                variant="default"
                disabled={!progress.isSaleReady}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                <Store className="h-4 w-4" />
                Iniciar Terminal POS Físico
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Readiness Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progress.steps.map((step) => {
          const isDone = step.status === "COMPLETED";
          const isBlocked = step.status === "BLOCKED";
          const inProgress = step.status === "IN_PROGRESS";

          return (
            <Card
              key={step.key}
              data-testid={`step-${step.key}`}
              className={`border transition-all ${
                isDone
                  ? "border-emerald-200 bg-emerald-50/20"
                  : inProgress
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border/60 bg-muted/20 opacity-80"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : inProgress ? (
                      <Clock className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                    {step.title}
                  </CardTitle>
                  <Badge
                    variant={isDone ? "outline" : inProgress ? "default" : "secondary"}
                    className={
                      isDone
                        ? "border-emerald-400 text-emerald-700 bg-emerald-50 text-xs font-semibold"
                        : inProgress
                        ? "bg-primary text-primary-foreground text-xs"
                        : "text-muted-foreground text-xs"
                    }
                  >
                    {step.actionLabel}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  {step.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {step.blockers.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {step.blockers.map((b) => (
                      <div
                        key={b}
                        className="text-xs font-mono text-amber-700 bg-amber-50 p-1.5 rounded flex items-center gap-1.5"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                  {/* Step CTA */}
                  <div className="flex items-center justify-between">
                    {step.key === "catalog" && (
                      <span className="text-[11px] text-muted-foreground">
                        {catalogSummary?.sellableProductCount
                          ? `${catalogSummary.sellableProductCount} producto(s) vendible(s)`
                          : "Sin productos aún"}
                      </span>
                    )}
                    <div className="flex justify-end gap-2 ml-auto">
                      {step.key === "fiscal" && !isDone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStepAction("fiscal")}
                          className="text-xs flex items-center gap-1.5"
                          data-testid="configure-fiscal-btn"
                        >
                          <Landmark className="h-3.5 w-3.5" />
                          Configurar Fiscal
                        </Button>
                      )}
                      {step.key === "catalog" && (
                        <Button
                          size="sm"
                          variant={isDone ? "ghost" : "outline"}
                          onClick={() => setCatalogModalOpen(true)}
                          className="text-xs flex items-center gap-1.5"
                          data-testid="catalog-step-action-btn"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {isDone ? "+ Agregar Más" : "Adquirir Catálogo"}
                        </Button>
                      )}
                      {step.key === "activation" && isDone && (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                          Terminal Operativo
                        </Badge>
                      )}
                    </div>
                  </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sale Ready Review & Operational Explainability (AC-27, AC-28) */}
      {progress.isSaleReady && (
        <Card className="border-emerald-500/40 bg-emerald-50/20" data-testid="sale-ready-review-card">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Evaluación de Preparación para Venta (SALE_READY)
              </CardTitle>
              <Badge className="bg-emerald-600 text-white text-[10px]">Criterios Mínimos Cumplidos</Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Tu comercio cumple todos los requisitos normativos para abrir caja y emitir facturas en el terminal POS.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-2 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Identidad de Propietario (OWNER único suficiente, AC-26)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Configuración Fiscal DGI Mínima (AC-04)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Catálogo Vendible Activo con Precio (AC-06)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2 text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>BOH (Stock/Recetas/Costos): Opcional no bloqueante (AC-07, AC-08)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Blockers & Readiness Details */}
      {progress.blockers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Bloqueadores Activos para Venta (SALE_READY)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 text-xs font-mono space-y-1 text-amber-800">
            {progress.blockers.map((blocker) => (
              <div key={blocker} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{blocker}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unified Catalog Acquisition Modal */}
      <CatalogAcquisitionModal
        open={catalogModalOpen}
        onOpenChange={setCatalogModalOpen}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}
