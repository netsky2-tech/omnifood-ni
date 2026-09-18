import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  markTenantPublicationDirty,
  readOrMaterializeMarker,
} from './tenant-publication-marker';

// Exact rejection text documented on requireTenantId (tenant-context.ts);
// asserted verbatim so the message cannot drift silently.
const EXACT_TENANT_MESSAGE =
  'A non-empty tenant id is required to bind the RLS tenant context';

describe('markTenantPublicationDirty', () => {
  let query: jest.Mock<Promise<unknown>, unknown[]>;
  let transaction: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    query = jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue([]);
    transaction = jest.fn();
    manager = { query, transaction } as unknown as EntityManager;
  });

  it('issues a single parameterized upsert with the tenant bound and never interpolated', async () => {
    const hostileTenant =
      "t'; DROP TABLE human_auth_tenant_publication_state; --";

    await markTenantPublicationDirty(manager, hostileTenant);

    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toMatch(
      /INSERT INTO human_auth_tenant_publication_state/,
    );
    expect(statement).toContain('ON CONFLICT (tenant_id) DO UPDATE SET');
    expect(statement).not.toContain(hostileTenant);
    expect(params).toEqual([hostileTenant]);
  });

  it('materializes an absent marker and stamps dirty on the conflicting update', async () => {
    await markTenantPublicationDirty(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toMatch(/VALUES\s*\(\$1,/);
    expect(statement).toMatch(/dirty\s*=\s*TRUE/i);
    expect(statement).toMatch(/marked_at\s*=\s*CURRENT_TIMESTAMP/i);
    expect(statement).toMatch(/updated_at\s*=\s*CURRENT_TIMESTAMP/i);
  });

  it('increments the existing revision on update and never assigns a literal revision there', async () => {
    await markTenantPublicationDirty(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    const onUpdate = statement.slice(statement.indexOf('ON CONFLICT'));
    // The DO UPDATE clause must derive the new revision from the stored one;
    // the migration trigger rejects any regression, so a literal would be a
    // latent bug even when numerically higher.
    expect(onUpdate).toMatch(
      /revision\s*=\s*[A-Za-z_]+\.[A-Za-z_]*revision\s*\+\s*1/,
    );
    expect(onUpdate).not.toMatch(/revision\s*=\s*\d/);
    expect(onUpdate).not.toMatch(/revision\s*=\s*'/);
  });

  it('never assigns tenant_id in the conflict branch, so tenant re-identification is impossible', async () => {
    await markTenantPublicationDirty(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    const onUpdate = statement.slice(statement.indexOf('ON CONFLICT'));
    // The migration trigger would reject re-identification anyway, but the
    // statement itself must never attempt it (e.g. via
    // tenant_id = EXCLUDED.tenant_id in a RETURNING-driving no-op).
    expect(onUpdate).not.toMatch(/tenant_id\s*=/);
  });

  it('insert branch uses revision 1, satisfying the migration CHECK (revision >= 1)', async () => {
    await markTenantPublicationDirty(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toMatch(/VALUES\s*\(\$1,\s*TRUE,\s*1,/);
  });

  it('validates the tenant the same way the binding does, before issuing anything', async () => {
    for (const badTenant of [undefined, null, '', '   ', 42]) {
      await expect(
        markTenantPublicationDirty(manager, badTenant),
      ).rejects.toThrow(BadRequestException);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects with the exact documented message, not merely the exception type', async () => {
    await expect(markTenantPublicationDirty(manager, '   ')).rejects.toThrow(
      new BadRequestException(EXACT_TENANT_MESSAGE),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('does not open its own transaction: it runs on the caller manager', async () => {
    await expect(
      markTenantPublicationDirty(manager, 'tenant-1'),
    ).resolves.toBeUndefined();

    expect(transaction).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('propagates a marker-write failure instead of swallowing it', async () => {
    query.mockRejectedValue(new Error('marker write failed'));

    await expect(
      markTenantPublicationDirty(manager, 'tenant-1'),
    ).rejects.toThrow('marker write failed');
  });
});

describe('readOrMaterializeMarker', () => {
  let query: jest.Mock<Promise<unknown>, unknown[]>;
  let transaction: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    query = jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue([]);
    transaction = jest.fn();
    manager = { query, transaction } as unknown as EntityManager;
  });

  it('reads and materializes in ONE parameterized statement and returns the RETURNING row', async () => {
    const hostileTenant =
      "t'; DROP TABLE human_auth_tenant_publication_state; --";
    query.mockResolvedValue([{ dirty: true, revision: '1' }]);

    await expect(
      readOrMaterializeMarker(manager, hostileTenant),
    ).resolves.toEqual({ dirty: true, revision: '1' });

    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toMatch(
      /INSERT INTO human_auth_tenant_publication_state/,
    );
    expect(statement).toMatch(/ON CONFLICT \(tenant_id\) DO UPDATE/);
    expect(statement).toMatch(/RETURNING dirty,\s*revision/);
    expect(statement).not.toContain(hostileTenant);
    expect(params).toEqual([hostileTenant]);
  });

  it('returns the stored dirty/revision of an existing marker through the no-op conflict branch', async () => {
    query.mockResolvedValue([{ dirty: false, revision: '9' }]);

    await expect(readOrMaterializeMarker(manager, 'tenant-1')).resolves.toEqual(
      { dirty: false, revision: '9' },
    );

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    const onUpdate = statement.slice(statement.indexOf('ON CONFLICT'));
    // The conflict branch must be a genuine no-op: it only re-assigns
    // updated_at to its stored value, so reading a clean marker can never
    // dirty it, move its revision, or restamp marked_at.
    expect(onUpdate).toMatch(
      /updated_at\s*=\s*human_auth_tenant_publication_state\.updated_at/,
    );
    expect(onUpdate).not.toMatch(/dirty\s*=/);
    expect(onUpdate).not.toMatch(/revision\s*=/);
    expect(onUpdate).not.toMatch(/marked_at\s*=/);
  });

  it('materializes an absent marker with revision 1, satisfying the migration CHECK (revision >= 1)', async () => {
    await readOrMaterializeMarker(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toMatch(/VALUES\s*\(\$1,\s*TRUE,\s*1,/);
  });

  it('never assigns tenant_id in the conflict branch, so tenant re-identification is impossible', async () => {
    await readOrMaterializeMarker(manager, 'tenant-1');

    const [statement] = query.mock.calls[0] as [string, unknown[]];
    const onUpdate = statement.slice(statement.indexOf('ON CONFLICT'));
    expect(onUpdate).not.toMatch(/tenant_id\s*=/);
  });

  it('validates the tenant before issuing anything and rejects with the exact documented message', async () => {
    for (const badTenant of [undefined, null, '', '   ', 42]) {
      await expect(readOrMaterializeMarker(manager, badTenant)).rejects.toThrow(
        new BadRequestException(EXACT_TENANT_MESSAGE),
      );
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('does not open its own transaction: it runs on the caller manager', async () => {
    query.mockResolvedValue([{ dirty: true, revision: '1' }]);

    await expect(readOrMaterializeMarker(manager, 'tenant-1')).resolves.toEqual(
      { dirty: true, revision: '1' },
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('propagates a marker-read failure instead of swallowing it', async () => {
    query.mockRejectedValue(new Error('marker read failed'));

    await expect(readOrMaterializeMarker(manager, 'tenant-1')).rejects.toThrow(
      'marker read failed',
    );
  });
});
