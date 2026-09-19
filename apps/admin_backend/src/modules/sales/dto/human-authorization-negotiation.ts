/**
 * Transport parsing for the OHAC delivery negotiation (design §11.4
 * decision 25). Negotiation travels as query parameters, so this module turns
 * the raw strings into the typed input the negotiation service consumes and
 * decides nothing about eligibility itself.
 *
 * The distinction that matters: an **absent** negotiated build means the
 * client never opted in and the authorization member is omitted entirely,
 * while a **present but empty** build means the client opted in and cannot be
 * served, which the negotiation service answers with an explicit upgrade
 * status. Reporting an empty string as absent would silently turn an opted-in
 * client into a legacy one.
 */
export interface ParsedHumanAuthorizationNegotiation {
  readonly posBuild?: string;
  readonly supportedPolicySchemas?: readonly string[];
  readonly supportedAssertionSchemas?: readonly string[];
  readonly localFloorSequence?: string;
}

export interface HumanAuthorizationNegotiationQuery {
  readonly ohacPosBuild?: string;
  readonly ohacPolicySchemas?: string;
  readonly ohacAssertionSchemas?: string;
  readonly ohacFloorSequence?: string;
}

/**
 * Splits a comma-separated query list into trimmed, non-empty entries.
 * Returns `undefined` when the parameter was not sent at all, so the caller
 * can tell "sent nothing" from "sent an empty list" — the negotiation service
 * treats both as unsupported, but the distinction stays visible here rather
 * than being decided by an accident of splitting.
 */
const parseList = (raw: string | undefined): readonly string[] | undefined => {
  if (raw === undefined) return undefined;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const parseHumanAuthorizationNegotiation = (
  query: HumanAuthorizationNegotiationQuery,
): ParsedHumanAuthorizationNegotiation => ({
  posBuild: query.ohacPosBuild,
  supportedPolicySchemas: parseList(query.ohacPolicySchemas),
  supportedAssertionSchemas: parseList(query.ohacAssertionSchemas),
  localFloorSequence: query.ohacFloorSequence?.trim() || undefined,
});
