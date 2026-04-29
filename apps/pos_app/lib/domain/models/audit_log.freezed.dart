// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'audit_log.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

AuditLog _$AuditLogFromJson(Map<String, dynamic> json) {
  return _AuditLog.fromJson(json);
}

/// @nodoc
mixin _$AuditLog {
  int? get id => throw _privateConstructorUsedError;
  @JsonKey(name: 'user_id')
  String get userId => throw _privateConstructorUsedError;
  String get action => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;
  @JsonKey(name: 'device_id')
  String get deviceId => throw _privateConstructorUsedError;
  String? get metadata => throw _privateConstructorUsedError; // JSON string
  bool get isSynced => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $AuditLogCopyWith<AuditLog> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $AuditLogCopyWith<$Res> {
  factory $AuditLogCopyWith(AuditLog value, $Res Function(AuditLog) then) =
      _$AuditLogCopyWithImpl<$Res, AuditLog>;
  @useResult
  $Res call(
      {int? id,
      @JsonKey(name: 'user_id') String userId,
      String action,
      DateTime timestamp,
      @JsonKey(name: 'device_id') String deviceId,
      String? metadata,
      bool isSynced});
}

/// @nodoc
class _$AuditLogCopyWithImpl<$Res, $Val extends AuditLog>
    implements $AuditLogCopyWith<$Res> {
  _$AuditLogCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = freezed,
    Object? userId = null,
    Object? action = null,
    Object? timestamp = null,
    Object? deviceId = null,
    Object? metadata = freezed,
    Object? isSynced = null,
  }) {
    return _then(_value.copyWith(
      id: freezed == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as int?,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      deviceId: null == deviceId
          ? _value.deviceId
          : deviceId // ignore: cast_nullable_to_non_nullable
              as String,
      metadata: freezed == metadata
          ? _value.metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as String?,
      isSynced: null == isSynced
          ? _value.isSynced
          : isSynced // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$AuditLogImplCopyWith<$Res>
    implements $AuditLogCopyWith<$Res> {
  factory _$$AuditLogImplCopyWith(
          _$AuditLogImpl value, $Res Function(_$AuditLogImpl) then) =
      __$$AuditLogImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {int? id,
      @JsonKey(name: 'user_id') String userId,
      String action,
      DateTime timestamp,
      @JsonKey(name: 'device_id') String deviceId,
      String? metadata,
      bool isSynced});
}

/// @nodoc
class __$$AuditLogImplCopyWithImpl<$Res>
    extends _$AuditLogCopyWithImpl<$Res, _$AuditLogImpl>
    implements _$$AuditLogImplCopyWith<$Res> {
  __$$AuditLogImplCopyWithImpl(
      _$AuditLogImpl _value, $Res Function(_$AuditLogImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = freezed,
    Object? userId = null,
    Object? action = null,
    Object? timestamp = null,
    Object? deviceId = null,
    Object? metadata = freezed,
    Object? isSynced = null,
  }) {
    return _then(_$AuditLogImpl(
      id: freezed == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as int?,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      deviceId: null == deviceId
          ? _value.deviceId
          : deviceId // ignore: cast_nullable_to_non_nullable
              as String,
      metadata: freezed == metadata
          ? _value.metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as String?,
      isSynced: null == isSynced
          ? _value.isSynced
          : isSynced // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$AuditLogImpl implements _AuditLog {
  const _$AuditLogImpl(
      {this.id,
      @JsonKey(name: 'user_id') required this.userId,
      required this.action,
      required this.timestamp,
      @JsonKey(name: 'device_id') required this.deviceId,
      this.metadata,
      this.isSynced = false});

  factory _$AuditLogImpl.fromJson(Map<String, dynamic> json) =>
      _$$AuditLogImplFromJson(json);

  @override
  final int? id;
  @override
  @JsonKey(name: 'user_id')
  final String userId;
  @override
  final String action;
  @override
  final DateTime timestamp;
  @override
  @JsonKey(name: 'device_id')
  final String deviceId;
  @override
  final String? metadata;
// JSON string
  @override
  @JsonKey()
  final bool isSynced;

  @override
  String toString() {
    return 'AuditLog(id: $id, userId: $userId, action: $action, timestamp: $timestamp, deviceId: $deviceId, metadata: $metadata, isSynced: $isSynced)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$AuditLogImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.action, action) || other.action == action) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.deviceId, deviceId) ||
                other.deviceId == deviceId) &&
            (identical(other.metadata, metadata) ||
                other.metadata == metadata) &&
            (identical(other.isSynced, isSynced) ||
                other.isSynced == isSynced));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType, id, userId, action, timestamp, deviceId, metadata, isSynced);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$AuditLogImplCopyWith<_$AuditLogImpl> get copyWith =>
      __$$AuditLogImplCopyWithImpl<_$AuditLogImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$AuditLogImplToJson(
      this,
    );
  }
}

abstract class _AuditLog implements AuditLog {
  const factory _AuditLog(
      {final int? id,
      @JsonKey(name: 'user_id') required final String userId,
      required final String action,
      required final DateTime timestamp,
      @JsonKey(name: 'device_id') required final String deviceId,
      final String? metadata,
      final bool isSynced}) = _$AuditLogImpl;

  factory _AuditLog.fromJson(Map<String, dynamic> json) =
      _$AuditLogImpl.fromJson;

  @override
  int? get id;
  @override
  @JsonKey(name: 'user_id')
  String get userId;
  @override
  String get action;
  @override
  DateTime get timestamp;
  @override
  @JsonKey(name: 'device_id')
  String get deviceId;
  @override
  String? get metadata;
  @override // JSON string
  bool get isSynced;
  @override
  @JsonKey(ignore: true)
  _$$AuditLogImplCopyWith<_$AuditLogImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
