import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOnboardingSession,
  fetchOnboardingReadiness,
  startOnboardingSession,
  createManualOnboardingProduct,
  fetchOnboardingCatalogSummary,
} from "./onboarding-api";
import {
  OnboardingLifecycleState,
  type OnboardingSession,
  type OnboardingReadinessSnapshot,
  type OnboardingStep,
  type SetupCenterProgress,
  type CreateManualProductDto,
} from "./types";

export const onboardingKeys = {
  all: ["onboarding"] as const,
  session: () => [...onboardingKeys.all, "session"] as const,
  readiness: () => [...onboardingKeys.all, "readiness"] as const,
  catalogSummary: () => [...onboardingKeys.all, "catalog-summary"] as const,
};

export function calculateSetupCenterProgress(
  session?: OnboardingSession | null,
  readiness?: OnboardingReadinessSnapshot | null,
): SetupCenterProgress {
  const currentLifecycle =
    session?.lifecycleState ?? OnboardingLifecycleState.PROVISIONED;
  const isLegacyBaseline = session?.legacyBaseline ?? false;
  const isMeasurementEligible = session?.measurementEligible ?? true;
  const saleReadyFirstAt = session?.saleReadyFirstAt ?? null;
  const optimisticVersion = session?.optimisticVersion ?? 1;

  const identityReady =
    Boolean(readiness?.identity.tenantExists) &&
    Boolean(readiness?.identity.initialOwnerExists) &&
    Boolean(readiness?.identity.ownerCanAuthenticate);

  const fiscalReady = Boolean(readiness?.fiscal.minimumConfigurationValid);
  const catalogReady = (readiness?.catalog.sellableProductCount ?? 0) >= 1;
  const isSaleReady = Boolean(readiness?.saleReady);
  const isActivated = currentLifecycle === OnboardingLifecycleState.ACTIVATED;
  const isActivating = currentLifecycle === OnboardingLifecycleState.ACTIVATION_IN_PROGRESS;

  const steps: OnboardingStep[] = [
    {
      key: "identity",
      title: "1. Identidad & Propietario",
      description: "Provisionamiento del tenant y validación del usuario propietario.",
      status: identityReady ? "COMPLETED" : "BLOCKED",
      isRequired: true,
      blockers: identityReady ? [] : (readiness?.blockers.filter((b) => b.startsWith("IDENTITY")) ?? []),
      actionKey: "identity",
      actionLabel: identityReady ? "Verificado" : "Verificar Cuenta",
    },
    {
      key: "fiscal",
      title: "2. Régimen Fiscal DGI",
      description: "Régimen tributario (Cuota Fija / Régimen General), RUC y razón social.",
      status: fiscalReady ? "COMPLETED" : "IN_PROGRESS",
      isRequired: true,
      blockers: fiscalReady ? [] : (readiness?.blockers.filter((b) => b.startsWith("FISCAL")) ?? []),
      actionKey: "fiscal",
      actionLabel: fiscalReady ? "Configurado" : "Configurar Fiscal",
    },
    {
      key: "catalog",
      title: "3. Catálogo de Productos Vendibles",
      description: "Mínimo 1 producto con precio para poder operar la caja registradora.",
      status: catalogReady ? "COMPLETED" : "IN_PROGRESS",
      isRequired: true,
      blockers: catalogReady ? [] : (readiness?.blockers.filter((b) => b.startsWith("CATALOG")) ?? []),
      actionKey: "catalog",
      actionLabel: catalogReady ? "Listo" : "Cargar Productos",
    },
    {
      key: "activation",
      title: "4. Activación de Terminal POS",
      description: "Sincronización inicial del terminal offline-first y primera venta exitosa.",
      status: isActivated
        ? "COMPLETED"
        : isActivating || isSaleReady
        ? "IN_PROGRESS"
        : "BLOCKED",
      isRequired: true,
      blockers: isSaleReady ? [] : ["PREREQUISITES_NOT_MET"],
      actionKey: "activation",
      actionLabel: isActivated ? "Activado" : isSaleReady ? "Activar POS" : "Bloqueado",
    },
  ];

  const completedStepsCount = steps.filter((s) => s.status === "COMPLETED").length;
  const totalStepsCount = steps.length;
  const percentage = Math.round((completedStepsCount / totalStepsCount) * 100);

  let nextRecommendedAction: SetupCenterProgress["nextRecommendedAction"];

  if (!identityReady) {
    nextRecommendedAction = {
      actionKey: "identity",
      label: "Verificar Identidad",
      description: "Es necesario confirmar el tenant y el usuario propietario inicial.",
    };
  } else if (!fiscalReady) {
    nextRecommendedAction = {
      actionKey: "fiscal",
      label: "Configurar Régimen Fiscal",
      description: "Completá el régimen tributario y datos de facturación para habilitar ventas.",
    };
  } else if (!catalogReady) {
    nextRecommendedAction = {
      actionKey: "catalog",
      label: "Cargar Primer Producto",
      description: "Agregá productos vendibles mediante plantillas o carga masiva.",
    };
  } else if (!isActivated) {
    nextRecommendedAction = {
      actionKey: "activation",
      label: "Activar Terminal POS",
      description: "Tu negocio es SALE_READY. Iniciá sesión en el terminal POS para finalizar la activación.",
    };
  } else {
    nextRecommendedAction = {
      actionKey: "activation",
      label: "Onboarding Completado",
      description: "Operación activa. Podés continuar enriqueciendo recetas e inventario BOH.",
    };
  }

  return {
    currentLifecycle,
    steps,
    completedStepsCount,
    totalStepsCount,
    percentage,
    nextRecommendedAction,
    isSaleReady,
    isLegacyBaseline,
    isMeasurementEligible,
    saleReadyFirstAt,
    optimisticVersion,
    blockers: readiness?.blockers ?? [],
    warnings: readiness?.warnings ?? [],
  };
}

export function useOnboardingSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: onboardingKeys.session(),
    queryFn: fetchOnboardingSession,
    staleTime: 10_000,
  });

  const progress = calculateSetupCenterProgress(
    query.data?.session,
    query.data?.readiness,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: onboardingKeys.all });

  return {
    ...query,
    session: query.data?.session,
    readiness: query.data?.readiness,
    progress,
    invalidate,
  };
}

export function useOnboardingReadiness() {
  return useQuery({
    queryKey: onboardingKeys.readiness(),
    queryFn: fetchOnboardingReadiness,
    staleTime: 10_000,
  });
}

export function useStartOnboardingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (source?: string) => startOnboardingSession(source),
    onSuccess: (data) => {
      queryClient.setQueryData(onboardingKeys.session(), data);
      queryClient.setQueryData(onboardingKeys.readiness(), data.readiness);
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
    },
  });
}

export function useOnboardingCatalogSummary() {
  return useQuery({
    queryKey: onboardingKeys.catalogSummary(),
    queryFn: fetchOnboardingCatalogSummary,
    staleTime: 10_000,
  });
}

export function useCreateManualProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateManualProductDto) => createManualOnboardingProduct(dto),
    onSuccess: (data) => {
      queryClient.setQueryData(onboardingKeys.session(), {
        session: data.session,
        readiness: data.readiness,
      });
      queryClient.setQueryData(onboardingKeys.readiness(), data.readiness);
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
    },
  });
}
