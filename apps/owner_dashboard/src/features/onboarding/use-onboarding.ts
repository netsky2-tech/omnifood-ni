import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOnboardingSession,
  fetchOnboardingReadiness,
  startOnboardingSession,
  createManualOnboardingProduct,
  fetchOnboardingCatalogSummary,
  startActivationAttempt,
  fetchActiveActivationAttempt,
  generateLinkingCode,
  fetchLinkingCodes,
} from "./onboarding-api";
import {
  OnboardingLifecycleState,
  type OnboardingSession,
  type OnboardingReadinessSnapshot,
  type OnboardingStep,
  type SetupCenterProgress,
  type CreateManualProductDto,
  type StartActivationDto,
} from "./types";

import { getActiveTenantId } from "@/lib/tenant";

export const onboardingKeys = {
  all: ["onboarding"] as const,
  session: (tenantId?: string) => ["onboarding", tenantId ?? getActiveTenantId(), "session"] as const,
  readiness: (tenantId?: string) => ["onboarding", tenantId ?? getActiveTenantId(), "readiness"] as const,
  catalogSummary: (tenantId?: string) => ["onboarding", tenantId ?? getActiveTenantId(), "catalog-summary"] as const,
  activationAttempt: (tenantId?: string) => ["onboarding", tenantId ?? getActiveTenantId(), "activation-attempt"] as const,
  linkingCodes: (tenantId?: string) => ["onboarding", tenantId ?? getActiveTenantId(), "linking-codes"] as const,
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
      description: "Tu negocio está listo para vender. Iniciá sesión en la terminal POS para completar la activación.",
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
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

function generateActivationIdempotencyKey(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `activation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useActiveActivationAttempt() {
  return useQuery({
    queryKey: onboardingKeys.activationAttempt(),
    queryFn: fetchActiveActivationAttempt,
    staleTime: 10_000,
  });
}

/**
 * Polls the tenant's linking codes every 5 seconds (issue #569 single
 * linking flow): the owner generates a code and keeps this view open; when
 * the POS claims the code the status flips ACTIVE -> CLAIMED and the setup
 * center offers one-click activation for the claimed deviceId. Polling (not
 * push) matches the offline-first reality where the POS and the dashboard
 * share no direct channel.
 */
export function useLinkingCodes() {
  return useQuery({
    queryKey: onboardingKeys.linkingCodes(),
    queryFn: fetchLinkingCodes,
    refetchInterval: 5000,
  });
}

/**
 * Creates an activation attempt for a terminal. The idempotency key is
 * generated per submission and kept stable across retries of the same
 * submission so the backend replays the existing attempt instead of failing
 * with CANNOT_START_ACTIVATION_NOT_SALE_READY. It is regenerated only after a
 * successful create or when the terminal id changes.
 */
export function useStartActivationAttempt() {
  const queryClient = useQueryClient();
  const idempotencyKeyRef = useRef<string | null>(null);
  const idempotencyTerminalIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (input: Omit<StartActivationDto, "idempotencyKey">) => {
      if (
        !idempotencyKeyRef.current ||
        idempotencyTerminalIdRef.current !== input.candidateTerminalId
      ) {
        idempotencyKeyRef.current = generateActivationIdempotencyKey();
        idempotencyTerminalIdRef.current = input.candidateTerminalId;
      }
      return startActivationAttempt({
        ...input,
        idempotencyKey: idempotencyKeyRef.current,
      });
    },
    onSuccess: () => {
      // The backend moved the session to ACTIVATION_IN_PROGRESS: cached
      // lifecycle state is stale and must be refetched.
      idempotencyKeyRef.current = null;
      idempotencyTerminalIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: onboardingKeys.session() });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.readiness() });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.activationAttempt() });
    },
  });
}

/**
 * Generates a single-use terminal linking code (issue #556 stage 12c). No
 * cache invalidation: generating a code does not change the onboarding
 * session, readiness snapshot or activation attempt state — the code is
 * ephemeral display-only data owned by the calling component.
 */
export function useGenerateLinkingCode() {
  return useMutation({
    mutationFn: () => generateLinkingCode(),
  });
}
