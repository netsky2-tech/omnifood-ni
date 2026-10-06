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
  String? get category => throw _privateConstructorUsedError;

  /// T0.5c: resolved category identity (catalog_values.id). Promotions
  /// match strictly on this id, never on the free-text [category].
  String? get categoryId => throw _privateConstructorUsedError;
  bool get isPrepared => throw _privateConstructorUsedError;
  String get productType => throw _privateConstructorUsedError;
  String? get mappingVersionId => throw _privateConstructorUsedError;
  String? get insumoId => throw _privateConstructorUsedError;
  String? get createdAt => throw _privateConstructorUsedError;
  InventoryPolicy? get inventoryPolicy => throw _privateConstructorUsedError;
  String? get directStockInsumoId => throw _privateConstructorUsedError;

  /// B2e D-3 fail-closed default: 0.0 (exempt).
  /// A product without an explicit synced rate is treated as exempt, never
  /// silently taxed at an invented 15%. The backend payload is the rate's
  /// source of truth; whether IVA applies at sale time is decided by the
  /// active fiscal regime (calculator/receipt layer), not by this default.
  double get taxRate => throw _privateConstructorUsedError;
  bool get isTaxExempt => throw _privateConstructorUsedError;
  List<ProductVariant> get variants => throw _privateConstructorUsedError;
  List<Modifier> get availableModifiers => throw _privateConstructorUsedError;

  /// T2.3: effective modifier groups resolved at load time from the local
  /// mirror, mirroring the server's category-inheritance + per-product
  /// exception rule. Empty when the mirror has nothing for the product.
  List<EffectiveModifierGroup> get availableModifierGroups =>
      throw _privateConstructorUsedError;

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
      String? category,
      String? categoryId,
      bool isPrepared,
      String productType,
      String? mappingVersionId,
      String? insumoId,
      String? createdAt,
      InventoryPolicy? inventoryPolicy,
      String? directStockInsumoId,
      double taxRate,
      bool isTaxExempt,
      List<ProductVariant> variants,
      List<Modifier> availableModifiers,
      List<EffectiveModifierGroup> availableModifierGroups});
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
    Object? category = freezed,
    Object? categoryId = freezed,
    Object? isPrepared = null,
    Object? productType = null,
    Object? mappingVersionId = freezed,
    Object? insumoId = freezed,
    Object? createdAt = freezed,
    Object? inventoryPolicy = freezed,
    Object? directStockInsumoId = freezed,
    Object? taxRate = null,
    Object? isTaxExempt = null,
    Object? variants = null,
    Object? availableModifiers = null,
    Object? availableModifierGroups = null,
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
      category: freezed == category
          ? _value.category
          : category // ignore: cast_nullable_to_non_nullable
              as String?,
      categoryId: freezed == categoryId
          ? _value.categoryId
          : categoryId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPrepared: null == isPrepared
          ? _value.isPrepared
          : isPrepared // ignore: cast_nullable_to_non_nullable
              as bool,
      productType: null == productType
          ? _value.productType
          : productType // ignore: cast_nullable_to_non_nullable
              as String,
      mappingVersionId: freezed == mappingVersionId
          ? _value.mappingVersionId
          : mappingVersionId // ignore: cast_nullable_to_non_nullable
              as String?,
      insumoId: freezed == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String?,
      createdAt: freezed == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as String?,
      inventoryPolicy: freezed == inventoryPolicy
          ? _value.inventoryPolicy
          : inventoryPolicy // ignore: cast_nullable_to_non_nullable
              as InventoryPolicy?,
      directStockInsumoId: freezed == directStockInsumoId
          ? _value.directStockInsumoId
          : directStockInsumoId // ignore: cast_nullable_to_non_nullable
              as String?,
      taxRate: null == taxRate
          ? _value.taxRate
          : taxRate // ignore: cast_nullable_to_non_nullable
              as double,
      isTaxExempt: null == isTaxExempt
          ? _value.isTaxExempt
          : isTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
      variants: null == variants
          ? _value.variants
          : variants // ignore: cast_nullable_to_non_nullable
              as List<ProductVariant>,
      availableModifiers: null == availableModifiers
          ? _value.availableModifiers
          : availableModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
      availableModifierGroups: null == availableModifierGroups
          ? _value.availableModifierGroups
          : availableModifierGroups // ignore: cast_nullable_to_non_nullable
              as List<EffectiveModifierGroup>,
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
      String? category,
      String? categoryId,
      bool isPrepared,
      String productType,
      String? mappingVersionId,
      String? insumoId,
      String? createdAt,
      InventoryPolicy? inventoryPolicy,
      String? directStockInsumoId,
      double taxRate,
      bool isTaxExempt,
      List<ProductVariant> variants,
      List<Modifier> availableModifiers,
      List<EffectiveModifierGroup> availableModifierGroups});
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
    Object? category = freezed,
    Object? categoryId = freezed,
    Object? isPrepared = null,
    Object? productType = null,
    Object? mappingVersionId = freezed,
    Object? insumoId = freezed,
    Object? createdAt = freezed,
    Object? inventoryPolicy = freezed,
    Object? directStockInsumoId = freezed,
    Object? taxRate = null,
    Object? isTaxExempt = null,
    Object? variants = null,
    Object? availableModifiers = null,
    Object? availableModifierGroups = null,
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
      category: freezed == category
          ? _value.category
          : category // ignore: cast_nullable_to_non_nullable
              as String?,
      categoryId: freezed == categoryId
          ? _value.categoryId
          : categoryId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPrepared: null == isPrepared
          ? _value.isPrepared
          : isPrepared // ignore: cast_nullable_to_non_nullable
              as bool,
      productType: null == productType
          ? _value.productType
          : productType // ignore: cast_nullable_to_non_nullable
              as String,
      mappingVersionId: freezed == mappingVersionId
          ? _value.mappingVersionId
          : mappingVersionId // ignore: cast_nullable_to_non_nullable
              as String?,
      insumoId: freezed == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String?,
      createdAt: freezed == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as String?,
      inventoryPolicy: freezed == inventoryPolicy
          ? _value.inventoryPolicy
          : inventoryPolicy // ignore: cast_nullable_to_non_nullable
              as InventoryPolicy?,
      directStockInsumoId: freezed == directStockInsumoId
          ? _value.directStockInsumoId
          : directStockInsumoId // ignore: cast_nullable_to_non_nullable
              as String?,
      taxRate: null == taxRate
          ? _value.taxRate
          : taxRate // ignore: cast_nullable_to_non_nullable
              as double,
      isTaxExempt: null == isTaxExempt
          ? _value.isTaxExempt
          : isTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
      variants: null == variants
          ? _value._variants
          : variants // ignore: cast_nullable_to_non_nullable
              as List<ProductVariant>,
      availableModifiers: null == availableModifiers
          ? _value._availableModifiers
          : availableModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
      availableModifierGroups: null == availableModifierGroups
          ? _value._availableModifierGroups
          : availableModifierGroups // ignore: cast_nullable_to_non_nullable
              as List<EffectiveModifierGroup>,
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
      this.category,
      this.categoryId,
      this.isPrepared = false,
      this.productType = 'SIMPLE',
      this.mappingVersionId,
      this.insumoId,
      this.createdAt,
      this.inventoryPolicy,
      this.directStockInsumoId,
      this.taxRate = 0.0,
      this.isTaxExempt = false,
      final List<ProductVariant> variants = const [],
      final List<Modifier> availableModifiers = const [],
      final List<EffectiveModifierGroup> availableModifierGroups = const []})
      : _variants = variants,
        _availableModifiers = availableModifiers,
        _availableModifierGroups = availableModifierGroups;

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
  @override
  final String? category;

  /// T0.5c: resolved category identity (catalog_values.id). Promotions
  /// match strictly on this id, never on the free-text [category].
  @override
  final String? categoryId;
  @override
  @JsonKey()
  final bool isPrepared;
  @override
  @JsonKey()
  final String productType;
  @override
  final String? mappingVersionId;
  @override
  final String? insumoId;
  @override
  final String? createdAt;
  @override
  final InventoryPolicy? inventoryPolicy;
  @override
  final String? directStockInsumoId;

  /// B2e D-3 fail-closed default: 0.0 (exempt).
  /// A product without an explicit synced rate is treated as exempt, never
  /// silently taxed at an invented 15%. The backend payload is the rate's
  /// source of truth; whether IVA applies at sale time is decided by the
  /// active fiscal regime (calculator/receipt layer), not by this default.
  @override
  @JsonKey()
  final double taxRate;
  @override
  @JsonKey()
  final bool isTaxExempt;
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

  /// T2.3: effective modifier groups resolved at load time from the local
  /// mirror, mirroring the server's category-inheritance + per-product
  /// exception rule. Empty when the mirror has nothing for the product.
  final List<EffectiveModifierGroup> _availableModifierGroups;

  /// T2.3: effective modifier groups resolved at load time from the local
  /// mirror, mirroring the server's category-inheritance + per-product
  /// exception rule. Empty when the mirror has nothing for the product.
  @override
  @JsonKey()
  List<EffectiveModifierGroup> get availableModifierGroups {
    if (_availableModifierGroups is EqualUnmodifiableListView)
      return _availableModifierGroups;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_availableModifierGroups);
  }

  @override
  String toString() {
    return 'Product(id: $id, name: $name, uom: $uom, stock: $stock, averageCost: $averageCost, sellPrice: $sellPrice, isActive: $isActive, sku: $sku, barcode: $barcode, category: $category, categoryId: $categoryId, isPrepared: $isPrepared, productType: $productType, mappingVersionId: $mappingVersionId, insumoId: $insumoId, createdAt: $createdAt, inventoryPolicy: $inventoryPolicy, directStockInsumoId: $directStockInsumoId, taxRate: $taxRate, isTaxExempt: $isTaxExempt, variants: $variants, availableModifiers: $availableModifiers, availableModifierGroups: $availableModifierGroups)';
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
            (identical(other.category, category) ||
                other.category == category) &&
            (identical(other.categoryId, categoryId) ||
                other.categoryId == categoryId) &&
            (identical(other.isPrepared, isPrepared) ||
                other.isPrepared == isPrepared) &&
            (identical(other.productType, productType) ||
                other.productType == productType) &&
            (identical(other.mappingVersionId, mappingVersionId) ||
                other.mappingVersionId == mappingVersionId) &&
            (identical(other.insumoId, insumoId) ||
                other.insumoId == insumoId) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.inventoryPolicy, inventoryPolicy) ||
                other.inventoryPolicy == inventoryPolicy) &&
            (identical(other.directStockInsumoId, directStockInsumoId) ||
                other.directStockInsumoId == directStockInsumoId) &&
            (identical(other.taxRate, taxRate) || other.taxRate == taxRate) &&
            (identical(other.isTaxExempt, isTaxExempt) ||
                other.isTaxExempt == isTaxExempt) &&
            const DeepCollectionEquality().equals(other._variants, _variants) &&
            const DeepCollectionEquality()
                .equals(other._availableModifiers, _availableModifiers) &&
            const DeepCollectionEquality().equals(
                other._availableModifierGroups, _availableModifierGroups));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hashAll([
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
        category,
        categoryId,
        isPrepared,
        productType,
        mappingVersionId,
        insumoId,
        createdAt,
        inventoryPolicy,
        directStockInsumoId,
        taxRate,
        isTaxExempt,
        const DeepCollectionEquality().hash(_variants),
        const DeepCollectionEquality().hash(_availableModifiers),
        const DeepCollectionEquality().hash(_availableModifierGroups)
      ]);

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
          final String? category,
          final String? categoryId,
          final bool isPrepared,
          final String productType,
          final String? mappingVersionId,
          final String? insumoId,
          final String? createdAt,
          final InventoryPolicy? inventoryPolicy,
          final String? directStockInsumoId,
          final double taxRate,
          final bool isTaxExempt,
          final List<ProductVariant> variants,
          final List<Modifier> availableModifiers,
          final List<EffectiveModifierGroup> availableModifierGroups}) =
      _$ProductImpl;

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
  String? get category;
  @override

  /// T0.5c: resolved category identity (catalog_values.id). Promotions
  /// match strictly on this id, never on the free-text [category].
  String? get categoryId;
  @override
  bool get isPrepared;
  @override
  String get productType;
  @override
  String? get mappingVersionId;
  @override
  String? get insumoId;
  @override
  String? get createdAt;
  @override
  InventoryPolicy? get inventoryPolicy;
  @override
  String? get directStockInsumoId;
  @override

  /// B2e D-3 fail-closed default: 0.0 (exempt).
  /// A product without an explicit synced rate is treated as exempt, never
  /// silently taxed at an invented 15%. The backend payload is the rate's
  /// source of truth; whether IVA applies at sale time is decided by the
  /// active fiscal regime (calculator/receipt layer), not by this default.
  double get taxRate;
  @override
  bool get isTaxExempt;
  @override
  List<ProductVariant> get variants;
  @override
  List<Modifier> get availableModifiers;
  @override

  /// T2.3: effective modifier groups resolved at load time from the local
  /// mirror, mirroring the server's category-inheritance + per-product
  /// exception rule. Empty when the mirror has nothing for the product.
  List<EffectiveModifierGroup> get availableModifierGroups;
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

  /// How many units of this option the line includes. Defaults to 1 so
  /// old persisted payloads (name + extraPrice only, invoice history
  /// included) keep loading as quantity 1.
  int get quantity => throw _privateConstructorUsedError;

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
  $Res call({String id, String name, double extraPrice, int quantity});
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
    Object? quantity = null,
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
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as int,
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
  $Res call({String id, String name, double extraPrice, int quantity});
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
    Object? quantity = null,
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
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as int,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ModifierImpl implements _Modifier {
  const _$ModifierImpl(
      {required this.id,
      required this.name,
      required this.extraPrice,
      this.quantity = 1});

  factory _$ModifierImpl.fromJson(Map<String, dynamic> json) =>
      _$$ModifierImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final double extraPrice;

  /// How many units of this option the line includes. Defaults to 1 so
  /// old persisted payloads (name + extraPrice only, invoice history
  /// included) keep loading as quantity 1.
  @override
  @JsonKey()
  final int quantity;

  @override
  String toString() {
    return 'Modifier(id: $id, name: $name, extraPrice: $extraPrice, quantity: $quantity)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ModifierImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.extraPrice, extraPrice) ||
                other.extraPrice == extraPrice) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, extraPrice, quantity);

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
      required final double extraPrice,
      final int quantity}) = _$ModifierImpl;

  factory _Modifier.fromJson(Map<String, dynamic> json) =
      _$ModifierImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  double get extraPrice;
  @override

  /// How many units of this option the line includes. Defaults to 1 so
  /// old persisted payloads (name + extraPrice only, invoice history
  /// included) keep loading as quantity 1.
  int get quantity;
  @override
  @JsonKey(ignore: true)
  _$$ModifierImplCopyWith<_$ModifierImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

EffectiveModifierOption _$EffectiveModifierOptionFromJson(
    Map<String, dynamic> json) {
  return _EffectiveModifierOption.fromJson(json);
}

/// @nodoc
mixin _$EffectiveModifierOption {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  double get priceDelta => throw _privateConstructorUsedError;
  bool get isDefault => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $EffectiveModifierOptionCopyWith<EffectiveModifierOption> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $EffectiveModifierOptionCopyWith<$Res> {
  factory $EffectiveModifierOptionCopyWith(EffectiveModifierOption value,
          $Res Function(EffectiveModifierOption) then) =
      _$EffectiveModifierOptionCopyWithImpl<$Res, EffectiveModifierOption>;
  @useResult
  $Res call({String id, String name, double priceDelta, bool isDefault});
}

/// @nodoc
class _$EffectiveModifierOptionCopyWithImpl<$Res,
        $Val extends EffectiveModifierOption>
    implements $EffectiveModifierOptionCopyWith<$Res> {
  _$EffectiveModifierOptionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? priceDelta = null,
    Object? isDefault = null,
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
      priceDelta: null == priceDelta
          ? _value.priceDelta
          : priceDelta // ignore: cast_nullable_to_non_nullable
              as double,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$EffectiveModifierOptionImplCopyWith<$Res>
    implements $EffectiveModifierOptionCopyWith<$Res> {
  factory _$$EffectiveModifierOptionImplCopyWith(
          _$EffectiveModifierOptionImpl value,
          $Res Function(_$EffectiveModifierOptionImpl) then) =
      __$$EffectiveModifierOptionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, String name, double priceDelta, bool isDefault});
}

/// @nodoc
class __$$EffectiveModifierOptionImplCopyWithImpl<$Res>
    extends _$EffectiveModifierOptionCopyWithImpl<$Res,
        _$EffectiveModifierOptionImpl>
    implements _$$EffectiveModifierOptionImplCopyWith<$Res> {
  __$$EffectiveModifierOptionImplCopyWithImpl(
      _$EffectiveModifierOptionImpl _value,
      $Res Function(_$EffectiveModifierOptionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? priceDelta = null,
    Object? isDefault = null,
  }) {
    return _then(_$EffectiveModifierOptionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      priceDelta: null == priceDelta
          ? _value.priceDelta
          : priceDelta // ignore: cast_nullable_to_non_nullable
              as double,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$EffectiveModifierOptionImpl implements _EffectiveModifierOption {
  const _$EffectiveModifierOptionImpl(
      {required this.id,
      required this.name,
      required this.priceDelta,
      required this.isDefault});

  factory _$EffectiveModifierOptionImpl.fromJson(Map<String, dynamic> json) =>
      _$$EffectiveModifierOptionImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final double priceDelta;
  @override
  final bool isDefault;

  @override
  String toString() {
    return 'EffectiveModifierOption(id: $id, name: $name, priceDelta: $priceDelta, isDefault: $isDefault)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$EffectiveModifierOptionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.priceDelta, priceDelta) ||
                other.priceDelta == priceDelta) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, priceDelta, isDefault);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$EffectiveModifierOptionImplCopyWith<_$EffectiveModifierOptionImpl>
      get copyWith => __$$EffectiveModifierOptionImplCopyWithImpl<
          _$EffectiveModifierOptionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$EffectiveModifierOptionImplToJson(
      this,
    );
  }
}

abstract class _EffectiveModifierOption implements EffectiveModifierOption {
  const factory _EffectiveModifierOption(
      {required final String id,
      required final String name,
      required final double priceDelta,
      required final bool isDefault}) = _$EffectiveModifierOptionImpl;

  factory _EffectiveModifierOption.fromJson(Map<String, dynamic> json) =
      _$EffectiveModifierOptionImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  double get priceDelta;
  @override
  bool get isDefault;
  @override
  @JsonKey(ignore: true)
  _$$EffectiveModifierOptionImplCopyWith<_$EffectiveModifierOptionImpl>
      get copyWith => throw _privateConstructorUsedError;
}

EffectiveModifierGroup _$EffectiveModifierGroupFromJson(
    Map<String, dynamic> json) {
  return _EffectiveModifierGroup.fromJson(json);
}

/// @nodoc
mixin _$EffectiveModifierGroup {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  int get minSelected => throw _privateConstructorUsedError;
  int get maxSelected => throw _privateConstructorUsedError;
  bool get allowQuantities => throw _privateConstructorUsedError;
  String get source => throw _privateConstructorUsedError;
  List<EffectiveModifierOption> get options =>
      throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $EffectiveModifierGroupCopyWith<EffectiveModifierGroup> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $EffectiveModifierGroupCopyWith<$Res> {
  factory $EffectiveModifierGroupCopyWith(EffectiveModifierGroup value,
          $Res Function(EffectiveModifierGroup) then) =
      _$EffectiveModifierGroupCopyWithImpl<$Res, EffectiveModifierGroup>;
  @useResult
  $Res call(
      {String id,
      String name,
      int minSelected,
      int maxSelected,
      bool allowQuantities,
      String source,
      List<EffectiveModifierOption> options});
}

/// @nodoc
class _$EffectiveModifierGroupCopyWithImpl<$Res,
        $Val extends EffectiveModifierGroup>
    implements $EffectiveModifierGroupCopyWith<$Res> {
  _$EffectiveModifierGroupCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? minSelected = null,
    Object? maxSelected = null,
    Object? allowQuantities = null,
    Object? source = null,
    Object? options = null,
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
      minSelected: null == minSelected
          ? _value.minSelected
          : minSelected // ignore: cast_nullable_to_non_nullable
              as int,
      maxSelected: null == maxSelected
          ? _value.maxSelected
          : maxSelected // ignore: cast_nullable_to_non_nullable
              as int,
      allowQuantities: null == allowQuantities
          ? _value.allowQuantities
          : allowQuantities // ignore: cast_nullable_to_non_nullable
              as bool,
      source: null == source
          ? _value.source
          : source // ignore: cast_nullable_to_non_nullable
              as String,
      options: null == options
          ? _value.options
          : options // ignore: cast_nullable_to_non_nullable
              as List<EffectiveModifierOption>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$EffectiveModifierGroupImplCopyWith<$Res>
    implements $EffectiveModifierGroupCopyWith<$Res> {
  factory _$$EffectiveModifierGroupImplCopyWith(
          _$EffectiveModifierGroupImpl value,
          $Res Function(_$EffectiveModifierGroupImpl) then) =
      __$$EffectiveModifierGroupImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      int minSelected,
      int maxSelected,
      bool allowQuantities,
      String source,
      List<EffectiveModifierOption> options});
}

/// @nodoc
class __$$EffectiveModifierGroupImplCopyWithImpl<$Res>
    extends _$EffectiveModifierGroupCopyWithImpl<$Res,
        _$EffectiveModifierGroupImpl>
    implements _$$EffectiveModifierGroupImplCopyWith<$Res> {
  __$$EffectiveModifierGroupImplCopyWithImpl(
      _$EffectiveModifierGroupImpl _value,
      $Res Function(_$EffectiveModifierGroupImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? minSelected = null,
    Object? maxSelected = null,
    Object? allowQuantities = null,
    Object? source = null,
    Object? options = null,
  }) {
    return _then(_$EffectiveModifierGroupImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      minSelected: null == minSelected
          ? _value.minSelected
          : minSelected // ignore: cast_nullable_to_non_nullable
              as int,
      maxSelected: null == maxSelected
          ? _value.maxSelected
          : maxSelected // ignore: cast_nullable_to_non_nullable
              as int,
      allowQuantities: null == allowQuantities
          ? _value.allowQuantities
          : allowQuantities // ignore: cast_nullable_to_non_nullable
              as bool,
      source: null == source
          ? _value.source
          : source // ignore: cast_nullable_to_non_nullable
              as String,
      options: null == options
          ? _value._options
          : options // ignore: cast_nullable_to_non_nullable
              as List<EffectiveModifierOption>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$EffectiveModifierGroupImpl implements _EffectiveModifierGroup {
  const _$EffectiveModifierGroupImpl(
      {required this.id,
      required this.name,
      required this.minSelected,
      required this.maxSelected,
      required this.allowQuantities,
      required this.source,
      final List<EffectiveModifierOption> options = const []})
      : _options = options;

  factory _$EffectiveModifierGroupImpl.fromJson(Map<String, dynamic> json) =>
      _$$EffectiveModifierGroupImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final int minSelected;
  @override
  final int maxSelected;
  @override
  final bool allowQuantities;
  @override
  final String source;
  final List<EffectiveModifierOption> _options;
  @override
  @JsonKey()
  List<EffectiveModifierOption> get options {
    if (_options is EqualUnmodifiableListView) return _options;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_options);
  }

  @override
  String toString() {
    return 'EffectiveModifierGroup(id: $id, name: $name, minSelected: $minSelected, maxSelected: $maxSelected, allowQuantities: $allowQuantities, source: $source, options: $options)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$EffectiveModifierGroupImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.minSelected, minSelected) ||
                other.minSelected == minSelected) &&
            (identical(other.maxSelected, maxSelected) ||
                other.maxSelected == maxSelected) &&
            (identical(other.allowQuantities, allowQuantities) ||
                other.allowQuantities == allowQuantities) &&
            (identical(other.source, source) || other.source == source) &&
            const DeepCollectionEquality().equals(other._options, _options));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      minSelected,
      maxSelected,
      allowQuantities,
      source,
      const DeepCollectionEquality().hash(_options));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$EffectiveModifierGroupImplCopyWith<_$EffectiveModifierGroupImpl>
      get copyWith => __$$EffectiveModifierGroupImplCopyWithImpl<
          _$EffectiveModifierGroupImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$EffectiveModifierGroupImplToJson(
      this,
    );
  }
}

abstract class _EffectiveModifierGroup implements EffectiveModifierGroup {
  const factory _EffectiveModifierGroup(
          {required final String id,
          required final String name,
          required final int minSelected,
          required final int maxSelected,
          required final bool allowQuantities,
          required final String source,
          final List<EffectiveModifierOption> options}) =
      _$EffectiveModifierGroupImpl;

  factory _EffectiveModifierGroup.fromJson(Map<String, dynamic> json) =
      _$EffectiveModifierGroupImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  int get minSelected;
  @override
  int get maxSelected;
  @override
  bool get allowQuantities;
  @override
  String get source;
  @override
  List<EffectiveModifierOption> get options;
  @override
  @JsonKey(ignore: true)
  _$$EffectiveModifierGroupImplCopyWith<_$EffectiveModifierGroupImpl>
      get copyWith => throw _privateConstructorUsedError;
}
