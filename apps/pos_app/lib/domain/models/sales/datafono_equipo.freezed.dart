// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'datafono_equipo.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

DatafonoEquipo _$DatafonoEquipoFromJson(Map<String, dynamic> json) {
  return _DatafonoEquipo.fromJson(json);
}

/// @nodoc
mixin _$DatafonoEquipo {
  String get id => throw _privateConstructorUsedError;
  String get nombre => throw _privateConstructorUsedError;
  String get bancoAdquirente =>
      throw _privateConstructorUsedError; // 'BAC', 'BANPRO', 'LAFISE', 'MIPOS', etc.
  String get numeroAfiliacion => throw _privateConstructorUsedError;
  String get terminalIdBanco => throw _privateConstructorUsedError;
  String get tipoConexion =>
      throw _privateConstructorUsedError; // 'AISLADO', 'LOCAL_NETWORK_TCP', 'SMART_POS_AIDL', 'MOCK'
  String? get ipAddress => throw _privateConstructorUsedError;
  int? get port => throw _privateConstructorUsedError;
  bool get activo => throw _privateConstructorUsedError;
  DateTime? get createdAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $DatafonoEquipoCopyWith<DatafonoEquipo> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DatafonoEquipoCopyWith<$Res> {
  factory $DatafonoEquipoCopyWith(
          DatafonoEquipo value, $Res Function(DatafonoEquipo) then) =
      _$DatafonoEquipoCopyWithImpl<$Res, DatafonoEquipo>;
  @useResult
  $Res call(
      {String id,
      String nombre,
      String bancoAdquirente,
      String numeroAfiliacion,
      String terminalIdBanco,
      String tipoConexion,
      String? ipAddress,
      int? port,
      bool activo,
      DateTime? createdAt});
}

/// @nodoc
class _$DatafonoEquipoCopyWithImpl<$Res, $Val extends DatafonoEquipo>
    implements $DatafonoEquipoCopyWith<$Res> {
  _$DatafonoEquipoCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? nombre = null,
    Object? bancoAdquirente = null,
    Object? numeroAfiliacion = null,
    Object? terminalIdBanco = null,
    Object? tipoConexion = null,
    Object? ipAddress = freezed,
    Object? port = freezed,
    Object? activo = null,
    Object? createdAt = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      nombre: null == nombre
          ? _value.nombre
          : nombre // ignore: cast_nullable_to_non_nullable
              as String,
      bancoAdquirente: null == bancoAdquirente
          ? _value.bancoAdquirente
          : bancoAdquirente // ignore: cast_nullable_to_non_nullable
              as String,
      numeroAfiliacion: null == numeroAfiliacion
          ? _value.numeroAfiliacion
          : numeroAfiliacion // ignore: cast_nullable_to_non_nullable
              as String,
      terminalIdBanco: null == terminalIdBanco
          ? _value.terminalIdBanco
          : terminalIdBanco // ignore: cast_nullable_to_non_nullable
              as String,
      tipoConexion: null == tipoConexion
          ? _value.tipoConexion
          : tipoConexion // ignore: cast_nullable_to_non_nullable
              as String,
      ipAddress: freezed == ipAddress
          ? _value.ipAddress
          : ipAddress // ignore: cast_nullable_to_non_nullable
              as String?,
      port: freezed == port
          ? _value.port
          : port // ignore: cast_nullable_to_non_nullable
              as int?,
      activo: null == activo
          ? _value.activo
          : activo // ignore: cast_nullable_to_non_nullable
              as bool,
      createdAt: freezed == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$DatafonoEquipoImplCopyWith<$Res>
    implements $DatafonoEquipoCopyWith<$Res> {
  factory _$$DatafonoEquipoImplCopyWith(_$DatafonoEquipoImpl value,
          $Res Function(_$DatafonoEquipoImpl) then) =
      __$$DatafonoEquipoImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String nombre,
      String bancoAdquirente,
      String numeroAfiliacion,
      String terminalIdBanco,
      String tipoConexion,
      String? ipAddress,
      int? port,
      bool activo,
      DateTime? createdAt});
}

/// @nodoc
class __$$DatafonoEquipoImplCopyWithImpl<$Res>
    extends _$DatafonoEquipoCopyWithImpl<$Res, _$DatafonoEquipoImpl>
    implements _$$DatafonoEquipoImplCopyWith<$Res> {
  __$$DatafonoEquipoImplCopyWithImpl(
      _$DatafonoEquipoImpl _value, $Res Function(_$DatafonoEquipoImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? nombre = null,
    Object? bancoAdquirente = null,
    Object? numeroAfiliacion = null,
    Object? terminalIdBanco = null,
    Object? tipoConexion = null,
    Object? ipAddress = freezed,
    Object? port = freezed,
    Object? activo = null,
    Object? createdAt = freezed,
  }) {
    return _then(_$DatafonoEquipoImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      nombre: null == nombre
          ? _value.nombre
          : nombre // ignore: cast_nullable_to_non_nullable
              as String,
      bancoAdquirente: null == bancoAdquirente
          ? _value.bancoAdquirente
          : bancoAdquirente // ignore: cast_nullable_to_non_nullable
              as String,
      numeroAfiliacion: null == numeroAfiliacion
          ? _value.numeroAfiliacion
          : numeroAfiliacion // ignore: cast_nullable_to_non_nullable
              as String,
      terminalIdBanco: null == terminalIdBanco
          ? _value.terminalIdBanco
          : terminalIdBanco // ignore: cast_nullable_to_non_nullable
              as String,
      tipoConexion: null == tipoConexion
          ? _value.tipoConexion
          : tipoConexion // ignore: cast_nullable_to_non_nullable
              as String,
      ipAddress: freezed == ipAddress
          ? _value.ipAddress
          : ipAddress // ignore: cast_nullable_to_non_nullable
              as String?,
      port: freezed == port
          ? _value.port
          : port // ignore: cast_nullable_to_non_nullable
              as int?,
      activo: null == activo
          ? _value.activo
          : activo // ignore: cast_nullable_to_non_nullable
              as bool,
      createdAt: freezed == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$DatafonoEquipoImpl implements _DatafonoEquipo {
  const _$DatafonoEquipoImpl(
      {required this.id,
      required this.nombre,
      required this.bancoAdquirente,
      required this.numeroAfiliacion,
      required this.terminalIdBanco,
      this.tipoConexion = 'AISLADO',
      this.ipAddress,
      this.port,
      this.activo = true,
      this.createdAt});

  factory _$DatafonoEquipoImpl.fromJson(Map<String, dynamic> json) =>
      _$$DatafonoEquipoImplFromJson(json);

  @override
  final String id;
  @override
  final String nombre;
  @override
  final String bancoAdquirente;
// 'BAC', 'BANPRO', 'LAFISE', 'MIPOS', etc.
  @override
  final String numeroAfiliacion;
  @override
  final String terminalIdBanco;
  @override
  @JsonKey()
  final String tipoConexion;
// 'AISLADO', 'LOCAL_NETWORK_TCP', 'SMART_POS_AIDL', 'MOCK'
  @override
  final String? ipAddress;
  @override
  final int? port;
  @override
  @JsonKey()
  final bool activo;
  @override
  final DateTime? createdAt;

  @override
  String toString() {
    return 'DatafonoEquipo(id: $id, nombre: $nombre, bancoAdquirente: $bancoAdquirente, numeroAfiliacion: $numeroAfiliacion, terminalIdBanco: $terminalIdBanco, tipoConexion: $tipoConexion, ipAddress: $ipAddress, port: $port, activo: $activo, createdAt: $createdAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DatafonoEquipoImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.nombre, nombre) || other.nombre == nombre) &&
            (identical(other.bancoAdquirente, bancoAdquirente) ||
                other.bancoAdquirente == bancoAdquirente) &&
            (identical(other.numeroAfiliacion, numeroAfiliacion) ||
                other.numeroAfiliacion == numeroAfiliacion) &&
            (identical(other.terminalIdBanco, terminalIdBanco) ||
                other.terminalIdBanco == terminalIdBanco) &&
            (identical(other.tipoConexion, tipoConexion) ||
                other.tipoConexion == tipoConexion) &&
            (identical(other.ipAddress, ipAddress) ||
                other.ipAddress == ipAddress) &&
            (identical(other.port, port) || other.port == port) &&
            (identical(other.activo, activo) || other.activo == activo) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      nombre,
      bancoAdquirente,
      numeroAfiliacion,
      terminalIdBanco,
      tipoConexion,
      ipAddress,
      port,
      activo,
      createdAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$DatafonoEquipoImplCopyWith<_$DatafonoEquipoImpl> get copyWith =>
      __$$DatafonoEquipoImplCopyWithImpl<_$DatafonoEquipoImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$DatafonoEquipoImplToJson(
      this,
    );
  }
}

abstract class _DatafonoEquipo implements DatafonoEquipo {
  const factory _DatafonoEquipo(
      {required final String id,
      required final String nombre,
      required final String bancoAdquirente,
      required final String numeroAfiliacion,
      required final String terminalIdBanco,
      final String tipoConexion,
      final String? ipAddress,
      final int? port,
      final bool activo,
      final DateTime? createdAt}) = _$DatafonoEquipoImpl;

  factory _DatafonoEquipo.fromJson(Map<String, dynamic> json) =
      _$DatafonoEquipoImpl.fromJson;

  @override
  String get id;
  @override
  String get nombre;
  @override
  String get bancoAdquirente;
  @override // 'BAC', 'BANPRO', 'LAFISE', 'MIPOS', etc.
  String get numeroAfiliacion;
  @override
  String get terminalIdBanco;
  @override
  String get tipoConexion;
  @override // 'AISLADO', 'LOCAL_NETWORK_TCP', 'SMART_POS_AIDL', 'MOCK'
  String? get ipAddress;
  @override
  int? get port;
  @override
  bool get activo;
  @override
  DateTime? get createdAt;
  @override
  @JsonKey(ignore: true)
  _$$DatafonoEquipoImplCopyWith<_$DatafonoEquipoImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
