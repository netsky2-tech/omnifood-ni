import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { premiumLockedMessage } from "./premium-locked-message";

/**
 * Plan/add-on that unlocks each capability, per the pricing catalog §4/§5:
 * Operación includes one pack, Pro includes both packs; Marketing and
 * Inteligencia are separate bundles.
 */
const CAPABILITY_UNLOCK_DEFAULTS: Record<string, string> = {
  promotions: "el bundle Marketing (incluido en Operación y Pro)",
  "promotions.convenio": "el bundle Marketing",
  loyalty: "el bundle Marketing (incluido en Operación y Pro)",
  "inventory.retail": "el pack Retail (incluido en Operación y Pro)",
  "inventory.cooking": "el pack Cocina (incluido en Operación y Pro)",
  "reports.margins": "el bundle Inteligencia (incluido en Pro)",
};

interface PremiumLockedProps {
  /** The capability key the tenant is missing (e.g. "inventory.retail"). */
  capability: string;
  /** Human feature name shown in the title, e.g. "Fidelización". */
  featureName?: string;
  /** Optional override of the plan/add-on descriptor. */
  unlockedBy?: string;
  className?: string;
}

/**
 * Upgrade state for premium features (ENT-05b, spec S6): a clear "upgrade
 * your plan" message instead of a cryptic API error. Reuses the existing UI
 * primitives; it never replaces the role RBAC unauthorized state.
 */
export function PremiumLocked({
  capability,
  featureName,
  unlockedBy,
  className,
}: PremiumLockedProps) {
  const unlockDescriptor =
    unlockedBy ?? CAPABILITY_UNLOCK_DEFAULTS[capability] ?? "un plan superior";

  return (
    <EmptyState
      className={className}
      icon={<Lock className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />}
      title={
        featureName
          ? `${featureName} no está disponible en su plan actual`
          : "Función no disponible en su plan actual"
      }
      description={premiumLockedMessage(capability)}
      action={
        <Alert variant="warning" className="max-w-md text-left">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Se habilita al actualizar su plan</AlertTitle>
          <AlertDescription>
            Esta función se incluye en {unlockDescriptor}.
          </AlertDescription>
        </Alert>
      }
    />
  );
}
