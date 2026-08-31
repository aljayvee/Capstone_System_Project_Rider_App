import React, { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';
import RiderDotMarker from './RiderDotMarker';
import type { MapCoordinate } from '../utils/coords';
import {
  advanceAlongPath,
  bearingBetween,
  lerpCoordinate,
  metresBetween,
  projectOntoPath,
} from '../utils/routeGeometry';

/**
 * How long the dot takes to travel from its last drawn spot to a new fix.
 *
 * Matched to the ~2 s fix cadence the foreground watcher uses, so the dot is
 * still moving when the next fix lands and never sits waiting. Slightly longer
 * than the gap on purpose: arriving a fraction late reads as smooth, arriving
 * early reads as a stutter followed by a pause.
 */
const GLIDE_MS = 2200;

/** Above this the fix is not on the route any more — the rider has gone their own way. */
const MAX_SNAP_METERS = 40;

/** ~30 fps. Sixty would be smoother in theory and is indistinguishable here. */
const FRAME_MS = 33;

interface Props {
  /** The latest raw GPS fix. */
  target: MapCoordinate | null;
  /** The route being followed, used to glide along the road rather than across it. */
  route: MapCoordinate[] | null;
  /** Device heading when known; the direction of travel is used when it is not. */
  headingDeg?: number | null;
}

/**
 * The rider's dot, moving the way a rider moves.
 *
 * The marker used to take `coordinate={riderLocation}` straight from GPS state,
 * so it teleported every couple of seconds — the single thing that most made
 * this map look unlike the delivery apps riders use daily. Two changes fix that:
 * the dot is projected onto the route line so it sits on the carriageway instead
 * of in the buildings a raw fix wanders into, and it is interpolated between
 * fixes ALONG that line, so it follows the bend of the road rather than cutting
 * the corner.
 *
 * Self-contained on purpose. Animating at 30 fps in the parent would re-render
 * the MapView, every Marker and the Polylines on every frame.
 */
export default function GlidingRiderMarker({ target, route, headingDeg }: Props) {
  const [position, setPosition] = useState<MapCoordinate | null>(target);
  const [bearing, setBearing] = useState(0);

  const positionRef = useRef<MapCoordinate | null>(target);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!target) return;

    const from = positionRef.current;

    // First fix, or a jump too large to be travel (a cold-start fix, a rider
    // resuming across town). Snapping there beats gliding across the city.
    if (!from || metresBetween(from, target) > 500) {
      positionRef.current = target;
      setPosition(target);
      return;
    }

    const path = route && route.length > 1 ? route : null;
    const destination = (() => {
      if (!path) return target;
      const projected = projectOntoPath(target, path);
      // Off-route: the rider is on a side street the route does not use, or the
      // route is stale. Drawing them on the line would be a confident lie.
      if (!projected || projected.distanceMeters > MAX_SNAP_METERS) return target;
      return projected.point;
    })();

    const startedAt = Date.now();
    const startPoint = from;
    const startProjection = path ? projectOntoPath(startPoint, path) : null;
    const endProjection = path ? projectOntoPath(destination, path) : null;

    // Distance to cover along the road, when both ends are on it.
    const alongRoute =
      path && startProjection && endProjection && endProjection.segmentIndex >= startProjection.segmentIndex
        ? (() => {
            let total = 0;
            let cursor = startProjection.point;
            for (let i = startProjection.segmentIndex; i < endProjection.segmentIndex; i++) {
              total += metresBetween(cursor, path[i + 1]);
              cursor = path[i + 1];
            }
            return total + metresBetween(cursor, endProjection.point);
          })()
        : null;

    if (frameRef.current) clearInterval(frameRef.current);

    frameRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / GLIDE_MS);
      // Ease-out: a rider decelerating into the next fix looks natural, a linear
      // ramp that stops dead does not.
      const eased = 1 - Math.pow(1 - t, 2);

      const next =
        path && startProjection && alongRoute !== null
          ? advanceAlongPath(path, startProjection, alongRoute * eased).point
          : lerpCoordinate(startPoint, destination, eased);

      const previous = positionRef.current;
      positionRef.current = next;
      setPosition(next);

      if (previous && metresBetween(previous, next) > 0.5) {
        setBearing(bearingBetween(previous, next));
      }

      if (t >= 1 && frameRef.current) {
        clearInterval(frameRef.current);
        frameRef.current = null;
      }
    }, FRAME_MS);

    return () => {
      if (frameRef.current) {
        clearInterval(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [target?.latitude, target?.longitude, route]);

  if (!position) return null;

  return (
    <Marker
      coordinate={position}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={headingDeg ?? bearing}
      // The dot is decoration over a map the rider is reading; letting it take a
      // tap only puts a callout in the way of the road underneath.
      tracksViewChanges={false}
      title="You"
    >
      <RiderDotMarker />
    </Marker>
  );
}
