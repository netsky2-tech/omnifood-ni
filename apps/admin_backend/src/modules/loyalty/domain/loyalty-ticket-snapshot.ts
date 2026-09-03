export interface LoyaltyTicketLine {
  lineId: string;
  productId: string;
  variantId?: string;
  categoryId?: string;
  quantity: number;
  merchandiseNetNioAfterAllBenefits: number;
  source: 'NORMAL' | 'LOYALTY_REWARD';
}

export interface LoyaltyTicketSnapshot {
  tenantId: string;
  branchId: string;
  terminalId: string;
  ticketId: string;
  customerId?: string;
  paidAt: Date;
  lines: LoyaltyTicketLine[];
}

export interface EarningResult {
  programId: string;
  programVersion: number;
  units: number;
  strategy: string;
  commercialSnapshot: Record<string, unknown>;
}
