import Homey from 'homey';
import { CircadianDriver } from './driver'

export class CircadianZone extends Homey.Device {

  private _enabled: boolean = true;
  private _minTemp: number = 0;
  private _maxTemp: number = 1;
  private _minBrightness: number = 0;
  private _maxBrightness: number = 1;
  private _currentBrightness: number = 0;
  private _currentTemperature: number = 0;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    // Cache local settings
    this._enabled = await this.getCapabilityValue("onoff");
    const settings = await this.getSettings();
    this._minTemp = settings.min_temp;
    this._maxTemp = settings.max_temp;
    this._minBrightness = settings.min_brightness;
    this._maxBrightness = settings.max_brightness;
    this._currentBrightness = await this.getCapabilityValue("dim");
    this._currentTemperature = await this.getCapabilityValue("light_temperature");

    // Enabled Override Listener
    this.registerCapabilityListener("onoff", async (value) => {
      this._enabled = value;
      if (this._enabled) {
        this.log("Restoring adaptive settings...");
        this.updateFromPercentage((this.driver as CircadianDriver).getPercentage());
      }
      else {
        this.log("Adaption disabled.");
      }
      
    });

    // Temperature Override Listener
    this.registerCapabilityListener("light_temperature", async (value) => {
      if (this._enabled) {
        this._enabled = false;
        this._currentTemperature = value;
        await this.setCapabilityValue("onoff", false);
      }
      this.log(`Temperature override to ${value}`);
    });

    // Dim Override Listener
    this.registerCapabilityListener("dim", async (value) => {
      if (this._enabled) {
        this._enabled = false;
        this._currentBrightness = value;
        await this.setCapabilityValue("onoff", false);
      }
      this.log(`Dim override to ${value}`);
    });

    this.log('CircadianZone has been initialized');
    this.updateFromPercentage((this.driver as CircadianDriver).getPercentage());
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('CircadianZone has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings: {}, newSettings: {}, changedKeys: [] }): Promise<string|void> {
    this.log(`CircadianZone settings were changed`);
    this.updateFromPercentage((this.driver as CircadianDriver).getPercentage());
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('CircadianZone was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('CircadianZone has been deleted');
  }

  /**
   * updateFromPercentage is called when the global circadian tracking percentage is recalculated
   */
  async updateFromPercentage(percentage: number) {

    if (!this._enabled) {
      this.log(`${this.getName()} is disabled.`);
      return;
    }

    this.log(`${this.getName()} is updating from percentage ${percentage}%...`);

    // Brightness
    const minBrightness: number = (this.getSetting("min_brightness") || 0) / 100.0;
    const maxBrightness: number = (this.getSetting("max_brightness") || 100) / 100.0;
    const brightnessDelta = maxBrightness - minBrightness;
    let brightness = (brightnessDelta * (percentage/100)) + minBrightness;
    if (brightness != this._currentBrightness) {
      this._currentBrightness = brightness;
      await this.setCapabilityValue("dim", brightness);
      this.log(`Brightness updated to be ${brightness * 100}% in range ${minBrightness * 100}% - ${maxBrightness * 100}%`);
    }
    else {
      this.log(`No change in brightness from ${this._currentBrightness}%`)
    }

    // Temperature
    const minTemp: number = (this.getSetting("min_temp") || 0) / 100.0;
    const maxTemp: number = (this.getSetting("max_temp") || 100) / 100.0;
    const tempDelta = maxTemp - minTemp;
    let temperature = 1 - ((tempDelta * (percentage/100)) + minTemp);
    if (temperature != this._currentTemperature) {
      this._currentTemperature = temperature;
      await this.setCapabilityValue("light_temperature", temperature);
      this.log(`Temperature updated to be ${temperature * 100}% in range ${minTemp * 100}% - ${maxTemp * 100}%`);
    }
    else {
      this.log(`No change in temperature from ${this._currentTemperature}%`)
    }

  }

}

module.exports = CircadianZone;
