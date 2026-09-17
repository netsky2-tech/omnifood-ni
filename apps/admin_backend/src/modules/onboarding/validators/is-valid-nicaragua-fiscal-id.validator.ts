import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidRuc } from '../utils/nicaragua-fiscal.validator';

/**
 * Contract rejection message naming RUC and the accepted forms — shared by the
 * class-validator decorator (HTTP boundary) and the service guard
 * (defense-in-depth) so both surfaces emit the identical message. FR-1 / design §5.
 */
export const NICARAGUA_FISCAL_ID_REQUIRED_MESSAGE =
  'El RUC del emisor es obligatorio: RUC jurídico (J + 13 dígitos) o cédula válida';

/**
 * class-validator decorator enforcing the shared Nicaragua fiscal-ID semantics
 * (legal J + 13 digit RUC, or valid natural-person cédula) — FR-1 / design §2.3.
 */
export function IsValidNicaraguaFiscalId(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidNicaraguaFiscalId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidRuc(typeof value === 'string' ? value : null);
        },
        defaultMessage(): string {
          return NICARAGUA_FISCAL_ID_REQUIRED_MESSAGE;
        },
      },
    });
  };
}
