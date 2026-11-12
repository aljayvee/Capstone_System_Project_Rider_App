import React, { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';
import type { MapCoordinate } from '../utils/coords';
import { bearingBetween, metresBetween } from '../utils/routeGeometry';
import { headingDelta } from '../utils/navigationCamera';
import { RiderMotion, type RiderMotionFrame } from '../utils/riderMotion';

// A blue arrow pointing north; the marker turns it to the rider's heading.
// Source and export: assets/rider-arrow.svg, scripts/export-rider-arrow.mjs.
const RIDER_ARROW = require('../../assets/rider-arrow.png');

const isHeading = (deg: number | null | undefined): deg is number =>
  typeof deg === 'number' && Number.isFinite(deg) && deg >= 0;

interface Props {
  target: MapCoordinate | null;
  route: MapCoordinate[] | null;
  headingDeg?: number | null;
  /**
   * On the road, the arrow reads its heading from the road just ahead of where
   * it is drawn, every frame, so it turns through a bend as it rides it.
   * False while the heading given is the rider's own to follow instead (the
   * phone's compass, stopped or walking). Off the road it is always the one given.
   */
  followRoad?: boolean;
  speedMps?: number | null;
  recordedAt?: number;
  stationary?: boolean;
  active?: boolean;
  /**
   * Native camera follows this visual sample, never a second GPS tween.
   * Returning true asks for another frame: the camera is still settling
   * (its zoom) though the arrow has come to rest.
   */
  onPositionChange?: (coordinate: MapCoordinate, rotation: number) => boolean | void;
}

/** One frame loop owns position and rotation. React only mounts/reseeds the pin. */
export default function GlidingRiderMarker(props: Props) {
  const { target, headingDeg, recordedAt, speedMps, stationary, active = true } = props;
  const [seed, setSeed] = useState(target);
  const initialRotation = useRef(isHeading(headingDeg) ? headingDeg : 0);
  const rotation = useRef(initialRotation.current);
  const markerRef = useRef<React.ComponentRef<typeof Marker> | null>(null);
  const motion = useRef(new RiderMotion());
  const frameRef = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const previousPosition = useRef(target);
  const latest = useRef(props);
  latest.current = props;
  const drawRef = useRef<() => void>(() => {});

  const schedule = () => {
    if (frameRef.current === null && latest.current.active !== false && latest.current.target) {
      frameRef.current = requestAnimationFrame(() => drawRef.current());
    }
  };
  /** The heading asked of the arrow: the road under it where it follows one, else the one given. */
  const askedHeading = (sample: RiderMotionFrame | null): number | null => {
    if (latest.current.followRoad !== false && sample?.roadHeading != null) return sample.roadHeading;
    return isHeading(latest.current.headingDeg) ? latest.current.headingDeg : null;
  };
  const turning = () => {
    const wanted = askedHeading(motion.current.sample(performance.now()));
    return wanted !== null && Math.abs(headingDelta(rotation.current, wanted)) > 0.1;
  };
  drawRef.current = () => {
    frameRef.current = null;
    const now = performance.now();
    const sample = motion.current.sample(now);
    if (!sample || latest.current.active === false || !latest.current.target) return;
    const dt = previousFrame.current === null ? 1 / 60 : Math.max(0, (now - previousFrame.current) / 1000);
    previousFrame.current = now;
    const previous = previousPosition.current;
    // With neither a road nor a heading given, the way it is actually moving.
    const wanted = askedHeading(sample)
      ?? (previous && metresBetween(previous, sample.coordinate) > 0.01 ? bearingBetween(previous, sample.coordinate) : rotation.current);
    // Time-based shortest-arc smoothing; heading changes never write a second,
    // conflicting native rotation. Response is the same at 30/60/90 Hz.
    const delta = headingDelta(rotation.current, wanted);
    rotation.current += Math.abs(delta) < 0.1 ? delta : delta * (1 - Math.exp(-dt / 0.15));
    const normalized = (rotation.current % 360 + 360) % 360;
    markerRef.current?.setCoordinates(sample.coordinate);
    markerRef.current?.setNativeProps({ rotation: normalized });
    previousPosition.current = sample.coordinate;
    const cameraSettling = latest.current.onPositionChange?.(sample.coordinate, normalized) === true;
    if (sample.moving || cameraSettling || Math.abs(headingDelta(rotation.current, wanted)) > 0.1) schedule();
    else previousFrame.current = null;
  };

  useEffect(() => {
    if (!target) {
      motion.current.clear();
      previousPosition.current = null;
      setSeed(null);
      return;
    }
    // A newly mounted pin has no visible previous orientation to animate from.
    if (!seed && isHeading(headingDeg)) {
      initialRotation.current = headingDeg;
      rotation.current = headingDeg;
    }
    const accepted = motion.current.push(target, {
      now: performance.now(), wallNow: Date.now(), recordedAt, speedMps, stationary, route: latest.current.route,
    });
    if (accepted) {
      const sample = motion.current.sample(performance.now());
      if (!seed || (sample && !sample.moving)) setSeed(sample?.coordinate ?? target);
      if (sample?.moving || turning() || (previousPosition.current && sample && metresBetween(previousPosition.current, sample.coordinate) > 0.01)) schedule();
    }
    // Route/compass identity refreshes do not restart positional movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.latitude, target?.longitude, recordedAt, speedMps, stationary]);

  useEffect(() => {
    if (!active || !target) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrame.current = null;
    } else if (motion.current.sample(performance.now())?.moving || turning()) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, headingDeg, props.followRoad, !!target]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  if (!target || !seed) return null;
  return (
    <Marker
      ref={markerRef}
      coordinate={seed}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={initialRotation.current}
      image={RIDER_ARROW}
      title="You"
    />
  );
}
