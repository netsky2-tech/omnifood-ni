// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'product.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Product _$ProductFromJson(Map<String, dynamic> json) {
  return _Product.fromJson(json);
}

/// @nodoc
mixin _$Product {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String get uom => throw _privateConstructorUsedError;
  double get stock => throw _privateConstructorUsedError;
  double get averageCost => throw _privateConstructorUsedError;
  double get sellPrice => throw _privateConstructorUsedError;
  bool get isActive => throw _privateConstructorUsedError;
  String? get sku => throw _privateConstructorUsedError;
  String? get barcode => throw _privateConstructorUsedError;
  List<ProductVariant> get variants => throw _privateConstructorUsedError;
  List<Modifier> get availableModifiers => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ProductCopyWith<Product> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProductCopyWith<$Res> {
  factory $ProductCopyWith(Product value, $Res Function(Product) then) =
      _$ProductCopyWithImpl<$Res, Product>;
  @useResult
  $Res call(
      {String id,
      String name,
      String uom,
      double stock,
      double averageCost,
      double sellPrice,
      bool isActive,
      String? sku,
      String? barcode,
      List<ProductVariant> variants,
      List<Modifier> availableModifiers});
}

/// @nodoc
class _$ProductCopyWithImpl<$Res, $Val extends Product>
    implements $ProductCopyWith<$Res> {
  _$ProductCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? uom = null,
    Object? stock = null,
    Object? averageCost = null,
    Object? sellPrice = null,
    Object? isActive = null,
    Object? sku = freezed,
    Object? barcode = freezed,
    Object? variants = null,
    Object? availableModifiers = null,
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
      uom: null == uom
          ? _value.uom
          : uom // ignore: cast_nullable_to_non_nullable
              as String,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCost: null == averageCost
          ? _value.averageCost
          : averageCost // ignore: cast_nullable_to_non_nullable
              as double,
      sellPrice: null == sellPrice
          ? _value.sellPrice
          : sellPrice // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      sku: freezed == sku
          ? _value.sku
          : sku // ignore: cast_nullable_to_non_nullable
              as String?,
      barcode: freezed == barcode
          ? _value.barcode
          : barcode // ignore: cast_nullable_to_non_nullable
              as String?,
      variants: null == variants
          ? _value.variants
          : variants // ignore: cast_nullable_to_non_nullable
              as List<ProductVariant>,
      availableModifiers: null == availableModifiers
          ? _value.availableModifiers
          : availableModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ProductImplCopyWith<$Res> implements $ProductCopyWith<$Res> {
  factory _$$ProductImplCopyWith(
          _$ProductImpl value, $Res Function(_$ProductImpl) then) =
      __$$ProductImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      String uom,
      double stock,
      double averageCost,
      double sellPrice,
      bool isActive,
      String? sku,
      String? barcode,
      List<ProductVariant> variants,
      List<Modifier> availableModifiers});
}

/// @nodoc
class __$$ProductImplCopyWithImpl<$Res>
    extends _$ProductCopyWithImpl<$Res, _$ProductImpl>
    implements _$$ProductImplCopyWith<$Res> {
  __$$ProductImplCopyWithImpl(
      _$ProductImpl _value, $Res Function(_$ProductImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? uom = null,
    Object? stock = null,
    Object? averageCost = null,
    Object? sellPrice = null,
    Object? isActive = null,
    Object? sku = freezed,
    Object? barcode = freezed,
    Object? variants = null,
    Object? availableModifiers = null,
  }) {
    return _then(_$ProductImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      uom: null == uom
          ? _value.uom
          : uom // ignore: cast_nullable_to_non_nullable
              as String,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCost: null == averageCost
          ? _value.averageCost
          : averageCost // ignore: cast_nullable_to_non_nullable
              as double,
      sellPrice: null == sellPrice
          ? _value.sellPrice
          : sellPrice // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      sku: freezed == sku
          ? _value.sku
          : sku // ignore: cast_nullable_to_non_nullable
              as String?,
      barcode: freezed == barcode
          ? _value.barcode
          : barcode // ignore: cast_nullable_to_non_nullable
              as String?,
      variants: null == variants
          ? _value._variants
          : variants // ignore: cast_nullable_to_non_nullable
              as List<ProductVariant>,
      availableModifiers: null == availableModifiers
          ? _value._availableModifiers
          : availableModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ProductImpl implements _Product {
  const _$ProductImpl(
      {required this.id,
      required this.name,
      required this.uom,
      required this.stock,
      required this.averageCost,
      required this.sellPrice,
      this.isActive = true,
      this.sku,
      this.barcode,
      final List<ProductVariant> variants = const [],
      final List<Modifier> availableModifiers = const []})
      : _variants = variants,
        _availableModifiers = availableModifiers;

  factory _$ProductImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProductImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String uom;
  @override
  final double stock;
  @override
  final double averageCost;
  @override
  final double sellPrice;
  @override
  @JsonKey()
  final bool isActive;
  @override
  final String? sku;
  @override
  final String? barcode;
  final List<ProductVariant> _variants;
  @override
  @JsonKey()
  List<ProductVariant> get variants {
    if (_variants is EqualUnmodifiableListView) return _variants;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_variants);
  }

  final List<Modifier> _availableModifiers;
  @override
  @JsonKey()
  List<Modifier> get availableModifiers {
    if (_availableModifiers is EqualUnmodifiableListView)
      return _availableModifiers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_availableModifiers);
  }

  @override
  String toString() {
    return 'Product(id: $id, name: $name, uom: $uom, stock: $stock, averageCost: $averageCost, sellPrice: $sellPrice, isActive: $isActive, sku: $sku, barcode: $barcode, variants: $variants, availableModifiers: $availableModifiers)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProductImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.uom, uom) || other.uom == uom) &&
            (identical(other.stock, stock) || other.stock == stock) &&
            (identical(other.averageCost, averageCost) ||
                other.averageCost == averageCost) &&
            (identical(other.sellPrice, sellPrice) ||
                other.sellPrice == sellPrice) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive) &&
            (identical(other.sku, sku) || other.sku == sku) &&
            (identical(other.barcode, barcode) || other.barcode == barcode) &&
            const DeepCollectionEquality().equals(other._variants, _variants) &&
            const DeepCollectionEquality()
                .equals(other._availableModifiers, _availableModifiers));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      uom,
      stock,
      averageCost,
      sellPrice,
      isActive,
      sku,
      barcode,
      const DeepCollectionEquality().hash(_variants),
      const DeepCollectionEquality().hash(_availableModifiers));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ProductImplCopyWith<_$ProductImpl> get copyWith =>
      __$$ProductImplCopyWithImpl<_$ProductImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProductImplToJson(
      this,
    );
  }
}

abstract class _Product implements Product {
  const factory _Product(
      {required final String id,
      required final String name,
      required final String uom,
      required final double stock,
      required final double averageCost,
      required final double sellPrice,
      final bool isActive,
      final String? sku,
      final String? barcode,
      final List<ProductVariant> variants,
      final List<Modifier> availableModifiers}) = _$ProductImpl;

  factory _Product.fromJson(Map<String, dynamic> json) = _$ProductImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String get uom;
  @override
  double get stock;
  @override
  double get averageCost;
  @override
  double get sellPrice;
  @override
  bool get isActive;
  @override
  String? get sku;
  @override
  String? get barcode;
  @override
  List<ProductVariant> get variants;
  @override
  List<Modifier> get availableModifiers;
  @override
  @JsonKey(ignore: true)
  _$$ProductImplCopyWith<_$ProductImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

ProductVariant _$ProductVariantFromJson(Map<String, dynamic> json) {
  return _ProductVariant.fromJson(json);
}

/// @nodoc
mixin _$ProductVariant {
  String get id => throw _privateConstructorUsedError;
  String get name =>
      throw _privateConstructorUsedError; // e.g., "Grande", "Vainilla"
  double get priceAdjustment => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ProductVariantCopyWith<ProductVariant> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProductVariantCopyWith<$Res> {
  factory $ProductVariantCopyWith(
          ProductVariant value, $Res Function(ProductVariant) then) =
      _$ProductVariantCopyWithImpl<$Res, ProductVariant>;
  @useResult
  $Res call({String id, String name, double priceAdjustment});
}

/// @nodoc
class _$ProductVariantCopyWithImpl<$Res, $Val extends ProductVariant>
    implements $ProductVariantCopyWith<$Res> {
  _$ProductVariantCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? priceAdjustment = null,
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
      priceAdjustment: null == priceAdjustment
          ? _value.priceAdjustment
          : priceAdjustment // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ProductVariantImplCopyWith<$Res>
    implements $ProductVariantCopyWith<$Res> {
  factory _$$ProductVariantImplCopyWith(_$ProductVariantImpl value,
          $Res Function(_$ProductVariantImpl) then) =
      __$$ProductVariantImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, String name, double priceAdjustment});
}

/// @nodoc
class __$$ProductVariantImplCopyWithImpl<$Res>
    extends _$ProductVariantCopyWithImpl<$Res, _$ProductVariantImpl>
    implements _$$ProductVariantImplCopyWith<$Res> {
  __$$ProductVariantImplCopyWithImpl(
      _$ProductVariantImpl _value, $Res Function(_$ProductVariantImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? priceAdjustment = null,
  }) {
    return _then(_$ProductVariantImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      priceAdjustment: null == priceAdjustment
          ? _value.priceAdjustment
          : priceAdjustment // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ProductVariantImpl implements _ProductVariant {
  const _$ProductVariantImpl(
      {required this.id, required this.name, required this.priceAdjustment});

  factory _$ProductVariantImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProductVariantImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
// e.g., "Grande", "Vainilla"
  @override
  final double priceAdjustment;

  @override
  String toString() {
    return 'ProductVariant(id: $id, name: $name, priceAdjustment: $priceAdjustment)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProductVariantImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.priceAdjustment, priceAdjustment) ||
                other.priceAdjustment == priceAdjustment));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, priceAdjustment);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ProductVariantImplCopyWith<_$ProductVariantImpl> get copyWith =>
      __$$ProductVariantImplCopyWithImpl<_$ProductVariantImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProductVariantImplToJson(
      this,
    );
  }
}

abstract class _ProductVariant implements ProductVariant {
  const factory _ProductVariant(
      {required final String id,
      required final String name,
      required final double priceAdjustment}) = _$ProductVariantImpl;

  factory _ProductVariant.fromJson(Map<String, dynamic> json) =
      _$ProductVariantImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override // e.g., "Grande", "Vainilla"
  double get priceAdjustment;
  @override
  @JsonKey(ignore: true)
  _$$ProductVariantImplCopyWith<_$ProductVariantImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

Modifier _$ModifierFromJson(Map<String, dynamic> json) {
  return _Modifier.fromJson(json);
}

/// @nodoc
mixin _$Modifier {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  double get extraPrice => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ModifierCopyWith<Modifier> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ModifierCopyWith<$Res> {
  factory $ModifierCopyWith(Modifier value, $Res Function(Modifier) then) =
      _$ModifierCopyWithImpl<$Res, Modifier>;
  @useResult
  $Res call({String id, String name, double extraPrice});
}

/// @nodoc
class _$ModifierCopyWithImpl<$Res, $Val extends Modifier>
    implements $ModifierCopyWith<$Res> {
  _$ModifierCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? extraPrice = null,
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
      extraPrice: null == extraPrice
          ? _value.extraPrice
          : extraPrice // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ModifierImplCopyWith<$Res>
    implements $ModifierCopyWith<$Res> {
  factory _$$ModifierImplCopyWith(
          _$ModifierImpl value, $Res Function(_$ModifierImpl) then) =
      __$$ModifierImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, String name, double extraPrice});
}

/// @nodoc
class __$$ModifierImplCopyWithImpl<$Res>
    extends _$ModifierCopyWithImpl<$Res, _$ModifierImpl>
    implements _$$ModifierImplCopyWith<$Res> {
  __$$ModifierImplCopyWithImpl(
      _$ModifierImpl _value, $Res Function(_$ModifierImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? extraPrice = null,
  }) {
    return _then(_$ModifierImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      extraPrice: null == extraPrice
          ? _value.extraPrice
          : extraPrice // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ModifierImpl implements _Modifier {
  const _$ModifierImpl(
      {required this.id, required this.name, required this.extraPrice});

  factory _$ModifierImpl.fromJson(Map<String, dynamic> json) =>
      _$$ModifierImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final double extraPrice;

  @override
  String toString() {
    return 'Modifier(id: $id, name: $name, extraPrice: $extraPrice)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ModifierImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.extraPrice, extraPrice) ||
                other.extraPrice == extraPrice));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, extraPrice);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ModifierImplCopyWith<_$ModifierImpl> get copyWith =>
      __$$ModifierImplCopyWithImpl<_$ModifierImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ModifierImplToJson(
      this,
    );
  }
}

abstract class _Modifier implements Modifier {
  const factory _Modifier(
      {required final String id,
      required final String name,
      required final double extraPrice}) = _$ModifierImpl;

  factory _Modifier.fromJson(Map<String, dynamic> json) =
      _$ModifierImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  double get extraPrice;
  @override
  @JsonKey(ignore: true)
  _$$ModifierImplCopyWith<_$ModifierImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
