import { STATUS_STEPS, type StatusStep } from '../types/rider';

/**
 * Which half of the errand the rider is in, and therefore which line the map
 * draws.
 *
 * An errand is two journeys wearing one name: a shopping run out to the pinned
 * stores, then a delivery run in to the customer. Drawing both at once — which
 * is what the maps did — shows the customer a line to their own house while the
 * rider is still queueing at the first shop, and shows the rider a route through
 * stores they have already finished.
 */
export type RoutePhase = 'shopping' | 'delivering';

/**
 * The step at which the shopping is done.
 *
 * "Delivering" is the moment the rider confirms they have everything, which is
 * exactly the customer-facing `itemsPurchasedAt` the customer app gates on. The
 * two apps therefore change colour at the same instant rather than one leading
 * the other.
 */
const FIRST_DELIVERING_STEP: StatusStep = 'Delivering';

export function routePhaseFor(status: StatusStep | null | undefined): RoutePhase {
  if (!status) return 'shopping';

  const reached = STATUS_STEPS.indexOf(status);
  const threshold = STATUS_STEPS.indexOf(FIRST_DELIVERING_STEP);

  // An unrecognised status yields -1, which reads as shopping. That is the safe
  // way round: the shopping line points at the next store, and showing it a
  // moment too long is better than promising a delivery run that has not begun.
  return reached >= threshold && reached !== -1 ? 'delivering' : 'shopping';
}
