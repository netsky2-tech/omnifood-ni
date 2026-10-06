import { z } from "zod";

/**
 * Form schemas mirroring the backend validation rules, with friendly
 * Spanish messages. price_delta deliberately has NO minimum: discount
 * options ("sin cebolla") are legitimate, so negative values are valid.
 */
export const modifierOptionFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la opción es requerido"),
  price_delta: z.coerce.number().refine((value) => Number.isFinite(value), {
    message: "Ingrese un precio válido",
  }),
  is_default: z.boolean(),
  sort_order: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(0, "El orden no puede ser negativo"),
});

export const modifierGroupFormSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido"),
    min_selected: z.coerce
      .number({ invalid_type_error: "Ingrese un número válido" })
      .int("Debe ser un número entero")
      .min(0, "El mínimo no puede ser negativo"),
    max_selected: z.coerce
      .number({ invalid_type_error: "Ingrese un número válido" })
      .int("Debe ser un número entero")
      .min(1, "El máximo debe ser al menos 1"),
    allow_quantities: z.boolean(),
    sort_order: z.coerce
      .number({ invalid_type_error: "Ingrese un número válido" })
      .int("Debe ser un número entero"),
  })
  .refine((data) => data.max_selected >= data.min_selected, {
    message: "El máximo no puede ser menor que el mínimo",
    path: ["max_selected"],
  });

export type ModifierGroupFormData = z.infer<typeof modifierGroupFormSchema>;
export type ModifierOptionFormData = z.infer<typeof modifierOptionFormSchema>;
