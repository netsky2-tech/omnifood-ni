// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'invoice_item.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

InvoiceItem _$InvoiceItemFromJson(Map<String, dynamic> json) {
  return _InvoiceItem.fromJson(json);
}

/// @nodoc
mixin _$InvoiceItem {
  String get id => throw _privateConstructorUsedError;
  String get invoiceId => throw _privateConstructorUsedError;
  String get productId => throw _privateConstructorUsedError;
  String get productName => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;
  double get unitPrice => throw _privateConstructorUsedError;
  double get originalTaxRate => throw _privateConstructorUsedError;
  double get appliedTaxRate => throw _privateConstructorUsedError;
  double get taxAmount => throw _privateConstructorUsedError;
  double get total => throw _privateConstructorUsedError;
  double get discount => throw _privateConstructorUsedError;
  String? get variantId => throw _privateConstructorUsedError;
  String? get notes => throw _privateConstructorUsedError;
  List<Modifier> get selectedModifiers => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InvoiceItemCopyWith<InvoiceItem> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InvoiceItemCopyWith<$Res> {
  factory $InvoiceItemCopyWith(
          InvoiceItem value, $Res Function(InvoiceItem) then) =
      _$InvoiceItemCopyWithImpl<$Res, InvoiceItem>;
  @useResult
  $Res call(
      {String id,
      String invoiceId,
      String productId,
      String productName,
      double quantity,
      double unitPrice,
      double originalTaxRate,
      double appliedTaxRate,
      double taxAmount,
      double total,
      double discount,
      String? variantId,
      String? notes,
      List<Modifier> selectedModifiers});
}

/// @nodoc
class _$InvoiceItemCopyWithImpl<$Res, $Val extends InvoiceItem>
    implements $InvoiceItemCopyWith<$Res> {
  _$InvoiceItemCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? invoiceId = null,
    Object? productId = null,
    Object? productName = null,
    Object? quantity = null,
    Object? unitPrice = null,
    Object? originalTaxRate = null,
    Object? appliedTaxRate = null,
    Object? taxAmount = null,
    Object? total = null,
    Object? discount = null,
    Object? variantId = freezed,
    Object? notes = freezed,
    Object? selectedModifiers = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceId: null == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String,
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      productName: null == productName
          ? _value.productName
          : productName // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitPrice: null == unitPrice
          ? _value.unitPrice
          : unitPrice // ignore: cast_nullable_to_non_nullable
              as double,
      originalTaxRate: null == originalTaxRate
          ? _value.originalTaxRate
          : originalTaxRate // ignore: cast_nullable_to_non_nullable
              as double,
      appliedTaxRate: null == appliedTaxRate
          ? _value.appliedTaxRate
          : appliedTaxRate // ignore: cast_nullable_to_non_nullable
              as double,
      taxAmount: null == taxAmount
          ? _value.taxAmount
          : taxAmount // ignore: cast_nullable_to_non_nullable
              as double,
      total: null == total
          ? _value.total
          : total // ignore: cast_nullable_to_non_nullable
              as double,
      discount: null == discount
          ? _value.discount
          : discount // ignore: cast_nullable_to_non_nullable
              as double,
      variantId: freezed == variantId
          ? _value.variantId
          : variantId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      selectedModifiers: null == selectedModifiers
          ? _value.selectedModifiers
          : selectedModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InvoiceItemImplCopyWith<$Res>
    implements $InvoiceItemCopyWith<$Res> {
  factory _$$InvoiceItemImplCopyWith(
          _$InvoiceItemImpl value, $Res Function(_$InvoiceItemImpl) then) =
      __$$InvoiceItemImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String invoiceId,
      String productId,
      String productName,
      double quantity,
      double unitPrice,
      double originalTaxRate,
      double appliedTaxRate,
      double taxAmount,
      double total,
      double discount,
      String? variantId,
      String? notes,
      List<Modifier> selectedModifiers});
}

/// @nodoc
class __$$InvoiceItemImplCopyWithImpl<$Res>
    extends _$InvoiceItemCopyWithImpl<$Res, _$InvoiceItemImpl>
    implements _$$InvoiceItemImplCopyWith<$Res> {
  __$$InvoiceItemImplCopyWithImpl(
      _$InvoiceItemImpl _value, $Res Function(_$InvoiceItemImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? invoiceId = null,
    Object? productId = null,
    Object? productName = null,
    Object? quantity = null,
    Object? unitPrice = null,
    Object? originalTaxRate = null,
    Object? appliedTaxRate = null,
    Object? taxAmount = null,
    Object? total = null,
    Object? discount = null,
    Object? variantId = freezed,
    Object? notes = freezed,
    Object? selectedModifiers = null,
  }) {
    return _then(_$InvoiceItemImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      invoiceId: null == invoiceId
          ? _value.invoiceId
          : invoiceId // ignore: cast_nullable_to_non_nullable
              as String,
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      productName: null == productName
          ? _value.productName
          : productName // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      unitPrice: null == unitPrice
          ? _value.unitPrice
          : unitPrice // ignore: cast_nullable_to_non_nullable
              as double,
      originalTaxRate: null == originalTaxRate
          ? _value.originalTaxRate
          : originalTaxRate // ignore: cast_nullable_to_non_nullable
              as double,
      appliedTaxRate: null == appliedTaxRate
          ? _value.appliedTaxRate
          : appliedTaxRate // ignore: cast_nullable_to_non_nullable
              as double,
      taxAmount: null == taxAmount
          ? _value.taxAmount
          : taxAmount // ignore: cast_nullable_to_non_nullable
              as double,
      total: null == total
          ? _value.total
          : total // ignore: cast_nullable_to_non_nullable
              as double,
      discount: null == discount
          ? _value.discount
          : discount // ignore: cast_nullable_to_non_nullable
              as double,
      variantId: freezed == variantId
          ? _value.variantId
          : variantId // ignore: cast_nullable_to_non_nullable
              as String?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      selectedModifiers: null == selectedModifiers
          ? _value._selectedModifiers
          : selectedModifiers // ignore: cast_nullable_to_non_nullable
              as List<Modifier>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InvoiceItemImpl implements _InvoiceItem {
  const _$InvoiceItemImpl(
      {required this.id,
      required this.invoiceId,
      required this.productId,
      required this.productName,
      required this.quantity,
      required this.unitPrice,
      required this.originalTaxRate,
      required this.appliedTaxRate,
      required this.taxAmount,
      required this.total,
      this.discount = 0.0,
      this.variantId,
      this.notes,
      final List<Modifier> selectedModifiers = const []})
      : _selectedModifiers = selectedModifiers;

  factory _$InvoiceItemImpl.fromJson(Map<String, dynamic> json) =>
      _$$InvoiceItemImplFromJson(json);

  @override
  final String id;
  @override
  final String invoiceId;
  @override
  final String productId;
  @override
  final String productName;
  @override
  final double quantity;
  @override
  final double unitPrice;
  @override
  final double originalTaxRate;
  @override
  final double appliedTaxRate;
  @override
  final double taxAmount;
  @override
  final double total;
  @override
  @JsonKey()
  final double discount;
  @override
  final String? variantId;
  @override
  final String? notes;
  final List<Modifier> _selectedModifiers;
  @override
  @JsonKey()
  List<Modifier> get selectedModifiers {
    if (_selectedModifiers is EqualUnmodifiableListView)
      return _selectedModifiers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_selectedModifiers);
  }

  @override
  String toString() {
    return 'InvoiceItem(id: $id, invoiceId: $invoiceId, productId: $productId, productName: $productName, quantity: $quantity, unitPrice: $unitPrice, originalTaxRate: $originalTaxRate, appliedTaxRate: $appliedTaxRate, taxAmount: $taxAmount, total: $total, discount: $discount, variantId: $variantId, notes: $notes, selectedModifiers: $selectedModifiers)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InvoiceItemImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.invoiceId, invoiceId) ||
                other.invoiceId == invoiceId) &&
            (identical(other.productId, productId) ||
                other.productId == productId) &&
            (identical(other.productName, productName) ||
                other.productName == productName) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity) &&
            (identical(other.unitPrice, unitPrice) ||
                other.unitPrice == unitPrice) &&
            (identical(other.originalTaxRate, originalTaxRate) ||
                other.originalTaxRate == originalTaxRate) &&
            (identical(other.appliedTaxRate, appliedTaxRate) ||
                other.appliedTaxRate == appliedTaxRate) &&
            (identical(other.taxAmount, taxAmount) ||
                other.taxAmount == taxAmount) &&
            (identical(other.total, total) || other.total == total) &&
            (identical(other.discount, discount) ||
                other.discount == discount) &&
            (identical(other.variantId, variantId) ||
                other.variantId == variantId) &&
            (identical(other.notes, notes) || other.notes == notes) &&
            const DeepCollectionEquality()
                .equals(other._selectedModifiers, _selectedModifiers));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      invoiceId,
      productId,
      productName,
      quantity,
      unitPrice,
      originalTaxRate,
      appliedTaxRate,
      taxAmount,
      total,
      discount,
      variantId,
      notes,
      const DeepCollectionEquality().hash(_selectedModifiers));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InvoiceItemImplCopyWith<_$InvoiceItemImpl> get copyWith =>
      __$$InvoiceItemImplCopyWithImpl<_$InvoiceItemImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InvoiceItemImplToJson(
      this,
    );
  }
}

abstract class _InvoiceItem implements InvoiceItem {
  const factory _InvoiceItem(
      {required final String id,
      required final String invoiceId,
      required final String productId,
      required final String productName,
      required final double quantity,
      required final double unitPrice,
      required final double originalTaxRate,
      required final double appliedTaxRate,
      required final double taxAmount,
      required final double total,
      final double discount,
      final String? variantId,
      final String? notes,
      final List<Modifier> selectedModifiers}) = _$InvoiceItemImpl;

  factory _InvoiceItem.fromJson(Map<String, dynamic> json) =
      _$InvoiceItemImpl.fromJson;

  @override
  String get id;
  @override
  String get invoiceId;
  @override
  String get productId;
  @override
  String get productName;
  @override
  double get quantity;
  @override
  double get unitPrice;
  @override
  double get originalTaxRate;
  @override
  double get appliedTaxRate;
  @override
  double get taxAmount;
  @override
  double get total;
  @override
  double get discount;
  @override
  String? get variantId;
  @override
  String? get notes;
  @override
  List<Modifier> get selectedModifiers;
  @override
  @JsonKey(ignore: true)
  _$$InvoiceItemImplCopyWith<_$InvoiceItemImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
