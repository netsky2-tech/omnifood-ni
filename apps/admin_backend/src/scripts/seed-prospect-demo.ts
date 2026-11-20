import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../core/app/app.module';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import {
  TENANT_SLUG_MAX_LENGTH,
  normalizeTenantSlug,
} from '../modules/tenant/tenant-slug';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { CatalogService } from '../modules/catalog/catalog.service';
import {
  findPlan,
  type PlanCode,
  type SupportTier,
} from '../modules/entitlements/capability-registry';
import { TenantSubscriptionService } from '../modules/entitlements/tenant-subscription.service';
import {
  COMMERCIAL_FX_SPREAD_MAX,
  COMMERCIAL_FX_SPREAD_MIN,
  FiscalSetupService,
} from '../modules/onboarding/services/fiscal-setup.service';
import {
  CheckoutFxMode,
  FiscalRegime,
  TenantOperationMode,
} from '../modules/onboarding/dto/fiscal-setup.dto';
import { CompanyLogoService } from '../modules/onboarding/services/company-logo.service';
import { IndustryTemplateService } from '../modules/onboarding/services/industry-template.service';
import { DeviceLinkingService } from '../modules/onboarding/services/device-linking.service';
import { TenantTopologyRevisionService } from '../modules/fulfillment/services/tenant-topology-revision.service';
import { Insumo } from '../modules/inventory/entities/insumo.entity';
import {
  Product,
  ProductType,
} from '../modules/inventory/entities/product.entity';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../modules/sales/entities/cash-shift.entity';
import { Invoice } from '../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../modules/sales/entities/invoice-item.entity';
import { Payment } from '../modules/sales/entities/payment.entity';
import { assertSeedOutcome } from './provision-seed-guard';

/**
 * PARAMETERIZED SALES-DEMO PROVISIONING CLI
 *
 * Provisions a complete, isolated prospect demo tenant in one command using
 * real NestJS domain services so tenant isolation (RLS), password/PIN hashing,
 * fiscal configuration, industry template application, opening inventory/kardex
 * invariants (docs/inventario_marco_normativo.md R-01/R-03), historical sales,
 * and POS device linking work identically to production onboarding.
 *
 * Usage:
 *   npm run seed:prospect-demo -- --name "Café Central" --vertical cafeteria
 */

export type DemoVertical = 'cafeteria' | 'restaurante' | 'foodpark' | 'retail';

export const DEMO_VERTICALS: readonly DemoVertical[] = [
  'cafeteria',
  'restaurante',
  'foodpark',
  'retail',
];

export const VERTICAL_TO_TEMPLATE_CODE: Readonly<Record<DemoVertical, string>> =
  {
    cafeteria: 'CAFETERIA',
    restaurante: 'BAR_RESTAURANTE',
    foodpark: 'BAR_RESTAURANTE',
    retail: 'RETAIL_MINIMARKET',
  };

export const VERTICAL_DEFAULT_MODE: Readonly<
  Record<DemoVertical, TenantOperationMode>
> = {
  cafeteria: TenantOperationMode.FOODPARK_QSR,
  restaurante: TenantOperationMode.RESTAURANT,
  foodpark: TenantOperationMode.FOODPARK_QSR,
  retail: TenantOperationMode.FOODPARK_QSR,
};

export const DEFAULT_DEMO_RUC = 'J0310000000000';
export const DEFAULT_FX_RATE = 36.62;
export const DEFAULT_PLAN_CODE: PlanCode = 'PRO';
export const DEFAULT_INVOICE_COUNT = 24;
export const MIN_INVOICE_COUNT = 0;
export const MAX_INVOICE_COUNT = 100;
export const DEFAULT_DEMO_PASSWORD = 'Demo1234!';
export const DEFAULT_LINKING_EXPIRY_MINUTES = 120;
export const DEFAULT_FISCAL_SERIES = 'A';
export const POS_ANDROID_PACKAGE_ID = 'com.nhilos.pos_app';

export const DEMO_USER_PINS = {
  OWNER: '1234',
  CASHIER: '1111',
  SUPERVISOR: '9999',
} as const;

export const ALLOW_PRODUCTION_DEMO_SEED_ENV = 'ALLOW_DEMO_SEED_IN_PRODUCTION';
export const ALLOW_PRODUCTION_DEMO_SEED_TOKEN = 'I_UNDERSTAND_THE_RISK';

export const PROSPECT_DEMO_ERROR_CODES = {
  MISSING_NAME: 'PROSPECT_DEMO_MISSING_NAME',
  INVALID_SLUG: 'PROSPECT_DEMO_INVALID_SLUG',
  INVALID_VERTICAL: 'PROSPECT_DEMO_INVALID_VERTICAL',
  INVALID_MODE: 'PROSPECT_DEMO_INVALID_MODE',
  INVALID_FX: 'PROSPECT_DEMO_INVALID_FX',
  INVALID_LOGO: 'PROSPECT_DEMO_INVALID_LOGO',
  INVALID_PLAN: 'PROSPECT_DEMO_INVALID_PLAN',
  INVALID_INVOICES: 'PROSPECT_DEMO_INVALID_INVOICES',
  INVALID_EMAIL: 'PROSPECT_DEMO_INVALID_EMAIL',
  INVALID_PASSWORD: 'PROSPECT_DEMO_INVALID_PASSWORD',
  UNKNOWN_FLAG: 'PROSPECT_DEMO_UNKNOWN_FLAG',
  MISSING_FLAG_VALUE: 'PROSPECT_DEMO_MISSING_FLAG_VALUE',
  PRODUCTION_FORBIDDEN: 'PROSPECT_DEMO_PRODUCTION_FORBIDDEN',
  DUPLICATE_SLUG: 'PROSPECT_DEMO_DUPLICATE_SLUG',
} as const;

export type ProspectDemoErrorCode =
  (typeof PROSPECT_DEMO_ERROR_CODES)[keyof typeof PROSPECT_DEMO_ERROR_CODES];

export class ProspectDemoArgsError extends Error {
  constructor(
    readonly code: ProspectDemoErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ProspectDemoArgsError';
  }
}

export class ProspectDemoGuardError extends Error {
  constructor(
    readonly code: ProspectDemoErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ProspectDemoGuardError';
  }
}

export interface ProspectDemoConfig {
  readonly help: false;
  readonly name: string;
  readonly slug: string;
  readonly vertical: DemoVertical;
  readonly templateCode: string;
  readonly mode: TenantOperationMode;
  readonly fx: number;
  readonly logoPath: string | null;
  readonly planCode: PlanCode;
  readonly supportTier: SupportTier;
  readonly invoices: number;
  readonly email: string;
  readonly password: string;
}

export type ParsedProspectDemoArgs =
  | { readonly help: true }
  | ProspectDemoConfig;

export function isProspectDemoConfig(
  parsed: ParsedProspectDemoArgs,
): parsed is ProspectDemoConfig {
  return !parsed.help;
}

export interface ParseArgsOptions {
  readonly checkFileReadable?: (filePath: string) => boolean;
}

const KNOWN_VALUE_FLAGS = new Set([
  'name',
  'slug',
  'vertical',
  'mode',
  'fx',
  'logo',
  'plan',
  'invoices',
  'email',
  'password',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;

/**
 * Strips accents/diacritics and punctuation, then delegates to the canonical
 * `normalizeTenantSlug` with a `demo-` prefix capped at 50 characters.
 */
export function normalizeDemoSlug(rawName: string): string {
  const ascii = (rawName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]+/g, ' ')
    .trim();

  if (!ascii) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.INVALID_SLUG,
      `Name '${rawName}' does not produce a valid slug.`,
    );
  }

  const base = normalizeTenantSlug(ascii);
  const prefixed = base.startsWith('demo-') ? base : `demo-${base}`;
  if (prefixed.length <= TENANT_SLUG_MAX_LENGTH) {
    return prefixed;
  }

  const cut = prefixed.slice(0, TENANT_SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  const bounded =
    lastDash > 'demo-'.length
      ? cut.slice(0, lastDash)
      : cut.replace(/-+$/, '');
  return bounded.replace(/-+$/, '');
}

function defaultCheckFileReadable(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function formatUsage(): string {
  return [
    'Usage: npm run seed:prospect-demo -- --name "<Business Name>" [options]',
    '',
    'Options:',
    '  --name <string>        Required. Prospect business display name (e.g. "Café Central")',
    '  --slug <string>        Optional. Tenant slug (default: demo-<normalized-name>)',
    '  --vertical <value>     Optional. cafeteria | restaurante | foodpark | retail (default: cafeteria)',
    '  --mode <value>         Optional. FOODPARK_QSR | RESTAURANT | HYBRID',
    '                         (default: RESTAURANT for restaurante; FOODPARK_QSR for others)',
    `  --fx <number>          Optional. Commercial FX rate NIO/USD, ${COMMERCIAL_FX_SPREAD_MIN}..${COMMERCIAL_FX_SPREAD_MAX} (default: ${DEFAULT_FX_RATE})`,
    '  --logo <path>          Optional. Path to a readable PNG logo file',
    `  --plan <code >         Optional. Plan code: ESENCIAL | OPERACION | PRO (default: ${DEFAULT_PLAN_CODE})`,
    `  --invoices <number>    Optional. Historical invoices over last 7 days, ${MIN_INVOICE_COUNT}..${MAX_INVOICE_COUNT} (default: ${DEFAULT_INVOICE_COUNT})`,
    '  --email <string>       Optional. Owner login email (default: admin@<slug>.nhilos.demo)',
    `  --password <string>    Optional. Shared password for demo users (default: ${DEFAULT_DEMO_PASSWORD})`,
    '  --help, -h             Print this help message and exit 0',
  ].join('\n');
}

export function parseArgs(
  argv: readonly string[],
  options: ParseArgsOptions = {},
): ParsedProspectDemoArgs {
  const checkReadable = options.checkFileReadable ?? defaultCheckFileReadable;
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      return { help: true };
    }
    if (!token.startsWith('--')) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.UNKNOWN_FLAG,
        `Unrecognized argument '${token}'. Pass --help for usage.`,
      );
    }

    const eqIndex = token.indexOf('=');
    let key: string;
    let value: string;
    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
      if (!KNOWN_VALUE_FLAGS.has(key)) {
        throw new ProspectDemoArgsError(
          PROSPECT_DEMO_ERROR_CODES.UNKNOWN_FLAG,
          `Unrecognized flag '--${key}'. Pass --help for usage.`,
        );
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new ProspectDemoArgsError(
          PROSPECT_DEMO_ERROR_CODES.MISSING_FLAG_VALUE,
          `Flag '--${key}' requires a value.`,
        );
      }
      value = next;
      i += 1;
    }

    if (!KNOWN_VALUE_FLAGS.has(key)) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.UNKNOWN_FLAG,
        `Unrecognized flag '--${key}'. Pass --help for usage.`,
      );
    }

    flags.set(key, value);
  }

  const name = (flags.get('name') ?? '').trim();
  if (!name) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.MISSING_NAME,
      'Required flag --name <string> is missing or empty.',
    );
  }

  const rawSlug = flags.get('slug');
  let slug: string;
  if (rawSlug !== undefined) {
    const trimmedSlug = rawSlug.trim().toLowerCase();
    if (
      !trimmedSlug ||
      trimmedSlug.length > TENANT_SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(trimmedSlug)
    ) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_SLUG,
        `Invalid --slug '${rawSlug}'. Must match [a-z0-9-] (no leading/trailing dashes) and be <= ${TENANT_SLUG_MAX_LENGTH} characters.`,
      );
    }
    slug = trimmedSlug;
  } else {
    slug = normalizeDemoSlug(name);
  }

  const rawVertical = (flags.get('vertical') ?? 'cafeteria')
    .trim()
    .toLowerCase();
  if (!DEMO_VERTICALS.includes(rawVertical as DemoVertical)) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.INVALID_VERTICAL,
      `Invalid --vertical '${rawVertical}'. Allowed values: ${DEMO_VERTICALS.join(', ')}.`,
    );
  }
  const vertical = rawVertical as DemoVertical;

  const rawMode = flags.get('mode');
  let mode: TenantOperationMode;
  if (rawMode !== undefined) {
    const upperMode = rawMode.trim().toUpperCase();
    const validModes = Object.values(TenantOperationMode) as string[];
    if (!validModes.includes(upperMode)) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_MODE,
        `Invalid --mode '${rawMode}'. Allowed values: ${validModes.join(', ')}.`,
      );
    }
    mode = upperMode as TenantOperationMode;
  } else {
    mode = VERTICAL_DEFAULT_MODE[vertical];
  }

  const rawFx = flags.get('fx');
  let fx = DEFAULT_FX_RATE;
  if (rawFx !== undefined) {
    const parsedFx = Number(rawFx.trim());
    if (
      !Number.isFinite(parsedFx) ||
      parsedFx <= 0 ||
      parsedFx < COMMERCIAL_FX_SPREAD_MIN ||
      parsedFx > COMMERCIAL_FX_SPREAD_MAX
    ) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_FX,
        `Invalid --fx '${rawFx}'. Must be a number > 0 within ${COMMERCIAL_FX_SPREAD_MIN}..${COMMERCIAL_FX_SPREAD_MAX}.`,
      );
    }
    fx = parsedFx;
  }

  const rawLogo = flags.get('logo');
  let logoPath: string | null = null;
  if (rawLogo !== undefined) {
    const trimmedLogo = rawLogo.trim();
    if (!trimmedLogo) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_LOGO,
        '--logo path must not be empty.',
      );
    }
    const resolvedLogo = path.resolve(trimmedLogo);
    if (!resolvedLogo.toLowerCase().endsWith('.png')) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_LOGO,
        `Logo file '${trimmedLogo}' must be a .png file.`,
      );
    }
    if (!checkReadable(resolvedLogo)) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_LOGO,
        `Logo file '${resolvedLogo}' does not exist or is not readable.`,
      );
    }
    logoPath = resolvedLogo;
  }

  const rawPlan = (flags.get('plan') ?? DEFAULT_PLAN_CODE).trim().toUpperCase();
  const plan = findPlan(rawPlan);
  if (!plan) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.INVALID_PLAN,
      `Unknown --plan '${rawPlan}'. Allowed plans: ESENCIAL, OPERACION, PRO.`,
    );
  }

  const rawInvoices = flags.get('invoices');
  let invoices = DEFAULT_INVOICE_COUNT;
  if (rawInvoices !== undefined) {
    const trimmedInvoices = rawInvoices.trim();
    const parsedInvoices = Number(trimmedInvoices);
    if (
      trimmedInvoices === '' ||
      !Number.isInteger(parsedInvoices) ||
      parsedInvoices < MIN_INVOICE_COUNT ||
      parsedInvoices > MAX_INVOICE_COUNT
    ) {
      throw new ProspectDemoArgsError(
        PROSPECT_DEMO_ERROR_CODES.INVALID_INVOICES,
        `Invalid --invoices '${rawInvoices}'. Must be an integer between ${MIN_INVOICE_COUNT} and ${MAX_INVOICE_COUNT}.`,
      );
    }
    invoices = parsedInvoices;
  }

  const email = (
    flags.get('email') ?? `admin@${slug}.nhilos.demo`
  )
    .trim()
    .toLowerCase();
  if (!BASIC_EMAIL_PATTERN.test(email)) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.INVALID_EMAIL,
      `Invalid --email '${email}'.`,
    );
  }

  const password = flags.get('password') ?? DEFAULT_DEMO_PASSWORD;
  if (password.length < 8) {
    throw new ProspectDemoArgsError(
      PROSPECT_DEMO_ERROR_CODES.INVALID_PASSWORD,
      '--password must contain at least 8 characters.',
    );
  }

  return {
    help: false,
    name,
    slug,
    vertical,
    templateCode: VERTICAL_TO_TEMPLATE_CODE[vertical],
    mode,
    fx,
    logoPath,
    planCode: plan.planCode,
    supportTier: plan.supportTier,
    invoices,
    email,
    password,
  };
}

/**
 * Production safety guard: refuses to seed demo tenants when running against
 * a production environment unless explicitly acknowledged by the operator.
 */
export function assertNotProductionEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const envSignals = [
    env.NODE_ENV,
    env.APP_ENV,
    env.RAILWAY_ENVIRONMENT,
    env.RENDER_ENV,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());

  const isProd = envSignals.includes('production') || envSignals.includes('prod');
  if (!isProd) {
    return;
  }

  if (env[ALLOW_PRODUCTION_DEMO_SEED_ENV] === ALLOW_PRODUCTION_DEMO_SEED_TOKEN) {
    return;
  }

  throw new ProspectDemoGuardError(
    PROSPECT_DEMO_ERROR_CODES.PRODUCTION_FORBIDDEN,
    `Refusing to seed a demo tenant in production. Set ${ALLOW_PRODUCTION_DEMO_SEED_ENV}=${ALLOW_PRODUCTION_DEMO_SEED_TOKEN} only if you explicitly intend to bypass this guard.`,
  );
}

export interface RestaurantTableSeed {
  readonly code: string;
  readonly name: string;
  readonly capacity: number;
  readonly status: 'AVAILABLE';
}

export interface RestaurantAreaSeed {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly tables: readonly RestaurantTableSeed[];
}

export interface RestaurantTopologySeed {
  readonly contractVersion: number;
  readonly topology: Record<string, unknown>;
  readonly hash: string;
}

export function shouldSeedRestaurantTables(mode: TenantOperationMode): boolean {
  return (
    mode === TenantOperationMode.RESTAURANT ||
    mode === TenantOperationMode.HYBRID
  );
}

export function buildDefaultRestaurantTopology(
  mode: TenantOperationMode,
): RestaurantTopologySeed {
  const areas: RestaurantAreaSeed[] = [
    {
      code: 'SALON_PRINCIPAL',
      name: 'Salón Principal',
      sortOrder: 1,
      tables: [
        { code: 'M-01', name: 'Mesa 1', capacity: 4, status: 'AVAILABLE' },
        { code: 'M-02', name: 'Mesa 2', capacity: 4, status: 'AVAILABLE' },
        { code: 'M-03', name: 'Mesa 3', capacity: 2, status: 'AVAILABLE' },
        { code: 'M-04', name: 'Mesa 4', capacity: 4, status: 'AVAILABLE' },
        { code: 'M-05', name: 'Mesa 5', capacity: 6, status: 'AVAILABLE' },
        { code: 'M-06', name: 'Mesa 6', capacity: 6, status: 'AVAILABLE' },
      ],
    },
    {
      code: 'TERRAZA',
      name: 'Terraza',
      sortOrder: 2,
      tables: [
        { code: 'T-01', name: 'Terraza 1', capacity: 4, status: 'AVAILABLE' },
        { code: 'T-02', name: 'Terraza 2', capacity: 4, status: 'AVAILABLE' },
        { code: 'T-03', name: 'Terraza 3', capacity: 4, status: 'AVAILABLE' },
        { code: 'T-04', name: 'Terraza 4', capacity: 6, status: 'AVAILABLE' },
      ],
    },
  ];

  const topology: Record<string, unknown> = {
    operationMode: mode,
    channels: ['KDS_AND_PRINT'],
    devices: [],
    areas,
    tableCount: areas.reduce((sum, area) => sum + area.tables.length, 0),
  };

  const hash = createHash('sha256')
    .update(JSON.stringify(topology))
    .digest('hex');

  return {
    contractVersion: 1,
    topology,
    hash,
  };
}

export interface InvoiceProductCandidate {
  readonly id: string;
  readonly name: string;
  readonly sellPrice: number;
  readonly taxRate: number;
}

export interface PlannedInvoiceItem {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
  readonly taxAmount: number;
  readonly total: number;
}

export interface PlannedPayment {
  readonly method: 'CASH' | 'USD' | 'CARD';
  readonly currency: 'NIO' | 'USD';
  readonly amount: number;
  readonly exchangeRate: number;
  readonly amountNio: number;
  readonly bankPos?: 'BAC' | 'BANPRO';
  readonly voucherCode?: string;
  readonly cardBrand?: 'VISA';
  readonly reconciliationStatus: 'RECONCILED' | 'PENDING_RECONCILIATION';
}

export interface PlannedInvoice {
  readonly number: string;
  readonly issuedAt: Date;
  readonly localIssueDate: string;
  readonly subtotal: number;
  readonly totalTax: number;
  readonly total: number;
  readonly totalUsd: number;
  readonly items: readonly PlannedInvoiceItem[];
  readonly payment: PlannedPayment;
}

/**
 * Generates deterministic, realistic historical invoices distributed across
 * the last 7 days (from 6 days ago up to `now`), with sequential folios
 * (`A-000001`..), mixed NIO/USD/CARD payments, and 1 pending voucher when at
 * least one card payment is generated.
 */
export function buildHistoricalInvoicePlan(
  count: number,
  products: readonly InvoiceProductCandidate[],
  fxRate: number,
  now: Date = new Date(),
): PlannedInvoice[] {
  if (count <= 0 || products.length === 0) {
    return [];
  }

  const plans: PlannedInvoice[] = [];
  const lastCardIndex = (() => {
    let idx = -1;
    for (let i = 1; i <= count; i += 1) {
      if (i % 4 === 0) {
        idx = i;
      }
    }
    return idx;
  })();

  for (let i = 1; i <= count; i += 1) {
    // Spread invoices evenly across the last 7 days (daysOffset: 6 -> 0).
    const daysOffset = Math.floor(((count - i) * 7) / count);
    const issuedAt = new Date(now.getTime());
    issuedAt.setDate(now.getDate() - daysOffset);
    issuedAt.setHours(8 + ((i * 2) % 12), (i * 17) % 60, (i * 11) % 60, 0);
    if (issuedAt.getTime() > now.getTime()) {
      issuedAt.setTime(now.getTime() - (count - i + 1) * 60_000);
    }

    const p1 = products[(i - 1) % products.length];
    const qty1 = 1 + (i % 2);
    const items: PlannedInvoiceItem[] = [];

    const addItem = (candidate: InvoiceProductCandidate, qty: number): void => {
      const unitPrice = Number(candidate.sellPrice) > 0 ? Number(candidate.sellPrice) : 75;
      const taxRate = Number(candidate.taxRate) >= 0 ? Number(candidate.taxRate) : 0;
      const lineSub = round2(unitPrice * qty);
      const lineTax = round2(lineSub * taxRate);
      const lineTotal = round2(lineSub + lineTax);
      items.push({
        productId: candidate.id,
        productName: candidate.name,
        quantity: qty,
        unitPrice,
        taxRate,
        taxAmount: lineTax,
        total: lineTotal,
      });
    };

    addItem(p1, qty1);
    if (products.length > 1 && i % 3 === 0) {
      const p2 = products[(i + 2) % products.length];
      if (p2.id !== p1.id) {
        addItem(p2, 1);
      }
    }

    const subtotal = round2(
      items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    );
    const totalTax = round2(items.reduce((acc, item) => acc + item.taxAmount, 0));
    const total = round2(subtotal + totalTax);
    const totalUsd = round2(total / fxRate);

    const method: 'CASH' | 'USD' | 'CARD' =
      i % 4 === 0 ? 'CARD' : i % 3 === 0 ? 'USD' : 'CASH';
    const bankPos: 'BAC' | 'BANPRO' | undefined =
      method === 'CARD' ? (i % 8 === 0 ? 'BANPRO' : 'BAC') : undefined;
    const isPendingVoucher = method === 'CARD' && i === lastCardIndex;

    const payment: PlannedPayment = {
      method,
      currency: method === 'USD' ? 'USD' : 'NIO',
      amount: method === 'USD' ? totalUsd : total,
      exchangeRate: fxRate,
      amountNio: total,
      bankPos,
      voucherCode: bankPos ? `VOUCH-${1000 + i}` : undefined,
      cardBrand: bankPos ? 'VISA' : undefined,
      reconciliationStatus: isPendingVoucher
        ? 'PENDING_RECONCILIATION'
        : 'RECONCILED',
    };

    plans.push({
      number: `${DEFAULT_FISCAL_SERIES}-${String(i).padStart(6, '0')}`,
      issuedAt,
      localIssueDate: issuedAt.toISOString().slice(0, 10),
      subtotal,
      totalTax,
      total,
      totalUsd,
      items,
      payment,
    });
  }

  return plans;
}

export interface ProspectDemoDeps {
  readonly dataSource: DataSource;
  readonly catalogService: Pick<CatalogService, 'seedDefaults'>;
  readonly tenantSubscriptionService: Pick<
    TenantSubscriptionService,
    'changePlan'
  >;
  readonly fiscalSetupService: Pick<
    FiscalSetupService,
    'configureFiscalSetup'
  >;
  readonly companyLogoService: Pick<CompanyLogoService, 'uploadLogo'>;
  readonly industryTemplateService: Pick<
    IndustryTemplateService,
    'applyTemplate'
  >;
  readonly tenantTopologyRevisionService: Pick<
    TenantTopologyRevisionService,
    'create'
  >;
  readonly deviceLinkingService: Pick<
    DeviceLinkingService,
    'generateLinkingCode'
  >;
  readonly readLogoFile?: (logoPath: string) => Buffer;
  readonly hashSecret?: (plain: string) => Promise<string>;
}

export interface ProvisionedDemoUser {
  readonly id: string;
  readonly label: 'OWNER' | 'CASHIER' | 'SUPERVISOR';
  readonly role: UserRole;
  readonly email: string;
  readonly pin: string;
}

export interface ProspectDemoResult {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly slug: string;
  readonly vertical: DemoVertical;
  readonly templateCode: string;
  readonly mode: TenantOperationMode;
  readonly fx: number;
  readonly planCode: PlanCode;
  readonly subscriptionId: string;
  readonly logoUploaded: boolean;
  readonly logoSha256: string | null;
  readonly users: {
    readonly owner: ProvisionedDemoUser;
    readonly cashier: ProvisionedDemoUser;
    readonly supervisor: ProvisionedDemoUser;
  };
  readonly password: string;
  readonly catalogValuesSeeded: number;
  readonly templateProductsCreated: number;
  readonly templateInsumosCreated: number;
  readonly openingInsumosSeeded: number;
  readonly openingProductsSeeded: number;
  readonly restaurantTablesSeeded: number;
  readonly cashShiftId: string;
  readonly invoicesCreated: number;
  readonly linkingCode: string;
  readonly linkingCodeExpiresAt: Date;
}

async function seedOpeningInventoryAndSales(
  manager: EntityManager,
  params: {
    tenantId: string;
    cashier: { id: string; name: string };
    fx: number;
    invoiceCount: number;
  },
): Promise<{
  openingInsumosSeeded: number;
  openingProductsSeeded: number;
  cashShiftId: string;
  invoicesCreated: number;
}> {
  const { tenantId, cashier, fx, invoiceCount } = params;

  // Opening inventory & kardex entries (docs/inventario_marco_normativo.md R-01/R-03):
  // - Non-negative unit cost (costo_promedio_nio >= 0)
  // - Transaction-scoped advisory lock matching seed-general-demo-tenant.ts
  // - Append-only INITIAL_STOCK entry in inventory_kardex so the running-balance
  //   trigger holds for every subsequent recipe-driven sale.
  await manager.query(
    `SELECT pg_advisory_xact_lock(hashtext($1), hashtext('inventory_kardex_seed_opening'))`,
    [tenantId],
  );

  const insumos = await manager.find(Insumo, {
    where: { tenant_id: tenantId },
    order: { name: 'ASC' },
  });

  let openingInsumosSeeded = 0;
  for (let idx = 0; idx < insumos.length; idx += 1) {
    const insumo = insumos[idx];
    const parLevel = Number(insumo.parLevel ?? 0);
    const minStock = Number(insumo.minStock ?? 0);
    const openingQty = round4(
      parLevel > 0 ? parLevel : minStock > 0 ? minStock * 3 : 50,
    );
    const unitCostNio = round4(
      Number(insumo.averageCost) > 0
        ? Number(insumo.averageCost)
        : 12 + (idx % 10) * 3.5,
    );
    const totalCostNio = round4(openingQty * unitCostNio);

    insumo.stock = openingQty;
    insumo.existenciaActual = openingQty;
    insumo.averageCost = unitCostNio;
    await manager.save(Insumo, insumo);

    await manager.query(
      `INSERT INTO inventory_kardex (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio, total_cost_nio, stock_before, stock_after, source_document_type, source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED', 'prospect-demo-initial', NOW())`,
      [tenantId, insumo.id, openingQty, unitCostNio, totalCostNio],
    );
    openingInsumosSeeded += 1;
  }

  const products = await manager.find(Product, {
    where: { tenant_id: tenantId, is_active: true },
    order: { name: 'ASC' },
  });

  let openingProductsSeeded = 0;
  for (const product of products) {
    if (product.product_type === ProductType.SIMPLE) {
      const sellPrice = Number(product.sellPrice) > 0 ? Number(product.sellPrice) : 50;
      const avgCost = round2(Math.max(0, sellPrice * 0.55));
      product.stock = 50;
      product.averageCost = avgCost;
      await manager.save(Product, product);
      openingProductsSeeded += 1;
    }
  }

  // Open Cash Shift Session on CAJA-01
  const plannedInvoices = buildHistoricalInvoicePlan(
    invoiceCount,
    products.map((product) => ({
      id: product.id,
      name: product.name,
      sellPrice: Number(product.sellPrice),
      taxRate: Number(product.tax_rate ?? 0),
    })),
    fx,
  );

  const cashSalesNio = round2(
    plannedInvoices
      .filter((inv) => inv.payment.method === 'CASH')
      .reduce((sum, inv) => sum + inv.payment.amountNio, 0),
  );

  const shift = await manager.save(
    CashShiftSession,
    manager.create(CashShiftSession, {
      tenant_id: tenantId,
      terminal_id: 'CAJA-01',
      cashier_id: cashier.id,
      cashier_name: cashier.name,
      status: CashShiftStatus.OPEN,
      initial_float_nio: 2000.0,
      initial_float_usd: 50.0,
      expected_cash_nio: round2(2000.0 + cashSalesNio),
    }),
  );

  for (const planned of plannedInvoices) {
    const savedInv = await manager.save(
      Invoice,
      manager.create(Invoice, {
        tenant_id: tenantId,
        number: planned.number,
        userId: cashier.id,
        created_at: planned.issuedAt,
        subtotal: planned.subtotal,
        totalTax: planned.totalTax,
        total: planned.total,
        isCanceled: false,
        paymentStatus: 'PAID',
        shiftId: shift.id,
        localIssueDate: planned.localIssueDate,
        bcnOfficialRate: fx,
        totalUsd: planned.totalUsd,
      }),
    );

    for (const item of planned.items) {
      await manager.save(
        InvoiceItem,
        manager.create(InvoiceItem, {
          tenant_id: tenantId,
          invoiceId: savedInv.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          originalTaxRate: item.taxRate,
          appliedTaxRate: item.taxRate,
          taxAmount: item.taxAmount,
          total: item.total,
        }),
      );
    }

    await manager.save(
      Payment,
      manager.create(Payment, {
        invoiceId: savedInv.id,
        method: planned.payment.method,
        amount: planned.payment.amount,
        currency: planned.payment.currency,
        exchangeRate: planned.payment.exchangeRate,
        amountNio: planned.payment.amountNio,
        changeGiven: 0,
        bankPos: planned.payment.bankPos,
        voucherCode: planned.payment.voucherCode,
        cardBrand: planned.payment.cardBrand,
        reconciliationStatus: planned.payment.reconciliationStatus,
        reconciledAt:
          planned.payment.reconciliationStatus === 'RECONCILED'
            ? planned.issuedAt
            : undefined,
        createdAt: planned.issuedAt,
      }),
    );
  }

  return {
    openingInsumosSeeded,
    openingProductsSeeded,
    cashShiftId: shift.id,
    invoicesCreated: plannedInvoices.length,
  };
}

export async function seedProspectDemo(
  config: ProspectDemoConfig,
  deps: ProspectDemoDeps,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ProspectDemoResult> {
  // 0. Production guard
  assertNotProductionEnvironment(env);

  // 1. Duplicate slug check (fail gracefully, never destroy an existing tenant)
  const existingTenant = await deps.dataSource
    .getRepository(Tenant)
    .findOne({ where: { slug: config.slug } });
  if (existingTenant) {
    throw new ProspectDemoGuardError(
      PROSPECT_DEMO_ERROR_CODES.DUPLICATE_SLUG,
      `A tenant with slug '${config.slug}' already exists (id=${existingTenant.id}, name='${existingTenant.name}'). Re-run with a different --slug value.`,
    );
  }

  const hashSecret =
    deps.hashSecret ?? ((plain: string) => bcrypt.hash(plain, 10));
  const readLogo = deps.readLogoFile ?? ((filePath: string) => fs.readFileSync(filePath));

  const tenantId = randomUUID();
  const passwordHash = await hashSecret(config.password);
  const ownerPinHash = await hashSecret(DEMO_USER_PINS.OWNER);
  const cashierPinHash = await hashSecret(DEMO_USER_PINS.CASHIER);
  const supervisorPinHash = await hashSecret(DEMO_USER_PINS.SUPERVISOR);

  const cashierEmail = `caja@${config.slug}.nhilos.demo`;
  const supervisorEmail = `supervisor@${config.slug}.nhilos.demo`;

  // 2. Create Tenant + 3 Users (OWNER, CASHIER, SUPERVISOR/MANAGER) + SecurityProfiles
  const createdUsers = await runInTenantTransaction(
    deps.dataSource,
    tenantId,
    async (manager) => {
      const tenant = manager.create(Tenant, {
        id: tenantId,
        name: config.name,
        slug: config.slug,
        ruc: DEFAULT_DEMO_RUC,
        email: config.email,
        is_active: true,
      });
      await manager.save(Tenant, tenant);

      const createUserWithPin = async (input: {
        name: string;
        email: string;
        role: UserRole;
        pinHash: string;
      }): Promise<User> => {
        const user = await manager.save(
          User,
          manager.create(User, {
            tenant_id: tenantId,
            name: input.name,
            email: input.email,
            role: input.role,
            password_hash: passwordHash,
            is_active: true,
          }),
        );
        await manager.save(
          SecurityProfile,
          manager.create(SecurityProfile, {
            user_id: user.id,
            pin_hash: input.pinHash,
            is_pin_enabled: true,
            is_totp_enabled: false,
          }),
        );
        return user;
      };

      const owner = await createUserWithPin({
        name: `Propietario ${config.name}`,
        email: config.email,
        role: UserRole.OWNER,
        pinHash: ownerPinHash,
      });

      const cashier = await createUserWithPin({
        name: 'Cajero Principal',
        email: cashierEmail,
        role: UserRole.CASHIER,
        pinHash: cashierPinHash,
      });

      const supervisor = await createUserWithPin({
        name: 'Supervisor de Turno',
        email: supervisorEmail,
        role: UserRole.MANAGER,
        pinHash: supervisorPinHash,
      });

      return { owner, cashier, supervisor };
    },
  );

  // 3. Seed default master catalogs + hard verification guard
  const catalogValuesSeeded = await deps.catalogService.seedDefaults(tenantId);
  assertSeedOutcome(tenantId, catalogValuesSeeded);

  // 4. Audited plan subscription
  const subscription = await deps.tenantSubscriptionService.changePlan({
    tenantId,
    planCode: config.planCode,
    supportTier: config.supportTier,
    addOns: [],
    startsAt: new Date(),
    actor: config.email,
    reason: `Prospect demo provisioning (${config.vertical}/${config.mode}) via seed:prospect-demo`,
  });

  // 5. Fiscal setup (CUOTA_FIJA, configured FX, DGI authorization, operationMode, businessName)
  await deps.fiscalSetupService.configureFiscalSetup(
    tenantId,
    {
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: config.name,
      ruc: DEFAULT_DEMO_RUC,
      commercialFxSpread: config.fx,
      pricesIncludeTax: true,
      operationMode: config.mode,
      checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      email: config.email,
      phone: '+505 8194 8526',
      address: 'Managua, Nicaragua',
      dgiAuthorizationCode: 'DGI-DEMO-2026-001',
      dgiAuthorizationIssuedAt: '2026-01-01',
      dgiAuthorizationExpiresAt: '2027-12-31',
    },
    createdUsers.owner.id,
  );

  // 6. Optional PNG logo upload
  let logoUploaded = false;
  let logoSha256: string | null = null;
  if (config.logoPath) {
    const logoBytes = readLogo(config.logoPath);
    const uploaded = await deps.companyLogoService.uploadLogo(tenantId, {
      content_type: 'image/png',
      data: logoBytes.toString('base64'),
    });
    logoUploaded = true;
    logoSha256 = uploaded.sha256;
  }

  // 7. Apply mapped industry template
  const templateResult = await deps.industryTemplateService.applyTemplate(
    tenantId,
    config.templateCode,
    {
      idempotencyKey: `prospect-demo-${tenantId}-${config.templateCode}`,
    },
    createdUsers.owner.id,
  );

  // 8. Seed restaurant areas & tables topology ONLY for RESTAURANT / HYBRID
  let restaurantTablesSeeded = 0;
  if (shouldSeedRestaurantTables(config.mode)) {
    const topologySeed = buildDefaultRestaurantTopology(config.mode);
    await deps.tenantTopologyRevisionService.create({
      tenantId,
      baseRevision: 0,
      contractVersion: topologySeed.contractVersion,
      topology: topologySeed.topology,
      hash: topologySeed.hash,
    });
    restaurantTablesSeeded = Number(topologySeed.topology.tableCount ?? 0);
  }

  // 9. Opening inventory/kardex + open cash shift + historical invoices
  const opsSummary = await runInTenantTransaction(
    deps.dataSource,
    tenantId,
    (manager) =>
      seedOpeningInventoryAndSales(manager, {
        tenantId,
        cashier: {
          id: createdUsers.cashier.id,
          name: createdUsers.cashier.name,
        },
        fx: config.fx,
        invoiceCount: config.invoices,
      }),
  );

  // 10. Generate fresh 6-character POS linking code using newly created OWNER ID
  const linking = await deps.deviceLinkingService.generateLinkingCode(
    tenantId,
    createdUsers.owner.id,
    { expiryMinutes: DEFAULT_LINKING_EXPIRY_MINUTES },
  );

  return {
    tenantId,
    tenantName: config.name,
    slug: config.slug,
    vertical: config.vertical,
    templateCode: config.templateCode,
    mode: config.mode,
    fx: config.fx,
    planCode: config.planCode,
    subscriptionId: subscription.subscriptionId,
    logoUploaded,
    logoSha256,
    users: {
      owner: {
        id: createdUsers.owner.id,
        label: 'OWNER',
        role: createdUsers.owner.role,
        email: createdUsers.owner.email,
        pin: DEMO_USER_PINS.OWNER,
      },
      cashier: {
        id: createdUsers.cashier.id,
        label: 'CASHIER',
        role: createdUsers.cashier.role,
        email: createdUsers.cashier.email,
        pin: DEMO_USER_PINS.CASHIER,
      },
      supervisor: {
        id: createdUsers.supervisor.id,
        label: 'SUPERVISOR',
        role: createdUsers.supervisor.role,
        email: createdUsers.supervisor.email,
        pin: DEMO_USER_PINS.SUPERVISOR,
      },
    },
    password: config.password,
    catalogValuesSeeded,
    templateProductsCreated: templateResult.productsCreated,
    templateInsumosCreated: templateResult.insumosCreated,
    openingInsumosSeeded: opsSummary.openingInsumosSeeded,
    openingProductsSeeded: opsSummary.openingProductsSeeded,
    restaurantTablesSeeded,
    cashShiftId: opsSummary.cashShiftId,
    invoicesCreated: opsSummary.invoicesCreated,
    linkingCode: linking.code,
    linkingCodeExpiresAt: linking.expiresAt,
  };
}

export function formatSummary(result: ProspectDemoResult): string {
  const lines = [
    '====================================================================',
    '  NHILOS PROSPECT DEMO READY',
    '====================================================================',
    `  Tenant Name:       ${result.tenantName}`,
    `  Tenant ID:         ${result.tenantId}`,
    `  Slug:              ${result.slug}`,
    `  Vertical / Mode:   ${result.vertical} (${result.templateCode}) / ${result.mode}`,
    `  Plan:              ${result.planCode} (subscription: ${result.subscriptionId})`,
    `  FX Rate (NIO/USD): ${result.fx.toFixed(2)}`,
    `  Logo Uploaded:     ${result.logoUploaded ? `yes (sha256: ${result.logoSha256})` : 'no'}`,
    '--------------------------------------------------------------------',
    '  CREDENTIALS (Shared password: ' + result.password + ')',
    `  OWNER:             ${result.users.owner.email}  | PIN: ${result.users.owner.pin}`,
    `  CASHIER:           ${result.users.cashier.email}  | PIN: ${result.users.cashier.pin}`,
    `  SUPERVISOR:        ${result.users.supervisor.email}  | PIN: ${result.users.supervisor.pin}`,
    '--------------------------------------------------------------------',
    '  SEEDED DATA',
    `  Master Catalogs:   ${result.catalogValuesSeeded} values`,
    `  Template Menu:     ${result.templateProductsCreated} products, ${result.templateInsumosCreated} insumos`,
    `  Opening Stock:     ${result.openingInsumosSeeded} insumos (kardex INITIAL_STOCK), ${result.openingProductsSeeded} simple products`,
    `  Restaurant Tables: ${result.restaurantTablesSeeded > 0 ? `${result.restaurantTablesSeeded} tables (Salón Principal + Terraza)` : 'not seeded (QSR mode)'}`,
    `  Sales & Shift:     ${result.invoicesCreated} invoices (last 7 days), open shift CAJA-01`,
    '--------------------------------------------------------------------',
    '  POS DEVICE LINKING',
    `  Linking Code:      ${result.linkingCode}`,
    `  Expires At:        ${result.linkingCodeExpiresAt.toISOString()}`,
    `  Switch POS Tip:    adb shell pm clear ${POS_ANDROID_PACKAGE_ID}`,
    '====================================================================',
  ];
  return lines.join('\n');
}

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  let parsed: ParsedProspectDemoArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof ProspectDemoArgsError) {
      console.error(`Error (${error.code}): ${error.message}`);
    } else {
      console.error('Failed to parse CLI arguments:', error);
    }
    process.exit(1);
    return;
  }

  if (!isProspectDemoConfig(parsed)) {
    console.log(formatUsage());
    return;
  }

  try {
    assertNotProductionEnvironment(process.env);
  } catch (error) {
    if (error instanceof ProspectDemoGuardError) {
      console.error(`Blocked (${error.code}): ${error.message}`);
    } else {
      console.error('Guard check failed:', error);
    }
    process.exit(1);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  let failed = false;
  try {
    const result = await seedProspectDemo(parsed, {
      dataSource: app.get(DataSource),
      catalogService: app.get(CatalogService),
      tenantSubscriptionService: app.get(TenantSubscriptionService),
      fiscalSetupService: app.get(FiscalSetupService),
      companyLogoService: app.get(CompanyLogoService),
      industryTemplateService: app.get(IndustryTemplateService),
      tenantTopologyRevisionService: app.get(TenantTopologyRevisionService),
      deviceLinkingService: app.get(DeviceLinkingService),
    });
    console.log(formatSummary(result));
  } catch (error) {
    if (error instanceof ProspectDemoGuardError) {
      console.error(`Aborted (${error.code}): ${error.message}`);
    } else {
      console.error('Prospect demo provisioning failed:', error);
    }
    failed = true;
  } finally {
    await app.close();
  }

  if (failed) {
    process.exit(1);
  }
}

if (require.main === module) {
  void runCli();
}
