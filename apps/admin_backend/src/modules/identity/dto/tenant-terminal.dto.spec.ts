import { DeviceSyncCredentialStatus } from '../entities/device-sync-credential.entity';
import { TenantTerminalDto } from './tenant-terminal.dto';

describe('TenantTerminalDto', () => {
  it('instantiates correctly with all fields populated', () => {
    const dto = new TenantTerminalDto();
    dto.terminalId = 'Q802024120001';
    dto.label = 'Caja Principal';
    dto.credentialId = 'd6df2e11-9a37-4fc9-a512-2b89a43a9a42';
    dto.credentialVersion = 1;
    dto.status = DeviceSyncCredentialStatus.ACTIVE;
    dto.issuedAt = new Date('2026-10-10T00:00:00Z');
    dto.expiresAt = new Date('2026-11-10T00:00:00Z');
    dto.revokedAt = null;
    dto.revocationReason = null;
    dto.posBuild = 'pos-1.2.3';
    dto.freshnessState = 'COMPLETE';
    dto.acceptedThroughSequence = 42;
    dto.lastReceiptAt = '2026-10-10T01:00:00.000Z';
    dto.hasDeclaredGaps = false;
    dto.hasInventoryPending = false;
    dto.inventoryPendingCount = 0;

    expect(dto.terminalId).toBe('Q802024120001');
    expect(dto.status).toBe(DeviceSyncCredentialStatus.ACTIVE);
    expect(dto.freshnessState).toBe('COMPLETE');
    expect(dto.acceptedThroughSequence).toBe(42);
    expect(dto.posBuild).toBe('pos-1.2.3');
  });

  it('supports revoked terminal with null freshness', () => {
    const dto = new TenantTerminalDto();
    dto.terminalId = 'Q802024120002';
    dto.label = 'Q802024120002';
    dto.credentialId = 'e7ef3f22-9a37-4fc9-a512-2b89a43a9a43';
    dto.credentialVersion = 2;
    dto.status = DeviceSyncCredentialStatus.REVOKED;
    dto.issuedAt = new Date('2026-10-01T00:00:00Z');
    dto.expiresAt = new Date('2026-11-01T00:00:00Z');
    dto.revokedAt = new Date('2026-10-05T12:00:00Z');
    dto.revocationReason = 'Terminal robada';
    dto.posBuild = null;
    dto.freshnessState = null;
    dto.acceptedThroughSequence = 10;
    dto.lastReceiptAt = '2026-10-05T11:00:00.000Z';
    dto.hasDeclaredGaps = false;
    dto.hasInventoryPending = false;
    dto.inventoryPendingCount = 0;

    expect(dto.status).toBe(DeviceSyncCredentialStatus.REVOKED);
    expect(dto.revocationReason).toBe('Terminal robada');
    expect(dto.freshnessState).toBeNull();
  });
});
