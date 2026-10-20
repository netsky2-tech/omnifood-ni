import 'package:freezed_annotation/freezed_annotation.dart';
import '../config/tenant_operation_mode.dart';

part 'supervision_policy.freezed.dart';
part 'supervision_policy.g.dart';

/// Who may authorize a sensitive operation in THIS tenant, and what happens
/// when the person at the till is not one of them.
///
/// WHY THIS EXISTS (owner's decision, 2026-10-20): a food park often has NO
/// manager on the floor — one person sells and prepares, or a cook and a
/// cashier. A rule that says "only an owner or a manager can authorize"
/// does not create a control there: it creates a DEAD END. The shift cannot
/// be closed, the drawer cannot be opened, and the terminal is stuck at the
/// end of the day.
///
/// The control that actually exists in a small business is not the
/// separation of duties — it is the RECORD. Who did it, with whose
/// credential, and whether a supervisor was involved. So the override is
/// never a lock: it is a record, plus a review the owner can do later.
///
/// The policy is the tenant's, not ours:
///  - [authorizingRoles]: the roles that count as a supervisor (the food
///    park can add its own "encargado de turno");
///  - the per-flow flags: whether the flow accepts a SELF-authorization
///    (the operator signs their own operation when no supervisor is
///    present) or refuses it.
@freezed
class SupervisionPolicy with _$SupervisionPolicy {
  const factory SupervisionPolicy({
    /// The roles that can authorize on behalf of the tenant.
    @Default(<String>{'OWNER', 'MANAGER'}) Set<String> authorizingRoles,

    /// The shift close (Corte Z): the fiscal duty that MUST be completable.
    /// In a food park it is: an unclosed shift is a worse fiscal problem than
    /// a self-authorized one.
    @Default(true) bool selfAuthorizationAllowedCloseBox,

    /// Opening the cash drawer by hand: money in and out of the drawer.
    @Default(false) bool selfAuthorizationAllowedCashDrawer,

    /// A manual discount: money out of the price.
    @Default(false) bool selfAuthorizationAllowedManualDiscount,

    /// The quantity an extra takes out of the stock: a DATA question, not a
    /// control one. The evidence (who, how much, why) is the control.
    @Default(false) bool supervisorRequiredForModifierQuantity,
  }) = _SupervisionPolicy;

  factory SupervisionPolicy.fromJson(Map<String, dynamic> json) =>
      _$SupervisionPolicyFromJson(json);

  /// Strictly parses a policy from an UNTRUSTED source (the cloud payload).
  ///
  /// Returns null for anything that is not a complete, well-typed policy:
  /// absence and corruption must both read as "never configured", so the
  /// terminal falls back to the default for its operation mode instead of
  /// enforcing a half-understood rule.
  static SupervisionPolicy? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final map = raw.map((key, value) => MapEntry(key.toString(), value));

    final roles = map['authorizingRoles'];
    if (roles is! List) return null;
    final parsedRoles = <String>{};
    for (final role in roles) {
      if (role is! String) return null;
      final normalized = role.trim().toUpperCase();
      if (normalized.isEmpty) return null;
      parsedRoles.add(normalized);
    }

    bool? readFlag(String key) {
      final value = map[key];
      if (value is bool) return value;
      return null;
    }

    final closeBox = readFlag('selfAuthorizationAllowedCloseBox');
    final cashDrawer = readFlag('selfAuthorizationAllowedCashDrawer');
    final manualDiscount = readFlag('selfAuthorizationAllowedManualDiscount');
    final modifierQuantity = readFlag('supervisorRequiredForModifierQuantity');
    if (closeBox == null ||
        cashDrawer == null ||
        manualDiscount == null ||
        modifierQuantity == null) {
      return null;
    }

    return SupervisionPolicy(
      authorizingRoles: parsedRoles,
      selfAuthorizationAllowedCloseBox: closeBox,
      selfAuthorizationAllowedCashDrawer: cashDrawer,
      selfAuthorizationAllowedManualDiscount: manualDiscount,
      supervisorRequiredForModifierQuantity: modifierQuantity,
    );
  }

  /// The policy a tenant gets when it never configured one.
  ///
  /// The DEFAULT follows the operation mode, because the mode already says
  /// how much bureaucracy the business has: a food park counter has no
  /// manager on the floor, a restaurant normally does.
  factory SupervisionPolicy.forOperationMode(TenantOperationMode mode) {
    final isQsr = mode.isFoodParkQsr;
    return SupervisionPolicy(
      authorizingRoles: const {'OWNER', 'MANAGER'},
      selfAuthorizationAllowedCloseBox: true,
      selfAuthorizationAllowedCashDrawer: isQsr,
      selfAuthorizationAllowedManualDiscount: isQsr,
      supervisorRequiredForModifierQuantity: false,
    );
  }
}

/// The policy's own rules, outside the generated data class.
extension SupervisionPolicyRules on SupervisionPolicy {
  /// Whether [role] is one of the roles that can authorize here.
  bool authorizes(String role) =>
      authorizingRoles.map((r) => r.toUpperCase()).contains(role.toUpperCase());

  /// Whether applying this policy would leave the shift close IMPOSSIBLE.
  ///
  /// The shift close (Corte Z) is a fiscal duty: an unclosed shift is a
  /// worse fiscal problem than a self-authorized one. The backoffice
  /// refuses to save a policy that breaks it, but the TERMINAL is the last
  /// line of defense: a till stuck at 6pm is worse than a stale policy, so
  /// a policy that fails this check is never applied — the terminal keeps
  /// the default for its operation mode, which never dead-ends the close.
  bool get keepsShiftCloseCompletable =>
      authorizingRoles.isNotEmpty || selfAuthorizationAllowedCloseBox;
}
