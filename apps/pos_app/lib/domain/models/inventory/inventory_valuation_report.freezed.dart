// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'inventory_valuation_report.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

InventoryValuationItem _$InventoryValuationItemFromJson(
    Map<String, dynamic> json) {
  return _InventoryValuationItem.fromJson(json);
}

/// @nodoc
mixin _$InventoryValuationItem {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  String get consumptionUom => throw _privateConstructorUsedError;
  String? get warehouseId => throw _privateConstructorUsedError;
  bool get isPerishable => throw _privateConstructorUsedError;
  double get stock => throw _privateConstructorUsedError;
  double get averageCostNio => throw _privateConstructorUsedError;
  double get totalValuationNio => throw _privateConstructorUsedError;
  double? get stockMin => throw _privateConstructorUsedError;
  double? get stockMax => throw _privateConstructorUsedError;
  double? get parLevel => throw _privateConstructorUsedError;
  bool get isLowStock => throw _privateConstructorUsedError;
  bool get isNegativeStock => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryValuationItemCopyWith<InventoryValuationItem> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryValuationItemCopyWith<$Res> {
  factory $InventoryValuationItemCopyWith(InventoryValuationItem value,
          $Res Function(InventoryValuationItem) then) =
      _$InventoryValuationItemCopyWithImpl<$Res, InventoryValuationItem>;
  @useResult
  $Res call(
      {String id,
      String name,
      String consumptionUom,
      String? warehouseId,
      bool isPerishable,
      double stock,
      double averageCostNio,
      double totalValuationNio,
      double? stockMin,
      double? stockMax,
      double? parLevel,
      bool isLowStock,
      bool isNegativeStock});
}

/// @nodoc
class _$InventoryValuationItemCopyWithImpl<$Res,
        $Val extends InventoryValuationItem>
    implements $InventoryValuationItemCopyWith<$Res> {
  _$InventoryValuationItemCopyWithImpl(this._value, this._then);

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
    Object? warehouseId = freezed,
    Object? isPerishable = null,
    Object? stock = null,
    Object? averageCostNio = null,
    Object? totalValuationNio = null,
    Object? stockMin = freezed,
    Object? stockMax = freezed,
    Object? parLevel = freezed,
    Object? isLowStock = null,
    Object? isNegativeStock = null,
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
      warehouseId: freezed == warehouseId
          ? _value.warehouseId
          : warehouseId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPerishable: null == isPerishable
          ? _value.isPerishable
          : isPerishable // ignore: cast_nullable_to_non_nullable
              as bool,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCostNio: null == averageCostNio
          ? _value.averageCostNio
          : averageCostNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalValuationNio: null == totalValuationNio
          ? _value.totalValuationNio
          : totalValuationNio // ignore: cast_nullable_to_non_nullable
              as double,
      stockMin: freezed == stockMin
          ? _value.stockMin
          : stockMin // ignore: cast_nullable_to_non_nullable
              as double?,
      stockMax: freezed == stockMax
          ? _value.stockMax
          : stockMax // ignore: cast_nullable_to_non_nullable
              as double?,
      parLevel: freezed == parLevel
          ? _value.parLevel
          : parLevel // ignore: cast_nullable_to_non_nullable
              as double?,
      isLowStock: null == isLowStock
          ? _value.isLowStock
          : isLowStock // ignore: cast_nullable_to_non_nullable
              as bool,
      isNegativeStock: null == isNegativeStock
          ? _value.isNegativeStock
          : isNegativeStock // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryValuationItemImplCopyWith<$Res>
    implements $InventoryValuationItemCopyWith<$Res> {
  factory _$$InventoryValuationItemImplCopyWith(
          _$InventoryValuationItemImpl value,
          $Res Function(_$InventoryValuationItemImpl) then) =
      __$$InventoryValuationItemImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      String consumptionUom,
      String? warehouseId,
      bool isPerishable,
      double stock,
      double averageCostNio,
      double totalValuationNio,
      double? stockMin,
      double? stockMax,
      double? parLevel,
      bool isLowStock,
      bool isNegativeStock});
}

/// @nodoc
class __$$InventoryValuationItemImplCopyWithImpl<$Res>
    extends _$InventoryValuationItemCopyWithImpl<$Res,
        _$InventoryValuationItemImpl>
    implements _$$InventoryValuationItemImplCopyWith<$Res> {
  __$$InventoryValuationItemImplCopyWithImpl(
      _$InventoryValuationItemImpl _value,
      $Res Function(_$InventoryValuationItemImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? consumptionUom = null,
    Object? warehouseId = freezed,
    Object? isPerishable = null,
    Object? stock = null,
    Object? averageCostNio = null,
    Object? totalValuationNio = null,
    Object? stockMin = freezed,
    Object? stockMax = freezed,
    Object? parLevel = freezed,
    Object? isLowStock = null,
    Object? isNegativeStock = null,
  }) {
    return _then(_$InventoryValuationItemImpl(
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
      warehouseId: freezed == warehouseId
          ? _value.warehouseId
          : warehouseId // ignore: cast_nullable_to_non_nullable
              as String?,
      isPerishable: null == isPerishable
          ? _value.isPerishable
          : isPerishable // ignore: cast_nullable_to_non_nullable
              as bool,
      stock: null == stock
          ? _value.stock
          : stock // ignore: cast_nullable_to_non_nullable
              as double,
      averageCostNio: null == averageCostNio
          ? _value.averageCostNio
          : averageCostNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalValuationNio: null == totalValuationNio
          ? _value.totalValuationNio
          : totalValuationNio // ignore: cast_nullable_to_non_nullable
              as double,
      stockMin: freezed == stockMin
          ? _value.stockMin
          : stockMin // ignore: cast_nullable_to_non_nullable
              as double?,
      stockMax: freezed == stockMax
          ? _value.stockMax
          : stockMax // ignore: cast_nullable_to_non_nullable
              as double?,
      parLevel: freezed == parLevel
          ? _value.parLevel
          : parLevel // ignore: cast_nullable_to_non_nullable
              as double?,
      isLowStock: null == isLowStock
          ? _value.isLowStock
          : isLowStock // ignore: cast_nullable_to_non_nullable
              as bool,
      isNegativeStock: null == isNegativeStock
          ? _value.isNegativeStock
          : isNegativeStock // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InventoryValuationItemImpl implements _InventoryValuationItem {
  const _$InventoryValuationItemImpl(
      {required this.id,
      required this.name,
      required this.consumptionUom,
      this.warehouseId,
      this.isPerishable = false,
      required this.stock,
      required this.averageCostNio,
      required this.totalValuationNio,
      this.stockMin,
      this.stockMax,
      this.parLevel,
      this.isLowStock = false,
      this.isNegativeStock = false});

  factory _$InventoryValuationItemImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryValuationItemImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final String consumptionUom;
  @override
  final String? warehouseId;
  @override
  @JsonKey()
  final bool isPerishable;
  @override
  final double stock;
  @override
  final double averageCostNio;
  @override
  final double totalValuationNio;
  @override
  final double? stockMin;
  @override
  final double? stockMax;
  @override
  final double? parLevel;
  @override
  @JsonKey()
  final bool isLowStock;
  @override
  @JsonKey()
  final bool isNegativeStock;

  @override
  String toString() {
    return 'InventoryValuationItem(id: $id, name: $name, consumptionUom: $consumptionUom, warehouseId: $warehouseId, isPerishable: $isPerishable, stock: $stock, averageCostNio: $averageCostNio, totalValuationNio: $totalValuationNio, stockMin: $stockMin, stockMax: $stockMax, parLevel: $parLevel, isLowStock: $isLowStock, isNegativeStock: $isNegativeStock)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryValuationItemImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.consumptionUom, consumptionUom) ||
                other.consumptionUom == consumptionUom) &&
            (identical(other.warehouseId, warehouseId) ||
                other.warehouseId == warehouseId) &&
            (identical(other.isPerishable, isPerishable) ||
                other.isPerishable == isPerishable) &&
            (identical(other.stock, stock) || other.stock == stock) &&
            (identical(other.averageCostNio, averageCostNio) ||
                other.averageCostNio == averageCostNio) &&
            (identical(other.totalValuationNio, totalValuationNio) ||
                other.totalValuationNio == totalValuationNio) &&
            (identical(other.stockMin, stockMin) ||
                other.stockMin == stockMin) &&
            (identical(other.stockMax, stockMax) ||
                other.stockMax == stockMax) &&
            (identical(other.parLevel, parLevel) ||
                other.parLevel == parLevel) &&
            (identical(other.isLowStock, isLowStock) ||
                other.isLowStock == isLowStock) &&
            (identical(other.isNegativeStock, isNegativeStock) ||
                other.isNegativeStock == isNegativeStock));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      consumptionUom,
      warehouseId,
      isPerishable,
      stock,
      averageCostNio,
      totalValuationNio,
      stockMin,
      stockMax,
      parLevel,
      isLowStock,
      isNegativeStock);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryValuationItemImplCopyWith<_$InventoryValuationItemImpl>
      get copyWith => __$$InventoryValuationItemImplCopyWithImpl<
          _$InventoryValuationItemImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryValuationItemImplToJson(
      this,
    );
  }
}

abstract class _InventoryValuationItem implements InventoryValuationItem {
  const factory _InventoryValuationItem(
      {required final String id,
      required final String name,
      required final String consumptionUom,
      final String? warehouseId,
      final bool isPerishable,
      required final double stock,
      required final double averageCostNio,
      required final double totalValuationNio,
      final double? stockMin,
      final double? stockMax,
      final double? parLevel,
      final bool isLowStock,
      final bool isNegativeStock}) = _$InventoryValuationItemImpl;

  factory _InventoryValuationItem.fromJson(Map<String, dynamic> json) =
      _$InventoryValuationItemImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  String get consumptionUom;
  @override
  String? get warehouseId;
  @override
  bool get isPerishable;
  @override
  double get stock;
  @override
  double get averageCostNio;
  @override
  double get totalValuationNio;
  @override
  double? get stockMin;
  @override
  double? get stockMax;
  @override
  double? get parLevel;
  @override
  bool get isLowStock;
  @override
  bool get isNegativeStock;
  @override
  @JsonKey(ignore: true)
  _$$InventoryValuationItemImplCopyWith<_$InventoryValuationItemImpl>
      get copyWith => throw _privateConstructorUsedError;
}

InventoryValuationReport _$InventoryValuationReportFromJson(
    Map<String, dynamic> json) {
  return _InventoryValuationReport.fromJson(json);
}

/// @nodoc
mixin _$InventoryValuationReport {
  double get totalValuationNio => throw _privateConstructorUsedError;
  int get totalItemsCount => throw _privateConstructorUsedError;
  int get itemsWithStockCount => throw _privateConstructorUsedError;
  int get itemsLowStockCount => throw _privateConstructorUsedError;
  int get itemsNegativeStockCount => throw _privateConstructorUsedError;
  DateTime get generatedAt => throw _privateConstructorUsedError;
  List<InventoryValuationItem> get items => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryValuationReportCopyWith<InventoryValuationReport> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryValuationReportCopyWith<$Res> {
  factory $InventoryValuationReportCopyWith(InventoryValuationReport value,
          $Res Function(InventoryValuationReport) then) =
      _$InventoryValuationReportCopyWithImpl<$Res, InventoryValuationReport>;
  @useResult
  $Res call(
      {double totalValuationNio,
      int totalItemsCount,
      int itemsWithStockCount,
      int itemsLowStockCount,
      int itemsNegativeStockCount,
      DateTime generatedAt,
      List<InventoryValuationItem> items});
}

/// @nodoc
class _$InventoryValuationReportCopyWithImpl<$Res,
        $Val extends InventoryValuationReport>
    implements $InventoryValuationReportCopyWith<$Res> {
  _$InventoryValuationReportCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? totalValuationNio = null,
    Object? totalItemsCount = null,
    Object? itemsWithStockCount = null,
    Object? itemsLowStockCount = null,
    Object? itemsNegativeStockCount = null,
    Object? generatedAt = null,
    Object? items = null,
  }) {
    return _then(_value.copyWith(
      totalValuationNio: null == totalValuationNio
          ? _value.totalValuationNio
          : totalValuationNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalItemsCount: null == totalItemsCount
          ? _value.totalItemsCount
          : totalItemsCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsWithStockCount: null == itemsWithStockCount
          ? _value.itemsWithStockCount
          : itemsWithStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsLowStockCount: null == itemsLowStockCount
          ? _value.itemsLowStockCount
          : itemsLowStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsNegativeStockCount: null == itemsNegativeStockCount
          ? _value.itemsNegativeStockCount
          : itemsNegativeStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      generatedAt: null == generatedAt
          ? _value.generatedAt
          : generatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      items: null == items
          ? _value.items
          : items // ignore: cast_nullable_to_non_nullable
              as List<InventoryValuationItem>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryValuationReportImplCopyWith<$Res>
    implements $InventoryValuationReportCopyWith<$Res> {
  factory _$$InventoryValuationReportImplCopyWith(
          _$InventoryValuationReportImpl value,
          $Res Function(_$InventoryValuationReportImpl) then) =
      __$$InventoryValuationReportImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {double totalValuationNio,
      int totalItemsCount,
      int itemsWithStockCount,
      int itemsLowStockCount,
      int itemsNegativeStockCount,
      DateTime generatedAt,
      List<InventoryValuationItem> items});
}

/// @nodoc
class __$$InventoryValuationReportImplCopyWithImpl<$Res>
    extends _$InventoryValuationReportCopyWithImpl<$Res,
        _$InventoryValuationReportImpl>
    implements _$$InventoryValuationReportImplCopyWith<$Res> {
  __$$InventoryValuationReportImplCopyWithImpl(
      _$InventoryValuationReportImpl _value,
      $Res Function(_$InventoryValuationReportImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? totalValuationNio = null,
    Object? totalItemsCount = null,
    Object? itemsWithStockCount = null,
    Object? itemsLowStockCount = null,
    Object? itemsNegativeStockCount = null,
    Object? generatedAt = null,
    Object? items = null,
  }) {
    return _then(_$InventoryValuationReportImpl(
      totalValuationNio: null == totalValuationNio
          ? _value.totalValuationNio
          : totalValuationNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalItemsCount: null == totalItemsCount
          ? _value.totalItemsCount
          : totalItemsCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsWithStockCount: null == itemsWithStockCount
          ? _value.itemsWithStockCount
          : itemsWithStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsLowStockCount: null == itemsLowStockCount
          ? _value.itemsLowStockCount
          : itemsLowStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      itemsNegativeStockCount: null == itemsNegativeStockCount
          ? _value.itemsNegativeStockCount
          : itemsNegativeStockCount // ignore: cast_nullable_to_non_nullable
              as int,
      generatedAt: null == generatedAt
          ? _value.generatedAt
          : generatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      items: null == items
          ? _value._items
          : items // ignore: cast_nullable_to_non_nullable
              as List<InventoryValuationItem>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InventoryValuationReportImpl implements _InventoryValuationReport {
  const _$InventoryValuationReportImpl(
      {required this.totalValuationNio,
      required this.totalItemsCount,
      required this.itemsWithStockCount,
      required this.itemsLowStockCount,
      required this.itemsNegativeStockCount,
      required this.generatedAt,
      required final List<InventoryValuationItem> items})
      : _items = items;

  factory _$InventoryValuationReportImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryValuationReportImplFromJson(json);

  @override
  final double totalValuationNio;
  @override
  final int totalItemsCount;
  @override
  final int itemsWithStockCount;
  @override
  final int itemsLowStockCount;
  @override
  final int itemsNegativeStockCount;
  @override
  final DateTime generatedAt;
  final List<InventoryValuationItem> _items;
  @override
  List<InventoryValuationItem> get items {
    if (_items is EqualUnmodifiableListView) return _items;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_items);
  }

  @override
  String toString() {
    return 'InventoryValuationReport(totalValuationNio: $totalValuationNio, totalItemsCount: $totalItemsCount, itemsWithStockCount: $itemsWithStockCount, itemsLowStockCount: $itemsLowStockCount, itemsNegativeStockCount: $itemsNegativeStockCount, generatedAt: $generatedAt, items: $items)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryValuationReportImpl &&
            (identical(other.totalValuationNio, totalValuationNio) ||
                other.totalValuationNio == totalValuationNio) &&
            (identical(other.totalItemsCount, totalItemsCount) ||
                other.totalItemsCount == totalItemsCount) &&
            (identical(other.itemsWithStockCount, itemsWithStockCount) ||
                other.itemsWithStockCount == itemsWithStockCount) &&
            (identical(other.itemsLowStockCount, itemsLowStockCount) ||
                other.itemsLowStockCount == itemsLowStockCount) &&
            (identical(
                    other.itemsNegativeStockCount, itemsNegativeStockCount) ||
                other.itemsNegativeStockCount == itemsNegativeStockCount) &&
            (identical(other.generatedAt, generatedAt) ||
                other.generatedAt == generatedAt) &&
            const DeepCollectionEquality().equals(other._items, _items));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      totalValuationNio,
      totalItemsCount,
      itemsWithStockCount,
      itemsLowStockCount,
      itemsNegativeStockCount,
      generatedAt,
      const DeepCollectionEquality().hash(_items));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryValuationReportImplCopyWith<_$InventoryValuationReportImpl>
      get copyWith => __$$InventoryValuationReportImplCopyWithImpl<
          _$InventoryValuationReportImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryValuationReportImplToJson(
      this,
    );
  }
}

abstract class _InventoryValuationReport implements InventoryValuationReport {
  const factory _InventoryValuationReport(
          {required final double totalValuationNio,
          required final int totalItemsCount,
          required final int itemsWithStockCount,
          required final int itemsLowStockCount,
          required final int itemsNegativeStockCount,
          required final DateTime generatedAt,
          required final List<InventoryValuationItem> items}) =
      _$InventoryValuationReportImpl;

  factory _InventoryValuationReport.fromJson(Map<String, dynamic> json) =
      _$InventoryValuationReportImpl.fromJson;

  @override
  double get totalValuationNio;
  @override
  int get totalItemsCount;
  @override
  int get itemsWithStockCount;
  @override
  int get itemsLowStockCount;
  @override
  int get itemsNegativeStockCount;
  @override
  DateTime get generatedAt;
  @override
  List<InventoryValuationItem> get items;
  @override
  @JsonKey(ignore: true)
  _$$InventoryValuationReportImplCopyWith<_$InventoryValuationReportImpl>
      get copyWith => throw _privateConstructorUsedError;
}
