import { AddAcceptedAtToInventorySyncReceipts1805000000000 } from './1805000000000-AddAcceptedAtToInventorySyncReceipts';

describe('AddAcceptedAtToInventorySyncReceipts1805000000000', () => {
  const m = new AddAcceptedAtToInventorySyncReceipts1805000000000();
  it('adds accepted_at column to inventory_sync_receipts', async () => {
    const q: string[] = [], qr = { query: jest.fn(async (sql: string) => (q.push(sql), [])) } as any;
    await m.up(qr);
    expect(q.join('\n')).toContain('ALTER TABLE inventory_sync_receipts ADD COLUMN IF NOT EXISTS accepted_at timestamptz');
  });
  it('guards down migration when accepted_at evidence exists', async () => {
    await expect(m.down({ query: jest.fn(async () => [{ 1: 1 }]) } as any)).rejects.toThrow('down migration forbidden');
    const qrClean = { query: jest.fn(async () => []) } as any;
    await m.down(qrClean);
    expect(qrClean.query).toHaveBeenCalledWith(expect.stringContaining('DROP COLUMN IF EXISTS accepted_at'));
  });
});
