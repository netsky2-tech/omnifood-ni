import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../data/database/app_database.dart';
import '../../../../domain/services/fiscal_authorization_expiry_notice.dart';

/// D-21 (#554) U4: warning-only informational notice for the DGI
/// authorization code expiry, rendered from the
/// `dgi_authorization_expires_at` local config (ISO `yyyy-MM-dd`).
///
/// CRITICAL INVARIANT: never blocks invoicing — the notice is informational
/// only and renders as nothing when the key is absent, blank, or corrupt
/// (D-16: absence looks like absence; a corrupt date never invents a
/// warning).
class FiscalAuthorizationExpiryNotice extends StatelessWidget {
  /// Raw `dgi_authorization_expires_at` value (ISO `yyyy-MM-dd` or blank).
  final String? rawExpiresAt;

  /// Injectable clock for deterministic tests; null = real today.
  final DateTime? today;

  const FiscalAuthorizationExpiryNotice({
    super.key,
    this.rawExpiresAt,
    this.today,
  });

  @override
  Widget build(BuildContext context) {
    final notice = resolveFiscalAuthorizationExpiryNotice(
      rawExpiresAt: rawExpiresAt,
      today: today,
    );
    if (notice == null) return const SizedBox.shrink();

    final expired =
        notice.level == FiscalAuthorizationExpiryNoticeLevel.expired;
    final colorScheme = Theme.of(context).colorScheme;

    // Expired uses the app's error palette; upcoming uses the amber
    // informational palette shared with InventoryEnrichmentWarningBanner.
    final Color background;
    final Color border;
    final Color iconColor;
    final Color textColor;
    if (expired) {
      background = colorScheme.errorContainer;
      border = colorScheme.error;
      iconColor = colorScheme.error;
      textColor = colorScheme.onErrorContainer;
    } else {
      background = Colors.amber.shade50;
      border = Colors.amber.shade400;
      iconColor = Colors.amber.shade800;
      textColor = Colors.amber.shade900;
    }

    return Container(
      key: const Key('fiscal_authorization_expiry_notice'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        children: [
          Icon(
            expired ? Icons.error_outline : Icons.warning_amber_rounded,
            color: iconColor,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              notice.message,
              style: TextStyle(
                color: textColor,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Loads `dgi_authorization_expires_at` and renders
/// [FiscalAuthorizationExpiryNotice]. Best-effort like
/// [InventoryEnrichmentWarningBanner]: any failure (including a missing
/// provider) degrades to no notice and never crashes or blocks the screen.
///
/// By default the value is read from the local `local_configs` table via the
/// provided [AppDatabase]; tests can inject [loadExpiresAt] and [today].
class FiscalAuthorizationExpiryNoticeLoader extends StatefulWidget {
  final Future<String?> Function()? loadExpiresAt;
  final DateTime? today;

  const FiscalAuthorizationExpiryNoticeLoader({
    super.key,
    this.loadExpiresAt,
    this.today,
  });

  @override
  State<FiscalAuthorizationExpiryNoticeLoader> createState() =>
      _FiscalAuthorizationExpiryNoticeLoaderState();
}

class _FiscalAuthorizationExpiryNoticeLoaderState
    extends State<FiscalAuthorizationExpiryNoticeLoader> {
  String? _rawExpiresAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadExpiresAt();
    });
  }

  Future<void> _loadExpiresAt() async {
    if (!mounted) return;
    try {
      final loader = widget.loadExpiresAt;
      final value = loader != null
          ? await loader()
          : (await context
                .read<AppDatabase>()
                .localConfigDao
                .getConfigByKey('dgi_authorization_expires_at'))
            ?.value;
      if (mounted && value != _rawExpiresAt) {
        setState(() {
          _rawExpiresAt = value;
        });
      }
    } catch (_) {
      // Best-effort refresh; never crash or block the screen. Absence of a
      // readable value means absence of a notice (D-16).
    }
  }

  @override
  Widget build(BuildContext context) {
    return FiscalAuthorizationExpiryNotice(
      rawExpiresAt: _rawExpiresAt,
      today: widget.today,
    );
  }
}
