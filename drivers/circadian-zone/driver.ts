import Homey from 'homey';
import { v4 as uuidv4 } from 'uuid';
import { CircadianZone } from './device';
import { SunEventSolarNoon, SunEventSunrise, SunEventSunset, SunTools } from './suntools';

const RECALC_INTERVAL_MS = 3 * 60 * 1000;
// Sentinel for "percentage not yet computed". Real percentages are in [-1, 1]
// (the curve formula can return any value in that range), so we can't reuse
// -1 as a sentinel — null distinguishes cleanly.
type Percentage = number | null;

export class CircadianDriver extends Homey.Driver {

  private _intervalId: NodeJS.Timeout | null = null;
  private _circadianPercentage: Percentage = null;
  private _circadianValuesChangedFlow!: Homey.FlowCardTriggerDevice;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();

    this._circadianValuesChangedFlow = this.homey.flow.getDeviceTriggerCard('circadian_changed');
    this.log('CircadianDriver has been initialized');

    this.homey.flow
      .getActionCard('set_adaptive_mode')
      .registerRunListener(async (args) => args.device.triggerCapabilityListener('adaptive_mode', args.mode));

    // Trigger an initial update before the interval kicks in
    await this._updateCircadianZones();

    // Schedule periodic recalculation
    this._intervalId = this.homey.setInterval(
      () => this._updateCircadianZones().catch((err) => this.error('Periodic update failed:', err)),
      RECALC_INTERVAL_MS,
    );
  }

  async onUninit(): Promise<void> {
    await super.onUninit();
    this.log('CircadianDriver is shutting down');

    if (this._intervalId) {
      this.homey.clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  async onPairListDevices() {
    return [
      {
        name: this.homey.__('circadian_zone'),
        data: {
          id: uuidv4(),
        },
      },
    ];
  }

  /**
   * Recalculate the master circadian percentage and propagate to every
   * zone device.
   *
   * Awaits all zone updates with Promise.all rather than the previous
   * fire-and-forget forEach(async) pattern, so:
   *   1. errors in zone updates surface to the caller (and to setInterval's
   *      .catch()) rather than disappearing into floating promise rejections;
   *   2. the next setInterval tick can't run while the previous tick's
   *      zone updates are still pending.
   */
  async _updateCircadianZones() {
    this.log('Updating circadian zones with recalculated percentage...');
    this._circadianPercentage = this._recalculateCircadianPercentage();

    const devices = this.getDevices();
    await Promise.all(
      devices.map((device) => (device as CircadianZone)
        .updateFromPercentage(this._circadianPercentage as number)
        .catch((err) => this.error(`Zone update for ${device.getName()} failed:`, err))),
    );
  }

  /**
   * Recalculate the sunrise/sunset curve and return the current
   * percentage progress through the day.
   *
   * Inspiration from @basnijholt's adaptive-lighting algorithm for HA:
   * https://github.com/basnijholt/adaptive-lighting
   */
  private _recalculateCircadianPercentage(): number {
    this.log('Recalculating...');

    const latitude = this.homey.geolocation.getLatitude();
    const longitude = this.homey.geolocation.getLongitude();
    const now = new Date();

    const sunTools = new SunTools(now, latitude, longitude);
    this.log(`SunTools: ${sunTools}`);

    const nextEvent = sunTools.getNextEvent(now);
    const lastEvent = sunTools.getLastEvent(now);
    if (!nextEvent || !lastEvent) {
      this.log('No bracketing sun events; defaulting to 0%');
      return 0;
    }

    this.log(`Now: ${now.toISOString()}`);
    this.log(`Previously: ${lastEvent}`);
    this.log(`Next: ${nextEvent}`);

    // Curve construction:
    //   - Between sunrise and noon (and between sunset and midnight) we're
    //     climbing/descending; the next event is the inflection.
    //   - Between noon and sunset (and between midnight and sunrise) we're
    //     mirrored; the previous event is the inflection.
    //   - k flips the curve sign based on whether we're heading toward a
    //     "high" event (sunset/noon, k=1) or "low" event (midnight/sunrise, k=-1).
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

    const percentage = (0 - k) * ((now.getTime() - h) / (h - x)) ** 2 + k;
    this.log(`Percentage: ${percentage}`);
    return percentage;
  }

  /**
   * Returns the current circadian percentage, computing it if needed.
   * Safe to call repeatedly; the result is cached and refreshed on the
   * driver's interval.
   */
  getPercentage(): number {
    if (this._circadianPercentage === null) {
      this._circadianPercentage = this._recalculateCircadianPercentage();
    }
    return this._circadianPercentage;
  }

  triggerValuesChangedFlow(device: Homey.Device, tokens: any, state: any) {
    this._circadianValuesChangedFlow
      .trigger(device, tokens, state)
      .catch(this.error);
  }

}

module.exports = CircadianDriver;
