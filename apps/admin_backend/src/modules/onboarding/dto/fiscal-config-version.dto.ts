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
  /** BXW-007 U1: POS canon operation mode — rides the fingerprint. */
  operationMode: TenantOperationMode;
  /** BXW-007 U1: POS canon checkout FX source — rides the fingerprint. */
  checkoutFxMode: CheckoutFxMode;
  /** D-21 (#554): null when no DGI authorization is configured. */
  dgiAuthorizationCode: string | null;
  dgiAuthorizationIssuedAt: string | null;
  dgiAuthorizationExpiresAt: string | null;
}

export interface FiscalConfigSnapshot {
  tenantId: string;
  businessName: string;
  ruc?: string | null;
  fiscalRegime: FiscalRegime;
  taxRate: number;
  pricesIncludeTax: boolean;
  commercialFxSpread?: number;
  /** BXW-007 U1: POS canon operation mode (optional so existing builders keep compiling). */
  operationMode?: TenantOperationMode;
  /** BXW-007 U1: POS canon checkout FX source (optional so existing builders keep compiling). */
  checkoutFxMode?: CheckoutFxMode;
  /** D-21 (#554): null when no DGI authorization is configured. */
  dgiAuthorizationCode?: string | null;
  dgiAuthorizationIssuedAt?: string | null;
  dgiAuthorizationExpiresAt?: string | null;
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
