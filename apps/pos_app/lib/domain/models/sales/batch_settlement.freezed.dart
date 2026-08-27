// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'batch_settlement.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

BatchSettlement _$BatchSettlementFromJson(Map<String, dynamic> json) {
  return _BatchSettlement.fromJson(json);
}

/// @nodoc
mixin _$BatchSettlement {
  String get id => throw _privateConstructorUsedError;
  String get batchNumber => throw _privateConstructorUsedError;
  String get terminalId => throw _privateConstructorUsedError;
  String get bankPos => throw _privateConstructorUsedError;
  int get totalTransactions => throw _privateConstructorUsedError;
  double get totalAmountNio => throw _privateConstructorUsedError;
  double get totalAmountUsd => throw _privateConstructorUsedError;
  String get status =>
      throw _privateConstructorUsedError; // 'OPEN', 'SETTLED', 'FORCE_CLOSED'
  DateTime get openedAt => throw _privateConstructorUsedError;
  DateTime? get settledAt => throw _privateConstructorUsedError;
  String? get sessionId => throw _privateConstructorUsedError;
  String? get settledByUserId => throw _privateConstructorUsedError;
  String? get notes => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $BatchSettlementCopyWith<BatchSettlement> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $BatchSettlementCopyWith<$Res> {
  factory $BatchSettlementCopyWith(
          BatchSettlement value, $Res Function(BatchSettlement) then) =
      _$BatchSettlementCopyWithImpl<$Res, BatchSettlement>;
  @useResult
  $Res call(
      {String id,
      String batchNumber,
      String terminalId,
      String bankPos,
      int totalTransactions,
      double totalAmountNio,
      double totalAmountUsd,
      String status,
      DateTime openedAt,
      DateTime? settledAt,
      String? sessionId,
      String? settledByUserId,
      String? notes});
}

/// @nodoc
class _$BatchSettlementCopyWithImpl<$Res, $Val extends BatchSettlement>
    implements $BatchSettlementCopyWith<$Res> {
  _$BatchSettlementCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? batchNumber = null,
    Object? terminalId = null,
    Object? bankPos = null,
    Object? totalTransactions = null,
    Object? totalAmountNio = null,
    Object? totalAmountUsd = null,
    Object? status = null,
    Object? openedAt = null,
    Object? settledAt = freezed,
    Object? sessionId = freezed,
    Object? settledByUserId = freezed,
    Object? notes = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      batchNumber: null == batchNumber
          ? _value.batchNumber
          : batchNumber // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      bankPos: null == bankPos
          ? _value.bankPos
          : bankPos // ignore: cast_nullable_to_non_nullable
              as String,
      totalTransactions: null == totalTransactions
          ? _value.totalTransactions
          : totalTransactions // ignore: cast_nullable_to_non_nullable
              as int,
      totalAmountNio: null == totalAmountNio
          ? _value.totalAmountNio
          : totalAmountNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalAmountUsd: null == totalAmountUsd
          ? _value.totalAmountUsd
          : totalAmountUsd // ignore: cast_nullable_to_non_nullable
              as double,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      openedAt: null == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      settledAt: freezed == settledAt
          ? _value.settledAt
          : settledAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      sessionId: freezed == sessionId
          ? _value.sessionId
          : sessionId // ignore: cast_nullable_to_non_nullable
              as String?,
      settledByUserId: freezed == settledByUserId
          ? _value.settledByUserId
          : settledByUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$BatchSettlementImplCopyWith<$Res>
    implements $BatchSettlementCopyWith<$Res> {
  factory _$$BatchSettlementImplCopyWith(_$BatchSettlementImpl value,
          $Res Function(_$BatchSettlementImpl) then) =
      __$$BatchSettlementImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String batchNumber,
      String terminalId,
      String bankPos,
      int totalTransactions,
      double totalAmountNio,
      double totalAmountUsd,
      String status,
      DateTime openedAt,
      DateTime? settledAt,
      String? sessionId,
      String? settledByUserId,
      String? notes});
}

/// @nodoc
class __$$BatchSettlementImplCopyWithImpl<$Res>
    extends _$BatchSettlementCopyWithImpl<$Res, _$BatchSettlementImpl>
    implements _$$BatchSettlementImplCopyWith<$Res> {
  __$$BatchSettlementImplCopyWithImpl(
      _$BatchSettlementImpl _value, $Res Function(_$BatchSettlementImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? batchNumber = null,
    Object? terminalId = null,
    Object? bankPos = null,
    Object? totalTransactions = null,
    Object? totalAmountNio = null,
    Object? totalAmountUsd = null,
    Object? status = null,
    Object? openedAt = null,
    Object? settledAt = freezed,
    Object? sessionId = freezed,
    Object? settledByUserId = freezed,
    Object? notes = freezed,
  }) {
    return _then(_$BatchSettlementImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      batchNumber: null == batchNumber
          ? _value.batchNumber
          : batchNumber // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      bankPos: null == bankPos
          ? _value.bankPos
          : bankPos // ignore: cast_nullable_to_non_nullable
              as String,
      totalTransactions: null == totalTransactions
          ? _value.totalTransactions
          : totalTransactions // ignore: cast_nullable_to_non_nullable
              as int,
      totalAmountNio: null == totalAmountNio
          ? _value.totalAmountNio
          : totalAmountNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalAmountUsd: null == totalAmountUsd
          ? _value.totalAmountUsd
          : totalAmountUsd // ignore: cast_nullable_to_non_nullable
              as double,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      openedAt: null == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      settledAt: freezed == settledAt
          ? _value.settledAt
          : settledAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      sessionId: freezed == sessionId
          ? _value.sessionId
          : sessionId // ignore: cast_nullable_to_non_nullable
              as String?,
      settledByUserId: freezed == settledByUserId
          ? _value.settledByUserId
          : settledByUserId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$BatchSettlementImpl implements _BatchSettlement {
  const _$BatchSettlementImpl(
      {required this.id,
      required this.batchNumber,
      required this.terminalId,
      this.bankPos = 'BAC',
      this.totalTransactions = 0,
      this.totalAmountNio = 0.0,
      this.totalAmountUsd = 0.0,
      this.status = 'OPEN',
      required this.openedAt,
      this.settledAt,
      this.sessionId,
      this.settledByUserId,
      this.notes});

  factory _$BatchSettlementImpl.fromJson(Map<String, dynamic> json) =>
      _$$BatchSettlementImplFromJson(json);

  @override
  final String id;
  @override
  final String batchNumber;
  @override
  final String terminalId;
  @override
  @JsonKey()
  final String bankPos;
  @override
  @JsonKey()
  final int totalTransactions;
  @override
  @JsonKey()
  final double totalAmountNio;
  @override
  @JsonKey()
  final double totalAmountUsd;
  @override
  @JsonKey()
  final String status;
// 'OPEN', 'SETTLED', 'FORCE_CLOSED'
  @override
  final DateTime openedAt;
  @override
  final DateTime? settledAt;
  @override
  final String? sessionId;
  @override
  final String? settledByUserId;
  @override
  final String? notes;

  @override
  String toString() {
    return 'BatchSettlement(id: $id, batchNumber: $batchNumber, terminalId: $terminalId, bankPos: $bankPos, totalTransactions: $totalTransactions, totalAmountNio: $totalAmountNio, totalAmountUsd: $totalAmountUsd, status: $status, openedAt: $openedAt, settledAt: $settledAt, sessionId: $sessionId, settledByUserId: $settledByUserId, notes: $notes)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$BatchSettlementImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.batchNumber, batchNumber) ||
                other.batchNumber == batchNumber) &&
            (identical(other.terminalId, terminalId) ||
                other.terminalId == terminalId) &&
            (identical(other.bankPos, bankPos) || other.bankPos == bankPos) &&
            (identical(other.totalTransactions, totalTransactions) ||
                other.totalTransactions == totalTransactions) &&
            (identical(other.totalAmountNio, totalAmountNio) ||
                other.totalAmountNio == totalAmountNio) &&
            (identical(other.totalAmountUsd, totalAmountUsd) ||
                other.totalAmountUsd == totalAmountUsd) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.openedAt, openedAt) ||
                other.openedAt == openedAt) &&
            (identical(other.settledAt, settledAt) ||
                other.settledAt == settledAt) &&
            (identical(other.sessionId, sessionId) ||
                other.sessionId == sessionId) &&
            (identical(other.settledByUserId, settledByUserId) ||
                other.settledByUserId == settledByUserId) &&
            (identical(other.notes, notes) || other.notes == notes));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      batchNumber,
      terminalId,
      bankPos,
      totalTransactions,
      totalAmountNio,
      totalAmountUsd,
      status,
      openedAt,
      settledAt,
      sessionId,
      settledByUserId,
      notes);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$BatchSettlementImplCopyWith<_$BatchSettlementImpl> get copyWith =>
      __$$BatchSettlementImplCopyWithImpl<_$BatchSettlementImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$BatchSettlementImplToJson(
      this,
    );
  }
}

abstract class _BatchSettlement implements BatchSettlement {
  const factory _BatchSettlement(
      {required final String id,
      required final String batchNumber,
      required final String terminalId,
      final String bankPos,
      final int totalTransactions,
      final double totalAmountNio,
      final double totalAmountUsd,
      final String status,
      required final DateTime openedAt,
      final DateTime? settledAt,
      final String? sessionId,
      final String? settledByUserId,
      final String? notes}) = _$BatchSettlementImpl;

  factory _BatchSettlement.fromJson(Map<String, dynamic> json) =
      _$BatchSettlementImpl.fromJson;

  @override
  String get id;
  @override
  String get batchNumber;
  @override
  String get terminalId;
  @override
  String get bankPos;
  @override
  int get totalTransactions;
  @override
  double get totalAmountNio;
  @override
  double get totalAmountUsd;
  @override
  String get status;
  @override // 'OPEN', 'SETTLED', 'FORCE_CLOSED'
  DateTime get openedAt;
  @override
  DateTime? get settledAt;
  @override
  String? get sessionId;
  @override
  String? get settledByUserId;
  @override
  String? get notes;
  @override
  @JsonKey(ignore: true)
  _$$BatchSettlementImplCopyWith<_$BatchSettlementImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
