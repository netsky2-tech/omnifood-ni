import 'package:freezed_annotation/freezed_annotation.dart';
import '../config/tenant_operation_mode.dart';

part 'fulfillment_contracts.freezed.dart';
part 'fulfillment_contracts.g.dart';

const generalDispatchStation = 'general-dispatch';

enum InventoryPolicy { recipeBom, directStock, notTracked }

enum FulfillmentChannel { print, kds }

enum FulfillmentAction { prepare, directHandoff }

enum PrintDocumentKind { receipt, ticket }

enum PrintAttemptState { pending, printing, printed, failed, uncertain }

enum PrintOutcome {
  succeeded,
  preSendFailure,
  postSendDisconnect,
  responseLoss,
}

extension InventoryPolicyRules on InventoryPolicy {
  bool get requiresDirectStockLink => this == InventoryPolicy.directStock;
}

@freezed
class FulfillmentTopology with _$FulfillmentTopology {
  const factory FulfillmentTopology({
    required String tenantId,
    required int contractVersion,
    required int revision,
    required TenantOperationMode operationMode,
    required Set<FulfillmentChannel> channels,
  }) = _FulfillmentTopology;

  factory FulfillmentTopology.fromJson(Map<String, dynamic> json) =>
      _$FulfillmentTopologyFromJson(json);
}

@freezed
class DgiInvoiceIdentity with _$DgiInvoiceIdentity {
  const DgiInvoiceIdentity._();

  const factory DgiInvoiceIdentity({
    required String invoiceId,
    required String invoiceNumber,
    @Default(false) bool isCanceled,
  }) = _DgiInvoiceIdentity;

  factory DgiInvoiceIdentity.fromJson(Map<String, dynamic> json) =>
      _$DgiInvoiceIdentityFromJson(json);

  DgiInvoiceIdentity cancel() => copyWith(isCanceled: true);
}

@freezed
class RouteProfile with _$RouteProfile {
  const RouteProfile._();

  const factory RouteProfile({
    required FulfillmentAction action,
    required String station,
    int? revision,
  }) = _RouteProfile;

  factory RouteProfile.prepare(String station, {int? revision}) => RouteProfile(
    action: FulfillmentAction.prepare,
    station: station,
    revision: revision,
  );
  factory RouteProfile.directHandoff(String station, {int? revision}) =>
      RouteProfile(
        action: FulfillmentAction.directHandoff,
        station: station,
        revision: revision,
      );
  factory RouteProfile.fromJson(Map<String, dynamic> json) =>
      _$RouteProfileFromJson(json);
}

@freezed
class FulfillmentLine with _$FulfillmentLine {
  const factory FulfillmentLine({required String id, RouteProfile? profile}) =
      _FulfillmentLine;

  factory FulfillmentLine.fromJson(Map<String, dynamic> json) =>
      _$FulfillmentLineFromJson(json);
}

@freezed
class RoutedFulfillmentLine with _$RoutedFulfillmentLine {
  const factory RoutedFulfillmentLine({
    required String id,
    required FulfillmentAction action,
    required String station,
  }) = _RoutedFulfillmentLine;

  factory RoutedFulfillmentLine.fromJson(Map<String, dynamic> json) =>
      _$RoutedFulfillmentLineFromJson(json);
}

@freezed
class ConfigurationAlert with _$ConfigurationAlert {
  const factory ConfigurationAlert({required String lineId}) =
      _ConfigurationAlert;

  factory ConfigurationAlert.fromJson(Map<String, dynamic> json) =>
      _$ConfigurationAlertFromJson(json);
}

@freezed
class RoutingResult with _$RoutingResult {
  const RoutingResult._();

  const factory RoutingResult({
    required List<RoutedFulfillmentLine> lines,
    required List<ConfigurationAlert> alerts,
  }) = _RoutingResult;

  factory RoutingResult.fromJson(Map<String, dynamic> json) =>
      _$RoutingResultFromJson(json);

  bool get blocksOfflineSale => false;
}

@freezed
class PrintJob with _$PrintJob {
  const factory PrintJob({
    required int sequence,
    required PrintDocumentKind kind,
  }) = _PrintJob;

  factory PrintJob.fromJson(Map<String, dynamic> json) =>
      _$PrintJobFromJson(json);
}

@freezed
class PrintPlan with _$PrintPlan {
  const PrintPlan._();

  const factory PrintPlan({required List<PrintJob> jobs}) = _PrintPlan;

  factory PrintPlan.fromJson(Map<String, dynamic> json) =>
      _$PrintPlanFromJson(json);

  bool get isOrdered =>
      jobs.length == 2 &&
      jobs[0].sequence == 0 &&
      jobs[0].kind == PrintDocumentKind.receipt &&
      jobs[1].sequence == 1 &&
      jobs[1].kind == PrintDocumentKind.ticket;
}

@freezed
class PrintTransition with _$PrintTransition {
  const PrintTransition._();

  const factory PrintTransition({
    required PrintAttemptState state,
    required bool canRetry,
  }) = _PrintTransition;

  factory PrintTransition.fromJson(Map<String, dynamic> json) =>
      _$PrintTransitionFromJson(json);

  bool get createsBusinessEffect => false;
}

class FulfillmentRoutingPolicy {
  const FulfillmentRoutingPolicy();

  RoutingResult route({
    required List<FulfillmentLine> lines,
    required int acceptedRevision,
  }) {
    final alerts = <ConfigurationAlert>[];
    final routed = lines
        .map((line) {
          final profile = line.profile;
          final invalid =
              profile == null ||
              profile.station.trim().isEmpty ||
              (profile.revision != null &&
                  profile.revision! < acceptedRevision);
          if (invalid) {
            alerts.add(ConfigurationAlert(lineId: line.id));
            return RoutedFulfillmentLine(
              id: line.id,
              action: FulfillmentAction.directHandoff,
              station: generalDispatchStation,
            );
          }
          return RoutedFulfillmentLine(
            id: line.id,
            action: profile.action,
            station: profile.station,
          );
        })
        .toList(growable: false);
    return RoutingResult(lines: routed, alerts: alerts);
  }
}

class PrintOutcomePolicy {
  const PrintOutcomePolicy();

  PrintTransition apply(PrintJob job, PrintOutcome outcome) {
    switch (outcome) {
      case PrintOutcome.succeeded:
        return const PrintTransition(
          state: PrintAttemptState.printed,
          canRetry: false,
        );
      case PrintOutcome.preSendFailure:
        return const PrintTransition(
          state: PrintAttemptState.failed,
          canRetry: true,
        );
      case PrintOutcome.postSendDisconnect:
      case PrintOutcome.responseLoss:
        return const PrintTransition(
          state: PrintAttemptState.uncertain,
          canRetry: false,
        );
    }
  }
}
