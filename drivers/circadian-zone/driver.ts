import { time } from 'console';
import Homey, { Device } from 'homey';
import { CircadianZone } from './device';
import { SunEventSolarNoon, SunEventSunrise, SunEventSunset, SunTools} from './suntools';

const { v4: uuidv4 } = require('uuid');

export class CircadianDriver extends Homey.Driver {

  private _intervalId: NodeJS.Timer;
  private _circadianPercentage: number = -1;
  protected _circadianValuesChangedFlow: Homey.FlowCardTriggerDevice;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {

    let _self = this;
    this._circadianValuesChangedFlow = this.homey.flow.getDeviceTriggerCard("circadian_changed");
    this.log('CircadianDriver has been initialized');

    // Trigger an initial update
    await _self._updateCircadianZones();

    // Schedule Updates
    this._intervalId = setInterval(function() {
      _self._updateCircadianZones();
    }, 3 * 60 * 1000);

  }


  /**
   * onUnInit is called when the driver is unintialized
   */
  async onUninit(): Promise<void> {
    
    this.log("CircadianDriver is shutting down....");

    // Stop the timer
    clearInterval(this._intervalId);

  }


  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: this.homey.__("circadian_zone"),
        data: {
          id: uuidv4(),
        },
      },
    ];
  }


  /**
   * _updateCircadianZones prompts individual zone devices to update based on the master percentage
   * 
   */

  async _updateCircadianZones() {

    this.log("Updating circadian zones with recalculated percentage...");
    this._circadianPercentage = this._recalculateCircadianPercentage();
    this.getDevices().forEach(async device => {
      await (device as CircadianZone).updateFromPercentage(this._circadianPercentage);
    });

  }

  /**
   * _recalculateCircadianPercentage recalculates the sunrise and sunset curves, used for calculations in each device
   * 
   * Inspiration taken in no small part from @basnijholt's excellent Home Assistant adaptive lighting algorithm
   * https://github.com/basnijholt/adaptive-lighting
   * 
   * @returns {number} percentage progress through the day
   * 
   */
  private _recalculateCircadianPercentage(date?: Date): number {

    // Debug
    this.log("Recalculating...");

    // Get location
    const latitude: number = this.homey.geolocation.getLatitude();
    const longitude: number = this.homey.geolocation.getLongitude();
    const now = date || new Date();

    // Calculate times
    let sunTools = new SunTools(now, latitude, longitude);
    this.log(`SunTools: ${sunTools}`);
    sunTools.keyEvents.forEach(event => {
      this.log(`    ${event} Before: ${event.timestamp.getTime() < now.getTime()}`);
    });
    let nextEvent = sunTools.getNextEvent(now);
    let lastEvent = sunTools.getLastEvent(now);

    // Debug
    this.log(`Now: ${now}`);
    this.log(`Previously: ${lastEvent}`);
    this.log(`Next: ${nextEvent}`);

    // Calculate the curves
    let h: number;
    let k: number;
    let x: number;
    let y: number;

    if ((nextEvent instanceof SunEventSunrise) || (nextEvent instanceof SunEventSunset)) {
      h = lastEvent!.timestamp.getTime();
      x = nextEvent!.timestamp.getTime();
    }
    else {
      x = lastEvent!.timestamp.getTime();
      h = nextEvent!.timestamp.getTime();
    }
    k = ((nextEvent instanceof SunEventSunset) || (nextEvent instanceof SunEventSolarNoon)) ? 1 : -1;

    let percentage = (0 - k) * ((now.getTime() - h) / (h - x)) ** 2 + k;
    this.log(`Percentage: ${percentage}%`);
    return percentage;

  }

  getPercentage(): number {
    if (this._circadianPercentage == -1) {
      this._circadianPercentage = this._recalculateCircadianPercentage();
    }
    return this._circadianPercentage;
  }

  getPercentageForDate(date:Date): number {
    return this._recalculateCircadianPercentage(date);
  }

  // Handler for an open request
  triggerValuesChangedFlow(device: Homey.Device, tokens: any, state: any) {
    this._circadianValuesChangedFlow
      .trigger(device, tokens, state)
      .catch(this.error)
  }

}

module.exports = CircadianDriver;
