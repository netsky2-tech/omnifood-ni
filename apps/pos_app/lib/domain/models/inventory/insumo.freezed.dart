// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'insumo.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Insumo _$InsumoFromJson(Map<String, dynamic> json) {
  return _Insumo.fromJson(json);
}

/// @nodoc
mixin _$Insumo {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String get consumptionUom => throw _privateConstructorUsedError;
  double get stock => throw _privateConstructorUsedError;
  double get averageCost => throw _privateConstructorUsedError;
  double? get parLevel => throw _privateConstructorUsedError;
  @JsonKey(name: 'warehouse_id')
  String? get warehouseId => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_perishable')
  bool get isPerishable => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InsumoCopyWith<Insumo> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InsumoCopyWith<$Res> {
  factory $InsumoCopyWith(Insumo value, $Res Function(Insumo) then) =
      _$InsumoCopyWithImpl<$Res, Insumo>;
  @useResult
  $Res call(
      {String id,
      String name,
      String consumptionUom,
      double stock,
      double averageCost,
      double? parLevel,
      @JsonKey(name: 'warehouse_id') String? warehouseId,
      @JsonKey(name: 'is_perishable') bool isPerishable});
}

/// @nodoc
class _$InsumoCopyWithImpl<$Res, $Val extends Insumo>
    implements $InsumoCopyWith<$Res> {
  _$InsumoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? consumptionUom = null,
    Object? stock = null,
    Object? averageCost = null,
    Object? parLevel = freezed,
    Object? warehouseId = freezed,
    Object? isPerishable = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      consumptionUom: null == consumptionUom
          ? _value.consumptionUom
          : consumptionUom // ignore: cast_nullable_to_non_nullable
              as String,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCost: null == averageCost
          ? _value.averageCost
          : averageCost // ignore: cast_nullable_to_non_nullable
              as double,
      parLevel: freezed == parLevel
          ? _value.parLevel
          : parLevel // ignore: cast_nullable_to_non_nullable
              as double?,
      warehouseId: freezed == warehouseId
          ? _value.warehouseId
          : warehouseId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPerishable: null == isPerishable
          ? _value.isPerishable
          : isPerishable // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InsumoImplCopyWith<$Res> implements $InsumoCopyWith<$Res> {
  factory _$$InsumoImplCopyWith(
          _$InsumoImpl value, $Res Function(_$InsumoImpl) then) =
      __$$InsumoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      String consumptionUom,
      double stock,
      double averageCost,
      double? parLevel,
      @JsonKey(name: 'warehouse_id') String? warehouseId,
      @JsonKey(name: 'is_perishable') bool isPerishable});
}

/// @nodoc
class __$$InsumoImplCopyWithImpl<$Res>
    extends _$InsumoCopyWithImpl<$Res, _$InsumoImpl>
    implements _$$InsumoImplCopyWith<$Res> {
  __$$InsumoImplCopyWithImpl(
      _$InsumoImpl _value, $Res Function(_$InsumoImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? consumptionUom = null,
    Object? stock = null,
    Object? averageCost = null,
    Object? parLevel = freezed,
    Object? warehouseId = freezed,
    Object? isPerishable = null,
  }) {
    return _then(_$InsumoImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      consumptionUom: null == consumptionUom
          ? _value.consumptionUom
          : consumptionUom // ignore: cast_nullable_to_non_nullable
              as String,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCost: null == averageCost
          ? _value.averageCost
          : averageCost // ignore: cast_nullable_to_non_nullable
              as double,
      parLevel: freezed == parLevel
          ? _value.parLevel
          : parLevel // ignore: cast_nullable_to_non_nullable
              as double?,
      warehouseId: freezed == warehouseId
          ? _value.warehouseId
          : warehouseId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPerishable: null == isPerishable
          ? _value.isPerishable
          : isPerishable // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InsumoImpl implements _Insumo {
  const _$InsumoImpl(
      {required this.id,
      required this.name,
      required this.consumptionUom,
      required this.stock,
      required this.averageCost,
      this.parLevel,
      @JsonKey(name: 'warehouse_id') this.warehouseId,
      @JsonKey(name: 'is_perishable') this.isPerishable = false});

  factory _$InsumoImpl.fromJson(Map<String, dynamic> json) =>
      _$$InsumoImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String consumptionUom;
  @override
  final double stock;
  @override
  final double averageCost;
  @override
  final double? parLevel;
  @override
  @JsonKey(name: 'warehouse_id')
  final String? warehouseId;
  @override
  @JsonKey(name: 'is_perishable')
  final bool isPerishable;

  @override
  String toString() {
    return 'Insumo(id: $id, name: $name, consumptionUom: $consumptionUom, stock: $stock, averageCost: $averageCost, parLevel: $parLevel, warehouseId: $warehouseId, isPerishable: $isPerishable)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InsumoImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.consumptionUom, consumptionUom) ||
                other.consumptionUom == consumptionUom) &&
            (identical(other.stock, stock) || other.stock == stock) &&
            (identical(other.averageCost, averageCost) ||
                other.averageCost == averageCost) &&
            (identical(other.parLevel, parLevel) ||
                other.parLevel == parLevel) &&
            (identical(other.warehouseId, warehouseId) ||
                other.warehouseId == warehouseId) &&
            (identical(other.isPerishable, isPerishable) ||
                other.isPerishable == isPerishable));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, consumptionUom, stock,
      averageCost, parLevel, warehouseId, isPerishable);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InsumoImplCopyWith<_$InsumoImpl> get copyWith =>
      __$$InsumoImplCopyWithImpl<_$InsumoImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InsumoImplToJson(
      this,
    );
  }
}

abstract class _Insumo implements Insumo {
  const factory _Insumo(
      {required final String id,
      required final String name,
      required final String consumptionUom,
      required final double stock,
      required final double averageCost,
      final double? parLevel,
      @JsonKey(name: 'warehouse_id') final String? warehouseId,
      @JsonKey(name: 'is_perishable') final bool isPerishable}) = _$InsumoImpl;

  factory _Insumo.fromJson(Map<String, dynamic> json) = _$InsumoImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String get consumptionUom;
  @override
  double get stock;
  @override
  double get averageCost;
  @override
  double? get parLevel;
  @override
  @JsonKey(name: 'warehouse_id')
  String? get warehouseId;
  @override
  @JsonKey(name: 'is_perishable')
  bool get isPerishable;
  @override
  @JsonKey(ignore: true)
  _$$InsumoImplCopyWith<_$InsumoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
