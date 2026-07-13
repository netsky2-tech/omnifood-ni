// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'inventory_movement.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

InventoryMovement _$InventoryMovementFromJson(Map<String, dynamic> json) {
  return _InventoryMovement.fromJson(json);
}

/// @nodoc
mixin _$InventoryMovement {
  String get id => throw _privateConstructorUsedError;
  String get insumoId => throw _privateConstructorUsedError;
  MovementType get type => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;
  double get previousStock => throw _privateConstructorUsedError;
  double get newStock => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;
  String? get reason => throw _privateConstructorUsedError;
  String? get userId => throw _privateConstructorUsedError;
  double? get unitCostNio => throw _privateConstructorUsedError;
  String? get sourceDocumentType => throw _privateConstructorUsedError;
  String? get sourceDocumentId => throw _privateConstructorUsedError;
  String? get originMovementId => throw _privateConstructorUsedError;
  String? get originInvoiceItemId => throw _privateConstructorUsedError;
  List<BatchDeduction>? get batchDeductions =>
      throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryMovementCopyWith<InventoryMovement> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryMovementCopyWith<$Res> {
  factory $InventoryMovementCopyWith(
          InventoryMovement value, $Res Function(InventoryMovement) then) =
      _$InventoryMovementCopyWithImpl<$Res, InventoryMovement>;
  @useResult
  $Res call(
      {String id,
      String insumoId,
      MovementType type,
      double quantity,
      double previousStock,
      double newStock,
      DateTime timestamp,
      String? reason,
      String? userId,
      double? unitCostNio,
      String? sourceDocumentType,
      String? sourceDocumentId,
      String? originMovementId,
      String? originInvoiceItemId,
      List<BatchDeduction>? batchDeductions});
}

/// @nodoc
class _$InventoryMovementCopyWithImpl<$Res, $Val extends InventoryMovement>
    implements $InventoryMovementCopyWith<$Res> {
  _$InventoryMovementCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? type = null,
    Object? quantity = null,
    Object? previousStock = null,
    Object? newStock = null,
    Object? timestamp = null,
    Object? reason = freezed,
    Object? userId = freezed,
    Object? unitCostNio = freezed,
    Object? sourceDocumentType = freezed,
    Object? sourceDocumentId = freezed,
    Object? originMovementId = freezed,
    Object? originInvoiceItemId = freezed,
    Object? batchDeductions = freezed,
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
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as MovementType,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      previousStock: null == previousStock
          ? _value.previousStock
          : previousStock // ignore: cast_nullable_to_non_nullable
              as double,
      newStock: null == newStock
          ? _value.newStock
          : newStock // ignore: cast_nullable_to_non_nullable
              as double,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      reason: freezed == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String?,
      userId: freezed == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String?,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
      sourceDocumentType: freezed == sourceDocumentType
          ? _value.sourceDocumentType
          : sourceDocumentType // ignore: cast_nullable_to_non_nullable
              as String?,
      sourceDocumentId: freezed == sourceDocumentId
          ? _value.sourceDocumentId
          : sourceDocumentId // ignore: cast_nullable_to_non_nullable
              as String?,
      originMovementId: freezed == originMovementId
          ? _value.originMovementId
          : originMovementId // ignore: cast_nullable_to_non_nullable
              as String?,
      originInvoiceItemId: freezed == originInvoiceItemId
          ? _value.originInvoiceItemId
          : originInvoiceItemId // ignore: cast_nullable_to_non_nullable
              as String?,
      batchDeductions: freezed == batchDeductions
          ? _value.batchDeductions
          : batchDeductions // ignore: cast_nullable_to_non_nullable
              as List<BatchDeduction>?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryMovementImplCopyWith<$Res>
    implements $InventoryMovementCopyWith<$Res> {
  factory _$$InventoryMovementImplCopyWith(_$InventoryMovementImpl value,
          $Res Function(_$InventoryMovementImpl) then) =
      __$$InventoryMovementImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String insumoId,
      MovementType type,
      double quantity,
      double previousStock,
      double newStock,
      DateTime timestamp,
      String? reason,
      String? userId,
      double? unitCostNio,
      String? sourceDocumentType,
      String? sourceDocumentId,
      String? originMovementId,
      String? originInvoiceItemId,
      List<BatchDeduction>? batchDeductions});
}

/// @nodoc
class __$$InventoryMovementImplCopyWithImpl<$Res>
    extends _$InventoryMovementCopyWithImpl<$Res, _$InventoryMovementImpl>
    implements _$$InventoryMovementImplCopyWith<$Res> {
  __$$InventoryMovementImplCopyWithImpl(_$InventoryMovementImpl _value,
      $Res Function(_$InventoryMovementImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? type = null,
    Object? quantity = null,
    Object? previousStock = null,
    Object? newStock = null,
    Object? timestamp = null,
    Object? reason = freezed,
    Object? userId = freezed,
    Object? unitCostNio = freezed,
    Object? sourceDocumentType = freezed,
    Object? sourceDocumentId = freezed,
    Object? originMovementId = freezed,
    Object? originInvoiceItemId = freezed,
    Object? batchDeductions = freezed,
  }) {
    return _then(_$InventoryMovementImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as MovementType,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      previousStock: null == previousStock
          ? _value.previousStock
          : previousStock // ignore: cast_nullable_to_non_nullable
              as double,
      newStock: null == newStock
          ? _value.newStock
          : newStock // ignore: cast_nullable_to_non_nullable
              as double,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      reason: freezed == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String?,
      userId: freezed == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String?,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
      sourceDocumentType: freezed == sourceDocumentType
          ? _value.sourceDocumentType
          : sourceDocumentType // ignore: cast_nullable_to_non_nullable
              as String?,
      sourceDocumentId: freezed == sourceDocumentId
          ? _value.sourceDocumentId
          : sourceDocumentId // ignore: cast_nullable_to_non_nullable
              as String?,
      originMovementId: freezed == originMovementId
          ? _value.originMovementId
          : originMovementId // ignore: cast_nullable_to_non_nullable
              as String?,
      originInvoiceItemId: freezed == originInvoiceItemId
          ? _value.originInvoiceItemId
          : originInvoiceItemId // ignore: cast_nullable_to_non_nullable
              as String?,
      batchDeductions: freezed == batchDeductions
          ? _value._batchDeductions
          : batchDeductions // ignore: cast_nullable_to_non_nullable
              as List<BatchDeduction>?,
    ));
  }
}

/// @nodoc

@JsonSerializable(explicitToJson: true)
class _$InventoryMovementImpl implements _InventoryMovement {
  const _$InventoryMovementImpl(
      {required this.id,
      required this.insumoId,
      required this.type,
      required this.quantity,
      required this.previousStock,
      required this.newStock,
      required this.timestamp,
      this.reason,
      this.userId,
      this.unitCostNio,
      this.sourceDocumentType,
      this.sourceDocumentId,
      this.originMovementId,
      this.originInvoiceItemId,
      final List<BatchDeduction>? batchDeductions})
      : _batchDeductions = batchDeductions;

  factory _$InventoryMovementImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryMovementImplFromJson(json);

  @override
  final String id;
  @override
  final String insumoId;
  @override
  final MovementType type;
  @override
  final double quantity;
  @override
  final double previousStock;
  @override
  final double newStock;
  @override
  final DateTime timestamp;
  @override
  final String? reason;
  @override
  final String? userId;
  @override
  final double? unitCostNio;
  @override
  final String? sourceDocumentType;
  @override
  final String? sourceDocumentId;
  @override
  final String? originMovementId;
  @override
  final String? originInvoiceItemId;
  final List<BatchDeduction>? _batchDeductions;
  @override
  List<BatchDeduction>? get batchDeductions {
    final value = _batchDeductions;
    if (value == null) return null;
    if (_batchDeductions is EqualUnmodifiableListView) return _batchDeductions;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(value);
  }

  @override
  String toString() {
    return 'InventoryMovement(id: $id, insumoId: $insumoId, type: $type, quantity: $quantity, previousStock: $previousStock, newStock: $newStock, timestamp: $timestamp, reason: $reason, userId: $userId, unitCostNio: $unitCostNio, sourceDocumentType: $sourceDocumentType, sourceDocumentId: $sourceDocumentId, originMovementId: $originMovementId, originInvoiceItemId: $originInvoiceItemId, batchDeductions: $batchDeductions)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryMovementImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.insumoId, insumoId) ||
                other.insumoId == insumoId) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity) &&
            (identical(other.previousStock, previousStock) ||
                other.previousStock == previousStock) &&
            (identical(other.newStock, newStock) ||
                other.newStock == newStock) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.reason, reason) || other.reason == reason) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.unitCostNio, unitCostNio) ||
                other.unitCostNio == unitCostNio) &&
            (identical(other.sourceDocumentType, sourceDocumentType) ||
                other.sourceDocumentType == sourceDocumentType) &&
            (identical(other.sourceDocumentId, sourceDocumentId) ||
                other.sourceDocumentId == sourceDocumentId) &&
            (identical(other.originMovementId, originMovementId) ||
                other.originMovementId == originMovementId) &&
            (identical(other.originInvoiceItemId, originInvoiceItemId) ||
                other.originInvoiceItemId == originInvoiceItemId) &&
            const DeepCollectionEquality()
                .equals(other._batchDeductions, _batchDeductions));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      insumoId,
      type,
      quantity,
      previousStock,
      newStock,
      timestamp,
      reason,
      userId,
      unitCostNio,
      sourceDocumentType,
      sourceDocumentId,
      originMovementId,
      originInvoiceItemId,
      const DeepCollectionEquality().hash(_batchDeductions));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryMovementImplCopyWith<_$InventoryMovementImpl> get copyWith =>
      __$$InventoryMovementImplCopyWithImpl<_$InventoryMovementImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryMovementImplToJson(
      this,
    );
  }
}

abstract class _InventoryMovement implements InventoryMovement {
  const factory _InventoryMovement(
      {required final String id,
      required final String insumoId,
      required final MovementType type,
      required final double quantity,
      required final double previousStock,
      required final double newStock,
      required final DateTime timestamp,
      final String? reason,
      final String? userId,
      final double? unitCostNio,
      final String? sourceDocumentType,
      final String? sourceDocumentId,
      final String? originMovementId,
      final String? originInvoiceItemId,
      final List<BatchDeduction>? batchDeductions}) = _$InventoryMovementImpl;

  factory _InventoryMovement.fromJson(Map<String, dynamic> json) =
      _$InventoryMovementImpl.fromJson;

  @override
  String get id;
  @override
  String get insumoId;
  @override
  MovementType get type;
  @override
  double get quantity;
  @override
  double get previousStock;
  @override
  double get newStock;
  @override
  DateTime get timestamp;
  @override
  String? get reason;
  @override
  String? get userId;
  @override
  double? get unitCostNio;
  @override
  String? get sourceDocumentType;
  @override
  String? get sourceDocumentId;
  @override
  String? get originMovementId;
  @override
  String? get originInvoiceItemId;
  @override
  List<BatchDeduction>? get batchDeductions;
  @override
  @JsonKey(ignore: true)
  _$$InventoryMovementImplCopyWith<_$InventoryMovementImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
