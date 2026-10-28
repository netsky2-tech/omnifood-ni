import { api } from "@/lib/api";
import type {
  SupervisionPolicy,
  SupervisionPolicyResponse,
} from "./types";

/**
 * The tenant's supervision policy.
 *
 * `GET` returns the configured policy (or null), the default that applies
 * when there is none, and the invariant verdict. `PUT` writes the WHOLE
 * policy; a `null` body clears it so every terminal falls back to the
 * default for its operation mode.
 */
export async function fetchSupervisionPolicy(
  options?: { signal?: AbortSignal },
): Promise<SupervisionPolicyResponse> {
  return api.get<SupervisionPolicyResponse>("/supervision/policy", options);
}

export async function updateSupervisionPolicy(
  policy: SupervisionPolicy,
): Promise<SupervisionPolicyResponse> {
  return api.put<SupervisionPolicyResponse>("/supervision/policy", policy);
}

/**
 * Clears the policy: the tenant goes back to "no opinion" and every
 * terminal falls back to the default for its operation mode.
 *
 * It is its own verb on the wire (not a null body) because clearing is an
 * explicit, auditable act — and a body-less request is the only shape that
 * travels unambiguously.
 */
export async function clearSupervisionPolicy(): Promise<SupervisionPolicyResponse> {
  return api.delete<SupervisionPolicyResponse>("/supervision/policy");
}
