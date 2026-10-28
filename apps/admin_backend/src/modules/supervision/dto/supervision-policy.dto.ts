import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { UserRole } from '../../identity/security/user-role.enum';

/**
 * Class-level guard for the invariant the whole change exists for: the
 * shift close MUST stay completable. A policy that would strand a till at
 * the end of the day never reaches the database.
 *
 * The class-validator constraint is the HTTP boundary; the service repeats
 * the same rule for directly-constructed DTOs (defense in depth, the
 * house pattern).
 */
@ValidatorConstraint({ name: 'HasCompletableCloseBoxGuard', async: false })
export class HasCompletableCloseBoxGuard
  implements ValidatorConstraintInterface
{
  validate(value: UserRole[], args: ValidationArguments): boolean {
    const related = args.object as {
      selfAuthorizationAllowedCloseBox?: boolean;
    };
    const hasAuthorizer = Array.isArray(value) && value.length > 0;
    if (hasAuthorizer) return true;
    return related.selfAuthorizationAllowedCloseBox === true;
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      args.constraints['message'] as string | undefined ??
      'La política dejaría una operación obligatoria sin forma de completarla.'
    );
  }
}

/**
 * The body of a supervision-policy write.
 *
 * The policy is written WHOLE (not patched): a partial body would let a
 * caller drop a rule and silently widen what the till accepts. A tenant
 * that wants "no policy" sends `null` (see [SupervisionPolicyClearDto]) —
 * an explicit, auditable act, not an omission.
 */
export class SupervisionPolicyDto {
  /**
   * The roles that authorize HERE. An EMPTY list is a legitimate
   * configuration — "in this business nobody else signs; the operator signs
   * their own operation" — so it is NOT rejected as an empty array: the
   * guard below decides whether that combination still leaves the shift
   * close completable.
   */
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @Validate(HasCompletableCloseBoxGuard, {
    message:
      'Ningún rol puede autorizar y el cierre de turno no admite auto-autorización: el corte de caja quedaría imposible de completar.',
  })
  authorizingRoles!: UserRole[];

  @IsBoolean()
  selfAuthorizationAllowedCloseBox!: boolean;

  @IsBoolean()
  selfAuthorizationAllowedCashDrawer!: boolean;

  @IsBoolean()
  selfAuthorizationAllowedManualDiscount!: boolean;

  @IsBoolean()
  supervisorRequiredForModifierQuantity!: boolean;
}

/**
 * The explicit "the tenant has no opinion" write: it clears the policy so
 * every terminal falls back to the default for its operation mode.
 */
export class SupervisionPolicyClearDto {
  @IsOptional()
  @IsBoolean()
  cleared?: boolean;
}
