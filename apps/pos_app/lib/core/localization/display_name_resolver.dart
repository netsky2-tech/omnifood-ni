/// D-14 (operator-reported): a person's name belongs where an id is shown;
/// internal ids must never be rendered. This resolver is the single shared
/// rule every person-attribution surface uses (invoice detail, audit log,
/// X/Z report operator rows, DGI report session labels).
///
/// Contract:
/// - Callers build an id→name map ONCE per view load from the local identity
///   source (`UserDao.findAllUsers()` — includes INACTIVE users on purpose,
///   for historical attribution — or `AuthRepository.getAllUsers()`).
/// - When the id is absent (user deleted later by syncStaff's
///   `deleteAllUsers`/`deleteUser`, or a placeholder id like `''`,
///   `'system'`, `'user-manager'`), the HONEST fallback is returned. It is
///   never the raw id and never a cloud round-trip on a display path.
library;

const String kUnresolvedUserNameLabel = 'Operador no disponible';

const String kUnresolvedSupervisorNameLabel = 'Supervisor no disponible';

/// Resolves [userId] against a preloaded [usersById] map, returning the
/// person's name or [kUnresolvedUserNameLabel]. Null/empty ids (invoice
/// placeholders) always resolve to the fallback.
String resolveUserName(String? userId, Map<String, String> usersById) {
  if (userId == null || userId.trim().isEmpty) {
    return kUnresolvedUserNameLabel;
  }
  return usersById[userId] ?? kUnresolvedUserNameLabel;
}
