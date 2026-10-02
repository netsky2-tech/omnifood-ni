import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/cash_movement_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/open_shift_dialog.dart';
import 'package:provider/provider.dart';

// D-20: two-column money dialogs truncated the currency marker (the ONLY part
// of the label that says which currency the operator is typing into):
// 'Total Contado (C$)' -> 'Total Contado (C…'  and
// 'Total Contado ($ USD)' -> 'Total Contado ($…'.
// These tests pin: (a) every currency label renders FULLY (no clipping), and
// (b) the two labels stay unambiguous even under truncation, and (c) narrow
// widths stack the two money fields instead of squeezing them into one row.
class _MockCashierSessionDao extends Mock implements CashierSessionDao {}

class _MockCashMovementDao extends Mock implements CashMovementDao {}

/// Measurement of one rendered label.
class LabelMetrics {
  const LabelMetrics(this.label, this.renderedWidth, this.intrinsicWidth);
  final String label;

  /// Width the Text widget actually got from layout.
  final double renderedWidth;

  /// Width the full single-line string needs at its own style.
  final double intrinsicWidth;

  bool get isClipped => intrinsicWidth > renderedWidth + 0.5;
}

LabelMetrics _measure(WidgetTester tester, String label) {
  final RenderParagraph paragraph =
      tester.renderObject<RenderParagraph>(find.text(label));
  final span = paragraph.text as TextSpan;
  final painter = TextPainter(text: span, textDirection: TextDirection.ltr)
    ..layout();
  return LabelMetrics(label, paragraph.size.width, painter.maxIntrinsicWidth);
}

/// Longest prefix of [text] that fits inside the rendered width of the Text
/// widget for [label] — i.e. what the operator can actually READ if the label
/// is ellipsized/clipped.
String _visiblePrefix(WidgetTester tester, String label) {
  final RenderParagraph paragraph =
      tester.renderObject<RenderParagraph>(find.text(label));
  final span = paragraph.text as TextSpan;
  final maxWidth = paragraph.size.width;
  int lo = 0;
  int hi = label.length;
  while (lo < hi) {
    final mid = (lo + hi + 1) >> 1;
    final painter = TextPainter(
      text: TextSpan(text: label.substring(0, mid), style: span.style),
      textDirection: TextDirection.ltr,
    )..layout();
    if (painter.width <= maxWidth + 0.01) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return label.substring(0, lo);
}

void main() {
  late _MockCashierSessionDao mockSessionDao;
  late _MockCashMovementDao mockMovementDao;
  late CashShiftViewModel viewModel;

  setUp(() {
    mockSessionDao = _MockCashierSessionDao();
    mockMovementDao = _MockCashMovementDao();
    viewModel = CashShiftViewModel(
      sessionDao: mockSessionDao,
      movementDao: mockMovementDao,
      currentUserId: 'user-cajero-1',
      currentUserName: 'Juan Pérez',
      currentTerminalId: 'term-main',
    );
  });

  Future<void> pumpDialog(
    WidgetTester tester,
    Widget dialog, {
    required Size screen,
  }) async {
    tester.view.physicalSize = screen;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ChangeNotifierProvider<CashShiftViewModel>.value(
        value: viewModel,
        child: MaterialApp(home: Scaffold(body: dialog)),
      ),
    );
    await tester.pumpAndSettle();
  }

  void expectLabelsFullyVisible(WidgetTester tester, List<String> labels) {
    for (final label in labels) {
      final metrics = _measure(tester, label);
      expect(
        metrics.isClipped,
        isFalse,
        reason: 'Label "$label" is clipped: rendered width '
            '${metrics.renderedWidth.toStringAsFixed(1)} < intrinsic width '
            '${metrics.intrinsicWidth.toStringAsFixed(1)}. The tail (the '
            'currency marker) is what gets cut.',
      );
    }
  }

  void expectLabelsUnambiguous(WidgetTester tester, List<String> labels) {
    final prefixes = labels.map((l) => _visiblePrefix(tester, l)).toList();
    expect(
      prefixes.toSet().length,
      labels.length,
      reason: 'Labels $labels truncate to identical visible prefixes '
          '$prefixes — the operator cannot tell the currency fields apart '
          'from what is on screen.',
    );
  }

  group('CloseShiftDialog (blind count) — D-20 currency labels', () {
    const nioKey = Key('close_shift_nio_counted_input');
    const usdKey = Key('close_shift_usd_counted_input');

    testWidgets('narrow screen (360dp): both counted labels fully visible',
        (tester) async {
      await pumpDialog(tester, const CloseShiftDialog(),
          screen: const Size(360, 800));
      expect(find.text('C\$ contado'), findsOneWidget);
      expect(find.text('USD contado'), findsOneWidget);
      expectLabelsFullyVisible(tester, const ['C\$ contado', 'USD contado']);
      expectLabelsUnambiguous(tester, const ['C\$ contado', 'USD contado']);
    });

    testWidgets('narrow screen (360dp): money fields stack vertically',
        (tester) async {
      await pumpDialog(tester, const CloseShiftDialog(),
          screen: const Size(360, 800));
      final nioTop = tester.getTopLeft(find.byKey(nioKey)).dy;
      final usdTop = tester.getTopLeft(find.byKey(usdKey)).dy;
      expect(usdTop, greaterThan(nioTop),
          reason: 'On a handheld the two money fields must stack so neither '
              'is a cramped half-width field.');
    });

    testWidgets('natural width: labels fully visible and side by side',
        (tester) async {
      await pumpDialog(tester, const CloseShiftDialog(),
          screen: const Size(900, 1000));
      expect(find.text('C\$ contado'), findsOneWidget);
      expect(find.text('USD contado'), findsOneWidget);
      expectLabelsFullyVisible(tester, const ['C\$ contado', 'USD contado']);
      final nioTop = tester.getTopLeft(find.byKey(nioKey)).dy;
      final usdTop = tester.getTopLeft(find.byKey(usdKey)).dy;
      expect(usdTop, closeTo(nioTop, 0.5));
    });
  });

  group('CashMovementDialog — D-20 currency labels', () {
    const nioKey = Key('cash_movement_nio_input');
    const usdKey = Key('cash_movement_usd_input');

    testWidgets('narrow screen (360dp): both amount labels fully visible',
        (tester) async {
      await pumpDialog(tester, const CashMovementDialog(),
          screen: const Size(360, 800));
      expect(find.text('Monto C\$'), findsOneWidget);
      expect(find.text('Monto USD'), findsOneWidget);
      expectLabelsFullyVisible(tester, const ['Monto C\$', 'Monto USD']);
      expectLabelsUnambiguous(tester, const ['Monto C\$', 'Monto USD']);
    });

    testWidgets('narrow screen (360dp): money fields stack vertically',
        (tester) async {
      await pumpDialog(tester, const CashMovementDialog(),
          screen: const Size(360, 800));
      final nioTop = tester.getTopLeft(find.byKey(nioKey)).dy;
      final usdTop = tester.getTopLeft(find.byKey(usdKey)).dy;
      expect(usdTop, greaterThan(nioTop));
    });

    testWidgets('natural width: labels fully visible and side by side',
        (tester) async {
      await pumpDialog(tester, const CashMovementDialog(),
          screen: const Size(900, 1000));
      expect(find.text('Monto C\$'), findsOneWidget);
      expect(find.text('Monto USD'), findsOneWidget);
      expectLabelsFullyVisible(tester, const ['Monto C\$', 'Monto USD']);
      final nioTop = tester.getTopLeft(find.byKey(nioKey)).dy;
      final usdTop = tester.getTopLeft(find.byKey(usdKey)).dy;
      expect(usdTop, closeTo(nioTop, 0.5));
    });
  });

  group('OpenShiftDialog — D-20 currency labels', () {
    testWidgets('narrow screen (360dp): both float labels fully visible',
        (tester) async {
      when(() => mockSessionDao.getActiveSessionForUserAndTerminal(any(), any()))
          .thenAnswer((_) async => null);
      await pumpDialog(tester, const OpenShiftDialog(),
          screen: const Size(360, 800));
      expect(find.text('Fondo C\$'), findsOneWidget);
      expect(find.text('Fondo USD'), findsOneWidget);
      expectLabelsFullyVisible(tester, const ['Fondo C\$', 'Fondo USD']);
      expectLabelsUnambiguous(tester, const ['Fondo C\$', 'Fondo USD']);
    });
  });
}