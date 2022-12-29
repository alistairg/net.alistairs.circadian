import Homey from 'homey';
import { CircadianDriver } from './driver'

export class CircadianZone extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
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
    this.log(`${this.getName()} is updating from percentage ${percentage}%...`);

    // Brightness
    const minBrightness: number = this.getSetting("min_brightness") || 0;
    const maxBrightness: number = this.getSetting("max_brightness") || 100;
    const brightnessDelta = maxBrightness - minBrightness;
    let brightness = Math.round((brightnessDelta * (percentage/100))) + minBrightness;
    const currentBrightness = this.getCapabilityValue("circadian_brightness")
    if (brightness != currentBrightness) {
      await this.setCapabilityValue("circadian_brightness", brightness);
      this.log(`Brightness updated to be ${brightness}% in range ${minBrightness}% - ${maxBrightness}%`);
    }
    else {
      this.log(`No change in brightness from ${currentBrightness}%`)
    }

    // Temperature
    const minTemp: number = this.getSetting("min_temp") || 0;
    const maxTemp: number = this.getSetting("max_temp") || 100;
    const tempDelta = maxTemp - minTemp;
    let temperature = Math.round((tempDelta * (percentage/100))) + minTemp;
    const currentTemperature = this.getCapabilityValue("circadian_temperature")
    if (brightness != currentTemperature) {
      await this.setCapabilityValue("circadian_temperature", temperature);
      this.log(`Temperature updated to be ${temperature}K in range ${minTemp}K - ${maxTemp}K`);
    }
    else {
      this.log(`No change in brightness from ${currentTemperature}%`)
    }

  }

}

module.exports = CircadianZone;
