// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'split_bill_engine.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

SplitBillShare _$SplitBillShareFromJson(Map<String, dynamic> json) {
  return _SplitBillShare.fromJson(json);
}

/// @nodoc
mixin _$SplitBillShare {
  int get shareIndex => throw _privateConstructorUsedError;
  String get label => throw _privateConstructorUsedError;
  List<CartItem> get items => throw _privateConstructorUsedError;
  double get subtotalNio => throw _privateConstructorUsedError;
  double get taxNio => throw _privateConstructorUsedError;
  double get tipNio => throw _privateConstructorUsedError;
  double get discountNio => throw _privateConstructorUsedError;
  double get totalNio => throw _privateConstructorUsedError;
  double get totalUsd => throw _privateConstructorUsedError;
  bool get isPaid => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SplitBillShareCopyWith<SplitBillShare> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SplitBillShareCopyWith<$Res> {
  factory $SplitBillShareCopyWith(
          SplitBillShare value, $Res Function(SplitBillShare) then) =
      _$SplitBillShareCopyWithImpl<$Res, SplitBillShare>;
  @useResult
  $Res call(
      {int shareIndex,
      String label,
      List<CartItem> items,
      double subtotalNio,
      double taxNio,
      double tipNio,
      double discountNio,
      double totalNio,
      double totalUsd,
      bool isPaid});
}

/// @nodoc
class _$SplitBillShareCopyWithImpl<$Res, $Val extends SplitBillShare>
    implements $SplitBillShareCopyWith<$Res> {
  _$SplitBillShareCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shareIndex = null,
    Object? label = null,
    Object? items = null,
    Object? subtotalNio = null,
    Object? taxNio = null,
    Object? tipNio = null,
    Object? discountNio = null,
    Object? totalNio = null,
    Object? totalUsd = null,
    Object? isPaid = null,
  }) {
    return _then(_value.copyWith(
      shareIndex: null == shareIndex
          ? _value.shareIndex
          : shareIndex // ignore: cast_nullable_to_non_nullable
              as int,
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      items: null == items
          ? _value.items
          : items // ignore: cast_nullable_to_non_nullable
              as List<CartItem>,
      subtotalNio: null == subtotalNio
          ? _value.subtotalNio
          : subtotalNio // ignore: cast_nullable_to_non_nullable
              as double,
      taxNio: null == taxNio
          ? _value.taxNio
          : taxNio // ignore: cast_nullable_to_non_nullable
              as double,
      tipNio: null == tipNio
          ? _value.tipNio
          : tipNio // ignore: cast_nullable_to_non_nullable
              as double,
      discountNio: null == discountNio
          ? _value.discountNio
          : discountNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalNio: null == totalNio
          ? _value.totalNio
          : totalNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalUsd: null == totalUsd
          ? _value.totalUsd
          : totalUsd // ignore: cast_nullable_to_non_nullable
              as double,
      isPaid: null == isPaid
          ? _value.isPaid
          : isPaid // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SplitBillShareImplCopyWith<$Res>
    implements $SplitBillShareCopyWith<$Res> {
  factory _$$SplitBillShareImplCopyWith(_$SplitBillShareImpl value,
          $Res Function(_$SplitBillShareImpl) then) =
      __$$SplitBillShareImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {int shareIndex,
      String label,
      List<CartItem> items,
      double subtotalNio,
      double taxNio,
      double tipNio,
      double discountNio,
      double totalNio,
      double totalUsd,
      bool isPaid});
}

/// @nodoc
class __$$SplitBillShareImplCopyWithImpl<$Res>
    extends _$SplitBillShareCopyWithImpl<$Res, _$SplitBillShareImpl>
    implements _$$SplitBillShareImplCopyWith<$Res> {
  __$$SplitBillShareImplCopyWithImpl(
      _$SplitBillShareImpl _value, $Res Function(_$SplitBillShareImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shareIndex = null,
    Object? label = null,
    Object? items = null,
    Object? subtotalNio = null,
    Object? taxNio = null,
    Object? tipNio = null,
    Object? discountNio = null,
    Object? totalNio = null,
    Object? totalUsd = null,
    Object? isPaid = null,
  }) {
    return _then(_$SplitBillShareImpl(
      shareIndex: null == shareIndex
          ? _value.shareIndex
          : shareIndex // ignore: cast_nullable_to_non_nullable
              as int,
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      items: null == items
          ? _value._items
          : items // ignore: cast_nullable_to_non_nullable
              as List<CartItem>,
      subtotalNio: null == subtotalNio
          ? _value.subtotalNio
          : subtotalNio // ignore: cast_nullable_to_non_nullable
              as double,
      taxNio: null == taxNio
          ? _value.taxNio
          : taxNio // ignore: cast_nullable_to_non_nullable
              as double,
      tipNio: null == tipNio
          ? _value.tipNio
          : tipNio // ignore: cast_nullable_to_non_nullable
              as double,
      discountNio: null == discountNio
          ? _value.discountNio
          : discountNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalNio: null == totalNio
          ? _value.totalNio
          : totalNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalUsd: null == totalUsd
          ? _value.totalUsd
          : totalUsd // ignore: cast_nullable_to_non_nullable
              as double,
      isPaid: null == isPaid
          ? _value.isPaid
          : isPaid // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$SplitBillShareImpl extends _SplitBillShare {
  const _$SplitBillShareImpl(
      {required this.shareIndex,
      required this.label,
      final List<CartItem> items = const <CartItem>[],
      required this.subtotalNio,
      required this.taxNio,
      required this.tipNio,
      required this.discountNio,
      required this.totalNio,
      required this.totalUsd,
      this.isPaid = false})
      : _items = items,
        super._();

  factory _$SplitBillShareImpl.fromJson(Map<String, dynamic> json) =>
      _$$SplitBillShareImplFromJson(json);

  @override
  final int shareIndex;
  @override
  final String label;
  final List<CartItem> _items;
  @override
  @JsonKey()
  List<CartItem> get items {
    if (_items is EqualUnmodifiableListView) return _items;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_items);
  }

  @override
  final double subtotalNio;
  @override
  final double taxNio;
  @override
  final double tipNio;
  @override
  final double discountNio;
  @override
  final double totalNio;
  @override
  final double totalUsd;
  @override
  @JsonKey()
  final bool isPaid;

  @override
  String toString() {
    return 'SplitBillShare(shareIndex: $shareIndex, label: $label, items: $items, subtotalNio: $subtotalNio, taxNio: $taxNio, tipNio: $tipNio, discountNio: $discountNio, totalNio: $totalNio, totalUsd: $totalUsd, isPaid: $isPaid)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SplitBillShareImpl &&
            (identical(other.shareIndex, shareIndex) ||
                other.shareIndex == shareIndex) &&
            (identical(other.label, label) || other.label == label) &&
            const DeepCollectionEquality().equals(other._items, _items) &&
            (identical(other.subtotalNio, subtotalNio) ||
                other.subtotalNio == subtotalNio) &&
            (identical(other.taxNio, taxNio) || other.taxNio == taxNio) &&
            (identical(other.tipNio, tipNio) || other.tipNio == tipNio) &&
            (identical(other.discountNio, discountNio) ||
                other.discountNio == discountNio) &&
            (identical(other.totalNio, totalNio) ||
                other.totalNio == totalNio) &&
            (identical(other.totalUsd, totalUsd) ||
                other.totalUsd == totalUsd) &&
            (identical(other.isPaid, isPaid) || other.isPaid == isPaid));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      shareIndex,
      label,
      const DeepCollectionEquality().hash(_items),
      subtotalNio,
      taxNio,
      tipNio,
      discountNio,
      totalNio,
      totalUsd,
      isPaid);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SplitBillShareImplCopyWith<_$SplitBillShareImpl> get copyWith =>
      __$$SplitBillShareImplCopyWithImpl<_$SplitBillShareImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SplitBillShareImplToJson(
      this,
    );
  }
}

abstract class _SplitBillShare extends SplitBillShare {
  const factory _SplitBillShare(
      {required final int shareIndex,
      required final String label,
      final List<CartItem> items,
      required final double subtotalNio,
      required final double taxNio,
      required final double tipNio,
      required final double discountNio,
      required final double totalNio,
      required final double totalUsd,
      final bool isPaid}) = _$SplitBillShareImpl;
  const _SplitBillShare._() : super._();

  factory _SplitBillShare.fromJson(Map<String, dynamic> json) =
      _$SplitBillShareImpl.fromJson;

  @override
  int get shareIndex;
  @override
  String get label;
  @override
  List<CartItem> get items;
  @override
  double get subtotalNio;
  @override
  double get taxNio;
  @override
  double get tipNio;
  @override
  double get discountNio;
  @override
  double get totalNio;
  @override
  double get totalUsd;
  @override
  bool get isPaid;
  @override
  @JsonKey(ignore: true)
  _$$SplitBillShareImplCopyWith<_$SplitBillShareImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

SplitBillResult _$SplitBillResultFromJson(Map<String, dynamic> json) {
  return _SplitBillResult.fromJson(json);
}

/// @nodoc
mixin _$SplitBillResult {
  List<SplitBillShare> get shares => throw _privateConstructorUsedError;
  double get totalDistributedNio => throw _privateConstructorUsedError;
  double get totalDistributedUsd => throw _privateConstructorUsedError;
  double get commercialRate => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SplitBillResultCopyWith<SplitBillResult> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SplitBillResultCopyWith<$Res> {
  factory $SplitBillResultCopyWith(
          SplitBillResult value, $Res Function(SplitBillResult) then) =
      _$SplitBillResultCopyWithImpl<$Res, SplitBillResult>;
  @useResult
  $Res call(
      {List<SplitBillShare> shares,
      double totalDistributedNio,
      double totalDistributedUsd,
      double commercialRate});
}

/// @nodoc
class _$SplitBillResultCopyWithImpl<$Res, $Val extends SplitBillResult>
    implements $SplitBillResultCopyWith<$Res> {
  _$SplitBillResultCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shares = null,
    Object? totalDistributedNio = null,
    Object? totalDistributedUsd = null,
    Object? commercialRate = null,
  }) {
    return _then(_value.copyWith(
      shares: null == shares
          ? _value.shares
          : shares // ignore: cast_nullable_to_non_nullable
              as List<SplitBillShare>,
      totalDistributedNio: null == totalDistributedNio
          ? _value.totalDistributedNio
          : totalDistributedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalDistributedUsd: null == totalDistributedUsd
          ? _value.totalDistributedUsd
          : totalDistributedUsd // ignore: cast_nullable_to_non_nullable
              as double,
      commercialRate: null == commercialRate
          ? _value.commercialRate
          : commercialRate // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SplitBillResultImplCopyWith<$Res>
    implements $SplitBillResultCopyWith<$Res> {
  factory _$$SplitBillResultImplCopyWith(_$SplitBillResultImpl value,
          $Res Function(_$SplitBillResultImpl) then) =
      __$$SplitBillResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {List<SplitBillShare> shares,
      double totalDistributedNio,
      double totalDistributedUsd,
      double commercialRate});
}

/// @nodoc
class __$$SplitBillResultImplCopyWithImpl<$Res>
    extends _$SplitBillResultCopyWithImpl<$Res, _$SplitBillResultImpl>
    implements _$$SplitBillResultImplCopyWith<$Res> {
  __$$SplitBillResultImplCopyWithImpl(
      _$SplitBillResultImpl _value, $Res Function(_$SplitBillResultImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? shares = null,
    Object? totalDistributedNio = null,
    Object? totalDistributedUsd = null,
    Object? commercialRate = null,
  }) {
    return _then(_$SplitBillResultImpl(
      shares: null == shares
          ? _value._shares
          : shares // ignore: cast_nullable_to_non_nullable
              as List<SplitBillShare>,
      totalDistributedNio: null == totalDistributedNio
          ? _value.totalDistributedNio
          : totalDistributedNio // ignore: cast_nullable_to_non_nullable
              as double,
      totalDistributedUsd: null == totalDistributedUsd
          ? _value.totalDistributedUsd
          : totalDistributedUsd // ignore: cast_nullable_to_non_nullable
              as double,
      commercialRate: null == commercialRate
          ? _value.commercialRate
          : commercialRate // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$SplitBillResultImpl extends _SplitBillResult {
  const _$SplitBillResultImpl(
      {required final List<SplitBillShare> shares,
      required this.totalDistributedNio,
      required this.totalDistributedUsd,
      required this.commercialRate})
      : _shares = shares,
        super._();

  factory _$SplitBillResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$SplitBillResultImplFromJson(json);

  final List<SplitBillShare> _shares;
  @override
  List<SplitBillShare> get shares {
    if (_shares is EqualUnmodifiableListView) return _shares;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_shares);
  }

  @override
  final double totalDistributedNio;
  @override
  final double totalDistributedUsd;
  @override
  final double commercialRate;

  @override
  String toString() {
    return 'SplitBillResult(shares: $shares, totalDistributedNio: $totalDistributedNio, totalDistributedUsd: $totalDistributedUsd, commercialRate: $commercialRate)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SplitBillResultImpl &&
            const DeepCollectionEquality().equals(other._shares, _shares) &&
            (identical(other.totalDistributedNio, totalDistributedNio) ||
                other.totalDistributedNio == totalDistributedNio) &&
            (identical(other.totalDistributedUsd, totalDistributedUsd) ||
                other.totalDistributedUsd == totalDistributedUsd) &&
            (identical(other.commercialRate, commercialRate) ||
                other.commercialRate == commercialRate));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      const DeepCollectionEquality().hash(_shares),
      totalDistributedNio,
      totalDistributedUsd,
      commercialRate);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SplitBillResultImplCopyWith<_$SplitBillResultImpl> get copyWith =>
      __$$SplitBillResultImplCopyWithImpl<_$SplitBillResultImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SplitBillResultImplToJson(
      this,
    );
  }
}

abstract class _SplitBillResult extends SplitBillResult {
  const factory _SplitBillResult(
      {required final List<SplitBillShare> shares,
      required final double totalDistributedNio,
      required final double totalDistributedUsd,
      required final double commercialRate}) = _$SplitBillResultImpl;
  const _SplitBillResult._() : super._();

  factory _SplitBillResult.fromJson(Map<String, dynamic> json) =
      _$SplitBillResultImpl.fromJson;

  @override
  List<SplitBillShare> get shares;
  @override
  double get totalDistributedNio;
  @override
  double get totalDistributedUsd;
  @override
  double get commercialRate;
  @override
  @JsonKey(ignore: true)
  _$$SplitBillResultImplCopyWith<_$SplitBillResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
