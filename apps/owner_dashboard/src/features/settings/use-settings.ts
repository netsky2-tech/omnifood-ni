import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchFiscalSetup,
  updateFiscalSetup,
  fetchCompanyLogo,
  uploadCompanyLogo,
  fetchIndustryTemplates,
  getIndustryTemplate,
  applyIndustryTemplate,
  uploadImportBatch,
  uploadLargeDatasetInChunks,
  commitImport,
  fetchImportErrors,
  previewMenuImport,
  commitMenuImport,
  type ChunkedUploadOptions,
} from "./settings-api";
import type {
  FiscalSetupFormValues,
  ApplyTemplateDto,
  UploadBatchDto,
  CommitImportDto,
  ImportRowDto,
} from "./types";
import { useToast } from "@/hooks/use-toast";
import { useTenantId } from "@/lib/tenant";
import { getApiErrorMessage } from "@/lib/api-error";

export const SETTINGS_QUERY_KEYS = {
  fiscalSetup: (tenantId?: string | null) => ["settings", tenantId ?? "unknown", "fiscal-setup"] as const,
  companyLogo: (tenantId?: string | null) => ["settings", tenantId ?? "unknown", "company-logo"] as const,
  templates: ["settings", "industry-templates"] as const,
  templateDetail: (code: string) => ["settings", "industry-templates", code] as const,
  importErrors: (token: string) => ["settings", "import-errors", token] as const,
};

export function useFiscalSetup() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.fiscalSetup(tenantId),
    queryFn: ({ signal }) => fetchFiscalSetup({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateFiscalSetup() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: FiscalSetupFormValues) => updateFiscalSetup(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEYS.fiscalSetup(tenantId), data);
      queryClient.invalidateQueries({ queryKey: ["onboarding", tenantId] });
      toast({
        variant: "success",
        title: "Configuración fiscal guardada",
        description: `Régimen: ${data.regime}. Aplicable a nuevas transacciones.`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al guardar configuración fiscal",
        description: getApiErrorMessage(err, "No se pudo guardar la configuración fiscal"),
      });
    },
  });
}

// --- Company logo (company identity parity P3, slice 1) ---

export function useCompanyLogo() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.companyLogo(tenantId),
    queryFn: ({ signal }) => fetchCompanyLogo({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: { content_type: string; data: string }) =>
      uploadCompanyLogo(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEYS.companyLogo(tenantId), data);
      toast({
        variant: "success",
        title: "Logo de la empresa actualizado",
        description: "El logo se usará en los documentos formales (listas de conteo). Los terminales lo recibirán en su próxima sincronización.",
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al subir el logo",
        description: getApiErrorMessage(err, "No se pudo subir el logo. El logo anterior permanece intacto."),
      });
    },
  });
}

export function useIndustryTemplates() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.templates,
    queryFn: fetchIndustryTemplates,
    staleTime: 10 * 60 * 1000,
  });
}

export function useIndustryTemplateDetail(code: string) {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.templateDetail(code),
    queryFn: () => getIndustryTemplate(code),
    enabled: Boolean(code),
  });
}

export function useApplyIndustryTemplate() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ code, dto }: { code: string; dto?: ApplyTemplateDto }) =>
      applyIndustryTemplate(code, dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["catalog", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["onboarding", tenantId] });
      toast({
        variant: "success",
        title: "Plantilla aplicada con éxito",
        description: `Creados: ${result.productsCreated} productos, ${result.insumosCreated} insumos, ${result.recipesCreated} recetas.`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al aplicar plantilla",
        description: getApiErrorMessage(err, "No se pudo aplicar la plantilla"),
      });
    },
  });
}

export function useUploadImportBatch() {
  return useMutation({
    mutationFn: (dto: UploadBatchDto) => uploadImportBatch(dto),
  });
}

export function useUploadChunkedImport() {
  return useMutation({
    mutationFn: ({
      rows,
      options,
    }: {
      rows: ImportRowDto[];
      options?: ChunkedUploadOptions;
    }) => uploadLargeDatasetInChunks(rows, options),
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CommitImportDto) => commitImport(dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["catalog", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["onboarding", tenantId] });
      toast({
        variant: "success",
        title: "Importación completada",
        description: `Se incorporaron ${result.totalCommitted} productos al catálogo (${result.productsCreated} nuevos, ${result.productsUpdated} actualizados).`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al confirmar importación",
        description: getApiErrorMessage(err, "No se pudo confirmar la importación"),
      });
    },
  });
}

export function useImportErrors(sessionToken: string | null) {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.importErrors(sessionToken ?? ""),
    queryFn: () => fetchImportErrors(sessionToken!),
    enabled: Boolean(sessionToken),
  });
}

// --- Menu Import from Excel ---

export function useMenuImportPreview() {
  return useMutation({
    mutationFn: (fileBase64: string) => previewMenuImport(fileBase64),
  });
}

export function useMenuImportCommit() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (fileBase64: string) => commitMenuImport(fileBase64),
    onSuccess: (result) => {
      // Menu import writes products, recipes and insumos. The insumo and
      // suggestion lists live under the ['recipes', tenantId, ...] prefix
      // (insumosQueryKey / suggestionsQueryKey), so invalidating that root
      // covers all three caches.
      queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["recipes", tenantId] });
      toast({
        variant: "success",
        title: "Importación de menú completada",
        description: `${result.categories} categorías: ${result.productsToCreate} productos creados, ${result.productsToUpdate} actualizados, ${result.recipesToCreate} recetas creadas.`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al confirmar la importación de menú",
        description: getApiErrorMessage(err, "No se pudo confirmar la importación del menú"),
      });
    },
  });
}
