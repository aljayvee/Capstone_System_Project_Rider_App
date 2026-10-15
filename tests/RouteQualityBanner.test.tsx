import React from 'react';
import { render } from '@testing-library/react-native';
import { RouteQualityBanner, APPROXIMATE_ROUTE_TEXT } from '../src/components/RouteQualityBanner';

describe('telling the rider the route is a guess', () => {
  it('says nothing while the route is a real one', async () => {
    const view = await render(<RouteQualityBanner visible={false} reason={null} />);
    expect(view.queryByTestId('route-quality-banner')).toBeNull();
  });

  it('speaks up when the route is only approximate', async () => {
    const view = await render(<RouteQualityBanner visible reason="network" />);
    expect(view.getByTestId('route-quality-banner')).toBeTruthy();
    expect(view.getByText(APPROXIMATE_ROUTE_TEXT)).toBeTruthy();
  });

  it('takes no touches, so it cannot come between the rider and the map', async () => {
    const view = await render(<RouteQualityBanner visible reason="network" />);
    expect(view.getByTestId('route-quality-banner').props.pointerEvents).toBe('none');
  });

  it('announces itself politely rather than stealing focus mid-ride', async () => {
    const view = await render(<RouteQualityBanner visible reason="network" />);
    const el = view.getByTestId('route-quality-banner');
    expect(el.props.accessibilityRole).toBe('alert');
    expect(el.props.accessibilityLiveRegion).toBe('polite');
  });

  it('says the same thing the customer is told', () => {
    // Byte-identical to CustomerApp/src/screens/portal/TrackTab.tsx, so the two
    // apps describing the same state differently fails here rather than passing
    // review unnoticed.
    expect(APPROXIMATE_ROUTE_TEXT).toBe(
      'Showing an approximate route — road directions are unavailable right now'
    );
  });

  it('names the reason in development, where nothing else can', async () => {
    // console.warn only reaches Metro under Hermes, so on a device this line is
    // the only way to tell a rate limit from an expired session.
    const view = await render(<RouteQualityBanner visible reason="rate-limited" />);
    expect(view.getByTestId('route-quality-reason')).toBeTruthy();
  });

  it('shows no reason line when there is no reason to show', async () => {
    const view = await render(<RouteQualityBanner visible reason={null} />);
    expect(view.queryByTestId('route-quality-reason')).toBeNull();
  });
});
