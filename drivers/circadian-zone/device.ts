import Homey from 'homey';
import { CircadianDriver } from './driver';

// Treat capability values as equal if they're within this much of each
// other. Without this, repeated polls would write through any tiny
// floating-point drift, causing redundant capability writes (and therefore
// redundant downstream flow events).
const FLOAT_EPSILON = 0.005;

interface SettingsValues {
  max_brightness: number;
  min_brightness: number;
  night_brightness: number;
  night_temp: number;
  sunset_temp: number;
  noon_temp: number;
}

export class CircadianZone extends Homey.Device {

  // Cached values are nullable rather than using -1 as a sentinel, since
  // 0 (and arguably negative numbers) are valid values for percentage
  // brightness and temperature.
  private _mode: string | null = null;
  private _sunsetTemp: number | null = null;
  private _noonTemp: number | null = null;
  private _minBrightness: number | null = null;
  private _maxBrightness: number | null = null;
  private _nightTemperature: number | null = null;
  private _nightBrightness: number | null = null;
  private _currentBrightness: number | null = null;
  private _currentTemperature: number | null = null;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    await super.onInit();

    // Seed the mode cache from the capability NOW, before any other code
    // can read it. The previous lazy-on-read pattern returned undefined
    // on the first call (or worse, raced with the capability listener
    // firing during onInit).
    this._mode = (this.getCapabilityValue('adaptive_mode') as string | null) ?? 'adaptive';

    // Mode listener
    this.registerCapabilityListener('adaptive_mode', async (value) => {
      this.log(`Mode changed to ${value}`);
      await this.setMode(value);
    });

    // Temperature override listener
    this.registerCapabilityListener('light_temperature', async (value) => {
      this.log(`Temperature override to ${value}`);
      await this.overrideCurrentTemperature(value);
    });

    // Dim override listener
    this.registerCapabilityListener('dim', async (value) => {
      this.log(`Dim override to ${value}`);
      await this.overrideCurrentBrightness(value);
    });

    this.log('CircadianZone has been initialized');
    await this.updateFromPercentage((this.driver as CircadianDriver).getPercentage());
  }

  async onAdded() {
    this.log('CircadianZone has been added');
  }

  async onSettings(event: {
    oldSettings: SettingsValues;
    newSettings: SettingsValues;
    changedKeys: string[];
  }): Promise<string | void> {
    if (!(event.newSettings.sunset_temp > event.newSettings.noon_temp)) {
      return this.homey.__('temperature_error');
    }

    this.log(`CircadianZone settings were changed - ${JSON.stringify(event.newSettings)}`);
    this._maxBrightness = event.newSettings.max_brightness / 100.0;
    this._minBrightness = event.newSettings.min_brightness / 100.0;
    this._noonTemp = event.newSettings.noon_temp / 100.0;
    this._sunsetTemp = event.newSettings.sunset_temp / 100.0;
    this._nightBrightness = event.newSettings.night_brightness / 100.0;
    this._nightTemperature = event.newSettings.night_temp / 100.0;
    await this.refreshZone();
  }

  async onRenamed(name: string) {
    this.log(`CircadianZone was renamed to ${name}`);
  }

  async onDeleted() {
    this.log('CircadianZone has been deleted');
  }

  // --- Mode ---

  getMode(): string {
    return this._mode ?? 'adaptive';
  }

  async setMode(newMode: string): Promise<void> {
    if (this._mode === newMode) {
      this.log('Mode not changed');
      return;
    }

    this._mode = newMode;
    await this.setCapabilityValue('adaptive_mode', newMode);

    if (newMode === 'adaptive' || newMode === 'night') {
      this.log('Triggering zone update...');
      await this.refreshZone();
    } else {
      this.log(`No changes needed for new mode ${newMode}`);
    }
  }

  // --- Settings cache (sync getSetting; no need to await) ---

  getNightTemperature(): number {
    if (this._nightTemperature === null) {
      this._nightTemperature = this.getSetting('night_temp') / 100.0;
    }
    return this._nightTemperature;
  }

  getNightBrightness(): number {
    if (this._nightBrightness === null) {
      this._nightBrightness = this.getSetting('night_brightness') / 100.0;
    }
    return this._nightBrightness;
  }

  getSunsetTemperature(): number {
    if (this._sunsetTemp === null) {
      this._sunsetTemp = this.getSetting('sunset_temp') / 100.0;
    }
    return this._sunsetTemp;
  }

  getNoonTemperature(): number {
    if (this._noonTemp === null) {
      this._noonTemp = this.getSetting('noon_temp') / 100.0;
    }
    return this._noonTemp;
  }

  getMinBrightness(): number {
    if (this._minBrightness === null) {
      this._minBrightness = this.getSetting('min_brightness') / 100.0;
    }
    return this._minBrightness;
  }

  getMaxBrightness(): number {
    if (this._maxBrightness === null) {
      this._maxBrightness = this.getSetting('max_brightness') / 100.0;
    }
    return this._maxBrightness;
  }

  // --- Current values (cached from capability) ---

  getCurrentTemperature(): number {
    if (this._currentTemperature === null) {
      this._currentTemperature = (this.getCapabilityValue('light_temperature') as number | null) ?? 0;
    }
    return this._currentTemperature;
  }

  getCurrentBrightness(): number {
    if (this._currentBrightness === null) {
      this._currentBrightness = (this.getCapabilityValue('dim') as number | null) ?? 0;
    }
    return this._currentBrightness;
  }

  // --- Manual overrides ---

  async overrideCurrentTemperature(newTemperature: number): Promise<void> {
    const currentTemperature = this.getCurrentTemperature();
    if (approximatelyEqual(currentTemperature, newTemperature)) return;

    this._currentTemperature = newTemperature;
    if (this.getMode() !== 'manual') {
      await this.setMode('manual');
    }
    await this.triggerValuesChangedFlow(this._currentBrightness ?? 0, newTemperature);
  }

  async overrideCurrentBrightness(newBrightness: number): Promise<void> {
    const currentBrightness = this.getCurrentBrightness();
    if (approximatelyEqual(currentBrightness, newBrightness)) return;

    this._currentBrightness = newBrightness;
    if (this.getMode() !== 'manual') {
      await this.setMode('manual');
    }
    await this.triggerValuesChangedFlow(newBrightness, this._currentTemperature ?? 0);
  }

  // --- Zone refresh logic ---

  async refreshZone(): Promise<void> {
    const mode = this.getMode();
    if (mode === 'adaptive') {
      await this.updateFromPercentage((this.driver as CircadianDriver).getPercentage());
    } else if (mode === 'night') {
      await this.updateFromNightMode();
    }
  }

  private async updateFromNightMode(): Promise<void> {
    const nightBrightness = this.getNightBrightness();
    const nightTemperature = this.getNightTemperature();
    const currentBrightness = this.getCurrentBrightness();
    const currentTemperature = this.getCurrentTemperature();

    const brightnessChanged = !approximatelyEqual(currentBrightness, nightBrightness);
    const temperatureChanged = !approximatelyEqual(currentTemperature, nightTemperature);
    if (!brightnessChanged && !temperatureChanged) {
      this.log('Already at night targets.');
      return;
    }

    this.log(`Updating to night brightness ${nightBrightness}% and temperature ${nightTemperature}%...`);
    this._currentBrightness = nightBrightness;
    this._currentTemperature = nightTemperature;
    await this.setCapabilityValue('dim', nightBrightness);
    await this.setCapabilityValue('light_temperature', nightTemperature);
    await this.triggerValuesChangedFlow(nightBrightness, nightTemperature);
  }

  async updateFromPercentage(percentage: number): Promise<void> {
    if (this.getMode() !== 'adaptive') {
      this.log(`${this.getName()} is not in adaptive mode. (${this._mode})`);
      return;
    }

    this.log(`${this.getName()} is updating from percentage ${percentage}%...`);

    let valuesChanged = false;
    let brightness: number;
    let temperature: number;

    // Brightness
    {
      const minBrightness = this.getMinBrightness();
      const maxBrightness = this.getMaxBrightness();
      const brightnessDelta = maxBrightness - minBrightness;
      brightness = (percentage > 0)
        ? (brightnessDelta * percentage) + minBrightness
        : minBrightness;

      const currentBrightness = this.getCurrentBrightness();
      if (!approximatelyEqual(brightness, currentBrightness)) {
        this._currentBrightness = brightness;
        await this.setCapabilityValue('dim', brightness);
        valuesChanged = true;
        this.log(`Brightness updated to be ${brightness * 100.0}% in range ${minBrightness * 100.0}% - ${maxBrightness * 100.0}%`);
      } else {
        this.log(`No change in brightness from ${currentBrightness}%`);
      }
    }

    // Temperature
    {
      const sunsetTemp = this.getSunsetTemperature();
      const noonTemp = this.getNoonTemperature();
      const tempDelta = sunsetTemp - noonTemp;
      const calculatedTemperature = (tempDelta * (1 - percentage)) + noonTemp; // gets less as we move to noon
      temperature = (percentage > 0) ? calculatedTemperature : sunsetTemp;

      const currentTemperature = this.getCurrentTemperature();
      if (!approximatelyEqual(temperature, currentTemperature)) {
        this._currentTemperature = temperature;
        await this.setCapabilityValue('light_temperature', temperature);
        valuesChanged = true;
        this.log(`Temperature updated to be ${temperature * 100.0}% in range ${sunsetTemp * 100.0}% - ${noonTemp * 100.0}%`);
      } else {
        this.log(`No change in temperature from ${currentTemperature}%`);
      }
    }

    if (valuesChanged) {
      await this.triggerValuesChangedFlow(brightness, temperature);
    }
  }

  async triggerValuesChangedFlow(brightness: number, temperature: number): Promise<void> {
    this.log(`Triggering values changed with temperature ${temperature} and brightness ${brightness}`);
    return (this.driver as CircadianDriver).triggerValuesChangedFlow(this, {
      brightness,
      temperature,
    }, {});
  }

}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < FLOAT_EPSILON;
}

module.exports = CircadianZone;
