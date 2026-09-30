import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Design §13 requires asserting positional `@transaction` generation.
///
/// Floor 1.5.0's `@transaction` methods break the generated `.g.dart` when they
/// take named parameters, so the rule in `AGENTS.md` ("methods annotated with
/// `@transaction` MUST use positional arguments") has to be checked against the
/// generated output rather than against the hand-written source: the generator
/// is what would fail, and it only fails at build time on the developer's
/// machine. Reading the generated file makes the rule fail a test instead.
void main() {
  final generated =
      File('lib/data/database/app_database.g.dart').readAsStringSync();

  String? signatureOf(String methodName) {
    final match = RegExp(
      'Future<void> $methodName\\((.*?)\\) async \\{',
      dotAll: true,
    ).firstMatch(generated);
    return match?.group(1);
  }

  void expectPositionalTransaction(String methodName) {
    final signature = signatureOf(methodName);
    expect(
      signature,
      isNotNull,
      reason: 'build_runner must generate the transaction wrapper for '
          '$methodName',
    );

    expect(
      signature,
      isNot(contains('{')),
      reason: '$methodName must take positional arguments; a named parameter '
          'breaks the generated .g.dart for Floor 1.5.0',
    );
    expect(signature, isNot(contains('}')));
    expect(signature, isNot(contains('required')));

    expect(
      generated,
      contains('super.$methodName('),
      reason: 'the generated wrapper must delegate into the transaction body',
    );

    // Scope the transaction assertion to THIS method's generated block rather
    // than to the whole file: `app_database.g.dart` holds every DAO's wrapper,
    // so a file-wide `contains` would be satisfied by some other method and
    // would assert nothing about this one.
    final start = generated.indexOf('Future<void> $methodName(');
    final nextMethod = generated.indexOf('Future<', start + 1);
    final block = generated.substring(
      start,
      nextMethod == -1 ? generated.length : nextMethod,
    );
    expect(
      block,
      contains('transaction<void>((transaction) async {'),
      reason: '$methodName must actually run inside a sqflite transaction, '
          'scoped to its own generated block',
    );
    expect(
      block,
      contains('super.$methodName('),
      reason: '$methodName\'s wrapper must delegate into its own transaction '
          'body',
    );
  }

  test('receiveCandidateEpoch is generated as a positional transaction', () {
    expectPositionalTransaction('receiveCandidateEpoch');
  });

  test('submitCandidateAcknowledgement is generated as a positional '
      'transaction', () {
    expectPositionalTransaction('submitCandidateAcknowledgement');
    // B3 (design §5.1, §11.5 decision 31): the drain-gate registry rides
    // along as a positional parameter — a named parameter would break the
    // generated wrapper, and the gate must live inside the SAME transaction
    // as the flip it guards.
    final signature = signatureOf('submitCandidateAcknowledgement');
    expect(signature, contains('OhacOutboxRegistry ohacOutboxRegistry'),
        reason: 'the drain gate must be consultable inside transaction S');
  });

  test('ensureTerminalState is generated as a positional transaction', () {
    expectPositionalTransaction('ensureTerminalState');
  });

  test('confirmAcknowledgementWithReceipt is generated as a positional '
      'transaction', () {
    expectPositionalTransaction('confirmAcknowledgementWithReceipt');
  });
}
