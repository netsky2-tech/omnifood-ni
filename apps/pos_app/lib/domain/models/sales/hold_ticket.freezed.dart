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
      throw _privateConstructorUsedError; // Customer name or table label
  List<CartItem> get items => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime? get updatedAt => throw _privateConstructorUsedError;
  String? get tableId => throw _privateConstructorUsedError;
  String? get areaId => throw _privateConstructorUsedError;
  String? get waiterId => throw _privateConstructorUsedError;
  String? get waiterName => throw _privateConstructorUsedError;
  int get guestCount => throw _privateConstructorUsedError;
  bool get isGlobalTaxExempt => throw _privateConstructorUsedError;
  int get version => throw _privateConstructorUsedError;

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
      DateTime? updatedAt,
      String? tableId,
      String? areaId,
      String? waiterId,
      String? waiterName,
      int guestCount,
      bool isGlobalTaxExempt,
      int version});
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
    Object? updatedAt = freezed,
    Object? tableId = freezed,
    Object? areaId = freezed,
    Object? waiterId = freezed,
    Object? waiterName = freezed,
    Object? guestCount = null,
    Object? isGlobalTaxExempt = null,
    Object? version = null,
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
      updatedAt: freezed == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      tableId: freezed == tableId
          ? _value.tableId
          : tableId // ignore: cast_nullable_to_non_nullable
              as String?,
      areaId: freezed == areaId
          ? _value.areaId
          : areaId // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterId: freezed == waiterId
          ? _value.waiterId
          : waiterId // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterName: freezed == waiterName
          ? _value.waiterName
          : waiterName // ignore: cast_nullable_to_non_nullable
              as String?,
      guestCount: null == guestCount
          ? _value.guestCount
          : guestCount // ignore: cast_nullable_to_non_nullable
              as int,
      isGlobalTaxExempt: null == isGlobalTaxExempt
          ? _value.isGlobalTaxExempt
          : isGlobalTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
      version: null == version
          ? _value.version
          : version // ignore: cast_nullable_to_non_nullable
              as int,
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
      DateTime? updatedAt,
      String? tableId,
      String? areaId,
      String? waiterId,
      String? waiterName,
      int guestCount,
      bool isGlobalTaxExempt,
      int version});
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
    Object? updatedAt = freezed,
    Object? tableId = freezed,
    Object? areaId = freezed,
    Object? waiterId = freezed,
    Object? waiterName = freezed,
    Object? guestCount = null,
    Object? isGlobalTaxExempt = null,
    Object? version = null,
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
      updatedAt: freezed == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      tableId: freezed == tableId
          ? _value.tableId
          : tableId // ignore: cast_nullable_to_non_nullable
              as String?,
      areaId: freezed == areaId
          ? _value.areaId
          : areaId // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterId: freezed == waiterId
          ? _value.waiterId
          : waiterId // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterName: freezed == waiterName
          ? _value.waiterName
          : waiterName // ignore: cast_nullable_to_non_nullable
              as String?,
      guestCount: null == guestCount
          ? _value.guestCount
          : guestCount // ignore: cast_nullable_to_non_nullable
              as int,
      isGlobalTaxExempt: null == isGlobalTaxExempt
          ? _value.isGlobalTaxExempt
          : isGlobalTaxExempt // ignore: cast_nullable_to_non_nullable
              as bool,
      version: null == version
          ? _value.version
          : version // ignore: cast_nullable_to_non_nullable
              as int,
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
      this.updatedAt,
      this.tableId,
      this.areaId,
      this.waiterId,
      this.waiterName,
      this.guestCount = 1,
      this.isGlobalTaxExempt = false,
      this.version = 1})
      : _items = items;

  factory _$HoldTicketImpl.fromJson(Map<String, dynamic> json) =>
      _$$HoldTicketImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
// Customer name or table label
  final List<CartItem> _items;
// Customer name or table label
  @override
  List<CartItem> get items {
    if (_items is EqualUnmodifiableListView) return _items;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_items);
  }

  @override
  final DateTime createdAt;
  @override
  final DateTime? updatedAt;
  @override
  final String? tableId;
  @override
  final String? areaId;
  @override
  final String? waiterId;
  @override
  final String? waiterName;
  @override
  @JsonKey()
  final int guestCount;
  @override
  @JsonKey()
  final bool isGlobalTaxExempt;
  @override
  @JsonKey()
  final int version;

  @override
  String toString() {
    return 'HoldTicket(id: $id, name: $name, items: $items, createdAt: $createdAt, updatedAt: $updatedAt, tableId: $tableId, areaId: $areaId, waiterId: $waiterId, waiterName: $waiterName, guestCount: $guestCount, isGlobalTaxExempt: $isGlobalTaxExempt, version: $version)';
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
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt) &&
            (identical(other.tableId, tableId) || other.tableId == tableId) &&
            (identical(other.areaId, areaId) || other.areaId == areaId) &&
            (identical(other.waiterId, waiterId) ||
                other.waiterId == waiterId) &&
            (identical(other.waiterName, waiterName) ||
                other.waiterName == waiterName) &&
            (identical(other.guestCount, guestCount) ||
                other.guestCount == guestCount) &&
            (identical(other.isGlobalTaxExempt, isGlobalTaxExempt) ||
                other.isGlobalTaxExempt == isGlobalTaxExempt) &&
            (identical(other.version, version) || other.version == version));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      name,
      const DeepCollectionEquality().hash(_items),
      createdAt,
      updatedAt,
      tableId,
      areaId,
      waiterId,
      waiterName,
      guestCount,
      isGlobalTaxExempt,
      version);

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
      final DateTime? updatedAt,
      final String? tableId,
      final String? areaId,
      final String? waiterId,
      final String? waiterName,
      final int guestCount,
      final bool isGlobalTaxExempt,
      final int version}) = _$HoldTicketImpl;

  factory _HoldTicket.fromJson(Map<String, dynamic> json) =
      _$HoldTicketImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override // Customer name or table label
  List<CartItem> get items;
  @override
  DateTime get createdAt;
  @override
  DateTime? get updatedAt;
  @override
  String? get tableId;
  @override
  String? get areaId;
  @override
  String? get waiterId;
  @override
  String? get waiterName;
  @override
  int get guestCount;
  @override
  bool get isGlobalTaxExempt;
  @override
  int get version;
  @override
  @JsonKey(ignore: true)
  _$$HoldTicketImplCopyWith<_$HoldTicketImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
