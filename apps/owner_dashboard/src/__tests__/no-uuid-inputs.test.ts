/**
 * No-UUID-inputs guard (§17.6, odd/tasks/no-uuid-inputs.md — slice S1).
 *
 * Owner's rule (2026-10-10, verbatim):
 *   "No puede haber inputs con UUID. Todo formulario que necesite usar
 *   registros de otras tablas debe ser un selector con búsqueda textual
 *   flexible — textual por varias columnas."
 *
 * A free-text input whose datum is a foreign key (`*_id`) asks the operator
 * to transcribe an identifier they do not know: guaranteed typos, zero
 * discovery of valid choices, cross-row mistakes. This file scans the
 * dashboard source tree (no network, no server — same style as
 * suite-layout.test.ts) and FAILS with an actionable message when a
 * backoffice form exposes a free-text identifier input.
 *
 * The guard BLOCKS, with an explicit, dated exception list: each entry must
 * carry a reason, the acceptance date and the condition that removes it, so
 * an exception can never be added silently and live forever. A rule that can
 * be ignored silently is not a rule.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TESTS_DIR = resolve(import.meta.dirname);
const SRC_ROOT = resolve(TESTS_DIR, "..");
const RULE_REF =
  "docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md §17.6 (odd/tasks/no-uuid-inputs.md)";

interface UuidInputException {
  /** Path relative to `src/`. */
  file: string;
  /** The identifier field/input the exception covers. */
  field: string;
  /** Why the violation still exists — never empty. */
  reason: string;
  /** ISO date (YYYY-MM-DD) the exception was accepted. */
  acceptedOn: string;
  /** What removes this entry — references the ODD task slice that fixes it. */
  removalCondition: string;
}

/**
 * Dated exception ledger. Every entry is a REAL, known violation left in the
 * tree on purpose. Adding an entry here is a decision, not a workaround:
 * it must name the ODD slice that removes it.
 */
const UUID_INPUT_EXCEPTIONS: UuidInputException[] = [
  // The referenceVersionId entry closed 2026-10-10 (slice S5): the version
  // list surface shipped (GET /recipes/products/:productId/versions + the
  // useRecipeVersions hook) and RecipeForm's free-text UUID input became a
  // governed EntitySearchSelect. The promotions entry closed the same day
  // with S4; see the pin in PromotionForm.test.tsx.
  // The loyalty entry closed 2026-10-10 (owner-approved, slices 1+3): the
  // FREE_PRODUCT reward form's productId is EntitySearchSelect +
  // useProductSearch with NO default selection, the fabricated 'prod-smash'
  // default and the onValid '|| prod-smash' fallback are removed, and
  // w10-loyalty-programs-rewards.test.tsx pins the governed contract
  // (empty selection blocks submit; the payload carries the picked uuid).
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_LITERAL_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** Strip JS line and block comments so sample strings inside comments are ignored. */
function stripJsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `://` in URLs is not a comment; eating it would destroy the closing
    // quote of the string and make the next quoted capture span junk.
    .replace(/(?<!:)\/\/[^\n]*/g, " ");
}

/**
 * End index (exclusive) of the JSX opening tag that starts at `startIndex`
 * (position of `<Input`/`<Label`). Tracks quotes and brace depth so `>` in
 * arrow functions (`=>`) or template literals does not end the tag early.
 */
function jsxTagEnd(source: string, startIndex: number): number {
  let quote: string | null = null;
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (ch === ">" && depth === 0) {
      return i + 1;
    }
  }
  return source.length;
}

/** First attribute value for `name` in a JSX tag: "x", 'x' or {x}. */
function attrValue(tag: string, name: string): string | undefined {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([\\s\\S]*?)\\})`),
  );
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3];
}

/**
 * Copy text for `name` in a JSX tag, from quoted values only. Brace
 * expressions are deliberately excluded: their non-greedy capture pulls
 * unrelated JSX after the expression and invents copy that was never written.
 */
function quotedCopyValue(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  if (!m) return undefined;
  return m[1] ?? m[2];
}

/**
 * Identifier-shaped token test. A token is an identifier datum when its last
 * word is an identifier noun in singular OR PLURAL form: snake_case `*_id`
 * / `*_ids` (the re-split below drops underscores, so the last word is the
 * bare `id`/`ids`), or camelCase `*Id` / `*Ids` (`target_product_id`,
 * `eligibleProductIds`). "valid", "paid", "product-search" do NOT match;
 * "product-ids-search" does not match either — the datum is a token's HEAD
 * noun, so only the last word decides. SCREAMING_SNAKE tokens (all caps) are
 * code constants naming an HTML element id (e.g. `URL_INPUT_ID`), not data,
 * and never count.
 */
function isIdentifierToken(raw: string): boolean {
  const words = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const last = words[words.length - 1];
  if (!last) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(last)) return false;
  const lower = last.toLowerCase();
  if (lower === "id" || lower === "ids") return true;
  return /[a-z]I[dD]$/.test(last) || /[a-z]I[dD]s$/.test(last);
}

/**
 * Identifier tokens appearing in the places a form binds its datum: id, name, register(...), value={...}.
 * The datum is a token's HEAD noun, so only the LAST word decides (see
 * isIdentifierToken): "product-ids-search" is a search affordance, not data.
 */
function identifierTokensInTag(tag: string): string[] {
  const tokens: string[] = [];
  for (const name of ["id", "name", "value"]) {
    // Quoted `id` literals can name the datum ("product_id"). A brace-bound
    // expression on `id` is an HTML element-id passthrough (useId(), a
    // forwardRef prop like inputId) — an element identity, never the datum —
    // so it is exempt. `name`/`value` KEEP brace capture: a controlled
    // binding (`value={productId}`) is exactly how a form binds an
    // identifier datum without register().
    const v =
      name === "id" ? quotedCopyValue(tag, name) : attrValue(tag, name);
    if (v) tokens.push(v);
  }
  for (const m of tag.matchAll(/register\(\s*['"]([^'"]+)['"]/g)) {
    tokens.push(m[1] ?? "");
  }
  // Deduplicate and keep only identifier-shaped raw strings, trimmed to the
  // meaningful token for reporting. The datum is a token's HEAD noun: only
  // the LAST word decides. find-first would let a segment like "ids" inside
  // "product-ids-search" impersonate data; the last word cannot — it is the
  // noun the operator's field is actually named by.
  const out: string[] = [];
  for (const raw of tokens) {
    const words = raw.split(/[^A-Za-z0-9_]+/).filter(Boolean);
    const last = words[words.length - 1];
    if (last && isIdentifierToken(last) && !out.includes(last)) out.push(last);
  }
  return out;
}

export interface UuidInputViolation {
  /** Path relative to `src/`. */
  file: string;
  /** The identifier field the input exposes. */
  field: string;
  /** Why the guard flagged it. */
  signals: string[];
  /** Trimmed JSX tag text for the failure message. */
  snippet: string;
}

/** Scan one file's comment-stripped source; returns violations found. */
export function scanSource(
  file: string,
  content: string,
): UuidInputViolation[] {
  const clean = stripJsComments(content);
  const violations: UuidInputViolation[] = [];

  // Free-text identifier inputs: the design-system Input used as a text field.
  for (const m of clean.matchAll(/<Input\b/g)) {
    const start = m.index ?? 0;
    const end = jsxTagEnd(clean, start);
    const tag = clean.slice(start, end);
    // A read-only display of an id is not entry; disabled/hidden types are
    // not operator-facing free text.
    if (/\breadOnly\b/.test(tag)) continue;
    const type = attrValue(tag, "type")?.trim();
    if (type && type !== "text") continue;

    const signals: string[] = [];
    const tokens = identifierTokensInTag(tag);
    if (tokens.length > 0) {
      signals.push(
        `free-text input bound to identifier field(s): ${tokens.join(", ")}`,
      );
    }
    const copyValues = ["placeholder", "aria-label"]
      .map((a) => quotedCopyValue(tag, a))
      .filter((v): v is string => !!v);
    const identifierCopy = copyValues.filter((v) => /\bUUID\b|\bID\b/i.test(v));
    if (identifierCopy.length > 0 && !/buscar/i.test(tag)) {
      // A search affordance ("Buscar por nombre o ID...") is the compliant
      // pattern, not entry: its copy mentioning ID is a search hint, while
      // entry copy ("ID del producto") asks the operator to transcribe one.
      signals.push(
        `copy asks the operator for an identifier: ${identifierCopy
          .map((v) => JSON.stringify(v.trim()))
          .join(", ")}`,
      );
    }
    if (UUID_LITERAL_RE.test(tag)) {
      signals.push("hardcoded UUID literal in the input's copy");
    }
    if (signals.length > 0) {
      violations.push({
        file,
        field: tokens[0] ?? "(copy)",
        signals,
        snippet: tag.replace(/\s+/g, " ").trim().slice(0, 200),
      });
    }
  }

  // A UUID literal hardcoding an expected id in a label is the same defect:
  // the copy asks for (or bakes in) an identifier. Label children are part of
  // the copy, so the capture extends to the closing tag.
  for (const m of clean.matchAll(/<Label\b/g)) {
    const start = m.index ?? 0;
    let end = jsxTagEnd(clean, start);
    if (clean.slice(start, end).endsWith(">") && clean[end - 2] !== "/") {
      const close = clean.indexOf("</Label>", end);
      if (close !== -1) end = close + "</Label>".length;
    }
    const tag = clean.slice(start, end);
    if (UUID_LITERAL_RE.test(tag)) {
      violations.push({
        file,
        field: "(label copy)",
        signals: ["hardcoded UUID literal in a label"],
        snippet: tag.replace(/\s+/g, " ").trim().slice(0, 200),
      });
    }
  }

  return violations;
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "__tests__",
  "e2e",
  "assets",
  "fixtures",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every scanned source file: [path relative to src/, comment-stripped content]. */
function sourceFiles(): Array<[string, string]> {
  return walk(SRC_ROOT)
    .filter((p) => !/\.test\.[jt]sx?$|\.spec\.[jt]sx?$/.test(p))
    .sort()
    .map((p) => [relative(SRC_ROOT, p).split("\\").join("/"), readFileSync(p, "utf8")]);
}

function exceptionKey(file: string, field: string): string {
  return `${file}#${field}`;
}

function failureReport(violations: UuidInputViolation[]): string {
  return [
    `Found ${violations.length} free-text identifier input(s) in backoffice forms.`,
    `Rule: ${RULE_REF}`,
    `"${"No puede haber inputs con UUID. Todo formulario que necesite usar registros de otras tablas debe ser un selector con búsqueda textual flexible — textual por varias columnas."}"`,
    "Replacement: the reusable selector with flexible textual search (several columns, tolerant of case/accents/partial matches, never an exact id or exact name).",
    "",
    ...violations.map(
      (v) =>
        `  ${v.file} — ${v.field}\n    why: ${v.signals.join("; ")}\n    code: ${v.snippet}`,
    ),
  ].join("\n");
}

describe("no-uuid-inputs guard (§17.6): no free-text input for a foreign key", () => {
  it("finds every free-text identifier input in the real tree, honoring only dated exceptions", () => {
    const violations = sourceFiles().flatMap(([file, content]) =>
      scanSource(file, content),
    );
    const excepted = new Set(
      UUID_INPUT_EXCEPTIONS.map((e) => exceptionKey(e.file, e.field)),
    );
    const unexcepted = violations.filter(
      (v) => !excepted.has(exceptionKey(v.file, v.field)),
    );
    expect(unexcepted, failureReport(unexcepted)).toEqual([]);
  });

  it("keeps every exception dated, reasoned and bounded", () => {
    // An exception without a date can live forever; one without a removal
    // condition is a permanent opt-out, not an exception. Both are forbidden.
    // Round-2 slice S5: the ledger reached its terminal EMPTY state — the
    // last entry (referenceVersionId) closed when the versions surface and
    // the governed selector shipped. Zero exceptions is the goal, not a
    // broken invariant; the bounds below protect any future entry.
    for (const e of UUID_INPUT_EXCEPTIONS) {
      expect(
        DATE_RE.test(e.acceptedOn),
        `exception ${e.file}#${e.field} needs acceptedOn as YYYY-MM-DD`,
      ).toBe(true);
      expect(
        e.reason.trim().length,
        `exception ${e.file}#${e.field} needs a reason`,
      ).toBeGreaterThan(0);
      expect(
        e.removalCondition,
        `exception ${e.file}#${e.field} must reference the task/slice that removes it`,
      ).toMatch(/odd\/tasks\/no-uuid-inputs\.md/);
    }
  });

  it("flags a synthetic free-text UUID input (the detector cannot silently rot)", () => {
    const sample = [
      "export function DemoForm() {",
      '  return (<form><Label htmlFor="product_id">Producto</Label>',
      '    <Input id="product_id" placeholder="ID del producto" {...register(\'product_id\')} />',
      "  </form>);}",
    ].join("\n");
    const violations = scanSource("features/demo/DemoForm.tsx", sample);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.field).toBe("product_id");
    expect(violations[0]?.signals.join("; ")).toMatch(/identifier field/);
    expect(violations[0]?.signals.join("; ")).toMatch(/asks the operator/);
  });

  it("does not flag a compliant selector, search input or governed native select", () => {
    const sample = [
      "export function DemoForm() {",
      "  return (<form>",
      '    <Input id="product-search" placeholder="Ej: Cerveza, Pan" value={search} onChange={(e) => setSearch(e.target.value)} />',
      "    <select id=\"target_category_id\" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>",
      '      <option value="">Global (sin categoría)</option>',
      "    </select>",
      '    <Input id="buy_quantity" type="number" min="1" {...register(\'buy_quantity\')} />',
      "  </form>);}",
    ].join("\n");
    expect(scanSource("features/demo/DemoForm.tsx", sample)).toEqual([]);
  });

  it("flags a hardcoded UUID baked into input or label copy", () => {
    const inputSample =
      '<Input id="target" type="text" placeholder="Registro 550e8400-e29b-41d4-a716-446655440000" />';
    expect(scanSource("features/demo/DemoForm.tsx", inputSample)).toHaveLength(1);
    const labelSample =
      "<Label>Producto 550e8400-e29b-41d4-a716-446655440000</Label>";
    const labelViolations = scanSource("features/demo/DemoForm.tsx", labelSample);
    expect(labelViolations).toHaveLength(1);
    expect(labelViolations[0]?.field).toBe("(label copy)");
  });

  it("does not flag search affordances or HTML element-id constants", () => {
    const searchSample =
      '<Input id="promotion-search" placeholder="Buscar por nombre o ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />';
    expect(scanSource("features/demo/Search.tsx", searchSample)).toEqual([]);
    const constantIdSample =
      '<Input id={URL_INPUT_ID} type="text" inputMode="url" placeholder="https://ejemplo.com/menu" value={url} onChange={(e) => setUrl(e.target.value)} />';
    expect(scanSource("features/demo/UrlForm.tsx", constantIdSample)).toEqual([]);
  });

  it("treats a brace-bound id expression as an element-id passthrough, while a quoted id literal stays a signal", () => {
    // The reusable selector (S2) binds the HTML element id from a prop:
    // that is the input's DOM identity, not a datum. It must not be flagged.
    const passthroughSample =
      '<Input id={inputId} type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} />';
    expect(scanSource("components/ui/Selector.tsx", passthroughSample)).toEqual([]);
    // A quoted id literal stays a datum signal — the S1 pin is intact.
    const quotedSample =
      '<Input id="product_id" placeholder="Producto" />';
    const violations = scanSource("features/demo/DemoForm.tsx", quotedSample);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.field).toBe("product_id");
  });

  it("flags PLURAL identifier fields — the form the singular detector was blind to (§17.6, loyalty eligibleProductIds)", () => {
    // The exact shape that slipped through: a free-text comma list bound to
    // a camelCase plural. The datum is still a foreign key — one row per
    // comma — so the plural must be caught exactly like the singular.
    const camelPluralSample =
      '<Input id="eligible-products" placeholder="prod-smash, prod-burger" {...register(\'eligibleProductIds\')} />';
    const camelViolations = scanSource(
      "features/demo/DemoForm.tsx",
      camelPluralSample,
    );
    expect(camelViolations).toHaveLength(1);
    expect(camelViolations[0]?.field).toBe("eligibleProductIds");

    // Snake-case plural binds are the same datum.
    const snakePluralSample =
      '<Input name="product_ids" placeholder="IDs separados por coma" />';
    expect(scanSource("features/demo/DemoForm.tsx", snakePluralSample)).toHaveLength(1);
  });

  it("does not flag a plural carried by a governed shape: hidden input or search affordance", () => {
    // A plural datum can legitimately appear as a HIDDEN input carrying the
    // ids a governed selector picked — carriage, not entry: the operator
    // cannot type into it. The type filter (hidden ≠ text) must keep
    // exempting it now that plurals are detected.
    const hiddenCarrierSample =
      '<Input type="hidden" name="eligibleProductIds" value={pickedIds.join(",")} />';
    expect(scanSource("features/demo/DemoForm.tsx", hiddenCarrierSample)).toEqual([]);
    // The selector's visible search input stays exempt (search affordance).
    const searchSample =
      '<Input id="product-ids-search" placeholder="Buscar productos..." value={search} onChange={(e) => onSearchChange(e.target.value)} />';
    expect(scanSource("features/demo/DemoForm.tsx", searchSample)).toEqual([]);
  });
});
