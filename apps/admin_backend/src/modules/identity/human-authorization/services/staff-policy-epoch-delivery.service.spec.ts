import {
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  type StaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import {
  OHAC_DELIVERY_STATUS,
  OhacDeliveryIntegrityError,
  StaffPolicyEpochDeliveryService,
  type NegotiateStaffPolicyEpochDeliveryInput,
} from './staff-policy-epoch-delivery.service';
import {
  StaffPolicyEpochMaterializationService,
  type StaffPolicyEpochMaterializationOutcome,
} from './staff-policy-epoch-materialization.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';
const POS_BUILD = 'pos-build-1';

/** The epoch envelope is opaque here; the transport slice renders it. */
const EPOCH = { schema: 'ohac.staff-policy-epoch.v1' } as StaffPolicyEpochV1;

const negotiation = (
  overrides: Partial<NegotiateStaffPolicyEpochDeliveryInput> = {},
): NegotiateStaffPolicyEpochDeliveryInput => ({
  tenantId: TENANT,
  terminalId: TERMINAL,
  posBuild: POS_BUILD,
  supportedPolicySchemas: [STAFF_POLICY_EPOCH_V1_SCHEMA],
  supportedAssertionSchemas: [MINIMUM_ASSERTION_SCHEMA],
  localFloorSequence: '0',
  ...overrides,
});

/**
 * Builds the service under test with a scripted materialization double, so a
 * test states the materialization outcome it is mapping and nothing else.
 */
const serviceWith = (options: {
  readonly floor?: string;
  readonly outcome?: StaffPolicyEpochMaterializationOutcome;
  readonly floorSpy?: jest.Mock;
  readonly materializeSpy?: jest.Mock;
}) => {
  const readAcceptedFloor =
    options.floorSpy ?? jest.fn(async () => options.floor ?? '0');
  const materialize =
    options.materializeSpy ??
    jest.fn(
      async () =>
        options.outcome ?? ({ status: 'nothing-to-deliver' } as const),
    );
  const materialization = {
    readAcceptedFloor,
    materialize,
  } as unknown as StaffPolicyEpochMaterializationService;
  return {
    service: new StaffPolicyEpochDeliveryService(materialization),
    readAcceptedFloor,
    materialize,
  };
};

const deliverable = (): StaffPolicyEpochMaterializationOutcome => ({
  status: 'deliver',
  epoch: EPOCH,
  sequence: '1',
  digest: 'sha256:' + 'a'.repeat(64),
});

describe('StaffPolicyEpochDeliveryService', () => {
  it('reports a client that never opted in, without reading or materializing anything', async () => {
    // Absence of a negotiated build is the legacy-client signal, and it is the
    // only case where the transport omits the member entirely.
    for (const absent of [undefined, null]) {
      const { service, readAcceptedFloor, materialize } = serviceWith({});

      await expect(
        service.negotiate(negotiation({ posBuild: absent })),
      ).resolves.toEqual({ result: 'not-participating' });
      expect(readAcceptedFloor).not.toHaveBeenCalled();
      expect(materialize).not.toHaveBeenCalled();
    }
  });

  it('answers an opted-in client with an unusable build instead of silence', async () => {
    const { service, materialize } = serviceWith({});

    for (const blank of ['', '   ', '\t']) {
      await expect(
        service.negotiate(negotiation({ posBuild: blank })),
      ).resolves.toEqual({
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      });
    }
    expect(materialize).not.toHaveBeenCalled();
  });

  it('requires the client to support the epoch policy schema', async () => {
    const { service, materialize } = serviceWith({});

    for (const advertised of [undefined, null, [], ['ohac.other.v1']]) {
      await expect(
        service.negotiate(negotiation({ supportedPolicySchemas: advertised })),
      ).resolves.toEqual({
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      });
    }
    expect(materialize).not.toHaveBeenCalled();
  });

  it('requires the client to support the minimum assertion schema', async () => {
    const { service, materialize } = serviceWith({});

    for (const advertised of [undefined, null, [], ['ohac.assertion.v9']]) {
      await expect(
        service.negotiate(
          negotiation({ supportedAssertionSchemas: advertised }),
        ),
      ).resolves.toEqual({
        result: 'status',
        status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
      });
    }
    expect(materialize).not.toHaveBeenCalled();
  });

  it('accepts a schema list that carries the required id alongside others', async () => {
    const { service } = serviceWith({ outcome: deliverable() });

    await expect(
      service.negotiate(
        negotiation({
          supportedPolicySchemas: [
            'ohac.other.v1',
            STAFF_POLICY_EPOCH_V1_SCHEMA,
          ],
        }),
      ),
    ).resolves.toMatchObject({ result: 'deliver' });
  });

  it('reads the server floor with the tenant and terminal it was given', async () => {
    const floorSpy = jest.fn(async () => '0');
    const { service } = serviceWith({ floorSpy });

    await service.negotiate(negotiation());

    expect(floorSpy).toHaveBeenCalledWith({
      tenantId: TENANT,
      terminalId: TERMINAL,
    });
  });

  it('requires recovery when the client floor is ahead of the server floor', async () => {
    const { service, materialize } = serviceWith({ floor: '4' });

    await expect(
      service.negotiate(negotiation({ localFloorSequence: '5' })),
    ).resolves.toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.RECOVERY_REQUIRED,
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it('does not require recovery when the client floor matches or trails the server', async () => {
    // `9` versus `10` is the case a string comparison would get wrong, so it is
    // asserted explicitly rather than left to the numeric path's good behaviour.
    for (const local of ['10', '9', '0', undefined, null]) {
      const { service, materialize } = serviceWith({
        floor: '10',
        outcome: deliverable(),
      });

      await expect(
        service.negotiate(negotiation({ localFloorSequence: local })),
      ).resolves.toMatchObject({ result: 'deliver' });
      expect(materialize).toHaveBeenCalledTimes(1);
    }
  });

  it('treats an absent local floor as zero', async () => {
    const { service } = serviceWith({ floor: '0', outcome: deliverable() });

    await expect(
      service.negotiate(negotiation({ localFloorSequence: undefined })),
    ).resolves.toMatchObject({ result: 'deliver' });
  });

  it('resolves an unsupported schema before a floor that would need recovery', async () => {
    // Precedence is part of the contract: the documented order decides, not the
    // order in which a reader happens to check.
    const { service, readAcceptedFloor } = serviceWith({ floor: '4' });

    await expect(
      service.negotiate(
        negotiation({
          supportedPolicySchemas: [],
          localFloorSequence: '5',
        }),
      ),
    ).resolves.toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
    });
    expect(readAcceptedFloor).not.toHaveBeenCalled();
  });

  it('resolves a floor needing recovery before attempting materialization', async () => {
    const { service, materialize } = serviceWith({ floor: '4' });

    await expect(
      service.negotiate(negotiation({ localFloorSequence: '9' })),
    ).resolves.toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.RECOVERY_REQUIRED,
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it('maps a deliverable epoch to the deliverable result', async () => {
    const { service } = serviceWith({ outcome: deliverable() });

    await expect(service.negotiate(negotiation())).resolves.toEqual({
      result: 'deliver',
      epoch: EPOCH,
      sequence: '1',
      digest: 'sha256:' + 'a'.repeat(64),
    });
  });

  it('maps nothing-to-deliver to up-to-date, which is not the disabled answer', async () => {
    const { service } = serviceWith({
      outcome: { status: 'nothing-to-deliver' },
    });

    const result = await service.negotiate(negotiation());

    expect(result).toEqual({ result: 'up-to-date' });
    expect(result).not.toEqual({ result: 'status', status: 'DISABLED' });
  });

  it('maps a disabled cohort pair to the disabled status', async () => {
    const { service } = serviceWith({
      outcome: { status: 'cohort-disabled', decision: 'DISABLED' },
    });

    await expect(service.negotiate(negotiation())).resolves.toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.DISABLED,
    });
  });

  it('maps a frozen epoch built for another build to upgrade-required', async () => {
    const { service } = serviceWith({
      outcome: {
        status: 'build-mismatch',
        storedTargetPosBuild: 'pos-build-old',
        storedPublisherBackendBuild: 'backend-build-1',
      },
    });

    await expect(service.negotiate(negotiation())).resolves.toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.UPGRADE_REQUIRED,
    });
  });

  it('fails closed when materialization reports an untrusted artifact', async () => {
    const { service } = serviceWith({
      outcome: {
        status: 'failed',
        error: { code: OHAC_ERROR_CODE.DIGEST_MISMATCH, field: 'digest' },
      },
    });

    await expect(service.negotiate(negotiation())).rejects.toBeInstanceOf(
      OhacDeliveryIntegrityError,
    );
  });

  it('propagates a materialization failure unchanged instead of turning it into a member', async () => {
    const failure = new Error('materialization transaction aborted');
    const materializeSpy = jest.fn(async () => {
      throw failure;
    });
    const { service } = serviceWith({ materializeSpy });

    await expect(service.negotiate(negotiation())).rejects.toBe(failure);
  });

  it('propagates a floor read failure instead of answering from a guess', async () => {
    const failure = new Error('floor read aborted');
    const floorSpy = jest.fn(async () => {
      throw failure;
    });
    const { service } = serviceWith({ floorSpy });

    await expect(service.negotiate(negotiation())).rejects.toBe(failure);
  });

  it('passes the tenant, terminal, and negotiated build down to materialization', async () => {
    const materializeSpy = jest.fn(async () => ({
      status: 'nothing-to-deliver',
    }));
    const { service } = serviceWith({ materializeSpy });

    await service.negotiate(negotiation());

    expect(materializeSpy).toHaveBeenCalledWith({
      tenantId: TENANT,
      terminalId: TERMINAL,
      posBuild: POS_BUILD,
    });
  });

  it('never reports a status for a client that did not participate', async () => {
    // The distinguishing property: a legacy client must not be mistaken for a
    // disabled tenant, and a disabled tenant must not be mistaken for silence.
    const legacy = await serviceWith({}).service.negotiate(
      negotiation({ posBuild: undefined }),
    );
    const disabled = await serviceWith({
      outcome: { status: 'cohort-disabled', decision: 'DISABLED' },
    }).service.negotiate(negotiation());

    expect(legacy).toEqual({ result: 'not-participating' });
    expect(disabled).toEqual({
      result: 'status',
      status: OHAC_DELIVERY_STATUS.DISABLED,
    });
    expect(legacy).not.toEqual(disabled);
  });
});
