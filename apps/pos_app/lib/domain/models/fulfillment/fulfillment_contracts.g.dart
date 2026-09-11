// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fulfillment_contracts.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$FulfillmentTopologyImpl _$$FulfillmentTopologyImplFromJson(
        Map<String, dynamic> json) =>
    _$FulfillmentTopologyImpl(
      tenantId: json['tenantId'] as String,
      contractVersion: json['contractVersion'] as int,
      revision: json['revision'] as int,
      operationMode:
          $enumDecode(_$TenantOperationModeEnumMap, json['operationMode']),
      channels: (json['channels'] as List<dynamic>)
          .map((e) => $enumDecode(_$FulfillmentChannelEnumMap, e))
          .toSet(),
    );

Map<String, dynamic> _$$FulfillmentTopologyImplToJson(
        _$FulfillmentTopologyImpl instance) =>
    <String, dynamic>{
      'tenantId': instance.tenantId,
      'contractVersion': instance.contractVersion,
      'revision': instance.revision,
      'operationMode': _$TenantOperationModeEnumMap[instance.operationMode]!,
      'channels': instance.channels
          .map((e) => _$FulfillmentChannelEnumMap[e]!)
          .toList(),
    };

const _$TenantOperationModeEnumMap = {
  TenantOperationMode.foodparkQsr: 'FOODPARK_QSR',
  TenantOperationMode.restaurant: 'RESTAURANT',
  TenantOperationMode.hybrid: 'HYBRID',
};

const _$FulfillmentChannelEnumMap = {
  FulfillmentChannel.print: 'print',
  FulfillmentChannel.kds: 'kds',
};

_$DgiInvoiceIdentityImpl _$$DgiInvoiceIdentityImplFromJson(
        Map<String, dynamic> json) =>
    _$DgiInvoiceIdentityImpl(
      invoiceId: json['invoiceId'] as String,
      invoiceNumber: json['invoiceNumber'] as String,
      isCanceled: json['isCanceled'] as bool? ?? false,
    );

Map<String, dynamic> _$$DgiInvoiceIdentityImplToJson(
        _$DgiInvoiceIdentityImpl instance) =>
    <String, dynamic>{
      'invoiceId': instance.invoiceId,
      'invoiceNumber': instance.invoiceNumber,
      'isCanceled': instance.isCanceled,
    };

_$RouteProfileImpl _$$RouteProfileImplFromJson(Map<String, dynamic> json) =>
    _$RouteProfileImpl(
      action: $enumDecode(_$FulfillmentActionEnumMap, json['action']),
      station: json['station'] as String,
      revision: json['revision'] as int?,
    );

Map<String, dynamic> _$$RouteProfileImplToJson(_$RouteProfileImpl instance) =>
    <String, dynamic>{
      'action': _$FulfillmentActionEnumMap[instance.action]!,
      'station': instance.station,
      'revision': instance.revision,
    };

const _$FulfillmentActionEnumMap = {
  FulfillmentAction.prepare: 'prepare',
  FulfillmentAction.directHandoff: 'directHandoff',
};

_$FulfillmentLineImpl _$$FulfillmentLineImplFromJson(
        Map<String, dynamic> json) =>
    _$FulfillmentLineImpl(
      id: json['id'] as String,
      profile: json['profile'] == null
          ? null
          : RouteProfile.fromJson(json['profile'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$$FulfillmentLineImplToJson(
        _$FulfillmentLineImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'profile': instance.profile,
    };

_$RoutedFulfillmentLineImpl _$$RoutedFulfillmentLineImplFromJson(
        Map<String, dynamic> json) =>
    _$RoutedFulfillmentLineImpl(
      id: json['id'] as String,
      action: $enumDecode(_$FulfillmentActionEnumMap, json['action']),
      station: json['station'] as String,
    );

Map<String, dynamic> _$$RoutedFulfillmentLineImplToJson(
        _$RoutedFulfillmentLineImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'action': _$FulfillmentActionEnumMap[instance.action]!,
      'station': instance.station,
    };

_$ConfigurationAlertImpl _$$ConfigurationAlertImplFromJson(
        Map<String, dynamic> json) =>
    _$ConfigurationAlertImpl(
      lineId: json['lineId'] as String,
    );

Map<String, dynamic> _$$ConfigurationAlertImplToJson(
        _$ConfigurationAlertImpl instance) =>
    <String, dynamic>{
      'lineId': instance.lineId,
    };

_$RoutingResultImpl _$$RoutingResultImplFromJson(Map<String, dynamic> json) =>
    _$RoutingResultImpl(
      lines: (json['lines'] as List<dynamic>)
          .map((e) => RoutedFulfillmentLine.fromJson(e as Map<String, dynamic>))
          .toList(),
      alerts: (json['alerts'] as List<dynamic>)
          .map((e) => ConfigurationAlert.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$RoutingResultImplToJson(_$RoutingResultImpl instance) =>
    <String, dynamic>{
      'lines': instance.lines,
      'alerts': instance.alerts,
    };

_$PrintJobImpl _$$PrintJobImplFromJson(Map<String, dynamic> json) =>
    _$PrintJobImpl(
      sequence: json['sequence'] as int,
      kind: $enumDecode(_$PrintDocumentKindEnumMap, json['kind']),
    );

Map<String, dynamic> _$$PrintJobImplToJson(_$PrintJobImpl instance) =>
    <String, dynamic>{
      'sequence': instance.sequence,
      'kind': _$PrintDocumentKindEnumMap[instance.kind]!,
    };

const _$PrintDocumentKindEnumMap = {
  PrintDocumentKind.receipt: 'receipt',
  PrintDocumentKind.ticket: 'ticket',
};

_$PrintPlanImpl _$$PrintPlanImplFromJson(Map<String, dynamic> json) =>
    _$PrintPlanImpl(
      jobs: (json['jobs'] as List<dynamic>)
          .map((e) => PrintJob.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$PrintPlanImplToJson(_$PrintPlanImpl instance) =>
    <String, dynamic>{
      'jobs': instance.jobs,
    };

_$PrintTransitionImpl _$$PrintTransitionImplFromJson(
        Map<String, dynamic> json) =>
    _$PrintTransitionImpl(
      state: $enumDecode(_$PrintAttemptStateEnumMap, json['state']),
      canRetry: json['canRetry'] as bool,
    );

Map<String, dynamic> _$$PrintTransitionImplToJson(
        _$PrintTransitionImpl instance) =>
    <String, dynamic>{
      'state': _$PrintAttemptStateEnumMap[instance.state]!,
      'canRetry': instance.canRetry,
    };

const _$PrintAttemptStateEnumMap = {
  PrintAttemptState.pending: 'pending',
  PrintAttemptState.printing: 'printing',
  PrintAttemptState.printed: 'printed',
  PrintAttemptState.failed: 'failed',
  PrintAttemptState.uncertain: 'uncertain',
};
