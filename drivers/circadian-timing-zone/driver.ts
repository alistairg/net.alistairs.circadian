const { v4: uuidv4 } = require('uuid');
import { CircadianTimingZone } from './device';

export class CircadianTimingDriver extends require('../circadian-zone/driver') {


  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    super.onInit()
    this._circadianValuesChangedFlow = this.homey.flow.getDeviceTriggerCard("circadian_timing_changed");
    this.log('CircadianTimingDriver has been initialized');
  }

  async onPairListDevices() {
    this.log('onPairListDevices');
    return [
      {
        name: this.homey.__("circadian_timing_zone"),
        data: {
          id: uuidv4(),
        },
      },
    ];
  }

  async _updateCircadianZones() {

    this.log("Circadian time zones");
    this.getDevices().forEach(async (device: CircadianTimingZone) => {
      await device.refreshZone();
    });

  }
}

module.exports = CircadianTimingDriver;
