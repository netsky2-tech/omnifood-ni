import { useState, useCallback } from "react";
import { FiscalSetupForm } from "./fiscal-setup-form";
import { CompanyLogoCard } from "./company-logo-card";
import { IndustryTemplatesList } from "./industry-templates-list";
import { BulkImportWizard } from "./bulk-import-wizard";
import { MenuImportWizard } from "./menu-import-wizard";
import { SupervisionPolicyCard } from "@/features/supervision/supervision-policy-card";
import { AppPermission } from "@/features/users/types";
import { useHasPermission } from "@/features/users/use-has-permission";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { Landmark, Sparkles, FileSpreadsheet, Settings, Store, ShieldCheck } from "lucide-react";

export type SettingsTab = "setup" | "fiscal" | "templates" | "import" | "supervision";

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

const VALID_TABS: SettingsTab[] = [
  "setup",
  "fiscal",
  "templates",
  "import",
  "supervision",
];

function tabFromSearchParams(sp: URLSearchParams, fallback: SettingsTab): SettingsTab {
  const tab = sp.get("tab") as SettingsTab | null;
  if (tab && VALID_TABS.includes(tab)) return tab;
  return fallback;
}

export function SettingsPage({ initialTab = "setup" }: SettingsPageProps) {
  // The supervision policy is a control configuration: a user who may not
  // change it never sees the tab (the standard forbids permission
  // placeholders, and an empty tab is a dead end).
  const canConfigureSupervision = useHasPermission(
    AppPermission.SUPERVISION_CONFIGURE,
  );
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => tabFromSearchParams(searchParams, initialTab));

  const handleTabChange = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("tab", tab);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configuración & Onboarding
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestión del ciclo de vida de Onboarding, régimen fiscal DGI, plantillas de catálogo y carga masiva.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-border space-x-2 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Secciones de Configuración">
        <button
          role="tab"
          aria-selected={activeTab === "setup"}
          data-testid="tab-setup"
          onClick={() => handleTabChange("setup")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t ${
            activeTab === "setup"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <Store className="h-4 w-4" />
          Centro de Configuración
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "fiscal"}
          data-testid="tab-fiscal"
          onClick={() => handleTabChange("fiscal")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t ${
            activeTab === "fiscal"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <Landmark className="h-4 w-4" />
          Régimen Fiscal (DGI)
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "templates"}
          data-testid="tab-templates"
          onClick={() => handleTabChange("templates")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t ${
            activeTab === "templates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Plantillas de Industria
        </button>

        {canConfigureSupervision && (
        <button
          role="tab"
          aria-selected={activeTab === "supervision"}
          data-testid="tab-supervision"
          onClick={() => handleTabChange("supervision")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t ${
            activeTab === "supervision"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          Supervisión
        </button>
        )}

        <button
          role="tab"
          aria-selected={activeTab === "import"}
          data-testid="tab-import"
          onClick={() => handleTabChange("import")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t ${
            activeTab === "import"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Carga Masiva (Staging)
        </button>
      </div>

      {/* Tab Panels */}
      <div className="mt-4">
        {activeTab === "setup" && (
          <div role="tabpanel" data-testid="tabpanel-setup">
            <SetupCenterView onNavigateToTab={(tab) => handleTabChange(tab)} />
          </div>
        )}

        {activeTab === "fiscal" && (
          <div role="tabpanel" data-testid="tabpanel-fiscal" className="space-y-6">
            {/* P3 slice 1: the company logo lives beside the identity the
                fiscal form already owns — one identity, one place. */}
            <CompanyLogoCard />
            <FiscalSetupForm />
          </div>
        )}

        {activeTab === "supervision" && canConfigureSupervision && (
          <div role="tabpanel" data-testid="tabpanel-supervision" className="space-y-6">
            {/* The tenant's supervision policy: who may authorize a sensitive
                operation here, and which flows accept a self-authorization. */}
            <SupervisionPolicyCard />
          </div>
        )}

        {activeTab === "templates" && (
          <div role="tabpanel" data-testid="tabpanel-templates">
            <IndustryTemplatesList />
          </div>
        )}

        {activeTab === "import" && (
          <div role="tabpanel" data-testid="tabpanel-import" className="space-y-6">
            <MenuImportWizard />
            <BulkImportWizard />
          </div>
        )}
      </div>
    </div>
  );
}
