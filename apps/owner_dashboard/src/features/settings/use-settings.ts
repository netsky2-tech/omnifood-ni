import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchFiscalSetup,
  updateFiscalSetup,
  fetchIndustryTemplates,
  getIndustryTemplate,
  applyIndustryTemplate,
  uploadImportBatch,
  uploadLargeDatasetInChunks,
  commitImport,
  fetchImportErrors,
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

export const SETTINGS_QUERY_KEYS = {
  fiscalSetup: ["settings", "fiscal-setup"] as const,
  templates: ["settings", "industry-templates"] as const,
  templateDetail: (code: string) => ["settings", "industry-templates", code] as const,
  importErrors: (token: string) => ["settings", "import-errors", token] as const,
};

export function useFiscalSetup() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEYS.fiscalSetup,
    queryFn: fetchFiscalSetup,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateFiscalSetup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: FiscalSetupFormValues) => updateFiscalSetup(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEYS.fiscalSetup, data);
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: "Configuración fiscal guardada",
        description: `Régimen: ${data.regime}. Aplicable a nuevas transacciones.`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al guardar configuración fiscal",
        description: err.message,
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ code, dto }: { code: string; dto?: ApplyTemplateDto }) =>
      applyIndustryTemplate(code, dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: "Plantilla aplicada con éxito",
        description: `Creados: ${result.productsCreated} productos, ${result.insumosCreated} insumos, ${result.recipesCreated} recetas.`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al aplicar plantilla",
        description: err.message,
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CommitImportDto) => commitImport(dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: "Importación completada",
        description: `Se incorporaron ${result.totalCommitted} productos al catálogo (${result.productsCreated} nuevos, ${result.productsUpdated} actualizados).`,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error al confirmar importación",
        description: err.message,
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
