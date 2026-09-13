import { useState } from "react";
import { FiscalSetupForm } from "./fiscal-setup-form";
import { IndustryTemplatesList } from "./industry-templates-list";
import { BulkImportWizard } from "./bulk-import-wizard";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { Landmark, Sparkles, FileSpreadsheet, Settings, Store } from "lucide-react";

export type SettingsTab = "setup" | "fiscal" | "templates" | "import";

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

export function SettingsPage({ initialTab = "fiscal" }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

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
      <div className="flex border-b border-border space-x-2" role="tablist" aria-label="Secciones de Configuración">
        <button
          role="tab"
          aria-selected={activeTab === "setup"}
          data-testid="tab-setup"
          onClick={() => setActiveTab("setup")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer ${
            activeTab === "setup"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <Store className="h-4 w-4" />
          Setup Center (M2)
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "fiscal"}
          data-testid="tab-fiscal"
          onClick={() => setActiveTab("fiscal")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer ${
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
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer ${
            activeTab === "templates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Plantillas de Industria
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "import"}
          data-testid="tab-import"
          onClick={() => setActiveTab("import")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer ${
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
            <SetupCenterView onNavigateToTab={(tab) => setActiveTab(tab)} />
          </div>
        )}

        {activeTab === "fiscal" && (
          <div role="tabpanel" data-testid="tabpanel-fiscal">
            <FiscalSetupForm />
          </div>
        )}

        {activeTab === "templates" && (
          <div role="tabpanel" data-testid="tabpanel-templates">
            <IndustryTemplatesList />
          </div>
        )}

        {activeTab === "import" && (
          <div role="tabpanel" data-testid="tabpanel-import">
            <BulkImportWizard />
          </div>
        )}
      </div>
    </div>
  );
}
