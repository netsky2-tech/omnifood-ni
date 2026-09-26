import {
  buildFounderPilotFixture,
  FOUNDER_PILOT_FIXTURE_RUC,
  isFounderPilotPlaceholderRuc,
  Q80_TERMINAL_ID,
} from './seed-onboarding-founder-pilot';
import { normalizeTenantSlug } from '../modules/tenant/tenant-slug';
import { isValidRuc } from '../modules/onboarding/utils/nicaragua-fiscal.validator';

describe('buildFounderPilotFixture', () => {
  it('creates unique ephemeral credentials for the physical Q80 terminal', () => {
    const first = buildFounderPilotFixture({});
    const second = buildFounderPilotFixture({});

    expect(first.terminalId).toBe(Q80_TERMINAL_ID);
    expect(first.owner.role).toBe('OWNER');
    expect(first.owner.email).not.toBe(second.owner.email);
    expect(first.owner.password).not.toBe(second.owner.password);
    expect(first.owner.offlinePin).toMatch(/^\d{6}$/);
  });

  it('accepts operator-supplied secrets without logging them from this helper', () => {
    const fixture = buildFounderPilotFixture({
      ONBOARDING_FOUNDER_OWNER_PASSWORD: 'provided-password',
      ONBOARDING_FOUNDER_OWNER_PIN: '123456',
    });

    expect(fixture.owner.password).toBe('provided-password');
    expect(fixture.owner.offlinePin).toBe('123456');
  });

  it('supplies a deterministic, validator-accepted fixture RUC', () => {
    const first = buildFounderPilotFixture({});
    const second = buildFounderPilotFixture({});

    expect(first.ruc).toBe(FOUNDER_PILOT_FIXTURE_RUC);
    expect(second.ruc).toBe(first.ruc);
    expect(isValidRuc(first.ruc)).toBe(true);
  });

  it('flags the built-in fixture RUC as a placeholder to be corrected', () => {
    expect(isFounderPilotPlaceholderRuc(FOUNDER_PILOT_FIXTURE_RUC)).toBe(true);
    expect(isFounderPilotPlaceholderRuc('j000-0000000000')).toBe(true);
  });

  it('does not flag an operator-supplied real RUC as a placeholder', () => {
    const fixture = buildFounderPilotFixture({
      ONBOARDING_FOUNDER_RUC: 'J0310000055555',
    });

    expect(fixture.ruc).toBe('J0310000055555');
    expect(isFounderPilotPlaceholderRuc(fixture.ruc)).toBe(false);
  });

  it('rejects an invalid operator-supplied RUC instead of seeding it', () => {
    expect(() =>
      buildFounderPilotFixture({ ONBOARDING_FOUNDER_RUC: 'CF-12345' }),
    ).toThrow(/ONBOARDING_FOUNDER_RUC/);
  });
});

describe('founder pilot tenant slug (issue #556 slice 11)', () => {
  it('derives the tenant slug from the tenant name with the canonical normalization rule', () => {
    const fixture = buildFounderPilotFixture({});

    expect(fixture.tenantSlug).toBe(normalizeTenantSlug(fixture.tenantName));
    expect(fixture.tenantSlug).toMatch(/^[a-z0-9-]+$/);
    expect(fixture.tenantSlug.length).toBeLessThanOrEqual(50);
  });

  it('honors an explicit operator slug override when provided', () => {
    const fixture = buildFounderPilotFixture({
      ONBOARDING_FOUNDER_TENANT_SLUG: 'founder-pilot-custom',
    });

    expect(fixture.tenantSlug).toBe('founder-pilot-custom');
  });

  it('rejects a malformed operator slug override', () => {
    expect(() =>
      buildFounderPilotFixture({
        ONBOARDING_FOUNDER_TENANT_SLUG: 'Not A Slug!',
      }),
    ).toThrow(/ONBOARDING_FOUNDER_TENANT_SLUG/);
  });
});
