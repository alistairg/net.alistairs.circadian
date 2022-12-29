import { time } from 'console';
import Homey, { Device } from 'homey';
import SunCalc, { GetTimesResult } from 'suncalc';
import { CircadianZone } from './device';

const { v4: uuidv4 } = require('uuid');

export class CircadianDriver extends Homey.Driver {

  private _intervalId: NodeJS.Timer;
  private _circadianPercentage: number = -1;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {

    let _self = this;
    this.log('CircadianDriver has been initialized');

    // Trigger an initial update
    await _self._updateCircadianZones();

    // Schedule Updates
    this._intervalId = setInterval(function() {
      _self._updateCircadianZones();
    }, 1 * 60 * 1000);

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
   * Inspiration taken in no small part from @claytonjn's Home Assistant circadian lighting algorithm
   * https://github.com/claytonjn/hass-circadian_lighting
   * 
   * @returns {number} percentage progress through the day
   * 
   */
  private _recalculateCircadianPercentage(): number {

    // Debug
    this.log("Recalculating...");

    // Get location
    const latitude: number = this.homey.geolocation.getLatitude();
    const longitude: number = this.homey.geolocation.getLongitude();
    const now = new Date();

    // Calculate times
    var timesToday: GetTimesResult = SunCalc.getTimes(new Date(), latitude, longitude);

    // Debug
    this.log("Sunrise: " + timesToday.sunrise);
    this.log("Noon: " + timesToday.solarNoon);
    this.log("Sunset: " + timesToday.sunset);
    this.log("Nadir: " + timesToday.nadir);
    this.log("Now: " + now);

    // Calculate the curves
    let h: number;
    let k: number;
    let x: number;
    let y: number;

    // Sunrise to Sunset
    if ((timesToday.sunrise < now) && (now < timesToday.sunset)) {
      this.log("Between sunrise and sunset");
      h = timesToday.solarNoon.getTime();
      k = 100;
      x = (now < timesToday.solarNoon) ? timesToday.sunrise.getTime()  : timesToday.sunset.getTime();
    }

    // ...Sunset to Sunrise
    else {
      this.log("Between sunset and sunrise");
      h = timesToday.nadir.getTime();
      k = -100;
      x = (now < timesToday.nadir) ? timesToday.sunset.getTime()  : timesToday.sunrise.getTime() 
    }

    y = 0;
    let a: number = (y - k) / (h - x) ** 2;
    let percentage: number = a * (now.getTime()  - h) ** 2 + k;
    this.log(`Percentage: ${percentage}%`);
    return percentage;

  }

  getPercentage(): number {
    if (this._circadianPercentage == -1) {
      this._circadianPercentage = this._recalculateCircadianPercentage();
    }
    return this._circadianPercentage;
  }

}

module.exports = CircadianDriver;
