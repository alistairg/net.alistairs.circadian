import { time } from 'console';
import Homey from 'homey';
import SunCalc, { GetTimesResult } from 'suncalc';

const { v4: uuidv4 } = require('uuid');

class CircadianDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('CircadianDriver has been initialized');

    // Load initial values
    this._updateCircadianValues();
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Circadian Tracker',
        data: {
          id: uuidv4(),
        },
      },
    ];
  }


  /**
   * _updateCircadianValues recalculates the sunrise and sunset curves, used for calculations in each device
   * 
   * Inspiration taken in no small part from @claytonjn's Home Assistant circadian lighting algorithm
   * https://github.com/claytonjn/hass-circadian_lighting
   * 
   * @returns {number} percentage progress through the day
   * 
   */
  _updateCircadianValues(): number {

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
    this.log(`h :${h}`);
    this.log(`k :${k}`);
    this.log(`x :${x}`);
    this.log(`a :${x}`);
    this.log(`Percentage: ${percentage}%`);
    return percentage;

  }

}

module.exports = CircadianDriver;
