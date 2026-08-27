// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'waiter_settlement_service.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$WaiterSettlementReportImpl _$$WaiterSettlementReportImplFromJson(
        Map<String, dynamic> json) =>
    _$WaiterSettlementReportImpl(
      shiftId: json['shiftId'] as String,
      waiterUserId: json['waiterUserId'] as String,
      totalSalesNio: (json['totalSalesNio'] as num).toDouble(),
      totalCashCollectedNio: (json['totalCashCollectedNio'] as num).toDouble(),
      totalCardCollectedNio: (json['totalCardCollectedNio'] as num).toDouble(),
      totalTransferCollectedNio:
          (json['totalTransferCollectedNio'] as num).toDouble(),
      totalTipsCollectedNio: (json['totalTipsCollectedNio'] as num).toDouble(),
      invoicesCount: json['invoicesCount'] as int,
      openTablesCount: json['openTablesCount'] as int,
      openTableNames: (json['openTableNames'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const <String>[],
    );

Map<String, dynamic> _$$WaiterSettlementReportImplToJson(
        _$WaiterSettlementReportImpl instance) =>
    <String, dynamic>{
      'shiftId': instance.shiftId,
      'waiterUserId': instance.waiterUserId,
      'totalSalesNio': instance.totalSalesNio,
      'totalCashCollectedNio': instance.totalCashCollectedNio,
      'totalCardCollectedNio': instance.totalCardCollectedNio,
      'totalTransferCollectedNio': instance.totalTransferCollectedNio,
      'totalTipsCollectedNio': instance.totalTipsCollectedNio,
      'invoicesCount': instance.invoicesCount,
      'openTablesCount': instance.openTablesCount,
      'openTableNames': instance.openTableNames,
    };
