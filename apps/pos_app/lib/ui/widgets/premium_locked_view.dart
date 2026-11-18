import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/services/sync_service.dart';

/// ENT-05 (catalog §6.3) — locked state for a premium capability.
///
/// Rendered instead of a premium screen when the entitlement snapshot does
/// not include the capability. Nothing is hidden silently: the screen names
/// the feature, explains which plan or add-on unlocks it in human wording,
/// and carries the exact upgrade copy required by the plan document. The raw
/// capability key appears ONLY inside that quoted sentence, always next to
/// the human explanation — never alone.
///
/// When [SyncService.planBlockedCapabilities] contains the key (the backend
/// already refused a queued operation for this same capability), the screen
/// also reassures the owner that the pending operations are kept and will
/// sync after the upgrade (§6.3 points 1–3: never discarded, never retried
/// in a loop, released on the next snapshot).
class PremiumLockedView extends StatelessWidget {
  const PremiumLockedView({
    super.key,
    required this.capability,
    this.featureLabel,
  });

  /// Raw capability key from the catalog (e.g. `inventory.retail`).
  final String capability;

  /// Human feature name shown in the title (e.g. `Compras`). Falls back to a
  /// generic wording when the caller has no better label.
  final String? featureLabel;

  /// Human explanation of what unlocks each premium capability, taken from
  /// the plan matrix (catalog §4/§5). Unknown keys degrade to a generic
  /// explanation instead of showing a bare key.
  static const Map<String, String> unlockHints = {
    'inventory.retail':
        'Se desbloquea con el plan Operación o Pro, o con el complemento '
            'Pack Retail en el plan Esencial.',
    'inventory.cooking':
        'Se desbloquea con el plan Operación o Pro, o con el complemento '
            'Pack Cocina en el plan Esencial.',
    'promotions':
        'Se desbloquea con el plan Operación o Pro, o con el complemento '
            'Marketing en el plan Esencial.',
    'loyalty':
        'Se desbloquea con el plan Operación o Pro, o con el complemento '
            'Marketing en el plan Esencial.',
    'promotions.convenio':
        'Se desbloquea con el plan Pro, o con el complemento Convenios B2B '
            '(que requiere promociones activas).',
    'reports.margins':
        'Se desbloquea con el plan Pro, o con el complemento Inteligencia '
            'de costos en el plan Operación.',
  };

  static const String _genericHint =
      'Se desbloquea actualizando su plan o activando el complemento '
      'correspondiente desde el panel web.';

  /// §6.3: kept, never discarded, and synced once the plan is regularised.
  static const String pendingNote =
      'Sus operaciones pendientes están guardadas y se sincronizarán '
      'automáticamente después de actualizar su plan.';

  /// Reads the plan-refusal state without making [SyncService] a hard
  /// dependency: surfaces that render this view in isolation (tests, guard
  /// previews) still get a complete locked screen.
  static bool _isPlanBlocked(BuildContext context, String capability) {
    try {
      return context.read<SyncService>().planBlockedCapabilities
          .contains(capability);
    } on ProviderNotFoundException {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final feature = featureLabel ?? 'Esta función';
    final hint = unlockHints[capability] ?? _genericHint;
    final pending = _isPlanBlocked(context, capability);

    return Scaffold(
      appBar: AppBar(title: const Text('Función no incluida en su plan')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 48),
              const SizedBox(height: 16),
              Text(
                '$feature no está incluida en su plan actual.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                hint,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'La función requiere el plan o el complemento que incluye '
                '"$capability". Actualice su plan para usarla.',
                textAlign: TextAlign.center,
              ),
              if (pending) ...[
                const SizedBox(height: 12),
                const Text(
                  pendingNote,
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
