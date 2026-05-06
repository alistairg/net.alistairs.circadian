import { describe, it, expect } from 'vitest';
import {
  SunTools,
  SunEventSunrise,
  SunEventSunset,
  SunEventSolarNoon,
  SunEventSolarMidnight,
} from '../drivers/circadian-zone/suntools';

// London — picked because Athom HQ-ish-ish and known sunrise/sunset times
// are easy to sanity-check against published data if needed.
const LAT = 51.5074;
const LON = -0.1278;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('SunTools', () => {
  describe('constructor', () => {
    it('produces 12 events covering 3 days', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      // 4 events per day (sunrise, noon, sunset, midnight) × 3 days = 12.
      expect(sunTools.keyEvents).toHaveLength(12);
    });

    it('emits events in chronological order', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      for (let i = 1; i < sunTools.keyEvents.length; i++) {
        expect(sunTools.keyEvents[i].timestamp.getTime())
          .toBeGreaterThanOrEqual(sunTools.keyEvents[i - 1].timestamp.getTime());
      }
    });

    it('regression #24 — handles month boundaries correctly', () => {
      // The previous implementation computed dayMinusOne / dayPlusOne by
      // taking `new Date()` (today) and calling `setDate(centralDate.getDate() ± 1)`,
      // which produced wrong dates when today and centralDate were in
      // different months. This test fails on the old implementation if
      // the test is run in any month other than the same one as the
      // central date — and now passes regardless because we compute
      // ±1 day from centralDate's timestamp.
      const centralDate = new Date('2026-01-31T12:00:00Z'); // last day of January
      const sunTools = new SunTools(centralDate, LAT, LON);

      // The earliest event should be approximately 24h before centralDate
      // (i.e. in the late morning of Jan 30) — within a few hours.
      const earliest = sunTools.keyEvents[0].timestamp;
      const expectedEarliestApprox = new Date(centralDate.getTime() - ONE_DAY_MS);
      const driftHours = Math.abs(earliest.getTime() - expectedEarliestApprox.getTime()) / 3_600_000;
      expect(driftHours).toBeLessThan(18); // sun events span ~12h around the day
      // And it must be in January, NOT February or December.
      expect(earliest.getUTCMonth()).toBe(0); // 0 = January
      expect(earliest.getUTCDate()).toBeGreaterThanOrEqual(29);
    });

    it('regression #24 — handles year boundaries correctly', () => {
      const centralDate = new Date('2026-12-31T12:00:00Z');
      const sunTools = new SunTools(centralDate, LAT, LON);
      const latest = sunTools.keyEvents[sunTools.keyEvents.length - 1].timestamp;
      // Should be in early January 2027, not somewhere weird like Dec 32 or
      // an undefined date that JavaScript silently normalised wrong.
      expect(latest.getUTCFullYear()).toBe(2027);
      expect(latest.getUTCMonth()).toBe(0); // January
    });
  });

  describe('getNextEvent', () => {
    it('returns the soonest event after the given time', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const noon = new Date('2026-06-15T12:00:00Z');
      const next = sunTools.getNextEvent(noon);
      expect(next).toBeDefined();
      expect(next!.timestamp.getTime()).toBeGreaterThan(noon.getTime());
      // The very next event after London noon in June will be solar noon
      // (approx 12:02-13:00 BST) or sunset later that day.
      expect(
        next instanceof SunEventSolarNoon
        || next instanceof SunEventSunset,
      ).toBe(true);
    });

    it('returns undefined if no event is after the given time', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const farFuture = new Date('2030-01-01T00:00:00Z');
      expect(sunTools.getNextEvent(farFuture)).toBeUndefined();
    });
  });

  describe('getLastEvent', () => {
    it('returns the most recent event before the given time', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const noon = new Date('2026-06-15T12:00:00Z');
      const last = sunTools.getLastEvent(noon);
      expect(last).toBeDefined();
      expect(last!.timestamp.getTime()).toBeLessThan(noon.getTime());
    });

    it('returns undefined if no event is before the given time', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const farPast = new Date('2020-01-01T00:00:00Z');
      expect(sunTools.getLastEvent(farPast)).toBeUndefined();
    });

    it('regression #23 — does not mutate keyEvents on repeated calls', () => {
      // The old implementation called keyEvents.reverse() in-place,
      // which left the array reversed for subsequent calls. After the
      // first getLastEvent, getNextEvent would walk a backwards-sorted
      // array and return wrong results.
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const noon = new Date('2026-06-15T12:00:00Z');

      // Capture initial event order
      const before = [...sunTools.keyEvents].map((e) => e.timestamp.getTime());

      // Call getLastEvent multiple times — should not mutate the array
      sunTools.getLastEvent(noon);
      sunTools.getLastEvent(noon);
      sunTools.getLastEvent(noon);

      const after = [...sunTools.keyEvents].map((e) => e.timestamp.getTime());
      expect(after).toEqual(before);
    });

    it('regression #23 — produces consistent results across repeated calls', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const noon = new Date('2026-06-15T12:00:00Z');

      const first = sunTools.getLastEvent(noon);
      const second = sunTools.getLastEvent(noon);
      const third = sunTools.getLastEvent(noon);

      expect(first?.timestamp.getTime()).toBe(second?.timestamp.getTime());
      expect(second?.timestamp.getTime()).toBe(third?.timestamp.getTime());
    });

    it('regression #23 — getLastEvent does not break getNextEvent ordering', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const noon = new Date('2026-06-15T12:00:00Z');

      // Call getLastEvent first; under the old buggy implementation this
      // mutated keyEvents into reverse order, so getNextEvent's `find`
      // would then return the *latest* event (last day +1) instead of
      // the soonest after `noon`.
      sunTools.getLastEvent(noon);

      const next = sunTools.getNextEvent(noon);
      expect(next).toBeDefined();
      expect(next!.timestamp.getTime()).toBeGreaterThan(noon.getTime());
      // Next event from June 15 noon should be within 24h, not days away.
      const hoursAway = (next!.timestamp.getTime() - noon.getTime()) / 3_600_000;
      expect(hoursAway).toBeLessThan(24);
    });
  });

  describe('event type variety', () => {
    it('produces all four event types over a 3-day window', () => {
      const sunTools = new SunTools(new Date('2026-06-15T12:00:00Z'), LAT, LON);
      const types = new Set(sunTools.keyEvents.map((e) => e.constructor.name));
      expect(types).toContain('SunEventSunrise');
      expect(types).toContain('SunEventSolarNoon');
      expect(types).toContain('SunEventSunset');
      expect(types).toContain('SunEventSolarMidnight');
    });
  });
});
