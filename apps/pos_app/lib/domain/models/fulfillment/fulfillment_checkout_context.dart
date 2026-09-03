/// Immutable fulfillment identity supplied by the checkout composition root.
///
/// The repository must not derive these values from device count, mutable
/// configuration, or a network request. The following slice validates this
/// context against the cached topology before it creates fulfillment effects.
class FulfillmentCheckoutContext {
  final String tenantId;
  final String topologySnapshotId;
  final int topologyRevision;
  final String topologyHash;
  final String channel;

  const FulfillmentCheckoutContext({
    required this.tenantId,
    required this.topologySnapshotId,
    required this.topologyRevision,
    required this.topologyHash,
    required this.channel,
  });
}
