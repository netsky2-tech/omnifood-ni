import { scanNumberFreeJson } from './scanner';
import { AUDIT_V3_ERROR_CODE, type AuditV3Value, type Result } from './types';

const MAX = 1_048_576;
const CHUNK_UNITS = 8_192;

class Writer {
  readonly chunks: Buffer[] = [];
  length = 0;
  exceeded = false;

  write(text: string): void {
    for (let start = 0; start < text.length && !this.exceeded;) {
      let end = Math.min(start + CHUNK_UNITS, text.length);
      if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
      const chunk = Buffer.from(text.slice(start, end));
      if (this.length + chunk.length > MAX) { this.exceeded = true; return }
      this.chunks.push(chunk); this.length += chunk.length; start = end;
    }
  }
}

type Action = AuditV3Value | { readonly kind: 'text'; readonly value: string } | { readonly kind: 'escaped'; readonly value: string };
const text = (value: string): Action => ({ kind: 'text', value });
const escaped = (value: string): Action => ({ kind: 'escaped', value });
const compareUtf16 = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function writeEscaped(writer: Writer, value: string): void {
  writer.write('"'); let run = 0;
  const escapes: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
  for (let index = 0; index < value.length; index++) {
    const character = value[index]; const code = value.charCodeAt(index);
    const replacement = escapes[character] ?? (code < 0x20 ? `\\u00${code.toString(16).padStart(2, '0')}` : undefined);
    if (!replacement) continue;
    writer.write(value.slice(run, index)); writer.write(replacement); run = index + 1;
  }
  writer.write(value.slice(run)); writer.write('"');
}

export function canonicalizeNumberFreeJson(rawUtf8: Buffer): Result<Buffer> {
  const scanned = scanNumberFreeJson(rawUtf8);
  if (scanned.ok === false) return scanned;
  const writer = new Writer(); const stack: Action[] = [scanned.value];
  while (stack.length && !writer.exceeded) {
    const action = stack.pop()!;
    if (action.kind === 'text') { writer.write(action.value); continue }
    if (action.kind === 'escaped') { writeEscaped(writer, action.value); continue }
    if (action.kind === 'null') { writer.write('null'); continue }
    if (action.kind === 'boolean') { writer.write(action.value ? 'true' : 'false'); continue }
    if (action.kind === 'string') { writeEscaped(writer, action.value); continue }
    const values: Action[] = [];
    if (action.kind === 'array') action.values.forEach((value, index) => values.push(index ? text(',') : text(''), value));
    else [...action.entries].sort((a, b) => compareUtf16(a.key, b.key)).forEach((entry, index) => values.push(index ? text(',') : text(''), escaped(entry.key), text(':'), entry.value));
    stack.push(text(action.kind === 'array' ? ']' : '}'), ...values.reverse(), text(action.kind === 'array' ? '[' : '{'));
  }
  if (writer.exceeded) return { ok: false, error: { code: AUDIT_V3_ERROR_CODE.LIMIT_EXCEEDED, offset: MAX } };
  return { ok: true, value: Buffer.concat(writer.chunks, writer.length) };
}
