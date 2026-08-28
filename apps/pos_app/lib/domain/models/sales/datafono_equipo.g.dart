// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'datafono_equipo.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DatafonoEquipoImpl _$$DatafonoEquipoImplFromJson(Map<String, dynamic> json) =>
    _$DatafonoEquipoImpl(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      bancoAdquirente: json['bancoAdquirente'] as String,
      numeroAfiliacion: json['numeroAfiliacion'] as String,
      terminalIdBanco: json['terminalIdBanco'] as String,
      tipoConexion: json['tipoConexion'] as String? ?? 'AISLADO',
      ipAddress: json['ipAddress'] as String?,
      port: json['port'] as int?,
      activo: json['activo'] as bool? ?? true,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$$DatafonoEquipoImplToJson(
        _$DatafonoEquipoImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombre': instance.nombre,
      'bancoAdquirente': instance.bancoAdquirente,
      'numeroAfiliacion': instance.numeroAfiliacion,
      'terminalIdBanco': instance.terminalIdBanco,
      'tipoConexion': instance.tipoConexion,
      'ipAddress': instance.ipAddress,
      'port': instance.port,
      'activo': instance.activo,
      'createdAt': instance.createdAt?.toIso8601String(),
    };
