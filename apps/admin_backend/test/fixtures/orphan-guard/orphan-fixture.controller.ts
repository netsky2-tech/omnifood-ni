import { Controller, Get } from '@nestjs/common';

/**
 * Deliberately unregistered positive control for the orphan guard (issue #829).
 *
 * `enumerateAppRoutes` walks the module graph, so a controller that is never
 * registered in any module produces no routes and is invisible to every
 * served-route rule. Only the SOURCE scan (`scanSourceControllerClasses`) can
 * see such a dead controller — and the zero-orphans rule in
 * `src/core/http/route-transport-registry.spec.ts` is only as alive as that
 * scan. If the scan ever returns an empty list for the wrong reason (path
 * change, filter regression, early return), `expect(orphans).toEqual([])` stays
 * green and the guard quietly stops protecting anything.
 *
 * This file is the control: a real `@Controller` class that no module registers,
 * on purpose. The spec points the detector at this directory and requires it to
 * report this class with `served: false, declared: false`.
 *
 * Do not register it in a module. Do not import it anywhere. Do not delete it
 * without replacing the positive control with an equivalent one.
 */
@Controller('orphan-fixture')
export class OrphanFixtureController {
  @Get()
  unreachable(): string {
    return 'this route can never be served';
  }
}
