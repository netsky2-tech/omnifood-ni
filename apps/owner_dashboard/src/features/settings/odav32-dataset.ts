import type { ImportRowDto } from "./types";

/**
 * Generates the standardized ODAV-32 acceptance scenario:
 * 1,500 rows total with exactly 20 invalid rows (negative/text prices)
 * and 1,480 valid rows.
 */
export function generateOdav32Dataset(): ImportRowDto[] {
  return Array.from({ length: 1500 }, (_, i) => {
    const isInvalid = i < 20;
    return {
      nombre: isInvalid ? `Producto Inválido #${i + 1}` : `Bebida / Alimento #${i + 1}`,
      sku: `SKU-${String(i + 1).padStart(5, "0")}`,
      precioVenta: isInvalid ? -5 : 45 + (i % 50),
      costoInsumo: isInvalid ? -1 : 15 + (i % 20),
      categoria: i % 2 === 0 ? "Bebidas" : "Comidas",
      porcentajeIva: 15,
      uom: "UN",
      stockInicial: 50,
    };
  });
}
