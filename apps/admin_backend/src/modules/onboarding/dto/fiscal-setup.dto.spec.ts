import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FiscalRegime, FiscalSetupDto } from './fiscal-setup.dto';

/**
 * DTO/ValidationPipe seam tests: exercises the REAL Nest global ValidationPipe
 * behavior (whitelist + forbidNonWhitelisted + transform) against the actual
 * FiscalSetupDto metatype — the same validation boundary the HTTP layer uses.
 * The controller unit spec bypasses this pipe by design, so 400-shaped
 * validation behavior is pinned here (and end-to-end in
 * test/onboarding/fiscal-setup.e2e-spec.ts).
 */
const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const transformBody = (
  body: Record<string, unknown>,
): Promise<FiscalSetupDto> =>
  validationPipe.transform(body, {
    type: 'body',
    metatype: FiscalSetupDto,
  }) as Promise<FiscalSetupDto>;

const validBody = (): Record<string, unknown> => ({
  regime: FiscalRegime.CUOTA_FIJA,
  businessName: 'Comedor Doña Mary',
  ruc: 'J0310000055555',
  commercialFxSpread: 0.5,
  pricesIncludeTax: true,
});

describe('FiscalSetupDto (ValidationPipe boundary)', () => {
  describe('rejects an unusable issuer RUC (FR-1)', () => {
    it.each([
      ['absent', undefined],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['non-RUC prefix (CF)', 'CF-12345'],
      ['wrong letter (K)', 'K0310000055555'],
      ['J-RUC too short (12 digits)', 'J031000005555'],
    ])('rejects %s', async (_label, ruc) => {
      const body = { ...validBody() };
      if (ruc === undefined) {
        delete body.ruc;
      } else {
        body.ruc = ruc;
      }

      await expect(transformBody(body)).rejects.toThrow(BadRequestException);
    });
  });

  it('names RUC and the accepted forms in the rejection message', async () => {
    const error: BadRequestException = await transformBody({
      ...validBody(),
      ruc: 'CF-12345',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    const response = error.getResponse() as { message: string | string[] };
    const messages = Array.isArray(response.message)
      ? response.message
      : [response.message];
    expect(messages).toContain(
      'El RUC del emisor es obligatorio: RUC jurídico (J + 13 dígitos) o cédula válida',
    );
  });

  describe('accepts valid issuer RUC values', () => {
    it('accepts a legal J-RUC', async () => {
      const dto = await transformBody(validBody());
      expect(dto.ruc).toBe('J0310000055555');
    });

    it('accepts a valid natural-person cédula with hyphens', async () => {
      const dto = await transformBody({
        ...validBody(),
        ruc: '001-150885-1004J',
      });
      expect(dto.ruc).toBe('001-150885-1004J');
    });

    it('trims surrounding whitespace before validating', async () => {
      const dto = await transformBody({
        ...validBody(),
        ruc: '  J0310000055555  ',
      });
      expect(dto.ruc).toBe('J0310000055555');
    });
  });
});
