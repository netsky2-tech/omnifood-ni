import { parseHumanAuthorizationNegotiation } from './human-authorization-negotiation';

describe('parseHumanAuthorizationNegotiation', () => {
  it('reports an absent build so the caller can tell a legacy client apart', () => {
    // This is the whole compatibility contract: an absent build is what makes
    // the response omit the authorization member, so it must stay `undefined`
    // and never become an empty string.
    const parsed = parseHumanAuthorizationNegotiation({});

    expect(parsed.posBuild).toBeUndefined();
    expect(parsed).not.toHaveProperty('posBuild', '');
  });

  it('keeps a present but empty build distinguishable from an absent one', () => {
    // A client that sent the parameter empty opted in and cannot be served, so
    // it must reach the negotiation as an empty string rather than as absence.
    expect(
      parseHumanAuthorizationNegotiation({ ohacPosBuild: '' }).posBuild,
    ).toBe('');
  });

  it('splits a comma-separated schema list into trimmed non-empty entries', () => {
    const parsed = parseHumanAuthorizationNegotiation({
      ohacPolicySchemas: ' ohac.staff-policy-epoch.v1 , ohac.other.v1 ,, ',
    });

    expect(parsed.supportedPolicySchemas).toEqual([
      'ohac.staff-policy-epoch.v1',
      'ohac.other.v1',
    ]);
  });

  it('distinguishes an absent schema list from an empty one', () => {
    expect(
      parseHumanAuthorizationNegotiation({}).supportedPolicySchemas,
    ).toBeUndefined();
    expect(
      parseHumanAuthorizationNegotiation({ ohacPolicySchemas: ' , , ' })
        .supportedPolicySchemas,
    ).toEqual([]);
  });

  it('parses the assertion schema list independently of the policy list', () => {
    const parsed = parseHumanAuthorizationNegotiation({
      ohacPolicySchemas: 'ohac.staff-policy-epoch.v1',
      ohacAssertionSchemas: 'ohac.assertion.v1,ohac.assertion.v2',
    });

    expect(parsed.supportedPolicySchemas).toEqual([
      'ohac.staff-policy-epoch.v1',
    ]);
    expect(parsed.supportedAssertionSchemas).toEqual([
      'ohac.assertion.v1',
      'ohac.assertion.v2',
    ]);
  });

  it('trims the local floor and treats a blank one as absent', () => {
    expect(
      parseHumanAuthorizationNegotiation({ ohacFloorSequence: ' 7 ' })
        .localFloorSequence,
    ).toBe('7');
    expect(
      parseHumanAuthorizationNegotiation({ ohacFloorSequence: '   ' })
        .localFloorSequence,
    ).toBeUndefined();
  });

  it('parses every parameter together', () => {
    const parsed = parseHumanAuthorizationNegotiation({
      ohacPosBuild: 'pos-build-1',
      ohacPolicySchemas: 'ohac.staff-policy-epoch.v1',
      ohacAssertionSchemas: 'ohac.assertion.v1',
      ohacFloorSequence: '3',
    });

    expect(parsed).toEqual({
      posBuild: 'pos-build-1',
      supportedPolicySchemas: ['ohac.staff-policy-epoch.v1'],
      supportedAssertionSchemas: ['ohac.assertion.v1'],
      localFloorSequence: '3',
    });
  });

  it('does not validate or normalize values it is not responsible for', () => {
    // Eligibility is the negotiation service's decision, not the transport's:
    // an unsupported schema id must pass through unchanged so the service is
    // the single place that decides.
    const parsed = parseHumanAuthorizationNegotiation({
      ohacPolicySchemas: 'not-a-schema',
      ohacFloorSequence: 'not-a-number',
    });

    expect(parsed.supportedPolicySchemas).toEqual(['not-a-schema']);
    expect(parsed.localFloorSequence).toBe('not-a-number');
  });
});
