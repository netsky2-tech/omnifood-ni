import { UserRole } from '../../identity/security/user-role.enum';
import {
  defaultSupervisionPolicy,
  parseSupervisionPolicy,
  supervisionPolicyToJson,
  validateSupervisionPolicy,
  type SupervisionPolicy,
} from './supervision-policy.contract';

const completePolicy = (overrides: Partial<SupervisionPolicy> = {}): SupervisionPolicy => ({
  authorizingRoles: [UserRole.OWNER, UserRole.MANAGER],
  selfAuthorizationAllowedCloseBox: true,
  selfAuthorizationAllowedCashDrawer: false,
  selfAuthorizationAllowedManualDiscount: false,
  supervisorRequiredForModifierQuantity: false,
  ...overrides,
});

describe('SupervisionPolicy contract', () => {
  describe('defaultSupervisionPolicy', () => {
    it('gives a food park a policy with no manager on the floor', () => {
      const policy = defaultSupervisionPolicy(true);

      expect(policy.selfAuthorizationAllowedCloseBox).toBe(true);
      expect(policy.selfAuthorizationAllowedCashDrawer).toBe(true);
      expect(policy.selfAuthorizationAllowedManualDiscount).toBe(true);
      expect(policy.supervisorRequiredForModifierQuantity).toBe(false);
      expect(policy.authorizingRoles).toEqual([
        UserRole.MANAGER,
        UserRole.OWNER,
      ]);
    });

    it('gives a restaurant the stricter policy (a manager is on the floor)', () => {
      const policy = defaultSupervisionPolicy(false);

      expect(policy.selfAuthorizationAllowedCloseBox).toBe(true);
      expect(policy.selfAuthorizationAllowedCashDrawer).toBe(false);
      expect(policy.selfAuthorizationAllowedManualDiscount).toBe(false);
    });

    it('never dead-ends the shift close, in any mode', () => {
      for (const isQsr of [true, false]) {
        const policy = defaultSupervisionPolicy(isQsr);
        expect(validateSupervisionPolicy(policy).errors).toEqual([]);
      }
    });
  });

  describe('parseSupervisionPolicy', () => {
    it('parses a complete policy', () => {
      const parsed = parseSupervisionPolicy({
        authorizingRoles: ['OWNER', 'MANAGER'],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: true,
        selfAuthorizationAllowedManualDiscount: false,
        supervisorRequiredForModifierQuantity: false,
      });

      expect(parsed).toEqual({
        authorizingRoles: [UserRole.MANAGER, UserRole.OWNER],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: true,
        selfAuthorizationAllowedManualDiscount: false,
        supervisorRequiredForModifierQuantity: false,
      });
    });

    it('sorts and de-duplicates the roles so the same rule set has one canonical form', () => {
      const parsed = parseSupervisionPolicy({
        authorizingRoles: ['MANAGER', 'OWNER', 'MANAGER'],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: false,
        selfAuthorizationAllowedManualDiscount: false,
        supervisorRequiredForModifierQuantity: false,
      });

      expect(parsed?.authorizingRoles).toEqual([
        UserRole.MANAGER,
        UserRole.OWNER,
      ]);
    });

    it('reads an empty role list as a legitimate policy (nobody else signs)', () => {
      const parsed = parseSupervisionPolicy({
        authorizingRoles: [],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: true,
        selfAuthorizationAllowedManualDiscount: true,
        supervisorRequiredForModifierQuantity: false,
      });

      expect(parsed?.authorizingRoles).toEqual([]);
    });

    it.each([
      ['null', null],
      ['a non-object', 'OWNER'],
      ['an unknown role', { authorizingRoles: ['SUPERVISOR'] }],
      ['a missing boolean', { authorizingRoles: ['OWNER'] }],
      ['a non-boolean flag', {
        authorizingRoles: ['OWNER'],
        selfAuthorizationAllowedCloseBox: 'yes',
        selfAuthorizationAllowedCashDrawer: true,
        selfAuthorizationAllowedManualDiscount: true,
        supervisorRequiredForModifierQuantity: false,
      }],
    ])('reads %s as "never configured" (null)', (_label, raw) => {
      expect(parseSupervisionPolicy(raw)).toBeNull();
    });
  });

  describe('validateSupervisionPolicy', () => {
    it('rejects a policy that would make the shift close impossible', () => {
      const validation = validateSupervisionPolicy(
        completePolicy({
          authorizingRoles: [],
          selfAuthorizationAllowedCloseBox: false,
        }),
      );

      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]).toContain('corte de caja');
    });

    it('accepts a policy where nobody authorizes but the operator closes their own shift', () => {
      const validation = validateSupervisionPolicy(
        completePolicy({
          authorizingRoles: [],
          selfAuthorizationAllowedCloseBox: true,
          selfAuthorizationAllowedCashDrawer: true,
          selfAuthorizationAllowedManualDiscount: true,
        }),
      );

      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toEqual([]);
    });

    it('warns (never blocks) when no discount could ever be authorized', () => {
      const validation = validateSupervisionPolicy(
        completePolicy({
          authorizingRoles: [],
          selfAuthorizationAllowedCloseBox: true,
          selfAuthorizationAllowedCashDrawer: true,
          selfAuthorizationAllowedManualDiscount: false,
        }),
      );

      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('descuento manual');
    });

    it('never reports an error while a role can authorize', () => {
      const validation = validateSupervisionPolicy(
        completePolicy({
          selfAuthorizationAllowedCloseBox: false,
          selfAuthorizationAllowedCashDrawer: false,
          selfAuthorizationAllowedManualDiscount: false,
          supervisorRequiredForModifierQuantity: true,
        }),
      );

      expect(validation.errors).toEqual([]);
    });
  });

  describe('supervisionPolicyToJson', () => {
    it('produces the shape the terminal stores locally (same field names)', () => {
      const json = supervisionPolicyToJson(completePolicy());

      expect(json).toEqual({
        authorizingRoles: ['MANAGER', 'OWNER'],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: false,
        selfAuthorizationAllowedManualDiscount: false,
        supervisorRequiredForModifierQuantity: false,
      });
    });
  });
});
