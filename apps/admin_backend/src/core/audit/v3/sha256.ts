import { createHash } from 'node:crypto';

export const sha256LowerHex = (frame: Buffer): string => createHash('sha256').update(frame).digest('hex');
