import { Injectable } from '@nestjs/common';
import { FxRateResolver } from './inventory-purchase.service';

@Injectable()
export class FxRateResolverService implements FxRateResolver {
  resolveBcnRateByDate(invoiceDate: string): Promise<number> {
    void invoiceDate;
    return Promise.resolve(1);
  }
}
