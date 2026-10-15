import { describe, expect, it } from 'vitest';
import { chooseMapStyle, lineFitsMap, type MapChoiceInput } from '../src/config/mapChoice';

/**
 * Which base map the Task tab draws. The bug: on a Huawei phone the map opened
 * as Google (Petal, there), then switched to OpenStreetMap, and Petal stayed
 * drawn under the tiles. So no map until the server says which, and then that
 * one, kept.
 */

const waiting: MapChoiceInput = {
  wanted: true,
  drawnWith: null,
  routeFailed: false,
  osmTilesUp: true,
  waitedTooLong: false,
};

describe('before anything is chosen', () => {
  it('draws no map until the server has recommended one', () => {
    expect(chooseMapStyle(null, waiting)).toBeNull();
  });

  it('draws the map the server drew the route on', () => {
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'osrm' })).toBe('osm');
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'google' })).toBe('google');
  });

  it('waits for the tile probe before choosing OpenStreetMap, rather than guess', () => {
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'osrm', osmTilesUp: null })).toBeNull();
  });

  it('chooses Google when OpenStreetMap is recommended but its tiles do not load', () => {
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'osrm', osmTilesUp: false })).toBe('google');
  });

  it('falls back to Google when no recommendation is coming', () => {
    expect(chooseMapStyle(null, { ...waiting, routeFailed: true })).toBe('google');
    expect(chooseMapStyle(null, { ...waiting, waitedTooLong: true })).toBe('google');
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'osrm', osmTilesUp: null, waitedTooLong: true })).toBe(
      'google'
    );
  });

  it('ignores an answer that names no map engine, such as a straight-line guess', () => {
    expect(chooseMapStyle(null, { ...waiting, drawnWith: 'haversine' })).toBeNull();
  });

  it('chooses nothing while no map is wanted, however long it has been', () => {
    // The Task tab is mounted from launch with no errand in hand.
    expect(chooseMapStyle(null, { ...waiting, wanted: false, waitedTooLong: true, routeFailed: true })).toBeNull();
  });
});

describe('once a map is chosen', () => {
  it('keeps it, whatever later routes are drawn on', () => {
    expect(chooseMapStyle('osm', { ...waiting, drawnWith: 'google' })).toBe('osm');
    expect(chooseMapStyle('google', { ...waiting, drawnWith: 'osrm' })).toBe('google');
  });

  it('keeps it when the map is no longer wanted', () => {
    expect(chooseMapStyle('osm', { ...waiting, wanted: false })).toBe('osm');
  });

  it('gives up OpenStreetMap only for a dead tile server, which would be a blank map', () => {
    expect(chooseMapStyle('osm', { ...waiting, osmTilesUp: false })).toBe('google');
    // Not knowing yet is not dead.
    expect(chooseMapStyle('osm', { ...waiting, osmTilesUp: null })).toBe('osm');
  });

  it('never goes back from Google for where a route was drawn', () => {
    expect(chooseMapStyle('google', { ...waiting, drawnWith: 'osrm', osmTilesUp: true })).toBe('google');
  });
});

describe('when the chosen map’s own engine cannot route', () => {
  // Its line would otherwise be the other engine's, metres beside its roads.
  it('leaves Google for OpenStreetMap, whose engine answered', () => {
    expect(chooseMapStyle('google', { ...waiting, unroutable: 'google' })).toBe('osm');
  });

  it('stays on Google when OpenStreetMap cannot be drawn either', () => {
    expect(chooseMapStyle('google', { ...waiting, unroutable: 'google', osmTilesUp: false })).toBe('google');
    expect(chooseMapStyle('google', { ...waiting, unroutable: 'google', osmTilesUp: null })).toBe('google');
  });

  it('leaves OpenStreetMap for Google when OSRM has no route', () => {
    expect(chooseMapStyle('osm', { ...waiting, unroutable: 'osrm' })).toBe('google');
  });

  it('ignores the other engine failing', () => {
    expect(chooseMapStyle('osm', { ...waiting, unroutable: 'google' })).toBe('osm');
    expect(chooseMapStyle('google', { ...waiting, unroutable: 'osrm' })).toBe('google');
  });

  it('moves only once a session, so two failing engines cannot swap maps every retry', () => {
    expect(chooseMapStyle('osm', { ...waiting, unroutable: 'osrm', leftForRouting: true })).toBe('osm');
    expect(chooseMapStyle('google', { ...waiting, unroutable: 'google', leftForRouting: true })).toBe('google');
  });

  it('still leaves a dead tile server, moved before or not', () => {
    expect(chooseMapStyle('osm', { ...waiting, osmTilesUp: false, leftForRouting: true })).toBe('google');
  });
});

describe('which lines a map takes', () => {
  it('takes only its own engine’s road lines', () => {
    expect(lineFitsMap('google', 'google', false)).toBe(true);
    expect(lineFitsMap('osm', 'osrm', false)).toBe(true);
    // The bug: OSRM's line on Google's map, beside its painted roads.
    expect(lineFitsMap('google', 'osrm', false)).toBe(false);
    expect(lineFitsMap('osm', 'google', false)).toBe(false);
  });

  it('takes a dashed straight-line guess on either, which follows no roads', () => {
    expect(lineFitsMap('google', 'haversine', true)).toBe(true);
    expect(lineFitsMap('osm', 'haversine', true)).toBe(true);
  });

  it('has nothing to refuse before a map is chosen or a line has arrived', () => {
    expect(lineFitsMap(null, 'osrm', false)).toBe(true);
    expect(lineFitsMap('google', null, false)).toBe(true);
  });
});
