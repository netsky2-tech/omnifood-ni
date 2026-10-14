import {
  CheckoutFxMode,
  FiscalRegime,
  TenantOperationMode,
} from './fiscal-setup.dto';

export interface FiscalConfigVersion {
  revision: number;
  fingerprint: string;
}

export interface EffectiveFiscalPayload {
  businessName: string;
  commercialFxSpread: number;
  fiscalRegime: FiscalRegime;
  pricesIncludeTax: boolean;
  ruc: string | null;
  taxRate: number;
  tenantId: string;
  /**
   * Company identity parity P1: the business contact identity rides the
   * fingerprinted payload (null = never configured — rides as null, same
   * school as D-4, so absence and configured- absence fingerprint alike and
   * a first configuration materializes a new revision). The snapshot is the
   * ONLY delivery channel (S2): no second sync mechanism.
   *
   * S6 — declared local exception: the terminal may still override what it
   * PRINTS via its local printer_header_* settings (POS precedence
   * `printer_header_* ?? business_*`). The cloud is the owner of the
   * identity (S1); the terminal's local header override is an explicit,
   * documented exception, NOT a hidden divergence — P2 applies these values
   * as the business_* fallback without removing that precedence.
   */
  phone: string | null;
  address: string | null;
  email: string | null;
  /**
   * Company identity parity P3, slice 1 (S5): the sha256 of the tenant's
   * cloud-stored logo ORIGINAL — a REFERENCE, never the bytes. The fiscal
   * payload is stored whole per revision in fiscal_config_revisions, so
   * embedding base64 here would be one logo copy per revision; the reference
   * rides the fingerprint instead, which makes a logo change read as what it
   * is: a TERMINAL-CONFIG change delivered through the existing versioned
   * channel (S2), not a fiscal one. null = the tenant has no logo.
   */
  logoSha256: string | null;
  /** BXW-007 U1 rev 2: null = the tenant never configured it — rides the fingerprint as null. */
  operationMode: TenantOperationMode | null;
  /** BXW-007 U1 rev 2: null = the tenant never configured it — rides the fingerprint as null. */
  checkoutFxMode: CheckoutFxMode | null;
  /** D-21 (#554): null when no DGI authorization is configured. */
  dgiAuthorizationCode: string | null;
  dgiAuthorizationIssuedAt: string | null;
  dgiAuthorizationExpiresAt: string | null;
  /**
   * SOHO P3 (D-A): null = no cap configured — rides the fingerprint as null
   * (D-4: the fingerprint covers null), so "no cap" and "never configured"
   * are the same honest absence. The POS mirrors the enforcement rule
   * documented in FiscalConfigVersionService.getEffectiveFiscalPayload.
   */
  maxDiscountAmount: number | null;
  maxDiscountPercent: number | null;
}

export interface FiscalConfigSnapshot {
  tenantId: string;
  businessName: string;
  ruc?: string | null;
  /** Company identity parity P1: null = never configured (optional so pre-P1 builders keep compiling). */
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  /**
   * Company identity parity P3, slice 1 (S5): the sha256 REFERENCE to the
   * tenant's cloud logo original (null = no logo). Optional so pre-P3
   * builders keep compiling. The terminal uses it to know it must re-fetch
   * and re-derive its local raster; the bytes themselves are fetched from
   * the brand-asset surface, never from this payload.
   */
  logoSha256?: string | null;
  fiscalRegime: FiscalRegime;
  taxRate: number;
  pricesIncludeTax: boolean;
  commercialFxSpread?: number;
  /** BXW-007 U1 rev 2: null = never configured (optional so existing builders keep compiling). */
  operationMode?: TenantOperationMode | null;
  /** BXW-007 U1 rev 2: null = never configured (optional so existing builders keep compiling). */
  checkoutFxMode?: CheckoutFxMode | null;
  /** D-21 (#554): null when no DGI authorization is configured. */
  dgiAuthorizationCode?: string | null;
  dgiAuthorizationIssuedAt?: string | null;
  dgiAuthorizationExpiresAt?: string | null;
  /** SOHO P3 (D-A): null = no cap configured (optional so existing builders keep compiling). */
  maxDiscountAmount?: number | null;
  maxDiscountPercent?: number | null;
  configVersion: FiscalConfigVersion;
  generatedAt: string;
}

export interface FiscalAckDto {
  tenantId: string;
  terminalId: string;
  revision: number;
  fingerprint: string;
  appliedAt: string;
}
