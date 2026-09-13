class RevocationBarrier {
  const RevocationBarrier({
    required this.revokedAtUtc,
    this.generation,
  });

  final DateTime revokedAtUtc;
  final BigInt? generation;

  bool rejects({
    required BigInt? recordGeneration,
    required DateTime? recordIssuedAtUtc,
  }) {
    if (generation != null && recordGeneration != null) {
      return recordGeneration <= generation!;
    }
    if (recordIssuedAtUtc != null) {
      return !recordIssuedAtUtc.isAfter(revokedAtUtc);
    }
    return true;
  }
}

class RevocationBarrierFailure implements Exception {
  const RevocationBarrierFailure(this.message, [this.cause]);
  final String message;
  final Object? cause;

  @override
  String toString() =>
      'RevocationBarrierFailure: $message${cause != null ? ' (cause: $cause)' : ''}';
}

class RevocationBarrierCorruptedFailure extends RevocationBarrierFailure {
  const RevocationBarrierCorruptedFailure(super.message, [super.cause]);
}

class RevocationBarrierReadFailure extends RevocationBarrierFailure {
  const RevocationBarrierReadFailure(super.message, [super.cause]);
}

class RevocationBarrierWriteFailure extends RevocationBarrierFailure {
  const RevocationBarrierWriteFailure(super.message, [super.cause]);
}

abstract class CloudRevocationBarrierStore {
  Future<RevocationBarrier?> readBarrier();
  Future<void> writeBarrier(RevocationBarrier barrier);
  Future<void> clearBarrier();
}
