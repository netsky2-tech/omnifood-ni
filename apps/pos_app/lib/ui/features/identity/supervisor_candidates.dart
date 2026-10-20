import '../../../domain/models/user.dart';
import 'supervisor_override_modal.dart';

/// The people who may authorize an override, as the operator sees them.
///
/// The rule is the app's own: the OWNER and the MANAGER are the privileged
/// roles (the sale view already lets them act without asking anyone). The
/// list comes from the LOCAL staff template, so the override works with the
/// WiFi down — the same promise the rest of the terminal makes.
///
/// The uuid never reaches the screen: it stays in the template and travels
/// with the request (Nhilos backoffice §17.6).
List<SupervisorCandidate> supervisorCandidatesFrom(List<User> users) {
  return users
      .where(
        (user) =>
            user.isActive &&
            (user.role == UserRole.owner || user.role == UserRole.manager),
      )
      .map(
        (user) => SupervisorCandidate(
          id: user.id,
          name: user.name,
          role: user.role == UserRole.owner ? 'Propietario' : 'Encargado',
        ),
      )
      .toList(growable: false);
}
