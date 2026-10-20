import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../../domain/models/config/supervision_policy.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../../domain/services/config/tenant_config_service.dart';
import 'supervisor_override_modal.dart';

/// The tenant's supervision policy, as this terminal knows it.
///
/// Absent = the default for the tenant's operation mode, which never
/// dead-ends the close box (a food park has no manager on the floor).
Future<SupervisionPolicy> tenantSupervisionPolicy(BuildContext context) async {
  final configService = context.read<TenantConfigService>();
  return configService.getSupervisionPolicy();
}

/// The outcome of an authorization, from the POS's point of view: who signed,
/// and whether a supervisor was behind it.
class SensitiveOperationAuthorization {
  const SensitiveOperationAuthorization({
    required this.authorized,
    required this.selfAuthorized,
    this.userId,
    this.userName,
  });

  /// The operation may proceed.
  final bool authorized;

  /// The person signed their OWN operation because no supervisor was there.
  ///
  /// It is NOT a failure: in a food park there is often no manager on the
  /// floor, and the shift still has to be closed. The record says exactly
  /// what happened, so the owner can review it later.
  final bool selfAuthorized;

  final String? userId;
  final String? userName;
}

/// Authorizes a sensitive operation the way THIS tenant works.
///
/// Three facts, in this order:
///
///  1. The credential (the PIN) identifies the person — offline, from the
///     local staff template. Nobody types an identifier.
///  2. The tenant's [policy] decides who counts as a supervisor. It is the
///     tenant's call, not ours: a food park with an "encargado de turno" can
///     say so, and a restaurant can keep the manager requirement.
///  3. If the person is not a supervisor, the operation proceeds as a
///     SELF-authorization when the flow allows it ([selfAuthorizationAllowed]),
///     and the caller records it as such. When the flow does not allow it,
///     the operation is refused — because the tenant asked for that control.
///
/// The rule that matters: **the override is never a lock that traps the
/// till**. The close box defaults to allowing the self-authorization (an
/// unclosed shift is a worse fiscal problem than a self-authorized one); the
/// flows that move money out of the drawer or out of the price default to
/// requiring a supervisor, and the tenant can change that.
Future<SupervisorOverrideOutcome> authorizeWithPolicy({
  required AuthRepository authRepository,
  required SupervisionPolicy policy,
  required SupervisorOverrideRequest request,
  required bool selfAuthorizationAllowed,
}) async {
  final matches = await authRepository.identifyByCredential(
    credential: request.credential,
    policy: policy,
    userId: request.supervisorId.isEmpty ? null : request.supervisorId,
  );
  final method =
      request.method == SupervisorAuthorizationMethod.pin ? 'PIN' : 'TOTP';
  if (matches.isEmpty) {
    return const SupervisorOverrideOutcome.invalid();
  }
  if (matches.length > 1) {
    // The same PIN belongs to more than one person: the operator says which
    // one, by name. The identifier never reaches the screen.
    return SupervisorOverrideOutcome.ambiguous(
      matches
          .map(
            (match) => SupervisorCandidate(
              id: match.userId,
              name: match.userName,
              role: match.userRole,
            ),
          )
          .toList(growable: false),
      userId: matches.first.userId,
      userName: matches.first.userName,
      isAuthorizingRole: matches.any((match) => match.isAuthorizingRole),
      method: method,
    );
  }
  final match = matches.first;
  if (match.isAuthorizingRole) {
    return SupervisorOverrideOutcome.authorized(
      userId: match.userId,
      userName: match.userName,
      isAuthorizingRole: true,
      method: method,
    );
  }
  if (!selfAuthorizationAllowed) {
    return const SupervisorOverrideOutcome.invalid();
  }
  return SupervisorOverrideOutcome.authorized(
    userId: match.userId,
    userName: match.userName,
    isAuthorizingRole: false,
    method: method,
  );
}
