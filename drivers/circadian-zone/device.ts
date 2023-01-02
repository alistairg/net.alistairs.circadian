import Homey from 'homey';
import { CircadianDriver } from './driver'

export class CircadianZone extends Homey.Device {

  private _mode: string = "unknown";
  private _sunsetTemp: number = -1;
  private _noonTemp: number = -1;
  private _minBrightness: number = -1;
  private _maxBrightness: number = -1;
  private _nightTemperature: number = -1;
  private _nightBrightness: number = -1;
  private _currentBrightness: number = -1;
  private _currentTemperature: number = -1;


  /**
   * return the current mode, getting it if needed
   */
  async getMode(): Promise<string> {
    if (this._mode === "unknown") {
      this._mode = await this.getCapabilityValue("adaptive_mode");
    }
    return this._mode;
  }

  /**
   * set the current mode, notifying if appropriate
   */
  async setMode(newMode: string) {
    if (this._mode != newMode) {
      this._mode = newMode;
      await this.setCapabilityValue("adaptive_mode", newMode);

      // Trigger changes
      if ((newMode === "adaptive") || (newMode === "night")) {
        this.log("Triggering zone update...");
        await this.refreshZone();
      }
      else {
        this.log(`No changes needed for new mode ${newMode}`);
      }

    }
    else {
      this.log("Mode not changed");
    }
  }

  /**
   * gets the night temperature, reading from settings if needed
   */
  async getNightTemperature(): Promise<number> {
    if (this._nightTemperature == -1) {
      this._nightTemperature = await this.getSetting("night_temp") / 100.0;
    }
    return this._nightTemperature;
  }

  /**
   * gets the night brightness, reading from settings if needed
   */
  async getNightBrightness(): Promise<number> {
    if (this._nightBrightness == -1) {
      this._nightBrightness = await this.getSetting("night_brightness") / 100.0;
    }
    return this._nightBrightness;
  }

  /**
   * gets the current sunset temperature, reading from settings if needed
   */
  async getSunsetTemperature(): Promise<number> {
    if (this._sunsetTemp == -1) {
      this._sunsetTemp = await this.getSetting("sunset_temp") / 100.0;
    }
    return this._sunsetTemp;
  }

  /**
   * gets the current maximum temperature, reading from settings if needed
   */
  async getNoonTemperature(): Promise<number> {
    if (this._noonTemp == -1) {
      this._noonTemp = await this.getSetting("noon_temp") / 100.0;
    }
    return this._noonTemp;
  }

  /**
   * gets the current minimum brightness, reading from settings if needed
   */
  async getMinBrightness(): Promise<number> {
    if (this._minBrightness == -1) {
      this._minBrightness = await this.getSetting("min_brightness") / 100.0;
    }
    return this._minBrightness;
  }

  /**
   * gets the current maximum brightness, reading from settings if needed
   */
  async getMaxBrightness(): Promise<number> {
    if (this._maxBrightness == -1) {
      this._maxBrightness = await this.getSetting("max_brightness") / 100.0;
    }
    return this._maxBrightness;
  }

  /**
   * gets the current light temperature, reading from capability cache if needed
   */
  async getCurrentTemperature(): Promise<Number> {
    if (this._currentTemperature == -1) {
      this._currentTemperature = await this.getCapabilityValue("light_temperature");
    }
    return this._currentTemperature;
  }

  /**
   * sets the current light temperature, changing to manual mode if needed
   */
  async overrideCurrentTemperature(newTemperature: number) {
    if (this._currentTemperature != newTemperature) {
      this._currentTemperature = newTemperature;
      const currentMode = await this.getMode();
      if (currentMode != "manual") {
        await this.setMode("manual");
      }
      await this.triggerValuesChangedFlow(this._currentBrightness, newTemperature);
    }
  }

  /**
   * gets the current brightness, reading from capability cache if needed
   */
  async getCurrentBrightness(): Promise<Number> {
    if (this._currentBrightness == -1) {
      this._currentBrightness = await this.getCapabilityValue("dim");
    }
    return this._currentBrightness;
  }

  /**
   * sets the current light temperature, changing to manual mode if needed
   */
  async overrideCurrentBrightness(newBrightness: number) {
    if (this._currentBrightness != newBrightness) {
      this._currentBrightness = newBrightness;
      const currentMode = await this.getMode();
      if (currentMode != "manual") {
        await this.setMode("manual");
      }
      await this.triggerValuesChangedFlow(newBrightness, this._currentTemperature);
    }
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    // Mode Listener
    this.registerCapabilityListener("adaptive_mode", async (value) => {
      this.log(`Mode changed to ${value}`)
      await this.setMode(value);    
    });

    // Temperature Override Listener
    this.registerCapabilityListener("light_temperature", async (value) => {
      this.log(`Temperature override to ${value}`);
      await this.overrideCurrentTemperature(value);
    });

    // Dim Override Listener
    this.registerCapabilityListener("dim", async (value) => {
      this.log(`Dim override to ${value}`);
      await this.overrideCurrentBrightness(value);
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
  async onSettings(event: { oldSettings: {}, newSettings: {max_brightness: number, min_brightness: number, night_brightness: number, night_temperature: number, sunset_temp: number, noon_temp:number}, changedKeys: [] }): Promise<string|void> {
    this.log(`CircadianZone settings were changed - ${JSON.stringify(event.newSettings)}`);
    this._maxBrightness = event.newSettings.max_brightness / 100.0;
    this._minBrightness = event.newSettings.min_brightness / 100.0;
    this._noonTemp = event.newSettings.noon_temp / 100.0;
    this._sunsetTemp = event.newSettings.sunset_temp / 100.0;
    this._nightBrightness = event.newSettings.night_brightness / 100.0;
    this._nightTemperature = event.newSettings.night_temperature / 100.0;
    await this.refreshZone();
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
   * refreshZone updates the zone values, based on mode and circadian progress
   */
  async refreshZone() {
    const mode = await this.getMode();
    if (mode == "adaptive") {
      await this.updateFromPercentage((this.driver as CircadianDriver).getPercentage()); 
    }
    else if (mode == "night") {
      await this.updateFromNightMode();
    }
  }

  /**
   * updateFromNightMode is called when the mode is forcibly set to night mode
   */
  private async updateFromNightMode() {
    const nightBrightness = await this.getNightBrightness();
    const nightTemperature = await this.getNightTemperature();
    if ((this._currentBrightness != nightBrightness) || (this._currentTemperature != this._currentTemperature)) {
      this.log(`Updating to night brightness ${nightBrightness}% and temperature ${nightTemperature}%...`);
      this._currentBrightness = nightBrightness;
      this._currentTemperature = nightTemperature;
      await this.setCapabilityValue("dim", nightBrightness);
      await this.setCapabilityValue("light_temperature", nightTemperature);

      // Trigger flow if appropriate
      await this.triggerValuesChangedFlow(nightBrightness, nightTemperature);

    }
    else {
      this.log("Already at night targets.");
    }
  }

  /**
   * updateFromPercentage is called when the global circadian tracking percentage is recalculated
   */
  async updateFromPercentage(percentage: number) {

    let valuesChanged: boolean = false;

    // Sanity check for adaptive mode
    if (await this.getMode() != "adaptive") {
      this.log(`${this.getName()} is not in adaptive mode. (${this._mode})`);
      return;
    }

    this.log(`${this.getName()} is updating from percentage ${percentage}%...`);

    // Brightness
    const minBrightness: number = await this.getMinBrightness();
    const maxBrightness: number = await this.getMaxBrightness();
    const brightnessDelta = maxBrightness - minBrightness;
    let brightness = (percentage > 0) ? (brightnessDelta * percentage) + minBrightness : minBrightness;
    if (brightness != this._currentBrightness) {
      this._currentBrightness = brightness;
      await this.setCapabilityValue("dim", brightness);
      valuesChanged = true;
      this.log(`Brightness updated to be ${brightness * 100.0}% in range ${minBrightness * 100.0}% - ${maxBrightness * 100.0}%`);
    }
    else {
      this.log(`No change in brightness from ${this._currentBrightness}%`)
    }

    // Temperature
    const sunsetTemp: number = await this.getSunsetTemperature();
    const noonTemp: number = await this.getNoonTemperature();
    const tempDelta = Math.abs(noonTemp - sunsetTemp);
    let calculatedTemperature = (tempDelta * percentage) + Math.min(sunsetTemp, noonTemp);
    let temperature = (percentage > 0) ? calculatedTemperature : sunsetTemp;
    if (temperature != this._currentTemperature) {
      this._currentTemperature = temperature;
      await this.setCapabilityValue("light_temperature", temperature);
      valuesChanged = true;
      this.log(`Temperature updated to be ${temperature * 100.0}% in range ${sunsetTemp * 100.0}% - ${noonTemp * 100.0}%`);
    }
    else {
      this.log(`No change in temperature from ${this._currentTemperature}%`)
    }

    // Trigger flow if appropriate
    if (valuesChanged) {
      await this.triggerValuesChangedFlow(brightness, temperature);
    }

  }

  async triggerValuesChangedFlow(brightness: number, temperature: number) {
    this.log(`Triggering values changed with temperature ${temperature} and brightness ${brightness}`);
    return (this.driver as CircadianDriver).triggerValuesChangedFlow(this, {
      brightness: brightness,
      temperature: temperature
    }, {});
  }

}

module.exports = CircadianZone;
