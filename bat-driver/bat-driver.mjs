import Ina219Board from 'ina219-async'
import EventEmitter from 'events';

const batAddr = 0x43;
const batBus = 1;

const battery_max = 4.20;
const battery_min = 3.0;

class BatteryManager extends EventEmitter {

  __calibrated = false;
  _voltage = 0;
  _current = 0;
  _power = 0;
  _charge = 0;
  _charging = false;
  _chargeThreshold = 20;
  _readingData = false;

  constructor() {
    super();
    this.bus = Ina219Board(batAddr, batBus);
  }

  // Get the voltage in volts
  async getVoltage() {
    // if (this._readingData) {
    //   console.error('Reading data in progress');
    //   return this._voltage;
    // }

    if (!this.__calibrated) {
      await this.calibrate();
    }
    const volts = await this.bus.getBusVoltage_V();
    return Math.floor(volts * 100, 2) / 100;
  }

  // Get the current in amps
  async getCurrent() {
    // if (this._readingData) {
    //   console.error('Reading data in progress');
    //   return this._current;
    // }

    if (!this.__calibrated) {
      await this.calibrate();
    }
    const amps = await this.bus.getCurrent_mA();
    return Math.floor(amps) / 1000;
  }

  // Calibrate the sensor
  async calibrate() {
    await this.bus.calibrate32V2A();
    this.calibrated = true;
  }

  // Check the battery status
  async checkBattery() {
    if (this._readingData) {
      console.error('Reading battery data in progress');
      return;
    }
    this._readingData = true;

    try {
      this._voltage = await this.getVoltage();
      this._current = await this.getCurrent();
    } catch (error) {
      console.error('Error reading battery data:', error);
    }

    this._power = Math.floor(this._voltage * this._current * 100) / 100;
    this._charge = this.getChargePercentage(this._voltage);

    if ((this._current > 0) !== this._charging) {
      this._charging = this._current > 0;
      // call emitter after current function
      setTimeout(() => { this.emit('charging', this._charging) });
    }

    if (!this._charging) {
      this.setChargeThreshold(this._chargeThreshold);
    }

    this._readingData = false;
    // console.log("BATTERY:", { voltage: this._voltage, current: this._current, power: this._power, charge: this._charge, charging: this._charging });
  }

  // Get the charge percentage from the voltage
  getChargePercentage(voltage) {
    return Math.floor(((voltage - battery_min) / (battery_max - battery_min)) * 1000) / 10;
  }

  // Set the interval for checking battery
  setCheckInterval(interval) {
    this.clearCheckInterval();
    if (interval > 999) {
      this.interval = setInterval(() => {
        this.checkBattery();
      }, interval);
      this.checkBattery();
    } else {
      throw new Error('Interval must be greater than 999ms');
    }
  }

  // Clear the interval set for checking battery
  clearCheckInterval() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  // Set the charge threshold in percentage
  setChargeThreshold(threshold) {
    this._chargeThreshold = threshold;
    if (this._chargeThreshold && this._charge && this._charge < this._chargeThreshold) {
      setTimeout(() => { this.emit('lowCharge', this._charge) });
    }
  }

  // Gives the voltage in volts
  get voltage() {
    return this._voltage;
  }

  // Gives the current in amps
  get current() {
    return this._current;
  }

  // Gives the power in watts
  get power() {
    return this._power;
  }

  // Gives the percentage of charge remaining
  get charge() {
    return this._charge;
  }

  // Gives the charging status
  get charging() {
    return this._charging;
  }

}

export default BatteryManager;
