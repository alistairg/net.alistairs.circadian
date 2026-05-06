import { SunTools, SunEventSunrise, SunEventSunset, SunEventSolarNoon } from '../drivers/circadian-zone/suntools';

/**
 * Pure functions for circadian percentage and brightness/temperature
 * calculations. Extracted from CircadianDriver and CircadianZone so the
 * logic can be tested without the Homey SDK.
 */

/**
 * Compute the current "circadian percentage" — a value in roughly [-1, 1]
 * that represents progress through the day:
 *   - +1 at solar noon (brightest)
 *   - -1 at solar midnight (darkest)
 *   - 0 at sunrise / sunset
 *
 * Inspiration from @basnijholt's adaptive-lighting algorithm:
 * https://github.com/basnijholt/adaptive-lighting
 *
 * @param now            current time (typically `new Date()`)
 * @param latitude       observer latitude in degrees
 * @param longitude      observer longitude in degrees
 * @returns              percentage in [-1, 1], or 0 if events bracketing
 *                       `now` aren't available
 */
export function calculateCircadianPercentage(
  now: Date,
  latitude: number,
  longitude: number,
): number {
  const sunTools = new SunTools(now, latitude, longitude);
  const nextEvent = sunTools.getNextEvent(now);
  const lastEvent = sunTools.getLastEvent(now);
  if (!nextEvent || !lastEvent) return 0;

  let h: number;
  let x: number;
  if (nextEvent instanceof SunEventSunrise || nextEvent instanceof SunEventSunset) {
    h = lastEvent.timestamp.getTime();
    x = nextEvent.timestamp.getTime();
  } else {
    x = lastEvent.timestamp.getTime();
    h = nextEvent.timestamp.getTime();
  }
  const k = (nextEvent instanceof SunEventSunset || nextEvent instanceof SunEventSolarNoon) ? 1 : -1;

  return (0 - k) * ((now.getTime() - h) / (h - x)) ** 2 + k;
}

/** Tolerance for capability-value comparisons; below this is "no change." */
export const CAPABILITY_VALUE_EPSILON = 0.005;

/** True if the two values are within {@link CAPABILITY_VALUE_EPSILON}. */
export function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < CAPABILITY_VALUE_EPSILON;
}

/**
 * Compute the brightness for a given circadian percentage and the user's
 * configured min/max range.
 *
 * Both inputs and outputs are in fractions (0..1).
 */
export function brightnessForPercentage(
  percentage: number,
  minBrightness: number,
  maxBrightness: number,
): number {
  if (percentage <= 0) return minBrightness;
  const delta = maxBrightness - minBrightness;
  return delta * percentage + minBrightness;
}

/**
 * Compute the colour temperature (as a fraction in 0..1) for a given
 * circadian percentage and the user's configured noon/sunset range.
 *
 * Note: the Homey `light_temperature` capability runs warm→cool, where
 * warmer (higher mired) values correspond to higher numeric values. The
 * user-facing "sunset" temperature is the warm end and "noon" is the
 * cool end. Past sunset (percentage <= 0), we hold at the sunset value.
 */
export function temperatureForPercentage(
  percentage: number,
  noonTemp: number,
  sunsetTemp: number,
): number {
  if (percentage <= 0) return sunsetTemp;
  const delta = sunsetTemp - noonTemp;
  return (delta * (1 - percentage)) + noonTemp;
}
