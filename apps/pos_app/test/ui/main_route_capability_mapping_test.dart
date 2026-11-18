import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ENT-05 — route→capability wiring guard for `lib/main.dart`.
///
/// The POS UI must gate ONLY the premium routes with their catalog keys
/// (`docs/plans/entitlements/catalogo_capacidades_v1.md` §3/§4) and must
/// NEVER pass a `core.*` capability: a typo here would gate the sale path
/// in the UI (catalog §7 — the nucleus is not gateable).
void main() {
  final mainSource = File('lib/main.dart').readAsStringSync();

  /// Route path → BohRouteGuard block source, extracted from the routes map.
  final guardBlocks = <String, String>{};
  final blockPattern = RegExp(
    r"'(/[a-z0-9/_]+)': \(context\) => const BohRouteGuard\((.|\n)*?child:",
  );
  for (final match in blockPattern.allMatches(mainSource)) {
    guardBlocks[match.group(1)!] = match.group(0)!;
  }

  /// The exact premium mapping under test: route → capability key.
  const premiumMapping = <String, String>{
    '/inventory/purchases': 'inventory.retail',
    '/inventory/suppliers': 'inventory.retail',
    '/inventory/shrinkage': 'inventory.retail',
    '/inventory/alerts': 'inventory.retail',
    '/inventory/alerts/stock': 'inventory.retail',
    '/inventory/counts': 'inventory.retail',
    '/inventory/kardex': 'inventory.retail',
    '/inventory/production': 'inventory.cooking',
    '/inventory/recipes': 'inventory.cooking',
    '/inventory/reports/valuation': 'reports.margins',
    '/inventory/reports/cogs': 'reports.margins',
  };

  /// Nucleus BOH routes: a plan must never gate them (catalog §7).
  const nucleusRoutes = <String>[
    '/inventory/boh',
    '/inventory/items',
    '/inventory/warehouses',
  ];

  /// Every premium capability key in the catalog — the ONLY keys allowed to
  /// appear as a `capability:` argument anywhere in main.dart.
  const premiumKeys = <String>[
    'inventory.retail',
    'inventory.cooking',
    'promotions',
    'promotions.convenio',
    'loyalty',
    'reports.margins',
  ];

  group('premium route→capability mapping', () {
    test('every premium route is present and mapped to its exact key', () {
      for (final entry in premiumMapping.entries) {
        final block = guardBlocks[entry.key];
        expect(block, isNotNull,
            reason: 'route ${entry.key} must wrap its child in BohRouteGuard');
        expect(
          block!.contains("capability: '${entry.value}'"),
          isTrue,
          reason:
              'route ${entry.key} must carry capability ${entry.value}',
        );
      }
    });

    test('each premium route carries NO capability other than its own', () {
      for (final entry in premiumMapping.entries) {
        final block = guardBlocks[entry.key]!;
        final capsInBlock = premiumKeys
            .where((key) => block.contains("capability: '$key'"))
            .toList();
        expect(capsInBlock, [entry.value],
            reason: 'route ${entry.key} must gate exactly ${entry.value}');
      }
    });
  });

  group('nucleus routes are never gated (catalog §7)', () {
    test('nucleus BOH routes carry NO capability argument', () {
      for (final route in nucleusRoutes) {
        final block = guardBlocks[route];
        expect(block, isNotNull,
            reason: 'route $route must stay wrapped in BohRouteGuard');
        expect(
          RegExp(r"capability:\s*'").hasMatch(block!),
          isFalse,
          reason: 'route $route is nucleus: no capability allowed',
        );
      }
    });

    test('no core.* capability is passed anywhere in main.dart', () {
      expect(
        RegExp(r"capability:\s*'core\.").hasMatch(mainSource),
        isFalse,
        reason: 'a core.* gate would lock the sale path in the UI',
      );
    });

    test('only catalog premium keys are ever passed as capabilities', () {
      final allCaps = RegExp(r"capability:\s*'([^']+)'")
          .allMatches(mainSource)
          .map((m) => m.group(1)!)
          .toList();
      expect(allCaps, isNotEmpty);
      for (final cap in allCaps) {
        expect(premiumKeys, contains(cap),
            reason: '$cap is not a catalog premium capability key');
      }
    });
  });
}
