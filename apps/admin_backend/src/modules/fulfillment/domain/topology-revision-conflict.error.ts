export class TopologyRevisionConflictError extends Error {
  constructor(
    readonly baseRevision: number,
    readonly currentRevision: number,
  ) {
    super('Topology revision conflict');
    this.name = 'TopologyRevisionConflictError';
  }
}
