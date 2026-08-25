import type { StatusStep } from "../types/rider";

export type ApiErrandStatus = "IN_TRANSIT" | "DELIVERED";

// The rider app's 4-step local UI (Traveling/At Store/Delivering/Delivered)
// is kept for rider-friendly granularity, but the backend's
// ErrandStatus enum only has IN_TRANSIT for all "in progress" states — so
// only the final Delivered transition is ever worth persisting.
export const STEP_TO_API: Record<StatusStep, ApiErrandStatus> = {
  Traveling: "IN_TRANSIT",
  "At Store": "IN_TRANSIT",
  Delivering: "IN_TRANSIT",
  Delivered: "DELIVERED",
};

// True only when the mapped API value actually changes — avoids four
// redundant identical PATCH /errands/:id/status calls for the intermediate
// local-only steps.
export function shouldPersistStatusChange(previousStep: StatusStep, nextStep: StatusStep): boolean {
  return STEP_TO_API[previousStep] !== STEP_TO_API[nextStep];
}
