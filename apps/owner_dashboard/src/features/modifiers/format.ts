/** Shared display helpers for the modifiers screens. */

/**
 * Human-readable selection rule: "Obligatorio 1/1" when at least one
 * selection is required, "Opcional 0/3" when the customer may skip it.
 */
export function formatSelectionRange(
  minSelected: number,
  maxSelected: number,
): string {
  return minSelected >= 1
    ? `Obligatorio ${minSelected}/${maxSelected}`
    : `Opcional 0/${maxSelected}`;
}
