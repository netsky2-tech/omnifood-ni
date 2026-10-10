import { z } from "zod";

export interface RevokeDeviceFormValues {
  reason: string;
  confirmation: string;
}

/**
 * NHILoS Standard §18.2 / §18.3: Form validation for terminal revocation.
 *
 * Mandatory reason (1-255 characters, non-empty after trimming) and explicit
 * confirmation keyword "REVOCAR" required to prevent accidental deactivation.
 */
export const revokeDeviceSchema: z.ZodType<RevokeDeviceFormValues> = z.object({
  reason: z
    .string()
    .min(1, "El motivo de revocación es obligatorio.")
    .max(255, "El motivo no puede exceder los 255 caracteres.")
    .refine((v) => v.trim().length > 0, {
      message: "El motivo de revocación es obligatorio.",
    }),
  confirmation: z.string().refine((v): boolean => v === "REVOCAR", {
    message: 'Debe escribir exactamente "REVOCAR" para confirmar.',
  }),
});

