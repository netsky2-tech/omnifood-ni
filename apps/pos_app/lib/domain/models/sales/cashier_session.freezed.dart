// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'cashier_session.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

CashierSession _$CashierSessionFromJson(Map<String, dynamic> json) {
  return _CashierSession.fromJson(json);
}

/// @nodoc
mixin _$CashierSession {
  String get id => throw _privateConstructorUsedError;
  String get userId => throw _privateConstructorUsedError;
  String get terminalId => throw _privateConstructorUsedError;
  DateTime get openedAt => throw _privateConstructorUsedError;
  @JsonKey(name: 'tipo_modelo')
  CashSessionModel get tipoModelo => throw _privateConstructorUsedError;
  DateTime? get closedAt => throw _privateConstructorUsedError;
  double get openingBalance => throw _privateConstructorUsedError;
  double get openingBalanceNio => throw _privateConstructorUsedError;
  double get openingBalanceUsd => throw _privateConstructorUsedError;
  double? get closingBalance => throw _privateConstructorUsedError;
  double? get closingCountedNio => throw _privateConstructorUsedError;
  double? get closingCountedUsd => throw _privateConstructorUsedError;
  double? get totalSales => throw _privateConstructorUsedError;
  double get totalExpected => throw _privateConstructorUsedError;
  double get expectedNio => throw _privateConstructorUsedError;
  double get expectedUsd => throw _privateConstructorUsedError;
  double? get differenceNio => throw _privateConstructorUsedError;
  double? get differenceUsd => throw _privateConstructorUsedError;
  int? get zReportSequence => throw _privateConstructorUsedError;
  bool get isClosed => throw _privateConstructorUsedError;
  String? get supervisorId => throw _privateConstructorUsedError;
  String? get notes => throw _privateConstructorUsedError;
  String get syncStatus => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $CashierSessionCopyWith<CashierSession> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CashierSessionCopyWith<$Res> {
  factory $CashierSessionCopyWith(
          CashierSession value, $Res Function(CashierSession) then) =
      _$CashierSessionCopyWithImpl<$Res, CashierSession>;
  @useResult
  $Res call(
      {String id,
      String userId,
      String terminalId,
      DateTime openedAt,
      @JsonKey(name: 'tipo_modelo') CashSessionModel tipoModelo,
      DateTime? closedAt,
      double openingBalance,
      double openingBalanceNio,
      double openingBalanceUsd,
      double? closingBalance,
      double? closingCountedNio,
      double? closingCountedUsd,
      double? totalSales,
      double totalExpected,
      double expectedNio,
      double expectedUsd,
      double? differenceNio,
      double? differenceUsd,
      int? zReportSequence,
      bool isClosed,
      String? supervisorId,
      String? notes,
      String syncStatus});
}

/// @nodoc
class _$CashierSessionCopyWithImpl<$Res, $Val extends CashierSession>
    implements $CashierSessionCopyWith<$Res> {
  _$CashierSessionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? userId = null,
    Object? terminalId = null,
    Object? openedAt = null,
    Object? tipoModelo = null,
    Object? closedAt = freezed,
    Object? openingBalance = null,
    Object? openingBalanceNio = null,
    Object? openingBalanceUsd = null,
    Object? closingBalance = freezed,
    Object? closingCountedNio = freezed,
    Object? closingCountedUsd = freezed,
    Object? totalSales = freezed,
    Object? totalExpected = null,
    Object? expectedNio = null,
    Object? expectedUsd = null,
    Object? differenceNio = freezed,
    Object? differenceUsd = freezed,
    Object? zReportSequence = freezed,
    Object? isClosed = null,
    Object? supervisorId = freezed,
    Object? notes = freezed,
    Object? syncStatus = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      openedAt: null == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      tipoModelo: null == tipoModelo
          ? _value.tipoModelo
          : tipoModelo // ignore: cast_nullable_to_non_nullable
              as CashSessionModel,
      closedAt: freezed == closedAt
          ? _value.closedAt
          : closedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      openingBalance: null == openingBalance
          ? _value.openingBalance
          : openingBalance // ignore: cast_nullable_to_non_nullable
              as double,
      openingBalanceNio: null == openingBalanceNio
          ? _value.openingBalanceNio
          : openingBalanceNio // ignore: cast_nullable_to_non_nullable
              as double,
      openingBalanceUsd: null == openingBalanceUsd
          ? _value.openingBalanceUsd
          : openingBalanceUsd // ignore: cast_nullable_to_non_nullable
              as double,
      closingBalance: freezed == closingBalance
          ? _value.closingBalance
          : closingBalance // ignore: cast_nullable_to_non_nullable
              as double?,
      closingCountedNio: freezed == closingCountedNio
          ? _value.closingCountedNio
          : closingCountedNio // ignore: cast_nullable_to_non_nullable
              as double?,
      closingCountedUsd: freezed == closingCountedUsd
          ? _value.closingCountedUsd
          : closingCountedUsd // ignore: cast_nullable_to_non_nullable
              as double?,
      totalSales: freezed == totalSales
          ? _value.totalSales
          : totalSales // ignore: cast_nullable_to_non_nullable
              as double?,
      totalExpected: null == totalExpected
          ? _value.totalExpected
          : totalExpected // ignore: cast_nullable_to_non_nullable
              as double,
      expectedNio: null == expectedNio
          ? _value.expectedNio
          : expectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      expectedUsd: null == expectedUsd
          ? _value.expectedUsd
          : expectedUsd // ignore: cast_nullable_to_non_nullable
              as double,
      differenceNio: freezed == differenceNio
          ? _value.differenceNio
          : differenceNio // ignore: cast_nullable_to_non_nullable
              as double?,
      differenceUsd: freezed == differenceUsd
          ? _value.differenceUsd
          : differenceUsd // ignore: cast_nullable_to_non_nullable
              as double?,
      zReportSequence: freezed == zReportSequence
          ? _value.zReportSequence
          : zReportSequence // ignore: cast_nullable_to_non_nullable
              as int?,
      isClosed: null == isClosed
          ? _value.isClosed
          : isClosed // ignore: cast_nullable_to_non_nullable
              as bool,
      supervisorId: freezed == supervisorId
          ? _value.supervisorId
          : supervisorId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$CashierSessionImplCopyWith<$Res>
    implements $CashierSessionCopyWith<$Res> {
  factory _$$CashierSessionImplCopyWith(_$CashierSessionImpl value,
          $Res Function(_$CashierSessionImpl) then) =
      __$$CashierSessionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String userId,
      String terminalId,
      DateTime openedAt,
      @JsonKey(name: 'tipo_modelo') CashSessionModel tipoModelo,
      DateTime? closedAt,
      double openingBalance,
      double openingBalanceNio,
      double openingBalanceUsd,
      double? closingBalance,
      double? closingCountedNio,
      double? closingCountedUsd,
      double? totalSales,
      double totalExpected,
      double expectedNio,
      double expectedUsd,
      double? differenceNio,
      double? differenceUsd,
      int? zReportSequence,
      bool isClosed,
      String? supervisorId,
      String? notes,
      String syncStatus});
}

/// @nodoc
class __$$CashierSessionImplCopyWithImpl<$Res>
    extends _$CashierSessionCopyWithImpl<$Res, _$CashierSessionImpl>
    implements _$$CashierSessionImplCopyWith<$Res> {
  __$$CashierSessionImplCopyWithImpl(
      _$CashierSessionImpl _value, $Res Function(_$CashierSessionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? userId = null,
    Object? terminalId = null,
    Object? openedAt = null,
    Object? tipoModelo = null,
    Object? closedAt = freezed,
    Object? openingBalance = null,
    Object? openingBalanceNio = null,
    Object? openingBalanceUsd = null,
    Object? closingBalance = freezed,
    Object? closingCountedNio = freezed,
    Object? closingCountedUsd = freezed,
    Object? totalSales = freezed,
    Object? totalExpected = null,
    Object? expectedNio = null,
    Object? expectedUsd = null,
    Object? differenceNio = freezed,
    Object? differenceUsd = freezed,
    Object? zReportSequence = freezed,
    Object? isClosed = null,
    Object? supervisorId = freezed,
    Object? notes = freezed,
    Object? syncStatus = null,
  }) {
    return _then(_$CashierSessionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      terminalId: null == terminalId
          ? _value.terminalId
          : terminalId // ignore: cast_nullable_to_non_nullable
              as String,
      openedAt: null == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      tipoModelo: null == tipoModelo
          ? _value.tipoModelo
          : tipoModelo // ignore: cast_nullable_to_non_nullable
              as CashSessionModel,
      closedAt: freezed == closedAt
          ? _value.closedAt
          : closedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      openingBalance: null == openingBalance
          ? _value.openingBalance
          : openingBalance // ignore: cast_nullable_to_non_nullable
              as double,
      openingBalanceNio: null == openingBalanceNio
          ? _value.openingBalanceNio
          : openingBalanceNio // ignore: cast_nullable_to_non_nullable
              as double,
      openingBalanceUsd: null == openingBalanceUsd
          ? _value.openingBalanceUsd
          : openingBalanceUsd // ignore: cast_nullable_to_non_nullable
              as double,
      closingBalance: freezed == closingBalance
          ? _value.closingBalance
          : closingBalance // ignore: cast_nullable_to_non_nullable
              as double?,
      closingCountedNio: freezed == closingCountedNio
          ? _value.closingCountedNio
          : closingCountedNio // ignore: cast_nullable_to_non_nullable
              as double?,
      closingCountedUsd: freezed == closingCountedUsd
          ? _value.closingCountedUsd
          : closingCountedUsd // ignore: cast_nullable_to_non_nullable
              as double?,
      totalSales: freezed == totalSales
          ? _value.totalSales
          : totalSales // ignore: cast_nullable_to_non_nullable
              as double?,
      totalExpected: null == totalExpected
          ? _value.totalExpected
          : totalExpected // ignore: cast_nullable_to_non_nullable
              as double,
      expectedNio: null == expectedNio
          ? _value.expectedNio
          : expectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      expectedUsd: null == expectedUsd
          ? _value.expectedUsd
          : expectedUsd // ignore: cast_nullable_to_non_nullable
              as double,
      differenceNio: freezed == differenceNio
          ? _value.differenceNio
          : differenceNio // ignore: cast_nullable_to_non_nullable
              as double?,
      differenceUsd: freezed == differenceUsd
          ? _value.differenceUsd
          : differenceUsd // ignore: cast_nullable_to_non_nullable
              as double?,
      zReportSequence: freezed == zReportSequence
          ? _value.zReportSequence
          : zReportSequence // ignore: cast_nullable_to_non_nullable
              as int?,
      isClosed: null == isClosed
          ? _value.isClosed
          : isClosed // ignore: cast_nullable_to_non_nullable
              as bool,
      supervisorId: freezed == supervisorId
          ? _value.supervisorId
          : supervisorId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      syncStatus: null == syncStatus
          ? _value.syncStatus
          : syncStatus // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$CashierSessionImpl implements _CashierSession {
  const _$CashierSessionImpl(
      {required this.id,
      required this.userId,
      this.terminalId = 'default-terminal',
      required this.openedAt,
      @JsonKey(name: 'tipo_modelo')
      this.tipoModelo = CashSessionModel.cajaCentral,
      this.closedAt,
      this.openingBalance = 0.0,
      this.openingBalanceNio = 0.0,
      this.openingBalanceUsd = 0.0,
      this.closingBalance,
      this.closingCountedNio,
      this.closingCountedUsd,
      this.totalSales,
      this.totalExpected = 0.0,
      this.expectedNio = 0.0,
      this.expectedUsd = 0.0,
      this.differenceNio,
      this.differenceUsd,
      this.zReportSequence,
      this.isClosed = false,
      this.supervisorId,
      this.notes,
      this.syncStatus = 'pending'});

  factory _$CashierSessionImpl.fromJson(Map<String, dynamic> json) =>
      _$$CashierSessionImplFromJson(json);

  @override
  final String id;
  @override
  final String userId;
  @override
  @JsonKey()
  final String terminalId;
  @override
  final DateTime openedAt;
  @override
  @JsonKey(name: 'tipo_modelo')
  final CashSessionModel tipoModelo;
  @override
  final DateTime? closedAt;
  @override
  @JsonKey()
  final double openingBalance;
  @override
  @JsonKey()
  final double openingBalanceNio;
  @override
  @JsonKey()
  final double openingBalanceUsd;
  @override
  final double? closingBalance;
  @override
  final double? closingCountedNio;
  @override
  final double? closingCountedUsd;
  @override
  final double? totalSales;
  @override
  @JsonKey()
  final double totalExpected;
  @override
  @JsonKey()
  final double expectedNio;
  @override
  @JsonKey()
  final double expectedUsd;
  @override
  final double? differenceNio;
  @override
  final double? differenceUsd;
  @override
  final int? zReportSequence;
  @override
  @JsonKey()
  final bool isClosed;
  @override
  final String? supervisorId;
  @override
  final String? notes;
  @override
  @JsonKey()
  final String syncStatus;

  @override
  String toString() {
    return 'CashierSession(id: $id, userId: $userId, terminalId: $terminalId, openedAt: $openedAt, tipoModelo: $tipoModelo, closedAt: $closedAt, openingBalance: $openingBalance, openingBalanceNio: $openingBalanceNio, openingBalanceUsd: $openingBalanceUsd, closingBalance: $closingBalance, closingCountedNio: $closingCountedNio, closingCountedUsd: $closingCountedUsd, totalSales: $totalSales, totalExpected: $totalExpected, expectedNio: $expectedNio, expectedUsd: $expectedUsd, differenceNio: $differenceNio, differenceUsd: $differenceUsd, zReportSequence: $zReportSequence, isClosed: $isClosed, supervisorId: $supervisorId, notes: $notes, syncStatus: $syncStatus)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CashierSessionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.terminalId, terminalId) ||
                other.terminalId == terminalId) &&
            (identical(other.openedAt, openedAt) ||
                other.openedAt == openedAt) &&
            (identical(other.tipoModelo, tipoModelo) ||
                other.tipoModelo == tipoModelo) &&
            (identical(other.closedAt, closedAt) ||
                other.closedAt == closedAt) &&
            (identical(other.openingBalance, openingBalance) ||
                other.openingBalance == openingBalance) &&
            (identical(other.openingBalanceNio, openingBalanceNio) ||
                other.openingBalanceNio == openingBalanceNio) &&
            (identical(other.openingBalanceUsd, openingBalanceUsd) ||
                other.openingBalanceUsd == openingBalanceUsd) &&
            (identical(other.closingBalance, closingBalance) ||
                other.closingBalance == closingBalance) &&
            (identical(other.closingCountedNio, closingCountedNio) ||
                other.closingCountedNio == closingCountedNio) &&
            (identical(other.closingCountedUsd, closingCountedUsd) ||
                other.closingCountedUsd == closingCountedUsd) &&
            (identical(other.totalSales, totalSales) ||
                other.totalSales == totalSales) &&
            (identical(other.totalExpected, totalExpected) ||
                other.totalExpected == totalExpected) &&
            (identical(other.expectedNio, expectedNio) ||
                other.expectedNio == expectedNio) &&
            (identical(other.expectedUsd, expectedUsd) ||
                other.expectedUsd == expectedUsd) &&
            (identical(other.differenceNio, differenceNio) ||
                other.differenceNio == differenceNio) &&
            (identical(other.differenceUsd, differenceUsd) ||
                other.differenceUsd == differenceUsd) &&
            (identical(other.zReportSequence, zReportSequence) ||
                other.zReportSequence == zReportSequence) &&
            (identical(other.isClosed, isClosed) ||
                other.isClosed == isClosed) &&
            (identical(other.supervisorId, supervisorId) ||
                other.supervisorId == supervisorId) &&
            (identical(other.notes, notes) || other.notes == notes) &&
            (identical(other.syncStatus, syncStatus) ||
                other.syncStatus == syncStatus));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hashAll([
        runtimeType,
        id,
        userId,
        terminalId,
        openedAt,
        tipoModelo,
        closedAt,
        openingBalance,
        openingBalanceNio,
        openingBalanceUsd,
        closingBalance,
        closingCountedNio,
        closingCountedUsd,
        totalSales,
        totalExpected,
        expectedNio,
        expectedUsd,
        differenceNio,
        differenceUsd,
        zReportSequence,
        isClosed,
        supervisorId,
        notes,
        syncStatus
      ]);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$CashierSessionImplCopyWith<_$CashierSessionImpl> get copyWith =>
      __$$CashierSessionImplCopyWithImpl<_$CashierSessionImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CashierSessionImplToJson(
      this,
    );
  }
}

abstract class _CashierSession implements CashierSession {
  const factory _CashierSession(
      {required final String id,
      required final String userId,
      final String terminalId,
      required final DateTime openedAt,
      @JsonKey(name: 'tipo_modelo') final CashSessionModel tipoModelo,
      final DateTime? closedAt,
      final double openingBalance,
      final double openingBalanceNio,
      final double openingBalanceUsd,
      final double? closingBalance,
      final double? closingCountedNio,
      final double? closingCountedUsd,
      final double? totalSales,
      final double totalExpected,
      final double expectedNio,
      final double expectedUsd,
      final double? differenceNio,
      final double? differenceUsd,
      final int? zReportSequence,
      final bool isClosed,
      final String? supervisorId,
      final String? notes,
      final String syncStatus}) = _$CashierSessionImpl;

  factory _CashierSession.fromJson(Map<String, dynamic> json) =
      _$CashierSessionImpl.fromJson;

  @override
  String get id;
  @override
  String get userId;
  @override
  String get terminalId;
  @override
  DateTime get openedAt;
  @override
  @JsonKey(name: 'tipo_modelo')
  CashSessionModel get tipoModelo;
  @override
  DateTime? get closedAt;
  @override
  double get openingBalance;
  @override
  double get openingBalanceNio;
  @override
  double get openingBalanceUsd;
  @override
  double? get closingBalance;
  @override
  double? get closingCountedNio;
  @override
  double? get closingCountedUsd;
  @override
  double? get totalSales;
  @override
  double get totalExpected;
  @override
  double get expectedNio;
  @override
  double get expectedUsd;
  @override
  double? get differenceNio;
  @override
  double? get differenceUsd;
  @override
  int? get zReportSequence;
  @override
  bool get isClosed;
  @override
  String? get supervisorId;
  @override
  String? get notes;
  @override
  String get syncStatus;
  @override
  @JsonKey(ignore: true)
  _$$CashierSessionImplCopyWith<_$CashierSessionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
