import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../domain/security/cloud_revocation_barrier.dart';

class SharedPreferencesCloudRevocationBarrierStore
    implements CloudRevocationBarrierStore {
  SharedPreferencesCloudRevocationBarrierStore([
    SharedPreferences? prefs,
    Future<SharedPreferences> Function()? prefsProvider,
  ])  : _prefs = prefs,
        _prefsProvider = prefsProvider;

  SharedPreferences? _prefs;
  final Future<SharedPreferences> Function()? _prefsProvider;
  static const _barrierKey = 'cloud_auth_revocation_barrier_v1';

  Future<SharedPreferences> _getPrefs() async {
    if (_prefs != null) return _prefs!;
    if (_prefsProvider != null) {
      _prefs = await _prefsProvider!();
      return _prefs!;
    }
    return _prefs = await SharedPreferences.getInstance();
  }

  @override
  Future<RevocationBarrier?> readBarrier() async {
    try {
      final prefs = await _getPrefs();
      final raw = prefs.getString(_barrierKey);
      if (raw == null) return null;

      final dynamic decoded;
      try {
        decoded = jsonDecode(raw);
      } catch (e) {
        throw RevocationBarrierCorruptedFailure(
          'Corrupted JSON in barrier store: $raw',
          e,
        );
      }

      if (decoded is! Map<String, dynamic>) {
        throw const RevocationBarrierCorruptedFailure(
          'Revocation barrier payload is not a JSON map',
        );
      }

      final revokedAtRaw = decoded['revokedAtUtc'];
      if (revokedAtRaw is! String) {
        throw const RevocationBarrierCorruptedFailure(
          'Missing or invalid revokedAtUtc in barrier payload',
        );
      }

      final DateTime revokedAtUtc;
      try {
        revokedAtUtc = DateTime.parse(revokedAtRaw);
      } catch (e) {
        throw RevocationBarrierCorruptedFailure(
          'Invalid revokedAtUtc date: $revokedAtRaw',
          e,
        );
      }

      final genRaw = decoded['generation'];
      final BigInt? generation;
      if (genRaw != null) {
        if (genRaw is String) {
          generation = BigInt.tryParse(genRaw);
        } else if (genRaw is num) {
          generation = BigInt.from(genRaw);
        } else {
          throw const RevocationBarrierCorruptedFailure(
            'Invalid generation type in barrier payload',
          );
        }
        if (generation == null) {
          throw RevocationBarrierCorruptedFailure(
            'Failed to parse generation BigInt: $genRaw',
          );
        }
      } else {
        generation = null;
      }

      return RevocationBarrier(
        revokedAtUtc: revokedAtUtc,
        generation: generation,
      );
    } on RevocationBarrierFailure {
      rethrow;
    } catch (e) {
      throw RevocationBarrierReadFailure(
        'Failed to read revocation barrier from SharedPreferences',
        e,
      );
    }
  }

  @override
  Future<void> writeBarrier(RevocationBarrier barrier) async {
    try {
      final prefs = await _getPrefs();
      final payload = jsonEncode({
        'revokedAtUtc': barrier.revokedAtUtc.toUtc().toIso8601String(),
        if (barrier.generation != null)
          'generation': barrier.generation.toString(),
      });
      final ok = await prefs.setString(_barrierKey, payload);
      if (!ok) {
        throw const RevocationBarrierWriteFailure(
          'SharedPreferences.setString returned false when writing barrier',
        );
      }
    } on RevocationBarrierFailure {
      rethrow;
    } catch (e) {
      throw RevocationBarrierWriteFailure(
        'Failed to write revocation barrier to SharedPreferences',
        e,
      );
    }
  }

  @override
  Future<void> clearBarrier() async {
    try {
      final prefs = await _getPrefs();
      final ok = await prefs.remove(_barrierKey);
      if (!ok) {
        throw const RevocationBarrierWriteFailure(
          'SharedPreferences.remove returned false when clearing barrier',
        );
      }
    } on RevocationBarrierFailure {
      rethrow;
    } catch (e) {
      throw RevocationBarrierWriteFailure(
        'Failed to clear revocation barrier from SharedPreferences',
        e,
      );
    }
  }
}
