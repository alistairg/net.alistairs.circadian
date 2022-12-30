import SunCalc, { GetTimesResult } from 'suncalc';

class SunEvent {

    readonly timestamp: Date;

    constructor (timestamp: Date) {
        this.timestamp = timestamp;
    }

}

export class SunEventSunrise extends SunEvent {

    toString() {
        return `Sunrise at ${this.timestamp}`;
    }

}

export class SunEventSunset extends SunEvent {

    toString() {
        return `Sunset at ${this.timestamp}`;
    }

}

export class SunEventSolarNoon extends SunEvent {

    toString() {
        return `Noon at ${this.timestamp}`;
    }

}

export class SunEventSolarMidnight extends SunEvent {

    toString() {
        return `Midnight at ${this.timestamp}`;
    }

}

export class SunTools {

    readonly centralDate: Date;
    readonly latitude: number;
    readonly longitude: number;
    readonly keyEvents: Array<SunEvent>;

    constructor (centralDate: Date, latitude: number, longitude: number) {
        this.centralDate = centralDate;
        this.latitude = latitude;
        this.longitude = longitude;
        let dayMinusOne = new Date();
        dayMinusOne.setDate(centralDate.getDate() - 1); 
        let dayPlusOne = new Date();
        dayPlusOne.setDate(centralDate.getDate() + 1); 
        const dayMinusOneTimes: SunCalc.GetTimesResult = SunCalc.getTimes(dayMinusOne, latitude, longitude);
        const dayZeroTimes: SunCalc.GetTimesResult = SunCalc.getTimes(centralDate, latitude, longitude);
        const dayPlusOneTimes: SunCalc.GetTimesResult = SunCalc.getTimes(dayPlusOne, latitude, longitude);
        let allEvents: Array<SunEvent> = [...this._sunEventsToArray(dayMinusOneTimes), ...this._sunEventsToArray(dayZeroTimes), ...this._sunEventsToArray(dayPlusOneTimes)];
        allEvents.sort((a, b) => (a.timestamp.getTime() - b.timestamp.getTime()));
        this.keyEvents = allEvents;
    }

    private _sunEventsToArray(source: SunCalc.GetTimesResult): Array<SunEvent> {
        return [
            new SunEventSunrise(source.sunrise),
            new SunEventSolarNoon(source.solarNoon),
            new SunEventSunset(source.sunset),
            new SunEventSolarMidnight(source.nadir)
        ]
    }

    getNextEvent(after: Date): SunEvent | undefined {
        return this.keyEvents.find(event => {
            return event.timestamp.getTime() > after.getTime();
        });
    }

    getLastEvent(before: Date): SunEvent | undefined {
        return this.keyEvents.reverse().find(event => {
            return event.timestamp.getTime() < before.getTime();
        });
    }

    toString() {
        return `${this.keyEvents.length} events`;
    }

}