import { resolveDeviations } from './modifier-deviation-resolver';
import type { CreateModifierDto } from '../sales/dto/sync-invoice.dto';

/**
 * R28 / M4 — the cloud's mirror of the terminal's deviation resolver.
 *
 * The two sides must agree, or the comparison the cloud performs is
 * meaningless: the terminal's demand and the cloud's recomputation are only
 * comparable when the ALGORITHM is the same. These specs pin the same
 * cases the POS's resolver specs pin, on the cloud's side.
 */
describe('resolveDeviations (cloud mirror, R28/M4)', () => {
  const leaves = [
    {
      insumoId: 'ins-cafe',
      quantityPerSaleUnit: 18,
      rootComponentId: 'cmp-cafe',
    },
    {
      insumoId: 'ins-leche',
      quantityPerSaleUnit: 150,
      rootComponentId: 'cmp-leche',
    },
  ];
  const rootComponents = [
    { id: 'cmp-cafe', insumoId: 'ins-cafe', quantityPerSaleUnit: 18 },
    { id: 'cmp-leche', insumoId: 'ins-leche', quantityPerSaleUnit: 150 },
  ];
  const tenantInsumosById = new Map([
    ['ins-cafe', { id: 'ins-cafe', consumptionUom: 'G', isActive: true }],
    ['ins-leche', { id: 'ins-leche', consumptionUom: 'ML', isActive: true }],
    [
      'ins-almendras',
      { id: 'ins-almendras', consumptionUom: 'ML', isActive: true },
    ],
  ]);

  const modifier = (
    overrides: Partial<CreateModifierDto>,
  ): CreateModifierDto => ({
    name: 'Extra',
    extraPrice: 10,
    ...overrides,
  });

  it('herits the recipe quantity for an ADD (D2)', () => {
    const resolution = resolveDeviations({
      leaves,
      rootComponents,
      tenantInsumosById,
      modifiers: [
        modifier({
          optionId: 'opt-shot',
          inventoryEffect: 'ADD',
          effectInsumoId: 'ins-cafe',
          effectTargetInsumoId: 'ins-cafe',
        }),
      ],
    });

    expect(resolution.demand.get('ins-cafe')).toBe(36);
    expect(resolution.demand.get('ins-leche')).toBe(150);
    expect(resolution.outcomes[0].applied).toBe(true);
  });

  it("takes the operator's marked quantity over the inherited one", () => {
    const resolution = resolveDeviations({
      leaves,
      rootComponents,
      tenantInsumosById,
      modifiers: [
        modifier({
          optionId: 'opt-shot',
          inventoryEffect: 'ADD',
          effectInsumoId: 'ins-cafe',
          effectTargetInsumoId: 'ins-cafe',
          effectQuantity: 9,
        }),
      ],
    });

    expect(resolution.demand.get('ins-cafe')).toBe(27);
  });

  it('restocks the replaced component and deducts the substitute (SWAP)', () => {
    const resolution = resolveDeviations({
      leaves,
      rootComponents,
      tenantInsumosById,
      modifiers: [
        modifier({
          optionId: 'opt-almendras',
          inventoryEffect: 'SWAP',
          effectTargetInsumoId: 'ins-leche',
          effectInsumoId: 'ins-almendras',
        }),
      ],
    });

    // The whole milk is NOT consumed: the customer received almond milk.
    expect(resolution.demand.get('ins-leche')).toBeUndefined();
    expect(resolution.demand.get('ins-almendras')).toBe(150);
  });

  it('removes the component and scales it', () => {
    const removed = resolveDeviations({
      leaves,
      rootComponents,
      tenantInsumosById,
      modifiers: [
        modifier({
          optionId: 'opt-sin-cebolla',
          inventoryEffect: 'REMOVE',
          effectTargetInsumoId: 'ins-leche',
        }),
      ],
    });
    expect(removed.demand.get('ins-leche')).toBeUndefined();

    const scaled = resolveDeviations({
      leaves,
      rootComponents,
      tenantInsumosById,
      modifiers: [
        modifier({
          optionId: 'opt-doble',
          inventoryEffect: 'SCALE',
          effectTargetInsumoId: 'ins-cafe',
          effectFactor: 2,
        }),
      ],
    });
    expect(scaled.demand.get('ins-cafe')).toBe(36);
  });

  describe('the SOHO guarantee (D6): an effect NEVER blocks the sale', () => {
    it('an insumo the company has not registered is NO_IMPACT', () => {
      const resolution = resolveDeviations({
        leaves,
        rootComponents,
        tenantInsumosById,
        modifiers: [
          modifier({
            optionId: 'opt-almendras',
            inventoryEffect: 'SWAP',
            effectTargetInsumoId: 'ins-leche',
            effectInsumoId: 'ins-que-no-existe',
          }),
        ],
      });

      // The demand is the recipe's: the swap did not apply.
      expect(resolution.demand.get('ins-leche')).toBe(150);
      expect(resolution.outcomes[0].applied).toBe(false);
      expect(resolution.outcomes[0].skipReason).toBe('INSUMSO_NOT_IN_CATALOG');
    });

    it('a quantity inherited across units does not apply', () => {
      const resolution = resolveDeviations({
        leaves,
        rootComponents,
        tenantInsumosById: new Map([
          ...tenantInsumosById,
          [
            'ins-almendras',
            { id: 'ins-almendras', consumptionUom: 'L', isActive: true },
          ],
        ]),
        modifiers: [
          modifier({
            optionId: 'opt-almendras',
            inventoryEffect: 'SWAP',
            effectTargetInsumoId: 'ins-leche',
            effectInsumoId: 'ins-almendras',
          }),
        ],
      });

      expect(resolution.demand.get('ins-leche')).toBe(150);
      expect(resolution.outcomes[0].skipReason).toBe('UNIT_MISMATCH');
    });

    it('a component the recipe does not have is ignored', () => {
      const resolution = resolveDeviations({
        leaves,
        rootComponents,
        tenantInsumosById,
        modifiers: [
          modifier({
            optionId: 'opt-sin-cebolla',
            inventoryEffect: 'REMOVE',
            effectTargetInsumoId: 'ins-cebolla',
          }),
        ],
      });

      expect(resolution.demand.get('ins-cafe')).toBe(18);
      expect(resolution.outcomes[0].skipReason).toBe('COMPONENT_NOT_IN_RECIPE');
    });

    it('a price-only modifier changes nothing', () => {
      const resolution = resolveDeviations({
        leaves,
        rootComponents,
        tenantInsumosById,
        modifiers: [modifier({ name: 'Extra shot', extraPrice: 15 })],
      });

      expect(resolution.demand.get('ins-cafe')).toBe(18);
      expect(resolution.outcomes).toHaveLength(0);
    });
  });
});
