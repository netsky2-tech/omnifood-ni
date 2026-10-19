import { resolve } from 'path';
import { readFileSync } from 'fs';
import {
  resolveDeviations,
  type DeviationInsumo,
  type DeviationLeaf,
  type DeviationRootComponent,
} from './modifier-deviation-resolver';
import type { CreateModifierDto } from '../sales/dto/sync-invoice.dto';

/**
 * R28 / M4 — the cloud's side of the CONFORMANCE CONTRACT.
 *
 * The vectors live in `fixtures/modifier-deviation/v1/vectors.json` and are
 * executed against BOTH implementations: the terminal's resolver (the POS)
 * and this mirror. They are the same file, so the two sides cannot drift
 * apart without one of the two suites failing: the demand the cloud
 * recomputes and the demand the terminal sent are only comparable because
 * both mean the same thing.
 */

interface VectorCase {
  name: string;
  leaves: DeviationLeaf[];
  rootComponents: DeviationRootComponent[];
  tenantInsumos: DeviationInsumo[];
  modifiers: Array<Partial<CreateModifierDto>>;
  expectedDemand: Record<string, number>;
  expectedOutcomes: Array<{
    optionId: string;
    effect: string;
    applied: boolean;
    skipReason?: string;
  }>;
}

interface VectorFile {
  version: string;
  cases: VectorCase[];
}

const VECTORS_PATH = resolve(
  process.cwd(),
  '../../fixtures/modifier-deviation/v1/vectors.json',
);

const vectors: VectorFile = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));

describe('conformance of the modifier deviation (R28/M4)', () => {
  it('reads the shared contract', () => {
    expect(vectors.version).toBe('v1');
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const testCase of vectors.cases) {
    it(testCase.name, () => {
      const resolution = resolveDeviations({
        leaves: testCase.leaves,
        rootComponents: testCase.rootComponents,
        modifiers: testCase.modifiers as CreateModifierDto[],
        tenantInsumosById: new Map(
          testCase.tenantInsumos.map((insumo) => [insumo.id, insumo]),
        ),
      });

      // The demand, insumo by insumo. An insumo the deviation removed is
      // ABSENT from the map (not zero): the demand did not include it.
      const demand: Record<string, number> = {};
      for (const [insumoId, quantity] of resolution.demand.entries()) {
        demand[insumoId] = quantity;
      }
      expect(demand).toEqual(testCase.expectedDemand);

      expect(resolution.outcomes).toEqual(
        testCase.expectedOutcomes.map((outcome) => ({
          optionId: outcome.optionId,
          effect: outcome.effect,
          applied: outcome.applied,
          ...(outcome.skipReason ? { skipReason: outcome.skipReason } : {}),
        })),
      );
    });
  }
});
