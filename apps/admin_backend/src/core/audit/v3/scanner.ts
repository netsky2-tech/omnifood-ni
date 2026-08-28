import { AUDIT_V3_ERROR_CODE as CODE, type AuditV3ErrorCode, type AuditV3ObjectEntry, type AuditV3Value, type Result } from './types';

const MAX = 1_048_576;
class Failure extends Error {
  constructor(readonly code: AuditV3ErrorCode, readonly offset: number) { super(code) }
}
const fail = (code: AuditV3ErrorCode, offset: number): never => { throw new Failure(code, offset) };

function decode(raw: Buffer): string {
  for (let i = 0; i < raw.length;) {
    const lead = raw[i];
    if (lead < 0x80) { i++; continue }
    let remaining: number; let scalar: number; let minimum: number;
    if (lead >= 0xc2 && lead <= 0xdf) { remaining = 1; scalar = lead & 31; minimum = 0x80 }
    else if (lead >= 0xe0 && lead <= 0xef) { remaining = 2; scalar = lead & 15; minimum = 0x800 }
    else if (lead >= 0xf0 && lead <= 0xf4) { remaining = 3; scalar = lead & 7; minimum = 0x10000 }
    else fail(CODE.INVALID_UTF8, i);
    if (i + remaining >= raw.length) fail(CODE.INVALID_UTF8, i);
    for (let j = 1; j <= remaining; j++) {
      const next = raw[i + j];
      if ((next & 0xc0) !== 0x80) fail(CODE.INVALID_UTF8, i + j);
      scalar = (scalar << 6) | (next & 63);
    }
    if (scalar < minimum || scalar >= 0xd800 && scalar <= 0xdfff || scalar > 0x10ffff) fail(CODE.INVALID_UTF8, i);
    i += remaining + 1;
  }
  return raw.toString('utf8');
}

interface Frame {
  readonly node: Extract<AuditV3Value, { kind: 'array' | 'object' }>;
  readonly depth: number;
  readonly seen?: Set<string>;
  count: number;
  afterValue: boolean;
}

export function scanNumberFreeJson(rawUtf8: Buffer): Result<AuditV3Value> {
  try {
    if (rawUtf8.length > MAX) fail(CODE.LIMIT_EXCEEDED, MAX);
    const source = decode(rawUtf8);
    const byteOffsets = new Uint32Array(source.length + 1);
    for (let i = 0, bytes = 0; i < source.length;) {
      const width = source.codePointAt(i)! > 0xffff ? 2 : 1;
      byteOffsets[i] = bytes;
      if (width === 2) byteOffsets[i + 1] = bytes;
      bytes += Buffer.byteLength(source.slice(i, i + width));
      i += width;
      byteOffsets[i] = bytes;
    }
    const offset = (index: number): number => index >= source.length ? rawUtf8.length : byteOffsets[index];
    let position = 0;
    const unicode: number[] = []; const duplicates: number[] = []; let numberOffset: number | undefined; const limits: number[] = [];
    const whitespace = (): void => { while (' \n\r\t'.includes(source[position] ?? '\0')) position++ };
    const string = (): { value: string; start: number } => {
      const start = offset(position++); let value = '';
      while (position < source.length) {
        let character = source[position++];
        if (character === '"') return { value, start };
        if (character < ' ') fail(CODE.INVALID_JSON, offset(position - 1));
        if (character !== '\\') { value += character; continue }
        const slash = offset(position - 1);
        if (position >= source.length) fail(CODE.INVALID_JSON, rawUtf8.length);
        character = source[position++];
        const escaped: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (character in escaped) { value += escaped[character]; continue }
        if (character !== 'u') fail(CODE.INVALID_JSON, offset(position - 1));
        const hex = source.slice(position, position + 4);
        const bad = [...hex].findIndex((unit) => !/[0-9a-fA-F]/.test(unit));
        if (hex.length < 4 || bad >= 0) fail(CODE.INVALID_JSON, offset(position + (bad < 0 ? hex.length : bad)));
        const first = Number.parseInt(hex, 16); position += 4;
        if (first >= 0xd800 && first <= 0xdbff) {
          const secondHex = source.slice(position + 2, position + 6);
          if (source.slice(position, position + 2) === '\\u' && /^[0-9a-fA-F]{4}$/.test(secondHex)) {
            const second = Number.parseInt(secondHex, 16);
            if (second >= 0xdc00 && second <= 0xdfff) { value += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00); position += 6; continue }
          }
          unicode.push(slash); value += '\ufffd';
        } else if (first >= 0xdc00 && first <= 0xdfff) { unicode.push(slash); value += '\ufffd' }
        else value += String.fromCharCode(first);
      }
      fail(CODE.INVALID_JSON, rawUtf8.length);
    };
    const stack: Frame[] = [];
    const value = (depth: number): AuditV3Value => {
      whitespace(); const start = offset(position); if (depth > 64) limits.push(start);
      const character = source[position];
      if (character === '"') return { kind: 'string', value: string().value };
      if (source.startsWith('true', position)) { position += 4; return { kind: 'boolean', value: true } }
      if (source.startsWith('false', position)) { position += 5; return { kind: 'boolean', value: false } }
      if (source.startsWith('null', position)) { position += 4; return { kind: 'null' } }
      if (character === '-' || character >= '0' && character <= '9') {
        const token = source.slice(position).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)?.[0];
        if (!token) fail(CODE.INVALID_JSON, start);
        position += token.length; numberOffset ??= start; return { kind: 'null' };
      }
      if (character === '[') {
        position++; const node: Extract<AuditV3Value, { kind: 'array' }> = { kind: 'array', values: [] };
        stack.push({ node, depth, count: 0, afterValue: false }); return node;
      }
      if (character === '{') {
        position++; const node: Extract<AuditV3Value, { kind: 'object' }> = { kind: 'object', entries: [] };
        stack.push({ node, depth, seen: new Set(), count: 0, afterValue: false }); return node;
      }
      fail(CODE.INVALID_JSON, position >= source.length ? rawUtf8.length : start);
    };
    whitespace(); const root = value(0);
    while (stack.length) {
      const frame = stack[stack.length - 1]; whitespace();
      const close = frame.node.kind === 'array' ? ']' : '}';
      if (frame.afterValue) {
        if (source[position] === close) { position++; stack.pop(); continue }
        if (source[position++] !== ',') fail(CODE.INVALID_JSON, offset(position - 1));
        frame.afterValue = false; whitespace();
      } else if (frame.count === 0 && source[position] === close) { position++; stack.pop(); continue }
      const crossing = offset(position); frame.count++; if (frame.count > 10_000) limits.push(crossing);
      if (frame.node.kind === 'array') (frame.node.values as AuditV3Value[]).push(value(frame.depth + 1));
      else {
        if (source[position] !== '"') fail(CODE.INVALID_JSON, position >= source.length ? rawUtf8.length : offset(position));
        const key = string(); if (frame.seen!.has(key.value)) duplicates.push(key.start); frame.seen!.add(key.value);
        whitespace(); if (source[position++] !== ':') fail(CODE.INVALID_JSON, offset(position - 1));
        const entry: AuditV3ObjectEntry = { key: key.value, value: value(frame.depth + 1) };
        (frame.node.entries as AuditV3ObjectEntry[]).push(entry);
      }
      frame.afterValue = true;
    }
    whitespace(); if (position !== source.length) fail(CODE.INVALID_JSON, offset(position));
    const candidate = (code: AuditV3ErrorCode, values: number[]): void => { if (values.length) fail(code, Math.min(...values)) };
    candidate(CODE.INVALID_UNICODE, unicode); candidate(CODE.DUPLICATE_KEY, duplicates);
    if (numberOffset !== undefined) fail(CODE.NUMBER_FORBIDDEN, numberOffset); candidate(CODE.LIMIT_EXCEEDED, limits);
    return { ok: true, value: root };
  } catch (error: unknown) {
    if (error instanceof Failure) return { ok: false, error: { code: error.code, offset: error.offset } };
    throw error;
  }
}
