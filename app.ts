import Homey from 'homey';

class CircadianApp extends Homey.App {

  async onInit() {
    this.log('Circadian app has been initialized');
  }

}

module.exports = CircadianApp;
