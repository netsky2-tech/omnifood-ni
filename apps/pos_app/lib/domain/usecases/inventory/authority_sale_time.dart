/// The instant used to resolve the ACTIVE recipe version of the authority.
///
/// The authority stores `effective_from` / `effective_until` in **UTC** and
/// the checkout path compares in UTC (`invoice.createdAt.toUtc()`). Every
/// reader of the authority must compare in the same frame: a LOCAL
/// wall-clock string compared against a UTC timestamp is a comparison
/// between two different clocks, and in every timezone behind UTC it
/// makes a version published minutes ago look "not yet in force".
///
/// The rig showed it: on the S23 (UTC-6) the modifiers dialog resolved NO
/// recipe version, so the operator never saw the inherited quantity nor
/// the insumo's name — the copy degraded to "Suma el insumo al consumo de
/// la receta".
///
/// Pure and synchronous: one frame, no clock of its own.
String authoritySaleTime(DateTime now) => now.toUtc().toIso8601String();
