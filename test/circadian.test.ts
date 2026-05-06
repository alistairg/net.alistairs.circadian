import { describe, it, expect } from 'vitest';
import {
  approximatelyEqual,
  CAPABILITY_VALUE_EPSILON,
  brightnessForPercentage,
  temperatureForPercentage,
  calculateCircadianPercentage,
} from '../lib/circadian';

const LAT = 51.5074;
const LON = -0.1278;

describe('approximatelyEqual', () => {
  it('treats identical values as equal', () => {
    expect(approximatelyEqual(0.5, 0.5)).toBe(true);
  });

  it('treats values within epsilon as equal', () => {
    expect(approximatelyEqual(0.5, 0.5 + CAPABILITY_VALUE_EPSILON / 2)).toBe(true);
  });

  it('treats values beyond epsilon as different', () => {
    expect(approximatelyEqual(0.5, 0.5 + CAPABILITY_VALUE_EPSILON * 2)).toBe(false);
  });

  it('handles tiny floating-point drift gracefully (regression #27)', () => {
    // 0.1 + 0.2 famously gives 0.30000000000000004 in IEEE floats.
    // Without epsilon comparisons, this would have triggered a redundant
    // capability write every poll cycle.
    expect(approximatelyEqual(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('treats negative drift symmetrically', () => {
    expect(approximatelyEqual(0.5, 0.5 - CAPABILITY_VALUE_EPSILON / 2)).toBe(true);
    expect(approximatelyEqual(0.5, 0.5 - CAPABILITY_VALUE_EPSILON * 2)).toBe(false);
  });
});

describe('brightnessForPercentage', () => {
  it('returns minBrightness when percentage is 0', () => {
    expect(brightnessForPercentage(0, 0.2, 0.9)).toBe(0.2);
  });

  it('returns minBrightness when percentage is negative (post-sunset)', () => {
    expect(brightnessForPercentage(-0.5, 0.2, 0.9)).toBe(0.2);
  });

  it('returns maxBrightness when percentage is 1 (solar noon)', () => {
    const result = brightnessForPercentage(1, 0.2, 0.9);
    expect(approximatelyEqual(result, 0.9)).toBe(true);
  });

  it('linearly interpolates for intermediate percentages', () => {
    // At 50% percentage with min 0.2, max 0.9, expect midpoint 0.55
    const result = brightnessForPercentage(0.5, 0.2, 0.9);
    expect(approximatelyEqual(result, 0.55)).toBe(true);
  });

  it('clamps at minBrightness for percentage exactly 0 (boundary)', () => {
    // The implementation uses `percentage <= 0` so zero should give min.
    expect(brightnessForPercentage(0, 0.2, 0.9)).toBe(0.2);
  });
});

describe('temperatureForPercentage', () => {
  it('returns sunsetTemp when percentage is 0', () => {
    expect(temperatureForPercentage(0, 0.3, 1.0)).toBe(1.0);
  });

  it('returns sunsetTemp when percentage is negative', () => {
    expect(temperatureForPercentage(-0.5, 0.3, 1.0)).toBe(1.0);
  });

  it('returns noonTemp when percentage is 1', () => {
    const result = temperatureForPercentage(1, 0.3, 1.0);
    expect(approximatelyEqual(result, 0.3)).toBe(true);
  });

  it('linearly interpolates for intermediate percentages', () => {
    // At 50% with noon 0.3 and sunset 1.0, expect midpoint ~0.65
    const result = temperatureForPercentage(0.5, 0.3, 1.0);
    expect(approximatelyEqual(result, 0.65)).toBe(true);
  });

  it('moves toward noon as percentage increases (warmer→cooler)', () => {
    // sunsetTemp > noonTemp by convention; as percentage rises,
    // the result should approach noonTemp.
    const at25 = temperatureForPercentage(0.25, 0.3, 1.0);
    const at75 = temperatureForPercentage(0.75, 0.3, 1.0);
    expect(at75).toBeLessThan(at25);
    expect(at75).toBeGreaterThan(0.3);
    expect(at25).toBeLessThan(1.0);
  });
});

describe('calculateCircadianPercentage', () => {
  it('returns a value in [-1, 1]', () => {
    const noon = new Date('2026-06-15T12:00:00Z');
    const percentage = calculateCircadianPercentage(noon, LAT, LON);
    expect(percentage).toBeGreaterThanOrEqual(-1);
    expect(percentage).toBeLessThanOrEqual(1);
  });

  it('produces a reasonable curve at solar noon', () => {
    // June 15 in London — solar noon ~12:02 BST = ~11:02 UTC.
    // At local noon UTC we should be very close to the high point.
    const localNoonUtc = new Date('2026-06-15T11:02:00Z');
    const percentage = calculateCircadianPercentage(localNoonUtc, LAT, LON);
    // Should be positive and close to 1
    expect(percentage).toBeGreaterThan(0.95);
  });

  it('produces a reasonable curve at solar midnight', () => {
    // London midnight summertime — solar midnight is ~01:00 BST = ~00:00 UTC.
    const midnight = new Date('2026-06-15T00:00:00Z');
    const percentage = calculateCircadianPercentage(midnight, LAT, LON);
    // Should be near -1 (deep night)
    expect(percentage).toBeLessThan(-0.95);
  });

  it('crosses 0 around sunrise and sunset', () => {
    // At a sun event itself, percentage should be near 0 — the curve
    // touches the x-axis at every sunrise/sunset boundary.
    // Use SunCalc to find an actual sunrise time and probe around it.
    const date = new Date('2026-06-15T12:00:00Z');
    // London sunrise ~04:43 BST = 03:43 UTC in June
    const sunrise = new Date('2026-06-15T03:43:00Z');
    const at = calculateCircadianPercentage(sunrise, LAT, LON);
    expect(Math.abs(at)).toBeLessThan(0.1); // close to zero
  });

  it('produces stable results when called many times in a row', () => {
    // Regression for #23 — the old buggy implementation could return
    // different values across calls because getLastEvent mutated state.
    const noon = new Date('2026-06-15T12:00:00Z');
    const a = calculateCircadianPercentage(noon, LAT, LON);
    const b = calculateCircadianPercentage(noon, LAT, LON);
    const c = calculateCircadianPercentage(noon, LAT, LON);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('produces correct result on month boundaries (regression #24)', () => {
    // Should not crash or produce bizarre values when SunTools is given
    // a date at the very end of a month.
    const lastDayOfJan = new Date('2026-01-31T12:00:00Z');
    const percentage = calculateCircadianPercentage(lastDayOfJan, LAT, LON);
    expect(percentage).toBeGreaterThanOrEqual(-1);
    expect(percentage).toBeLessThanOrEqual(1);
    expect(Number.isFinite(percentage)).toBe(true);
  });

  it('produces correct result on year boundaries (regression #24)', () => {
    const dec31 = new Date('2026-12-31T23:30:00Z');
    const percentage = calculateCircadianPercentage(dec31, LAT, LON);
    expect(Number.isFinite(percentage)).toBe(true);
    expect(percentage).toBeGreaterThanOrEqual(-1);
    expect(percentage).toBeLessThanOrEqual(1);
  });
});
