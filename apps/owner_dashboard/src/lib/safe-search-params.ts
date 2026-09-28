import { useSearchParams } from "react-router-dom";

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

const FALLBACK_PARAMS = new URLSearchParams();
const NOOP_SET_SEARCH_PARAMS: SetSearchParams = () => {};

/**
 * Safe wrapper around useSearchParams that degrades gracefully when rendered
 * outside of a React Router <Router> context (e.g. in isolated unit tests).
 */
export function useSafeSearchParams(): [URLSearchParams, SetSearchParams] {
  try {
    // oxlint-disable-next-line react-hooks/rules-of-hooks
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSearchParams();
  } catch {
    return [
      typeof window !== "undefined" && window.location?.search
        ? new URLSearchParams(window.location.search)
        : FALLBACK_PARAMS,
      NOOP_SET_SEARCH_PARAMS,
    ];
  }
}
