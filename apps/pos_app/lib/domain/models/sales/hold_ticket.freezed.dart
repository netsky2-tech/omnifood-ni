// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'hold_ticket.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

HoldTicket _$HoldTicketFromJson(Map<String, dynamic> json) {
  return _HoldTicket.fromJson(json);
}

/// @nodoc
mixin _$HoldTicket {
  String get id => throw _privateConstructorUsedError;
  String get name =>
      throw _privateConstructorUsedError; // Customer name or table number
  List<CartItem> get items => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  bool get isGlobalTaxExempt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $HoldTicketCopyWith<HoldTicket> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $HoldTicketCopyWith<$Res> {
  factory $HoldTicketCopyWith(
          HoldTicket value, $Res Function(HoldTicket) then) =
      _$HoldTicketCopyWithImpl<$Res, HoldTicket>;
  @useResult
  $Res call(
      {String id,
      String name,
      List<CartItem> items,
      DateTime createdAt,
      bool isGlobalTaxExempt});
}

/// @nodoc
class _$HoldTicketCopyWithImpl<$Res, $Val extends HoldTicket>
    implements $HoldTicketCopyWith<$Res> {
  _$HoldTicketCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? items = null,
    Object? createdAt = null,
    Object? isGlobalTaxExempt = null,
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
      items: null == items
          ? _value.items
          : items // ignore: cast_nullable_to_non_nullable
              as List<CartItem>,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      isGlobalTaxExempt: null == isGlobalTaxExempt
          ? _value.isGlobalTaxExempt
          : isGlobalTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$HoldTicketImplCopyWith<$Res>
    implements $HoldTicketCopyWith<$Res> {
  factory _$$HoldTicketImplCopyWith(
          _$HoldTicketImpl value, $Res Function(_$HoldTicketImpl) then) =
      __$$HoldTicketImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      List<CartItem> items,
      DateTime createdAt,
      bool isGlobalTaxExempt});
}

/// @nodoc
class __$$HoldTicketImplCopyWithImpl<$Res>
    extends _$HoldTicketCopyWithImpl<$Res, _$HoldTicketImpl>
    implements _$$HoldTicketImplCopyWith<$Res> {
  __$$HoldTicketImplCopyWithImpl(
      _$HoldTicketImpl _value, $Res Function(_$HoldTicketImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? items = null,
    Object? createdAt = null,
    Object? isGlobalTaxExempt = null,
  }) {
    return _then(_$HoldTicketImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      items: null == items
          ? _value._items
          : items // ignore: cast_nullable_to_non_nullable
              as List<CartItem>,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      isGlobalTaxExempt: null == isGlobalTaxExempt
          ? _value.isGlobalTaxExempt
          : isGlobalTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$HoldTicketImpl implements _HoldTicket {
  const _$HoldTicketImpl(
      {required this.id,
      required this.name,
      required final List<CartItem> items,
      required this.createdAt,
      this.isGlobalTaxExempt = false})
      : _items = items;

  factory _$HoldTicketImpl.fromJson(Map<String, dynamic> json) =>
      _$$HoldTicketImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
// Customer name or table number
  final List<CartItem> _items;
// Customer name or table number
  @override
  List<CartItem> get items {
    if (_items is EqualUnmodifiableListView) return _items;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_items);
  }

  @override
  final DateTime createdAt;
  @override
  @JsonKey()
  final bool isGlobalTaxExempt;

  @override
  String toString() {
    return 'HoldTicket(id: $id, name: $name, items: $items, createdAt: $createdAt, isGlobalTaxExempt: $isGlobalTaxExempt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$HoldTicketImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            const DeepCollectionEquality().equals(other._items, _items) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.isGlobalTaxExempt, isGlobalTaxExempt) ||
                other.isGlobalTaxExempt == isGlobalTaxExempt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      const DeepCollectionEquality().hash(_items),
      createdAt,
      isGlobalTaxExempt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$HoldTicketImplCopyWith<_$HoldTicketImpl> get copyWith =>
      __$$HoldTicketImplCopyWithImpl<_$HoldTicketImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$HoldTicketImplToJson(
      this,
    );
  }
}

abstract class _HoldTicket implements HoldTicket {
  const factory _HoldTicket(
      {required final String id,
      required final String name,
      required final List<CartItem> items,
      required final DateTime createdAt,
      final bool isGlobalTaxExempt}) = _$HoldTicketImpl;

  factory _HoldTicket.fromJson(Map<String, dynamic> json) =
      _$HoldTicketImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override // Customer name or table number
  List<CartItem> get items;
  @override
  DateTime get createdAt;
  @override
  bool get isGlobalTaxExempt;
  @override
  @JsonKey(ignore: true)
  _$$HoldTicketImplCopyWith<_$HoldTicketImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
