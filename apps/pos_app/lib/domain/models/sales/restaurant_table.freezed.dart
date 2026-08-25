// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'restaurant_table.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

RestaurantTable _$RestaurantTableFromJson(Map<String, dynamic> json) {
  return _RestaurantTable.fromJson(json);
}

/// @nodoc
mixin _$RestaurantTable {
  String get id => throw _privateConstructorUsedError;
  String get areaId => throw _privateConstructorUsedError;
  String get tableNumber => throw _privateConstructorUsedError;
  int get capacity => throw _privateConstructorUsedError;
  String get status =>
      throw _privateConstructorUsedError; // 'DISPONIBLE', 'OCUPADA', 'POR_COBRAR', 'RESERVADA'
  String? get currentTicketId => throw _privateConstructorUsedError;
  int? get activeGuests => throw _privateConstructorUsedError;
  DateTime? get openedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RestaurantTableCopyWith<RestaurantTable> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RestaurantTableCopyWith<$Res> {
  factory $RestaurantTableCopyWith(
          RestaurantTable value, $Res Function(RestaurantTable) then) =
      _$RestaurantTableCopyWithImpl<$Res, RestaurantTable>;
  @useResult
  $Res call(
      {String id,
      String areaId,
      String tableNumber,
      int capacity,
      String status,
      String? currentTicketId,
      int? activeGuests,
      DateTime? openedAt});
}

/// @nodoc
class _$RestaurantTableCopyWithImpl<$Res, $Val extends RestaurantTable>
    implements $RestaurantTableCopyWith<$Res> {
  _$RestaurantTableCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? areaId = null,
    Object? tableNumber = null,
    Object? capacity = null,
    Object? status = null,
    Object? currentTicketId = freezed,
    Object? activeGuests = freezed,
    Object? openedAt = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      areaId: null == areaId
          ? _value.areaId
          : areaId // ignore: cast_nullable_to_non_nullable
              as String,
      tableNumber: null == tableNumber
          ? _value.tableNumber
          : tableNumber // ignore: cast_nullable_to_non_nullable
              as String,
      capacity: null == capacity
          ? _value.capacity
          : capacity // ignore: cast_nullable_to_non_nullable
              as int,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      currentTicketId: freezed == currentTicketId
          ? _value.currentTicketId
          : currentTicketId // ignore: cast_nullable_to_non_nullable
              as String?,
      activeGuests: freezed == activeGuests
          ? _value.activeGuests
          : activeGuests // ignore: cast_nullable_to_non_nullable
              as int?,
      openedAt: freezed == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RestaurantTableImplCopyWith<$Res>
    implements $RestaurantTableCopyWith<$Res> {
  factory _$$RestaurantTableImplCopyWith(_$RestaurantTableImpl value,
          $Res Function(_$RestaurantTableImpl) then) =
      __$$RestaurantTableImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String areaId,
      String tableNumber,
      int capacity,
      String status,
      String? currentTicketId,
      int? activeGuests,
      DateTime? openedAt});
}

/// @nodoc
class __$$RestaurantTableImplCopyWithImpl<$Res>
    extends _$RestaurantTableCopyWithImpl<$Res, _$RestaurantTableImpl>
    implements _$$RestaurantTableImplCopyWith<$Res> {
  __$$RestaurantTableImplCopyWithImpl(
      _$RestaurantTableImpl _value, $Res Function(_$RestaurantTableImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? areaId = null,
    Object? tableNumber = null,
    Object? capacity = null,
    Object? status = null,
    Object? currentTicketId = freezed,
    Object? activeGuests = freezed,
    Object? openedAt = freezed,
  }) {
    return _then(_$RestaurantTableImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      areaId: null == areaId
          ? _value.areaId
          : areaId // ignore: cast_nullable_to_non_nullable
              as String,
      tableNumber: null == tableNumber
          ? _value.tableNumber
          : tableNumber // ignore: cast_nullable_to_non_nullable
              as String,
      capacity: null == capacity
          ? _value.capacity
          : capacity // ignore: cast_nullable_to_non_nullable
              as int,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      currentTicketId: freezed == currentTicketId
          ? _value.currentTicketId
          : currentTicketId // ignore: cast_nullable_to_non_nullable
              as String?,
      activeGuests: freezed == activeGuests
          ? _value.activeGuests
          : activeGuests // ignore: cast_nullable_to_non_nullable
              as int?,
      openedAt: freezed == openedAt
          ? _value.openedAt
          : openedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RestaurantTableImpl implements _RestaurantTable {
  const _$RestaurantTableImpl(
      {required this.id,
      required this.areaId,
      required this.tableNumber,
      this.capacity = 4,
      this.status = 'DISPONIBLE',
      this.currentTicketId,
      this.activeGuests,
      this.openedAt});

  factory _$RestaurantTableImpl.fromJson(Map<String, dynamic> json) =>
      _$$RestaurantTableImplFromJson(json);

  @override
  final String id;
  @override
  final String areaId;
  @override
  final String tableNumber;
  @override
  @JsonKey()
  final int capacity;
  @override
  @JsonKey()
  final String status;
// 'DISPONIBLE', 'OCUPADA', 'POR_COBRAR', 'RESERVADA'
  @override
  final String? currentTicketId;
  @override
  final int? activeGuests;
  @override
  final DateTime? openedAt;

  @override
  String toString() {
    return 'RestaurantTable(id: $id, areaId: $areaId, tableNumber: $tableNumber, capacity: $capacity, status: $status, currentTicketId: $currentTicketId, activeGuests: $activeGuests, openedAt: $openedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RestaurantTableImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.areaId, areaId) || other.areaId == areaId) &&
            (identical(other.tableNumber, tableNumber) ||
                other.tableNumber == tableNumber) &&
            (identical(other.capacity, capacity) ||
                other.capacity == capacity) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.currentTicketId, currentTicketId) ||
                other.currentTicketId == currentTicketId) &&
            (identical(other.activeGuests, activeGuests) ||
                other.activeGuests == activeGuests) &&
            (identical(other.openedAt, openedAt) ||
                other.openedAt == openedAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, areaId, tableNumber,
      capacity, status, currentTicketId, activeGuests, openedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RestaurantTableImplCopyWith<_$RestaurantTableImpl> get copyWith =>
      __$$RestaurantTableImplCopyWithImpl<_$RestaurantTableImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RestaurantTableImplToJson(
      this,
    );
  }
}

abstract class _RestaurantTable implements RestaurantTable {
  const factory _RestaurantTable(
      {required final String id,
      required final String areaId,
      required final String tableNumber,
      final int capacity,
      final String status,
      final String? currentTicketId,
      final int? activeGuests,
      final DateTime? openedAt}) = _$RestaurantTableImpl;

  factory _RestaurantTable.fromJson(Map<String, dynamic> json) =
      _$RestaurantTableImpl.fromJson;

  @override
  String get id;
  @override
  String get areaId;
  @override
  String get tableNumber;
  @override
  int get capacity;
  @override
  String get status;
  @override // 'DISPONIBLE', 'OCUPADA', 'POR_COBRAR', 'RESERVADA'
  String? get currentTicketId;
  @override
  int? get activeGuests;
  @override
  DateTime? get openedAt;
  @override
  @JsonKey(ignore: true)
  _$$RestaurantTableImplCopyWith<_$RestaurantTableImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
