// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'kitchen_order.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

KitchenOrder _$KitchenOrderFromJson(Map<String, dynamic> json) {
  return _KitchenOrder.fromJson(json);
}

/// @nodoc
mixin _$KitchenOrder {
  String get id => throw _privateConstructorUsedError;
  String get ticketId => throw _privateConstructorUsedError;
  String? get tableNumber => throw _privateConstructorUsedError;
  String? get tableName => throw _privateConstructorUsedError;
  String? get waiterName => throw _privateConstructorUsedError;
  String get station => throw _privateConstructorUsedError;
  String get status => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime? get startedAt => throw _privateConstructorUsedError;
  DateTime? get readyAt => throw _privateConstructorUsedError;
  DateTime? get servedAt => throw _privateConstructorUsedError;
  String? get notes => throw _privateConstructorUsedError;
  List<KitchenOrderItem> get items => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $KitchenOrderCopyWith<KitchenOrder> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $KitchenOrderCopyWith<$Res> {
  factory $KitchenOrderCopyWith(
          KitchenOrder value, $Res Function(KitchenOrder) then) =
      _$KitchenOrderCopyWithImpl<$Res, KitchenOrder>;
  @useResult
  $Res call(
      {String id,
      String ticketId,
      String? tableNumber,
      String? tableName,
      String? waiterName,
      String station,
      String status,
      DateTime createdAt,
      DateTime? startedAt,
      DateTime? readyAt,
      DateTime? servedAt,
      String? notes,
      List<KitchenOrderItem> items});
}

/// @nodoc
class _$KitchenOrderCopyWithImpl<$Res, $Val extends KitchenOrder>
    implements $KitchenOrderCopyWith<$Res> {
  _$KitchenOrderCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? ticketId = null,
    Object? tableNumber = freezed,
    Object? tableName = freezed,
    Object? waiterName = freezed,
    Object? station = null,
    Object? status = null,
    Object? createdAt = null,
    Object? startedAt = freezed,
    Object? readyAt = freezed,
    Object? servedAt = freezed,
    Object? notes = freezed,
    Object? items = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      ticketId: null == ticketId
          ? _value.ticketId
          : ticketId // ignore: cast_nullable_to_non_nullable
              as String,
      tableNumber: freezed == tableNumber
          ? _value.tableNumber
          : tableNumber // ignore: cast_nullable_to_non_nullable
              as String?,
      tableName: freezed == tableName
          ? _value.tableName
          : tableName // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterName: freezed == waiterName
          ? _value.waiterName
          : waiterName // ignore: cast_nullable_to_non_nullable
              as String?,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      startedAt: freezed == startedAt
          ? _value.startedAt
          : startedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      readyAt: freezed == readyAt
          ? _value.readyAt
          : readyAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      servedAt: freezed == servedAt
          ? _value.servedAt
          : servedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      items: null == items
          ? _value.items
          : items // ignore: cast_nullable_to_non_nullable
              as List<KitchenOrderItem>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$KitchenOrderImplCopyWith<$Res>
    implements $KitchenOrderCopyWith<$Res> {
  factory _$$KitchenOrderImplCopyWith(
          _$KitchenOrderImpl value, $Res Function(_$KitchenOrderImpl) then) =
      __$$KitchenOrderImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String ticketId,
      String? tableNumber,
      String? tableName,
      String? waiterName,
      String station,
      String status,
      DateTime createdAt,
      DateTime? startedAt,
      DateTime? readyAt,
      DateTime? servedAt,
      String? notes,
      List<KitchenOrderItem> items});
}

/// @nodoc
class __$$KitchenOrderImplCopyWithImpl<$Res>
    extends _$KitchenOrderCopyWithImpl<$Res, _$KitchenOrderImpl>
    implements _$$KitchenOrderImplCopyWith<$Res> {
  __$$KitchenOrderImplCopyWithImpl(
      _$KitchenOrderImpl _value, $Res Function(_$KitchenOrderImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? ticketId = null,
    Object? tableNumber = freezed,
    Object? tableName = freezed,
    Object? waiterName = freezed,
    Object? station = null,
    Object? status = null,
    Object? createdAt = null,
    Object? startedAt = freezed,
    Object? readyAt = freezed,
    Object? servedAt = freezed,
    Object? notes = freezed,
    Object? items = null,
  }) {
    return _then(_$KitchenOrderImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      ticketId: null == ticketId
          ? _value.ticketId
          : ticketId // ignore: cast_nullable_to_non_nullable
              as String,
      tableNumber: freezed == tableNumber
          ? _value.tableNumber
          : tableNumber // ignore: cast_nullable_to_non_nullable
              as String?,
      tableName: freezed == tableName
          ? _value.tableName
          : tableName // ignore: cast_nullable_to_non_nullable
              as String?,
      waiterName: freezed == waiterName
          ? _value.waiterName
          : waiterName // ignore: cast_nullable_to_non_nullable
              as String?,
      station: null == station
          ? _value.station
          : station // ignore: cast_nullable_to_non_nullable
              as String,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      startedAt: freezed == startedAt
          ? _value.startedAt
          : startedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      readyAt: freezed == readyAt
          ? _value.readyAt
          : readyAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      servedAt: freezed == servedAt
          ? _value.servedAt
          : servedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      items: null == items
          ? _value._items
          : items // ignore: cast_nullable_to_non_nullable
              as List<KitchenOrderItem>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$KitchenOrderImpl implements _KitchenOrder {
  const _$KitchenOrderImpl(
      {required this.id,
      required this.ticketId,
      this.tableNumber,
      this.tableName,
      this.waiterName,
      this.station = 'COCINA',
      this.status = 'PENDIENTE',
      required this.createdAt,
      this.startedAt,
      this.readyAt,
      this.servedAt,
      this.notes,
      final List<KitchenOrderItem> items = const []})
      : _items = items;

  factory _$KitchenOrderImpl.fromJson(Map<String, dynamic> json) =>
      _$$KitchenOrderImplFromJson(json);

  @override
  final String id;
  @override
  final String ticketId;
  @override
  final String? tableNumber;
  @override
  final String? tableName;
  @override
  final String? waiterName;
  @override
  @JsonKey()
  final String station;
  @override
  @JsonKey()
  final String status;
  @override
  final DateTime createdAt;
  @override
  final DateTime? startedAt;
  @override
  final DateTime? readyAt;
  @override
  final DateTime? servedAt;
  @override
  final String? notes;
  final List<KitchenOrderItem> _items;
  @override
  @JsonKey()
  List<KitchenOrderItem> get items {
    if (_items is EqualUnmodifiableListView) return _items;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_items);
  }

  @override
  String toString() {
    return 'KitchenOrder(id: $id, ticketId: $ticketId, tableNumber: $tableNumber, tableName: $tableName, waiterName: $waiterName, station: $station, status: $status, createdAt: $createdAt, startedAt: $startedAt, readyAt: $readyAt, servedAt: $servedAt, notes: $notes, items: $items)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$KitchenOrderImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.ticketId, ticketId) ||
                other.ticketId == ticketId) &&
            (identical(other.tableNumber, tableNumber) ||
                other.tableNumber == tableNumber) &&
            (identical(other.tableName, tableName) ||
                other.tableName == tableName) &&
            (identical(other.waiterName, waiterName) ||
                other.waiterName == waiterName) &&
            (identical(other.station, station) || other.station == station) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.startedAt, startedAt) ||
                other.startedAt == startedAt) &&
            (identical(other.readyAt, readyAt) || other.readyAt == readyAt) &&
            (identical(other.servedAt, servedAt) ||
                other.servedAt == servedAt) &&
            (identical(other.notes, notes) || other.notes == notes) &&
            const DeepCollectionEquality().equals(other._items, _items));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      ticketId,
      tableNumber,
      tableName,
      waiterName,
      station,
      status,
      createdAt,
      startedAt,
      readyAt,
      servedAt,
      notes,
      const DeepCollectionEquality().hash(_items));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$KitchenOrderImplCopyWith<_$KitchenOrderImpl> get copyWith =>
      __$$KitchenOrderImplCopyWithImpl<_$KitchenOrderImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$KitchenOrderImplToJson(
      this,
    );
  }
}

abstract class _KitchenOrder implements KitchenOrder {
  const factory _KitchenOrder(
      {required final String id,
      required final String ticketId,
      final String? tableNumber,
      final String? tableName,
      final String? waiterName,
      final String station,
      final String status,
      required final DateTime createdAt,
      final DateTime? startedAt,
      final DateTime? readyAt,
      final DateTime? servedAt,
      final String? notes,
      final List<KitchenOrderItem> items}) = _$KitchenOrderImpl;

  factory _KitchenOrder.fromJson(Map<String, dynamic> json) =
      _$KitchenOrderImpl.fromJson;

  @override
  String get id;
  @override
  String get ticketId;
  @override
  String? get tableNumber;
  @override
  String? get tableName;
  @override
  String? get waiterName;
  @override
  String get station;
  @override
  String get status;
  @override
  DateTime get createdAt;
  @override
  DateTime? get startedAt;
  @override
  DateTime? get readyAt;
  @override
  DateTime? get servedAt;
  @override
  String? get notes;
  @override
  List<KitchenOrderItem> get items;
  @override
  @JsonKey(ignore: true)
  _$$KitchenOrderImplCopyWith<_$KitchenOrderImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
