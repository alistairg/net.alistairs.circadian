import { CircadianTimingDriver } from './driver'

type TimeValue = {
  brightness: string;
  temperature: string;
};

interface Timing {
  [index: string]: TimeValue
};

type Time = {
  hours: number;
  minutes: number;
};

interface TimingItem {
  time: Time,
  value: TimeValue,
}

export class CircadianTimingZone extends require('../circadian-zone/device') {

  private _timings: TimingItem[] = [];
  private _nightTimings: TimingItem[] = [];
  private _fadeDuration: number = -1;

  async onSettings(event: {
    newSettings: { timing: string, night_timing: string, fade_duration: number },
    changedKeys: string[]
  }): Promise<string | void> {
    if (event.changedKeys.includes('timing')) {
      if (!this.validateTiming(event.newSettings.timing)) {
        return this.homey.__("json_timing_error");
      }
      this._timings = this.parseTiming(event.newSettings.timing);
    }
    if (event.changedKeys.includes('night_timing')) {
      if (!this.validateTiming(event.newSettings.night_timing)) {
        return this.homey.__("json_timing_error");
      }
      this._nightTimings = this.parseTiming(event.newSettings.night_timing);
    }
    if (event.changedKeys.includes('fade_duration')) {
      this._fadeDuration = event.newSettings.fade_duration;
    }
    await super.onSettings(event);
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    this._timings = this.parseTiming(await this.getSetting("timing"));
    this._nightTimings = this.parseTiming(await this.getSetting("night_timing"));

    // Mode Listener
    this.registerCapabilityListener("adaptive_mode", async (value: any) => {
      this.log(`Mode changed to ${value}`)
      await this.setMode(value);
    });

    // Temperature Override Listener
    this.registerCapabilityListener("light_temperature", async (value: any) => {
      this.log(`Temperature override to ${value}`);
      await this.overrideCurrentTemperature(value);
    });

    // Dim Override Listener
    this.registerCapabilityListener("dim", async (value: any) => {
      this.log(`Dim override to ${value}`);
      await this.overrideCurrentBrightness(value);
    });

    this.log('CircadianTimingZone has been initialized');
    this.refreshZone();
  }

  /**
   * refreshZone updates the zone values, based on mode and circadian progress
   */
  async refreshZone() {
    const mode = await this.getMode();
    if (mode == "adaptive") {
      if (this._timings.length < 2) {
        super.refreshZone();
        return;
      }
    } else if (mode == "night") {
      if (this._nightTimings.length < 2) {
        super.refreshZone();
        return;
      }
    } else {
      return;
    }

    let valuesChanged: boolean = false;
    const date = new Date()
    const currentTime: Time = this.dateToLocalTime(date);
    const prevItem = this.findPrevItem(currentTime, mode);
    const nextItem = this.findNextItem(currentTime, mode);

    let brightness: number = -1;
    if (prevItem.value.brightness === 'circadian' && nextItem.value.brightness === 'circadian') {
      brightness = await this.calcCircadianBrightness(mode);
    } else {
      const fade = await this.calcPrevNextFade(prevItem, nextItem)
      const prevBrightness = await this.calcItemPrevBrightness(prevItem, mode);
      const nextBrightness = await this.calcItemBrightness(nextItem, mode);
      brightness = prevBrightness * (1 - fade) + nextBrightness * fade;
    }

    let temperature: number = -1;
    if (prevItem.value.temperature === 'circadian' && nextItem.value.temperature === 'circadian') {
      temperature = await this.calcCircadianTemperature(mode);
    } else {
      const fade = await this.calcPrevNextFade(prevItem, nextItem)
      const prevTemperature = await this.calcItemPrevTemperature(prevItem, mode);
      const nextTemperature = await this.calcItemTemperature(nextItem, mode);
      temperature = prevTemperature * (1 - fade) + nextTemperature * fade;
    }
    brightness = Math.round(brightness * 100) / 100;
    let currentBrightness = await this.getCurrentBrightness();
    if (brightness != currentBrightness) {
      this._currentBrightness = brightness;
      await this.setCapabilityValue("dim", brightness);
      valuesChanged = true;
    }
    const currentTemperature = await this.getCurrentTemperature();

    temperature = Math.round(temperature * 100) / 100;

    if (temperature != currentTemperature) {
      this._currentTemperature = temperature;
      await this.setCapabilityValue("light_temperature", temperature);
      valuesChanged = true;
    } else {
      this.log(`No change in temperature from ${this._currentTemperature}%`)
    }

    // Trigger flow if appropriate
    if (valuesChanged) {
      await this.triggerValuesChangedFlow(brightness, temperature);
    }
  }

  async getFadeDuration(): Promise<number> {
    if (this._fadeDuration == -1) {
      this._fadeDuration = await this.getSetting("fade_duration");
    }
    return this._fadeDuration;
  }

  private async calcCircadianBrightness(mode: string, date?: Date) {
    if (mode === 'night') {
      return await this.getNightBrightness();
    }
    const percentage = (this.driver as CircadianTimingDriver).getPercentageForDate(date);
    const minBrightness: number = await this.getMinBrightness();
    const maxBrightness: number = await this.getMaxBrightness();
    const brightnessDelta = maxBrightness - minBrightness;
    return (percentage > 0) ? (brightnessDelta * percentage) + minBrightness : minBrightness;
  }

  private async calcCircadianTemperature(mode: string, date?: Date) {
    if (mode === 'night') {
      return await this.getNightTemperature();
    }
    const percentage = (this.driver as CircadianTimingDriver).getPercentageForDate(date);
    const sunsetTemp: number = await this.getSunsetTemperature();
    const noonTemp: number = await this.getNoonTemperature();
    const tempDelta = sunsetTemp - noonTemp;
    let calculatedTemperature = (tempDelta * (1 - percentage)) + noonTemp;
    return (percentage > 0) ? calculatedTemperature : sunsetTemp;
  }

  private async calcPrevNextFade(prevItem: TimingItem, nextItem: TimingItem) {
    let diff = this.timeToInt(nextItem.time) - this.timeToInt(prevItem.time)
    if (diff < 0) {
      diff = 24 * 60 - diff;
    }

    const fadeDuration = Math.min(await this.getFadeDuration(), diff);

    const currentTime: Time = this.dateToLocalTime(new Date());

    diff = this.timeToInt(nextItem.time) - this.timeToInt(currentTime)
    if (diff < 0) {
      diff = 24 * 60 - diff;
    }

    if (diff > fadeDuration) {
      return 0;
    }
    return (fadeDuration - diff) / fadeDuration;
  }

  private async calcItemBrightness(item: TimingItem, mode: string) {
    if (item.value.brightness === 'circadian') {
      const date = new Date()
      const currentTime = this.dateToLocalTime(date);

      const diff = this.timeToInt(item.time) - this.timeToInt(currentTime)
      date.setMinutes(date.getMinutes() + diff);

      return await this.calcCircadianBrightness(mode, date)
    }
    return parseFloat(item.value.brightness);
  }

  private async calcItemPrevBrightness(item: TimingItem, mode: string) {
    if (item.value.brightness === 'circadian') {
      return await this.calcCircadianBrightness(mode)
    }
    return parseFloat(item.value.brightness);
  }

  private async calcItemPrevTemperature(item: TimingItem, mode: string) {
    if (item.value.temperature === 'circadian') {
      return await this.calcCircadianTemperature(mode)
    }
    return parseFloat(item.value.temperature);
  }
  
  private async calcItemTemperature(item: TimingItem, mode: string) {
    if (item.value.temperature === 'circadian') {
      const date = new Date()
      const currentTime: Time = this.dateToLocalTime(date);

      const diff = this.timeToInt(item.time) - this.timeToInt(currentTime)
      date.setMinutes(date.getMinutes() + diff);

      return await this.calcCircadianTemperature(mode, date)
    }
    return parseFloat(item.value.temperature);
  }

  private timeToInt(time: Time) {
    return time.hours * 60 + time.minutes;
  }

  private findPrevItem(time: Time, mode: string) {
    let arr = this.getTimingArray(mode);
    let index = this.binarySearch(arr, time);
    if (index < arr.length && this.timeToInt(arr[index].time) === this.timeToInt(time)) {
      return arr[index];
    }
    index--;
    if (index >= 0) {
      return arr[index];
    }
    return arr[arr.length - 1];
  }

  private findNextItem(time: Time, mode: string) {
    let arr = this.getTimingArray(mode);
    let index = this.binarySearch(arr, time);
    if (index >= arr.length) {
      return arr[0];
    }
    if (this.timeToInt(arr[index].time) === this.timeToInt(time)) {
      index++;
    }
    if (index >= arr.length) {
      return arr[0];
    }
    return arr[index];
  }

  private getTimingArray(mode: string): TimingItem[] {
    if (mode === 'adaptive') {
      return this._timings;
    }
    return this._nightTimings;
  }

  private binarySearch(arr: TimingItem[], target: Time): number {
    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (arr[mid].time.hours === target.hours && arr[mid].time.minutes === target.minutes) {
        return mid;
      }
      if (this.timeToInt(arr[mid].time) < this.timeToInt(target)) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return left; // Return the index where the item is supposed to stay
  }


  private validateTiming(timing: string): boolean {
    if (timing === '') {
      return true;
    }

    let lastTime = -1;

    try {
      const parsedTiming: Timing = JSON.parse(timing);
      if (Object.keys(parsedTiming).length < 2){
        return false;
      }
      for (const time in parsedTiming) {
        if (!this.isValidTime(time)) {
          this.log(`Time value ${time} is not valid`);
          return false;
        }

        const tm = this.parseTime(time);

        const intTime = this.timeToInt(tm);
        if (intTime <= lastTime) {
          this.log(`Time value ${time} smaller than prev time`);
          return false;
        }

        lastTime = intTime;

        const value = parsedTiming[time];
        if (value.brightness !== 'circadian') {
          const brightness = parseFloat(value.brightness);

          if (isNaN(brightness) || brightness < 0 || brightness > 1) {
            return false;
          }
        }

        if (value.temperature !== 'circadian') {
          const temperature = parseFloat(value.temperature);
          if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            return false;
          }
        }
      }
      return true;
    } catch (e) {
      this.log(e)
      return false;
    }
  }

  private isValidTime(time: string): boolean {
    const timeRegExp = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegExp.test(time);
  }

  private parseTiming(timing: any): TimingItem[] {
    if (!timing) {
      return [];
    }
    const rawTiming: Timing = JSON.parse(timing);
    const result: TimingItem[] = [];
    for (const time in rawTiming) {
      result.push(
        {
          time: this.parseTime(time),
          value: rawTiming[time]
        }
      )
    }
    return result;
  }

  private parseTime(time: string): Time {
    const [hoursStr, minutesStr] = time.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    return { hours, minutes };
  }

  private dateToLocalTime(date: Date) {
    return this.parseTime(
      date.toLocaleString('en-UK',
        { minute: 'numeric', hour: 'numeric', timeZone: this.homey.clock.getTimezone() }
      )
    );
  }
}

module.exports = CircadianTimingZone;
