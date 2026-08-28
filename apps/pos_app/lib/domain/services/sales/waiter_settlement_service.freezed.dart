// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'waiter_settlement_service.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

WaiterSettlementReport _$WaiterSettlementReportFromJson(
    Map<String, dynamic> json) {
  return _WaiterSettlementReport.fromJson(json);
}

/// @nodoc
mixin _$WaiterSettlementReport {
  String get shiftId => throw _privateConstructorUsedError;
  String get waiterUserId => throw _privateConstructorUsedError;
  double get totalSalesNio => throw _privateConstructorUsedError;
  double get totalCashCollectedNio => throw _privateConstructorUsedError;
  double get totalCardCollectedNio => throw _privateConstructorUsedError;
  double get totalTransferCollectedNio => throw _privateConstructorUsedError;
  double get totalTipsCollectedNio => throw _privateConstructorUsedError;
  int get invoicesCount => throw _privateConstructorUsedError;
  int get openTablesCount => throw _privateConstructorUsedError;
  List<String> get openTableNames => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $WaiterSettlementReportCopyWith<WaiterSettlementReport> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $WaiterSettlementReportCopyWith<$Res> {
  factory $WaiterSettlementReportCopyWith(WaiterSettlementReport value,
          $Res Function(WaiterSettlementReport) then) =
      _$WaiterSettlementReportCopyWithImpl<$Res, WaiterSettlementReport>;
  @useResult
  $Res call(
      {String shiftId,
      String waiterUserId,
      double totalSalesNio,
      double totalCashCollectedNio,
      double totalCardCollectedNio,
      double totalTransferCollectedNio,
      double totalTipsCollectedNio,
      int invoicesCount,
      int openTablesCount,
      List<String> openTableNames});
}

/// @nodoc
class _$WaiterSettlementReportCopyWithImpl<$Res,
        $Val extends WaiterSettlementReport>
    implements $WaiterSettlementReportCopyWith<$Res> {
  _$WaiterSettlementReportCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shiftId = null,
    Object? waiterUserId = null,
    Object? totalSalesNio = null,
    Object? totalCashCollectedNio = null,
    Object? totalCardCollectedNio = null,
    Object? totalTransferCollectedNio = null,
    Object? totalTipsCollectedNio = null,
    Object? invoicesCount = null,
    Object? openTablesCount = null,
    Object? openTableNames = null,
  }) {
    return _then(_value.copyWith(
      shiftId: null == shiftId
          ? _value.shiftId
          : shiftId // ignore: cast_nullable_to_non_nullable
              as String,
      waiterUserId: null == waiterUserId
          ? _value.waiterUserId
          : waiterUserId // ignore: cast_nullable_to_non_nullable
              as String,
      totalSalesNio: null == totalSalesNio
          ? _value.totalSalesNio
          : totalSalesNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalCashCollectedNio: null == totalCashCollectedNio
          ? _value.totalCashCollectedNio
          : totalCashCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalCardCollectedNio: null == totalCardCollectedNio
          ? _value.totalCardCollectedNio
          : totalCardCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalTransferCollectedNio: null == totalTransferCollectedNio
          ? _value.totalTransferCollectedNio
          : totalTransferCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalTipsCollectedNio: null == totalTipsCollectedNio
          ? _value.totalTipsCollectedNio
          : totalTipsCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      invoicesCount: null == invoicesCount
          ? _value.invoicesCount
          : invoicesCount // ignore: cast_nullable_to_non_nullable
              as int,
      openTablesCount: null == openTablesCount
          ? _value.openTablesCount
          : openTablesCount // ignore: cast_nullable_to_non_nullable
              as int,
      openTableNames: null == openTableNames
          ? _value.openTableNames
          : openTableNames // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$WaiterSettlementReportImplCopyWith<$Res>
    implements $WaiterSettlementReportCopyWith<$Res> {
  factory _$$WaiterSettlementReportImplCopyWith(
          _$WaiterSettlementReportImpl value,
          $Res Function(_$WaiterSettlementReportImpl) then) =
      __$$WaiterSettlementReportImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String shiftId,
      String waiterUserId,
      double totalSalesNio,
      double totalCashCollectedNio,
      double totalCardCollectedNio,
      double totalTransferCollectedNio,
      double totalTipsCollectedNio,
      int invoicesCount,
      int openTablesCount,
      List<String> openTableNames});
}

/// @nodoc
class __$$WaiterSettlementReportImplCopyWithImpl<$Res>
    extends _$WaiterSettlementReportCopyWithImpl<$Res,
        _$WaiterSettlementReportImpl>
    implements _$$WaiterSettlementReportImplCopyWith<$Res> {
  __$$WaiterSettlementReportImplCopyWithImpl(
      _$WaiterSettlementReportImpl _value,
      $Res Function(_$WaiterSettlementReportImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shiftId = null,
    Object? waiterUserId = null,
    Object? totalSalesNio = null,
    Object? totalCashCollectedNio = null,
    Object? totalCardCollectedNio = null,
    Object? totalTransferCollectedNio = null,
    Object? totalTipsCollectedNio = null,
    Object? invoicesCount = null,
    Object? openTablesCount = null,
    Object? openTableNames = null,
  }) {
    return _then(_$WaiterSettlementReportImpl(
      shiftId: null == shiftId
          ? _value.shiftId
          : shiftId // ignore: cast_nullable_to_non_nullable
              as String,
      waiterUserId: null == waiterUserId
          ? _value.waiterUserId
          : waiterUserId // ignore: cast_nullable_to_non_nullable
              as String,
      totalSalesNio: null == totalSalesNio
          ? _value.totalSalesNio
          : totalSalesNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalCashCollectedNio: null == totalCashCollectedNio
          ? _value.totalCashCollectedNio
          : totalCashCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalCardCollectedNio: null == totalCardCollectedNio
          ? _value.totalCardCollectedNio
          : totalCardCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalTransferCollectedNio: null == totalTransferCollectedNio
          ? _value.totalTransferCollectedNio
          : totalTransferCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalTipsCollectedNio: null == totalTipsCollectedNio
          ? _value.totalTipsCollectedNio
          : totalTipsCollectedNio // ignore: cast_nullable_to_non_nullable
              as double,
      invoicesCount: null == invoicesCount
          ? _value.invoicesCount
          : invoicesCount // ignore: cast_nullable_to_non_nullable
              as int,
      openTablesCount: null == openTablesCount
          ? _value.openTablesCount
          : openTablesCount // ignore: cast_nullable_to_non_nullable
              as int,
      openTableNames: null == openTableNames
          ? _value._openTableNames
          : openTableNames // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$WaiterSettlementReportImpl extends _WaiterSettlementReport {
  const _$WaiterSettlementReportImpl(
      {required this.shiftId,
      required this.waiterUserId,
      required this.totalSalesNio,
      required this.totalCashCollectedNio,
      required this.totalCardCollectedNio,
      required this.totalTransferCollectedNio,
      required this.totalTipsCollectedNio,
      required this.invoicesCount,
      required this.openTablesCount,
      final List<String> openTableNames = const <String>[]})
      : _openTableNames = openTableNames,
        super._();

  factory _$WaiterSettlementReportImpl.fromJson(Map<String, dynamic> json) =>
      _$$WaiterSettlementReportImplFromJson(json);

  @override
  final String shiftId;
  @override
  final String waiterUserId;
  @override
  final double totalSalesNio;
  @override
  final double totalCashCollectedNio;
  @override
  final double totalCardCollectedNio;
  @override
  final double totalTransferCollectedNio;
  @override
  final double totalTipsCollectedNio;
  @override
  final int invoicesCount;
  @override
  final int openTablesCount;
  final List<String> _openTableNames;
  @override
  @JsonKey()
  List<String> get openTableNames {
    if (_openTableNames is EqualUnmodifiableListView) return _openTableNames;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_openTableNames);
  }

  @override
  String toString() {
    return 'WaiterSettlementReport(shiftId: $shiftId, waiterUserId: $waiterUserId, totalSalesNio: $totalSalesNio, totalCashCollectedNio: $totalCashCollectedNio, totalCardCollectedNio: $totalCardCollectedNio, totalTransferCollectedNio: $totalTransferCollectedNio, totalTipsCollectedNio: $totalTipsCollectedNio, invoicesCount: $invoicesCount, openTablesCount: $openTablesCount, openTableNames: $openTableNames)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$WaiterSettlementReportImpl &&
            (identical(other.shiftId, shiftId) || other.shiftId == shiftId) &&
            (identical(other.waiterUserId, waiterUserId) ||
                other.waiterUserId == waiterUserId) &&
            (identical(other.totalSalesNio, totalSalesNio) ||
                other.totalSalesNio == totalSalesNio) &&
            (identical(other.totalCashCollectedNio, totalCashCollectedNio) ||
                other.totalCashCollectedNio == totalCashCollectedNio) &&
            (identical(other.totalCardCollectedNio, totalCardCollectedNio) ||
                other.totalCardCollectedNio == totalCardCollectedNio) &&
            (identical(other.totalTransferCollectedNio,
                    totalTransferCollectedNio) ||
                other.totalTransferCollectedNio == totalTransferCollectedNio) &&
            (identical(other.totalTipsCollectedNio, totalTipsCollectedNio) ||
                other.totalTipsCollectedNio == totalTipsCollectedNio) &&
            (identical(other.invoicesCount, invoicesCount) ||
                other.invoicesCount == invoicesCount) &&
            (identical(other.openTablesCount, openTablesCount) ||
                other.openTablesCount == openTablesCount) &&
            const DeepCollectionEquality()
                .equals(other._openTableNames, _openTableNames));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      shiftId,
      waiterUserId,
      totalSalesNio,
      totalCashCollectedNio,
      totalCardCollectedNio,
      totalTransferCollectedNio,
      totalTipsCollectedNio,
      invoicesCount,
      openTablesCount,
      const DeepCollectionEquality().hash(_openTableNames));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$WaiterSettlementReportImplCopyWith<_$WaiterSettlementReportImpl>
      get copyWith => __$$WaiterSettlementReportImplCopyWithImpl<
          _$WaiterSettlementReportImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$WaiterSettlementReportImplToJson(
      this,
    );
  }
}

abstract class _WaiterSettlementReport extends WaiterSettlementReport {
  const factory _WaiterSettlementReport(
      {required final String shiftId,
      required final String waiterUserId,
      required final double totalSalesNio,
      required final double totalCashCollectedNio,
      required final double totalCardCollectedNio,
      required final double totalTransferCollectedNio,
      required final double totalTipsCollectedNio,
      required final int invoicesCount,
      required final int openTablesCount,
      final List<String> openTableNames}) = _$WaiterSettlementReportImpl;
  const _WaiterSettlementReport._() : super._();

  factory _WaiterSettlementReport.fromJson(Map<String, dynamic> json) =
      _$WaiterSettlementReportImpl.fromJson;

  @override
  String get shiftId;
  @override
  String get waiterUserId;
  @override
  double get totalSalesNio;
  @override
  double get totalCashCollectedNio;
  @override
  double get totalCardCollectedNio;
  @override
  double get totalTransferCollectedNio;
  @override
  double get totalTipsCollectedNio;
  @override
  int get invoicesCount;
  @override
  int get openTablesCount;
  @override
  List<String> get openTableNames;
  @override
  @JsonKey(ignore: true)
  _$$WaiterSettlementReportImplCopyWith<_$WaiterSettlementReportImpl>
      get copyWith => throw _privateConstructorUsedError;
}
