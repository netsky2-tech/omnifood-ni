/// Route of the pre-auth terminal linking screen (issue #556).
const String linkTerminalRoute = '/link';

/// Startup routing gate for issue #556: the terminal must LINK (capturing
/// its tenant slug) BEFORE any login attempt or login screen use.
///
/// - Stored slug present (already linked) -> login route ('/'), exactly the
///   current behavior; no UX change for linked terminals.
/// - Empty/absent slug -> the linking gate route; login stays unusable
///   until the terminal is linked.
String resolveStartupRoute(String storedTenantSlug) {
  return storedTenantSlug.trim().isEmpty ? linkTerminalRoute : '/';
}
