// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'purchase.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Purchase _$PurchaseFromJson(Map<String, dynamic> json) {
  return _Purchase.fromJson(json);
}

/// @nodoc
mixin _$Purchase {
  String get id => throw _privateConstructorUsedError;
  String get insumoId => throw _privateConstructorUsedError;
  String get supplierId => throw _privateConstructorUsedError;
  String get invoiceNumber => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;
  double get unitCost => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;
  DateTime get invoiceDate => throw _privateConstructorUsedError;
  String get currency => throw _privateConstructorUsedError;
  double get bcnRate => throw _privateConstructorUsedError;
  @JsonKey(name: 'unit_cost_nio')
  double? get unitCostNio => throw _privateConstructorUsedError;
  @JsonKey(name: 'cpp_before_nio')
  double? get cppBeforeNio => throw _privateConstructorUsedError;
  @JsonKey(name: 'projected_cpp_nio')
  double? get projectedCppNio => throw _privateConstructorUsedError;
  @JsonKey(name: 'lot_code')
  String? get lotCode => throw _privateConstructorUsedError;
  @JsonKey(name: 'received_date')
  DateTime? get receivedDate => throw _privateConstructorUsedError;
  @JsonKey(name: 'expiration_date')
  DateTime? get expirationDate => throw _privateConstructorUsedError;
  @JsonKey(name: 'requires_batch_tracking')
  bool get requiresBatchTracking => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PurchaseCopyWith<Purchase> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PurchaseCopyWith<$Res> {
  factory $PurchaseCopyWith(Purchase value, $Res Function(Purchase) then) =
      _$PurchaseCopyWithImpl<$Res, Purchase>;
  @useResult
  $Res call(
      {String id,
      String insumoId,
      String supplierId,
      String invoiceNumber,
      double quantity,
      double unitCost,
      DateTime timestamp,
      DateTime invoiceDate,
      String currency,
      double bcnRate,
      @JsonKey(name: 'unit_cost_nio') double? unitCostNio,
      @JsonKey(name: 'cpp_before_nio') double? cppBeforeNio,
      @JsonKey(name: 'projected_cpp_nio') double? projectedCppNio,
      @JsonKey(name: 'lot_code') String? lotCode,
      @JsonKey(name: 'received_date') DateTime? receivedDate,
      @JsonKey(name: 'expiration_date') DateTime? expirationDate,
      @JsonKey(name: 'requires_batch_tracking') bool requiresBatchTracking});
}

/// @nodoc
class _$PurchaseCopyWithImpl<$Res, $Val extends Purchase>
    implements $PurchaseCopyWith<$Res> {
  _$PurchaseCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? supplierId = null,
    Object? invoiceNumber = null,
    Object? quantity = null,
    Object? unitCost = null,
    Object? timestamp = null,
    Object? invoiceDate = null,
    Object? currency = null,
    Object? bcnRate = null,
    Object? unitCostNio = freezed,
    Object? cppBeforeNio = freezed,
    Object? projectedCppNio = freezed,
    Object? lotCode = freezed,
    Object? receivedDate = freezed,
    Object? expirationDate = freezed,
    Object? requiresBatchTracking = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      supplierId: null == supplierId
          ? _value.supplierId
          : supplierId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceNumber: null == invoiceNumber
          ? _value.invoiceNumber
          : invoiceNumber // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitCost: null == unitCost
          ? _value.unitCost
          : unitCost // ignore: cast_nullable_to_non_nullable
              as double,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      invoiceDate: null == invoiceDate
          ? _value.invoiceDate
          : invoiceDate // ignore: cast_nullable_to_non_nullable
              as DateTime,
      currency: null == currency
          ? _value.currency
          : currency // ignore: cast_nullable_to_non_nullable
              as String,
      bcnRate: null == bcnRate
          ? _value.bcnRate
          : bcnRate // ignore: cast_nullable_to_non_nullable
              as double,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
      cppBeforeNio: freezed == cppBeforeNio
          ? _value.cppBeforeNio
          : cppBeforeNio // ignore: cast_nullable_to_non_nullable
              as double?,
      projectedCppNio: freezed == projectedCppNio
          ? _value.projectedCppNio
          : projectedCppNio // ignore: cast_nullable_to_non_nullable
              as double?,
      lotCode: freezed == lotCode
          ? _value.lotCode
          : lotCode // ignore: cast_nullable_to_non_nullable
              as String?,
      receivedDate: freezed == receivedDate
          ? _value.receivedDate
          : receivedDate // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      expirationDate: freezed == expirationDate
          ? _value.expirationDate
          : expirationDate // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      requiresBatchTracking: null == requiresBatchTracking
          ? _value.requiresBatchTracking
          : requiresBatchTracking // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PurchaseImplCopyWith<$Res>
    implements $PurchaseCopyWith<$Res> {
  factory _$$PurchaseImplCopyWith(
          _$PurchaseImpl value, $Res Function(_$PurchaseImpl) then) =
      __$$PurchaseImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String insumoId,
      String supplierId,
      String invoiceNumber,
      double quantity,
      double unitCost,
      DateTime timestamp,
      DateTime invoiceDate,
      String currency,
      double bcnRate,
      @JsonKey(name: 'unit_cost_nio') double? unitCostNio,
      @JsonKey(name: 'cpp_before_nio') double? cppBeforeNio,
      @JsonKey(name: 'projected_cpp_nio') double? projectedCppNio,
      @JsonKey(name: 'lot_code') String? lotCode,
      @JsonKey(name: 'received_date') DateTime? receivedDate,
      @JsonKey(name: 'expiration_date') DateTime? expirationDate,
      @JsonKey(name: 'requires_batch_tracking') bool requiresBatchTracking});
}

/// @nodoc
class __$$PurchaseImplCopyWithImpl<$Res>
    extends _$PurchaseCopyWithImpl<$Res, _$PurchaseImpl>
    implements _$$PurchaseImplCopyWith<$Res> {
  __$$PurchaseImplCopyWithImpl(
      _$PurchaseImpl _value, $Res Function(_$PurchaseImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? supplierId = null,
    Object? invoiceNumber = null,
    Object? quantity = null,
    Object? unitCost = null,
    Object? timestamp = null,
    Object? invoiceDate = null,
    Object? currency = null,
    Object? bcnRate = null,
    Object? unitCostNio = freezed,
    Object? cppBeforeNio = freezed,
    Object? projectedCppNio = freezed,
    Object? lotCode = freezed,
    Object? receivedDate = freezed,
    Object? expirationDate = freezed,
    Object? requiresBatchTracking = null,
  }) {
    return _then(_$PurchaseImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      supplierId: null == supplierId
          ? _value.supplierId
          : supplierId // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceNumber: null == invoiceNumber
          ? _value.invoiceNumber
          : invoiceNumber // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitCost: null == unitCost
          ? _value.unitCost
          : unitCost // ignore: cast_nullable_to_non_nullable
              as double,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      invoiceDate: null == invoiceDate
          ? _value.invoiceDate
          : invoiceDate // ignore: cast_nullable_to_non_nullable
              as DateTime,
      currency: null == currency
          ? _value.currency
          : currency // ignore: cast_nullable_to_non_nullable
              as String,
      bcnRate: null == bcnRate
          ? _value.bcnRate
          : bcnRate // ignore: cast_nullable_to_non_nullable
              as double,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
      cppBeforeNio: freezed == cppBeforeNio
          ? _value.cppBeforeNio
          : cppBeforeNio // ignore: cast_nullable_to_non_nullable
              as double?,
      projectedCppNio: freezed == projectedCppNio
          ? _value.projectedCppNio
          : projectedCppNio // ignore: cast_nullable_to_non_nullable
              as double?,
      lotCode: freezed == lotCode
          ? _value.lotCode
          : lotCode // ignore: cast_nullable_to_non_nullable
              as String?,
      receivedDate: freezed == receivedDate
          ? _value.receivedDate
          : receivedDate // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      expirationDate: freezed == expirationDate
          ? _value.expirationDate
          : expirationDate // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      requiresBatchTracking: null == requiresBatchTracking
          ? _value.requiresBatchTracking
          : requiresBatchTracking // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PurchaseImpl implements _Purchase {
  const _$PurchaseImpl(
      {required this.id,
      required this.insumoId,
      required this.supplierId,
      required this.invoiceNumber,
      required this.quantity,
      required this.unitCost,
      required this.timestamp,
      required this.invoiceDate,
      this.currency = 'NIO',
      this.bcnRate = 1,
      @JsonKey(name: 'unit_cost_nio') this.unitCostNio,
      @JsonKey(name: 'cpp_before_nio') this.cppBeforeNio,
      @JsonKey(name: 'projected_cpp_nio') this.projectedCppNio,
      @JsonKey(name: 'lot_code') this.lotCode,
      @JsonKey(name: 'received_date') this.receivedDate,
      @JsonKey(name: 'expiration_date') this.expirationDate,
      @JsonKey(name: 'requires_batch_tracking')
      this.requiresBatchTracking = false});

  factory _$PurchaseImpl.fromJson(Map<String, dynamic> json) =>
      _$$PurchaseImplFromJson(json);

  @override
  final String id;
  @override
  final String insumoId;
  @override
  final String supplierId;
  @override
  final String invoiceNumber;
  @override
  final double quantity;
  @override
  final double unitCost;
  @override
  final DateTime timestamp;
  @override
  final DateTime invoiceDate;
  @override
  @JsonKey()
  final String currency;
  @override
  @JsonKey()
  final double bcnRate;
  @override
  @JsonKey(name: 'unit_cost_nio')
  final double? unitCostNio;
  @override
  @JsonKey(name: 'cpp_before_nio')
  final double? cppBeforeNio;
  @override
  @JsonKey(name: 'projected_cpp_nio')
  final double? projectedCppNio;
  @override
  @JsonKey(name: 'lot_code')
  final String? lotCode;
  @override
  @JsonKey(name: 'received_date')
  final DateTime? receivedDate;
  @override
  @JsonKey(name: 'expiration_date')
  final DateTime? expirationDate;
  @override
  @JsonKey(name: 'requires_batch_tracking')
  final bool requiresBatchTracking;

  @override
  String toString() {
    return 'Purchase(id: $id, insumoId: $insumoId, supplierId: $supplierId, invoiceNumber: $invoiceNumber, quantity: $quantity, unitCost: $unitCost, timestamp: $timestamp, invoiceDate: $invoiceDate, currency: $currency, bcnRate: $bcnRate, unitCostNio: $unitCostNio, cppBeforeNio: $cppBeforeNio, projectedCppNio: $projectedCppNio, lotCode: $lotCode, receivedDate: $receivedDate, expirationDate: $expirationDate, requiresBatchTracking: $requiresBatchTracking)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PurchaseImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.insumoId, insumoId) ||
                other.insumoId == insumoId) &&
            (identical(other.supplierId, supplierId) ||
                other.supplierId == supplierId) &&
            (identical(other.invoiceNumber, invoiceNumber) ||
                other.invoiceNumber == invoiceNumber) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity) &&
            (identical(other.unitCost, unitCost) ||
                other.unitCost == unitCost) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.invoiceDate, invoiceDate) ||
                other.invoiceDate == invoiceDate) &&
            (identical(other.currency, currency) ||
                other.currency == currency) &&
            (identical(other.bcnRate, bcnRate) || other.bcnRate == bcnRate) &&
            (identical(other.unitCostNio, unitCostNio) ||
                other.unitCostNio == unitCostNio) &&
            (identical(other.cppBeforeNio, cppBeforeNio) ||
                other.cppBeforeNio == cppBeforeNio) &&
            (identical(other.projectedCppNio, projectedCppNio) ||
                other.projectedCppNio == projectedCppNio) &&
            (identical(other.lotCode, lotCode) || other.lotCode == lotCode) &&
            (identical(other.receivedDate, receivedDate) ||
                other.receivedDate == receivedDate) &&
            (identical(other.expirationDate, expirationDate) ||
                other.expirationDate == expirationDate) &&
            (identical(other.requiresBatchTracking, requiresBatchTracking) ||
                other.requiresBatchTracking == requiresBatchTracking));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      insumoId,
      supplierId,
      invoiceNumber,
      quantity,
      unitCost,
      timestamp,
      invoiceDate,
      currency,
      bcnRate,
      unitCostNio,
      cppBeforeNio,
      projectedCppNio,
      lotCode,
      receivedDate,
      expirationDate,
      requiresBatchTracking);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PurchaseImplCopyWith<_$PurchaseImpl> get copyWith =>
      __$$PurchaseImplCopyWithImpl<_$PurchaseImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PurchaseImplToJson(
      this,
    );
  }
}

abstract class _Purchase implements Purchase {
  const factory _Purchase(
      {required final String id,
      required final String insumoId,
      required final String supplierId,
      required final String invoiceNumber,
      required final double quantity,
      required final double unitCost,
      required final DateTime timestamp,
      required final DateTime invoiceDate,
      final String currency,
      final double bcnRate,
      @JsonKey(name: 'unit_cost_nio') final double? unitCostNio,
      @JsonKey(name: 'cpp_before_nio') final double? cppBeforeNio,
      @JsonKey(name: 'projected_cpp_nio') final double? projectedCppNio,
      @JsonKey(name: 'lot_code') final String? lotCode,
      @JsonKey(name: 'received_date') final DateTime? receivedDate,
      @JsonKey(name: 'expiration_date') final DateTime? expirationDate,
      @JsonKey(name: 'requires_batch_tracking')
      final bool requiresBatchTracking}) = _$PurchaseImpl;

  factory _Purchase.fromJson(Map<String, dynamic> json) =
      _$PurchaseImpl.fromJson;

  @override
  String get id;
  @override
  String get insumoId;
  @override
  String get supplierId;
  @override
  String get invoiceNumber;
  @override
  double get quantity;
  @override
  double get unitCost;
  @override
  DateTime get timestamp;
  @override
  DateTime get invoiceDate;
  @override
  String get currency;
  @override
  double get bcnRate;
  @override
  @JsonKey(name: 'unit_cost_nio')
  double? get unitCostNio;
  @override
  @JsonKey(name: 'cpp_before_nio')
  double? get cppBeforeNio;
  @override
  @JsonKey(name: 'projected_cpp_nio')
  double? get projectedCppNio;
  @override
  @JsonKey(name: 'lot_code')
  String? get lotCode;
  @override
  @JsonKey(name: 'received_date')
  DateTime? get receivedDate;
  @override
  @JsonKey(name: 'expiration_date')
  DateTime? get expirationDate;
  @override
  @JsonKey(name: 'requires_batch_tracking')
  bool get requiresBatchTracking;
  @override
  @JsonKey(ignore: true)
  _$$PurchaseImplCopyWith<_$PurchaseImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
