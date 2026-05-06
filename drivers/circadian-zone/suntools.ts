import SunCalc from 'suncalc';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class SunEvent {
  readonly timestamp: Date;

  constructor(timestamp: Date) {
    this.timestamp = timestamp;
  }
}

export class SunEventSunrise extends SunEvent {
  toString() {
    return `Sunrise at ${this.timestamp.toISOString()}`;
  }
}

export class SunEventSunset extends SunEvent {
  toString() {
    return `Sunset at ${this.timestamp.toISOString()}`;
  }
}

export class SunEventSolarNoon extends SunEvent {
  toString() {
    return `Noon at ${this.timestamp.toISOString()}`;
  }
}

export class SunEventSolarMidnight extends SunEvent {
  toString() {
    return `Midnight at ${this.timestamp.toISOString()}`;
  }
}

export class SunTools {

  readonly centralDate: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly keyEvents: ReadonlyArray<SunEvent>;

  constructor(centralDate: Date, latitude: number, longitude: number) {
    this.centralDate = centralDate;
    this.latitude = latitude;
    this.longitude = longitude;

    // Compute ±1 day relative to centralDate (NOT today). The previous
    // implementation used `new Date()` (now) and then called `setDate(...)`
    // with `centralDate.getDate() ± 1`, which only worked when today and
    // centralDate were in the same month — at month boundaries the year
    // and/or month would be wrong.
    const dayMinusOne = new Date(centralDate.getTime() - ONE_DAY_MS);
    const dayPlusOne = new Date(centralDate.getTime() + ONE_DAY_MS);

    const minusOneTimes = SunCalc.getTimes(dayMinusOne, latitude, longitude);
    const zeroTimes = SunCalc.getTimes(centralDate, latitude, longitude);
    const plusOneTimes = SunCalc.getTimes(dayPlusOne, latitude, longitude);

    const allEvents = [
      ...this._sunEventsToArray(minusOneTimes),
      ...this._sunEventsToArray(zeroTimes),
      ...this._sunEventsToArray(plusOneTimes),
    ];
    allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    this.keyEvents = allEvents;
  }

  private _sunEventsToArray(source: SunCalc.GetTimesResult): SunEvent[] {
    return [
      new SunEventSunrise(source.sunrise),
      new SunEventSolarNoon(source.solarNoon),
      new SunEventSunset(source.sunset),
      new SunEventSolarMidnight(source.nadir),
    ];
  }

  getNextEvent(after: Date): SunEvent | undefined {
    const afterMs = after.getTime();
    return this.keyEvents.find((event) => event.timestamp.getTime() > afterMs);
  }

  /**
   * Returns the most recent SunEvent strictly before `before`. Iterates
   * the sorted events from the end without mutating — the previous
   * implementation called `keyEvents.reverse()` which mutated the array
   * in place, leaving subsequent `getNextEvent` / `getLastEvent` calls
   * to walk a reversed list. Works correctly now even with repeated
   * calls in any order.
   */
  getLastEvent(before: Date): SunEvent | undefined {
    const beforeMs = before.getTime();
    for (let i = this.keyEvents.length - 1; i >= 0; i--) {
      if (this.keyEvents[i].timestamp.getTime() < beforeMs) {
        return this.keyEvents[i];
      }
    }
    return undefined;
  }

  toString() {
    return `${this.keyEvents.length} events`;
  }

}
