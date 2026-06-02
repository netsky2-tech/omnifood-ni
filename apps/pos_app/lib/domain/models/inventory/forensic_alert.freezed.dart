// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'forensic_alert.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ForensicAlert _$ForensicAlertFromJson(Map<String, dynamic> json) {
  return _ForensicAlert.fromJson(json);
}

/// @nodoc
mixin _$ForensicAlert {
  String get id => throw _privateConstructorUsedError;
  String get alertType => throw _privateConstructorUsedError;
  String get severity => throw _privateConstructorUsedError;
  String get message => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  Map<String, dynamic>? get metadata => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ForensicAlertCopyWith<ForensicAlert> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ForensicAlertCopyWith<$Res> {
  factory $ForensicAlertCopyWith(
          ForensicAlert value, $Res Function(ForensicAlert) then) =
      _$ForensicAlertCopyWithImpl<$Res, ForensicAlert>;
  @useResult
  $Res call(
      {String id,
      String alertType,
      String severity,
      String message,
      DateTime createdAt,
      Map<String, dynamic>? metadata});
}

/// @nodoc
class _$ForensicAlertCopyWithImpl<$Res, $Val extends ForensicAlert>
    implements $ForensicAlertCopyWith<$Res> {
  _$ForensicAlertCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? alertType = null,
    Object? severity = null,
    Object? message = null,
    Object? createdAt = null,
    Object? metadata = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      alertType: null == alertType
          ? _value.alertType
          : alertType // ignore: cast_nullable_to_non_nullable
              as String,
      severity: null == severity
          ? _value.severity
          : severity // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      metadata: freezed == metadata
          ? _value.metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ForensicAlertImplCopyWith<$Res>
    implements $ForensicAlertCopyWith<$Res> {
  factory _$$ForensicAlertImplCopyWith(
          _$ForensicAlertImpl value, $Res Function(_$ForensicAlertImpl) then) =
      __$$ForensicAlertImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String alertType,
      String severity,
      String message,
      DateTime createdAt,
      Map<String, dynamic>? metadata});
}

/// @nodoc
class __$$ForensicAlertImplCopyWithImpl<$Res>
    extends _$ForensicAlertCopyWithImpl<$Res, _$ForensicAlertImpl>
    implements _$$ForensicAlertImplCopyWith<$Res> {
  __$$ForensicAlertImplCopyWithImpl(
      _$ForensicAlertImpl _value, $Res Function(_$ForensicAlertImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? alertType = null,
    Object? severity = null,
    Object? message = null,
    Object? createdAt = null,
    Object? metadata = freezed,
  }) {
    return _then(_$ForensicAlertImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      alertType: null == alertType
          ? _value.alertType
          : alertType // ignore: cast_nullable_to_non_nullable
              as String,
      severity: null == severity
          ? _value.severity
          : severity // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      metadata: freezed == metadata
          ? _value._metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ForensicAlertImpl implements _ForensicAlert {
  const _$ForensicAlertImpl(
      {required this.id,
      required this.alertType,
      required this.severity,
      required this.message,
      required this.createdAt,
      final Map<String, dynamic>? metadata})
      : _metadata = metadata;

  factory _$ForensicAlertImpl.fromJson(Map<String, dynamic> json) =>
      _$$ForensicAlertImplFromJson(json);

  @override
  final String id;
  @override
  final String alertType;
  @override
  final String severity;
  @override
  final String message;
  @override
  final DateTime createdAt;
  final Map<String, dynamic>? _metadata;
  @override
  Map<String, dynamic>? get metadata {
    final value = _metadata;
    if (value == null) return null;
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  String toString() {
    return 'ForensicAlert(id: $id, alertType: $alertType, severity: $severity, message: $message, createdAt: $createdAt, metadata: $metadata)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ForensicAlertImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.alertType, alertType) ||
                other.alertType == alertType) &&
            (identical(other.severity, severity) ||
                other.severity == severity) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, alertType, severity, message,
      createdAt, const DeepCollectionEquality().hash(_metadata));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ForensicAlertImplCopyWith<_$ForensicAlertImpl> get copyWith =>
      __$$ForensicAlertImplCopyWithImpl<_$ForensicAlertImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ForensicAlertImplToJson(
      this,
    );
  }
}

abstract class _ForensicAlert implements ForensicAlert {
  const factory _ForensicAlert(
      {required final String id,
      required final String alertType,
      required final String severity,
      required final String message,
      required final DateTime createdAt,
      final Map<String, dynamic>? metadata}) = _$ForensicAlertImpl;

  factory _ForensicAlert.fromJson(Map<String, dynamic> json) =
      _$ForensicAlertImpl.fromJson;

  @override
  String get id;
  @override
  String get alertType;
  @override
  String get severity;
  @override
  String get message;
  @override
  DateTime get createdAt;
  @override
  Map<String, dynamic>? get metadata;
  @override
  @JsonKey(ignore: true)
  _$$ForensicAlertImplCopyWith<_$ForensicAlertImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
