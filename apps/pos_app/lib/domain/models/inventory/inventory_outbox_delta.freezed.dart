// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'inventory_outbox_delta.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

InventoryOutboxDelta _$InventoryOutboxDeltaFromJson(Map<String, dynamic> json) {
  return _InventoryOutboxDelta.fromJson(json);
}

/// @nodoc
mixin _$InventoryOutboxDelta {
  String get idempotencyKey => throw _privateConstructorUsedError;
  String get sourceDeviceId => throw _privateConstructorUsedError;
  int get sourceSequence => throw _privateConstructorUsedError;
  String get documentType => throw _privateConstructorUsedError;
  List<InventoryOutboxMovement> get movements =>
      throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryOutboxDeltaCopyWith<InventoryOutboxDelta> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryOutboxDeltaCopyWith<$Res> {
  factory $InventoryOutboxDeltaCopyWith(InventoryOutboxDelta value,
          $Res Function(InventoryOutboxDelta) then) =
      _$InventoryOutboxDeltaCopyWithImpl<$Res, InventoryOutboxDelta>;
  @useResult
  $Res call(
      {String idempotencyKey,
      String sourceDeviceId,
      int sourceSequence,
      String documentType,
      List<InventoryOutboxMovement> movements});
}

/// @nodoc
class _$InventoryOutboxDeltaCopyWithImpl<$Res,
        $Val extends InventoryOutboxDelta>
    implements $InventoryOutboxDeltaCopyWith<$Res> {
  _$InventoryOutboxDeltaCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? idempotencyKey = null,
    Object? sourceDeviceId = null,
    Object? sourceSequence = null,
    Object? documentType = null,
    Object? movements = null,
  }) {
    return _then(_value.copyWith(
      idempotencyKey: null == idempotencyKey
          ? _value.idempotencyKey
          : idempotencyKey // ignore: cast_nullable_to_non_nullable
              as String,
      sourceDeviceId: null == sourceDeviceId
          ? _value.sourceDeviceId
          : sourceDeviceId // ignore: cast_nullable_to_non_nullable
              as String,
      sourceSequence: null == sourceSequence
          ? _value.sourceSequence
          : sourceSequence // ignore: cast_nullable_to_non_nullable
              as int,
      documentType: null == documentType
          ? _value.documentType
          : documentType // ignore: cast_nullable_to_non_nullable
              as String,
      movements: null == movements
          ? _value.movements
          : movements // ignore: cast_nullable_to_non_nullable
              as List<InventoryOutboxMovement>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryOutboxDeltaImplCopyWith<$Res>
    implements $InventoryOutboxDeltaCopyWith<$Res> {
  factory _$$InventoryOutboxDeltaImplCopyWith(_$InventoryOutboxDeltaImpl value,
          $Res Function(_$InventoryOutboxDeltaImpl) then) =
      __$$InventoryOutboxDeltaImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String idempotencyKey,
      String sourceDeviceId,
      int sourceSequence,
      String documentType,
      List<InventoryOutboxMovement> movements});
}

/// @nodoc
class __$$InventoryOutboxDeltaImplCopyWithImpl<$Res>
    extends _$InventoryOutboxDeltaCopyWithImpl<$Res, _$InventoryOutboxDeltaImpl>
    implements _$$InventoryOutboxDeltaImplCopyWith<$Res> {
  __$$InventoryOutboxDeltaImplCopyWithImpl(_$InventoryOutboxDeltaImpl _value,
      $Res Function(_$InventoryOutboxDeltaImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? idempotencyKey = null,
    Object? sourceDeviceId = null,
    Object? sourceSequence = null,
    Object? documentType = null,
    Object? movements = null,
  }) {
    return _then(_$InventoryOutboxDeltaImpl(
      idempotencyKey: null == idempotencyKey
          ? _value.idempotencyKey
          : idempotencyKey // ignore: cast_nullable_to_non_nullable
              as String,
      sourceDeviceId: null == sourceDeviceId
          ? _value.sourceDeviceId
          : sourceDeviceId // ignore: cast_nullable_to_non_nullable
              as String,
      sourceSequence: null == sourceSequence
          ? _value.sourceSequence
          : sourceSequence // ignore: cast_nullable_to_non_nullable
              as int,
      documentType: null == documentType
          ? _value.documentType
          : documentType // ignore: cast_nullable_to_non_nullable
              as String,
      movements: null == movements
          ? _value._movements
          : movements // ignore: cast_nullable_to_non_nullable
              as List<InventoryOutboxMovement>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InventoryOutboxDeltaImpl implements _InventoryOutboxDelta {
  const _$InventoryOutboxDeltaImpl(
      {required this.idempotencyKey,
      required this.sourceDeviceId,
      required this.sourceSequence,
      required this.documentType,
      required final List<InventoryOutboxMovement> movements})
      : _movements = movements;

  factory _$InventoryOutboxDeltaImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryOutboxDeltaImplFromJson(json);

  @override
  final String idempotencyKey;
  @override
  final String sourceDeviceId;
  @override
  final int sourceSequence;
  @override
  final String documentType;
  final List<InventoryOutboxMovement> _movements;
  @override
  List<InventoryOutboxMovement> get movements {
    if (_movements is EqualUnmodifiableListView) return _movements;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_movements);
  }

  @override
  String toString() {
    return 'InventoryOutboxDelta(idempotencyKey: $idempotencyKey, sourceDeviceId: $sourceDeviceId, sourceSequence: $sourceSequence, documentType: $documentType, movements: $movements)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryOutboxDeltaImpl &&
            (identical(other.idempotencyKey, idempotencyKey) ||
                other.idempotencyKey == idempotencyKey) &&
            (identical(other.sourceDeviceId, sourceDeviceId) ||
                other.sourceDeviceId == sourceDeviceId) &&
            (identical(other.sourceSequence, sourceSequence) ||
                other.sourceSequence == sourceSequence) &&
            (identical(other.documentType, documentType) ||
                other.documentType == documentType) &&
            const DeepCollectionEquality()
                .equals(other._movements, _movements));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      idempotencyKey,
      sourceDeviceId,
      sourceSequence,
      documentType,
      const DeepCollectionEquality().hash(_movements));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryOutboxDeltaImplCopyWith<_$InventoryOutboxDeltaImpl>
      get copyWith =>
          __$$InventoryOutboxDeltaImplCopyWithImpl<_$InventoryOutboxDeltaImpl>(
              this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryOutboxDeltaImplToJson(
      this,
    );
  }
}

abstract class _InventoryOutboxDelta implements InventoryOutboxDelta {
  const factory _InventoryOutboxDelta(
          {required final String idempotencyKey,
          required final String sourceDeviceId,
          required final int sourceSequence,
          required final String documentType,
          required final List<InventoryOutboxMovement> movements}) =
      _$InventoryOutboxDeltaImpl;

  factory _InventoryOutboxDelta.fromJson(Map<String, dynamic> json) =
      _$InventoryOutboxDeltaImpl.fromJson;

  @override
  String get idempotencyKey;
  @override
  String get sourceDeviceId;
  @override
  int get sourceSequence;
  @override
  String get documentType;
  @override
  List<InventoryOutboxMovement> get movements;
  @override
  @JsonKey(ignore: true)
  _$$InventoryOutboxDeltaImplCopyWith<_$InventoryOutboxDeltaImpl>
      get copyWith => throw _privateConstructorUsedError;
}

InventoryOutboxMovement _$InventoryOutboxMovementFromJson(
    Map<String, dynamic> json) {
  return _InventoryOutboxMovement.fromJson(json);
}

/// @nodoc
mixin _$InventoryOutboxMovement {
  String get insumoId => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;
  double? get unitCostNio => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryOutboxMovementCopyWith<InventoryOutboxMovement> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryOutboxMovementCopyWith<$Res> {
  factory $InventoryOutboxMovementCopyWith(InventoryOutboxMovement value,
          $Res Function(InventoryOutboxMovement) then) =
      _$InventoryOutboxMovementCopyWithImpl<$Res, InventoryOutboxMovement>;
  @useResult
  $Res call({String insumoId, double quantity, double? unitCostNio});
}

/// @nodoc
class _$InventoryOutboxMovementCopyWithImpl<$Res,
        $Val extends InventoryOutboxMovement>
    implements $InventoryOutboxMovementCopyWith<$Res> {
  _$InventoryOutboxMovementCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? insumoId = null,
    Object? quantity = null,
    Object? unitCostNio = freezed,
  }) {
    return _then(_value.copyWith(
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryOutboxMovementImplCopyWith<$Res>
    implements $InventoryOutboxMovementCopyWith<$Res> {
  factory _$$InventoryOutboxMovementImplCopyWith(
          _$InventoryOutboxMovementImpl value,
          $Res Function(_$InventoryOutboxMovementImpl) then) =
      __$$InventoryOutboxMovementImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String insumoId, double quantity, double? unitCostNio});
}

/// @nodoc
class __$$InventoryOutboxMovementImplCopyWithImpl<$Res>
    extends _$InventoryOutboxMovementCopyWithImpl<$Res,
        _$InventoryOutboxMovementImpl>
    implements _$$InventoryOutboxMovementImplCopyWith<$Res> {
  __$$InventoryOutboxMovementImplCopyWithImpl(
      _$InventoryOutboxMovementImpl _value,
      $Res Function(_$InventoryOutboxMovementImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? insumoId = null,
    Object? quantity = null,
    Object? unitCostNio = freezed,
  }) {
    return _then(_$InventoryOutboxMovementImpl(
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitCostNio: freezed == unitCostNio
          ? _value.unitCostNio
          : unitCostNio // ignore: cast_nullable_to_non_nullable
              as double?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InventoryOutboxMovementImpl implements _InventoryOutboxMovement {
  const _$InventoryOutboxMovementImpl(
      {required this.insumoId, required this.quantity, this.unitCostNio});

  factory _$InventoryOutboxMovementImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryOutboxMovementImplFromJson(json);

  @override
  final String insumoId;
  @override
  final double quantity;
  @override
  final double? unitCostNio;

  @override
  String toString() {
    return 'InventoryOutboxMovement(insumoId: $insumoId, quantity: $quantity, unitCostNio: $unitCostNio)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryOutboxMovementImpl &&
            (identical(other.insumoId, insumoId) ||
                other.insumoId == insumoId) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity) &&
            (identical(other.unitCostNio, unitCostNio) ||
                other.unitCostNio == unitCostNio));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, insumoId, quantity, unitCostNio);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryOutboxMovementImplCopyWith<_$InventoryOutboxMovementImpl>
      get copyWith => __$$InventoryOutboxMovementImplCopyWithImpl<
          _$InventoryOutboxMovementImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryOutboxMovementImplToJson(
      this,
    );
  }
}

abstract class _InventoryOutboxMovement implements InventoryOutboxMovement {
  const factory _InventoryOutboxMovement(
      {required final String insumoId,
      required final double quantity,
      final double? unitCostNio}) = _$InventoryOutboxMovementImpl;

  factory _InventoryOutboxMovement.fromJson(Map<String, dynamic> json) =
      _$InventoryOutboxMovementImpl.fromJson;

  @override
  String get insumoId;
  @override
  double get quantity;
  @override
  double? get unitCostNio;
  @override
  @JsonKey(ignore: true)
  _$$InventoryOutboxMovementImplCopyWith<_$InventoryOutboxMovementImpl>
      get copyWith => throw _privateConstructorUsedError;
}
