import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  DGI_AUTHORIZATION_CODE_CHARSET_MESSAGE,
  DGI_AUTHORIZATION_CODE_TOO_LONG_MESSAGE,
  DGI_AUTHORIZATION_DATE_RANGE_MESSAGE,
  FiscalRegime,
  FiscalSetupDto,
} from './fiscal-setup.dto';

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

  // D-21 (#554): the DGI authorization code carries a charset + length
  // ceiling only. DGI's format is not officially documented (e.g.
  // 'DGI-SFC-2024-00123', 'RES-SFC-145/2025'), so no structural mask and
  // no format enforcement — the operator types what the letter says.
  describe('DGI authorization code (D-21, #554)', () => {
    it('accepts a body without any DGI authorization fields', async () => {
      const dto = await transformBody(validBody());
      expect(dto.dgiAuthorizationCode).toBeUndefined();
      expect(dto.dgiAuthorizationIssuedAt).toBeUndefined();
      expect(dto.dgiAuthorizationExpiresAt).toBeUndefined();
    });

    it.each([
      ['DGI-style reference', 'DGI-SFC-2024-00123'],
      ['resolution-style reference with slash', 'RES-SFC-145/2025'],
    ])('accepts a %s', async (_label, code) => {
      const dto = await transformBody({ ...validBody(), dgiAuthorizationCode: code });
      expect(dto.dgiAuthorizationCode).toBe(code);
    });

    it('accepts a 50-character code at the length ceiling', async () => {
      const code = 'A'.repeat(50);
      const dto = await transformBody({ ...validBody(), dgiAuthorizationCode: code });
      expect(dto.dgiAuthorizationCode).toBe(code);
    });

    it('rejects a 51-character code with the ceiling message', async () => {
      const error: BadRequestException = await transformBody({
        ...validBody(),
        dgiAuthorizationCode: 'A'.repeat(51),
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const response = error.getResponse() as { message: string | string[] };
      const messages = Array.isArray(response.message)
        ? response.message
        : [response.message];
      expect(messages).toContain(DGI_AUTHORIZATION_CODE_TOO_LONG_MESSAGE);
    });

    it('accepts an empty string so the clear path is reachable from HTTP', async () => {
      const dto = await transformBody({ ...validBody(), dgiAuthorizationCode: '' });
      expect(dto.dgiAuthorizationCode).toBe('');
    });

    it.each([
      ['internal spaces', 'DGI SFC 2024'],
      ['underscore (symbol outside the charset)', 'RES_SFC_2025'],
      ['hash (symbol outside the charset)', 'RES-SFC-#145'],
      ['non-ASCII letters', 'RESOLUCIÓN-2025'],
    ])('rejects a code with %s', async (_label, code) => {
      const error: BadRequestException = await transformBody({
        ...validBody(),
        dgiAuthorizationCode: code,
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const response = error.getResponse() as { message: string | string[] };
      const messages = Array.isArray(response.message)
        ? response.message
        : [response.message];
      expect(messages).toContain(DGI_AUTHORIZATION_CODE_CHARSET_MESSAGE);
    });
  });

  describe('DGI authorization dates (D-21, #554)', () => {
    it('accepts a valid ISO-8601 issuedAt/expiresAt pair', async () => {
      const dto = await transformBody({
        ...validBody(),
        dgiAuthorizationIssuedAt: '2025-01-15',
        dgiAuthorizationExpiresAt: '2026-01-15',
      });
      expect(dto.dgiAuthorizationIssuedAt).toBe('2025-01-15');
      expect(dto.dgiAuthorizationExpiresAt).toBe('2026-01-15');
    });

    it.each([
      [
        'dgiAuthorizationIssuedAt',
        { dgiAuthorizationIssuedAt: '15/01/2025' },
      ],
      [
        'dgiAuthorizationExpiresAt',
        { dgiAuthorizationExpiresAt: 'not-a-date' },
      ],
    ])('rejects a non-ISO-8601 %s', async (_field, extra) => {
      await expect(
        transformBody({ ...validBody(), ...extra }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expiresAt earlier than issuedAt', async () => {
      const error: BadRequestException = await transformBody({
        ...validBody(),
        dgiAuthorizationIssuedAt: '2025-01-15',
        dgiAuthorizationExpiresAt: '2024-01-15',
      }).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const response = error.getResponse() as { message: string | string[] };
      const messages = Array.isArray(response.message)
        ? response.message
        : [response.message];
      expect(messages).toContain(DGI_AUTHORIZATION_DATE_RANGE_MESSAGE);
    });

    it('accepts an expiresAt equal to issuedAt', async () => {
      const dto = await transformBody({
        ...validBody(),
        dgiAuthorizationIssuedAt: '2025-01-15',
        dgiAuthorizationExpiresAt: '2025-01-15',
      });
      expect(dto.dgiAuthorizationExpiresAt).toBe('2025-01-15');
    });

    it('accepts an expiresAt without an issuedAt (no comparison possible)', async () => {
      const dto = await transformBody({
        ...validBody(),
        dgiAuthorizationExpiresAt: '2026-01-15',
      });
      expect(dto.dgiAuthorizationExpiresAt).toBe('2026-01-15');
    });

    it('accepts an issuedAt without an expiresAt', async () => {
      const dto = await transformBody({
        ...validBody(),
        dgiAuthorizationIssuedAt: '2025-01-15',
      });
      expect(dto.dgiAuthorizationIssuedAt).toBe('2025-01-15');
    });
  });
});
