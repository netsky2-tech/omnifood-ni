// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'printer_config.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PrinterConfigImpl _$$PrinterConfigImplFromJson(Map<String, dynamic> json) =>
    _$PrinterConfigImpl(
      driverType:
          $enumDecodeNullable(_$PrinterDriverTypeEnumMap, json['driverType']) ??
              PrinterDriverType.sunmiV2s,
      autoPrintInvoice: json['autoPrintInvoice'] as bool? ?? true,
      autoPrintKitchen: json['autoPrintKitchen'] as bool? ?? false,
      openDrawerOnCash: json['openDrawerOnCash'] as bool? ?? true,
      paperWidthMm: json['paperWidthMm'] as int? ?? 58,
      networkIp: json['networkIp'] as String?,
      networkPort: json['networkPort'] as int? ?? 9100,
      copies: json['copies'] as int? ?? 1,
      headerBusinessName:
          json['headerBusinessName'] as String? ?? 'OMNIFOOD NI',
      headerRuc: json['headerRuc'] as String?,
      headerAddress: json['headerAddress'] as String?,
      headerPhone: json['headerPhone'] as String?,
    );

Map<String, dynamic> _$$PrinterConfigImplToJson(_$PrinterConfigImpl instance) =>
    <String, dynamic>{
      'driverType': _$PrinterDriverTypeEnumMap[instance.driverType]!,
      'autoPrintInvoice': instance.autoPrintInvoice,
      'autoPrintKitchen': instance.autoPrintKitchen,
      'openDrawerOnCash': instance.openDrawerOnCash,
      'paperWidthMm': instance.paperWidthMm,
      'networkIp': instance.networkIp,
      'networkPort': instance.networkPort,
      'copies': instance.copies,
      'headerBusinessName': instance.headerBusinessName,
      'headerRuc': instance.headerRuc,
      'headerAddress': instance.headerAddress,
      'headerPhone': instance.headerPhone,
    };

const _$PrinterDriverTypeEnumMap = {
  PrinterDriverType.sunmiV2s: 'SUNMI_V2S',
  PrinterDriverType.escPosNetwork: 'ESCPOS_NETWORK',
  PrinterDriverType.mock: 'MOCK',
};
