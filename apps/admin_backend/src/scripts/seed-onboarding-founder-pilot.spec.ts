import { buildFounderPilotFixture, Q80_TERMINAL_ID } from './seed-onboarding-founder-pilot';

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
});
