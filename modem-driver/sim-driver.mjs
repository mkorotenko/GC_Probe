import { SIM7000 } from './sim7000e.js';
import { APN_GATE } from './modem-config.mjs';
import { Gpio } from 'pigpio';
import { exec } from 'child_process';

class Location {
  constructor(longitude, latitude, acuracy, dateTime) {
    this.longitude = longitude;
    this.latitude = latitude;
    this.acuracy = acuracy;
    this.dateTime = dateTime;
  }

  toString() {
    return `Longitude: ${this.longitude}, Latitude: ${this.latitude}, Acuracy: ${this.acuracy}`;
  }
}

class LocationGNSS extends Location {
  constructor(longitude, latitude, acuracy, isFixed, satelites, satelitesUsed, dateTime) {
    super(longitude, latitude, acuracy, dateTime);
    this.isFixed = isFixed;
    this.satelites = satelites;
    this.satelitesUsed = satelitesUsed;
  }

  toString() {
    return `${super.toString()}, Fixed: ${this.isFixed}, Satelites: ${this.satelites}, Satelites used: ${this.satelitesUsed}`;
  }
}

function parseGNSSDate(dateString) {
  const year = parseInt(dateString.substring(0, 4), 10);
  const month = parseInt(dateString.substring(4, 6), 10) - 1; // Months are zero-based in JavaScript
  const day = parseInt(dateString.substring(6, 8), 10);
  const hours = parseInt(dateString.substring(8, 10), 10);
  const minutes = parseInt(dateString.substring(10, 12), 10);
  const seconds = parseInt(dateString.substring(12, 14), 10);
  const milliseconds = parseInt(dateString.substring(15, 18), 10);

  let datetime = undefined;
  try {
    datetime = new Date(Date.UTC(year, month, day, hours, minutes, seconds, milliseconds));
  } catch (error) {
    console.error('Parsing date error:', error);
  }
  return datetime;
}

//GNSS location parsing
function parseCGNSINF(response) {
  const parts = response.split(':')[1].trim().split(',');

  return {
      gnssRunStatus: parts[0],//parseInt(parts[0], 10),
      fixStatus: parts[1],//parseInt(parts[1], 10),
      utcDateTime: parseGNSSDate(parts[2]),
      latitude: parts[4],//parseFloat(parts[4]),
      longitude: parts[3],//parseFloat(parts[3]),
      mslAltitude: parts[5],//parseFloat(parts[5]),
      speedOverGround: parts[6],//parseFloat(parts[6]),
      courseOverGround: parts[7],//parseFloat(parts[7]),
      fixMode: parts[8],//parseInt(parts[8], 10),
      hdop: parts[10],//parseFloat(parts[10]),
      pdop: parts[11],//parseFloat(parts[11]),
      vdop: parts[12],//parseFloat(parts[12]),
      gnssSatellitesInView: parts[14],//parseInt(parts[14], 10),
      gnssSatellitesUsed: parts[15],//parseInt(parts[15], 10),
      glonassSatellitesUsed: parts[16],//parseInt(parts[16], 10),
      cn0Max: parts[18],//parseFloat(parts[18]),
      hpa: parts[19],//parseFloat(parts[19]),
      vpa: parts[20],//parseFloat(parts[20])
  };
}

async function awaitTimeout(timeout = 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, timeout);
  });
}

class CommunicationModule extends SIM7000 {

  _signalQuality = 0;
  _signalQualityMax = 31;
  _signalQualityTimeout = 5000;
  _signalQualityID = undefined;
  
  _lastGNSSLocation = undefined;
  _lastGSMLocation = undefined;

  _gettingGNSSLocation = false;
  _gettingGSMLocation = false;

  constructor(uartPath, baudRate) {
    super(uartPath, { baudRate: baudRate });
  }

  async pwrOn() {
    console.info('Powering on SIM7000...');
    const pwrKey = new Gpio(4, {mode: Gpio.OUTPUT});

    pwrKey.digitalWrite(1);
    await awaitTimeout(2400);
  }

  async pwrToggle() {
    console.info('Power toggle SIM7000...');
    const pwrKey = new Gpio(4, {mode: Gpio.OUTPUT});

    pwrKey.digitalWrite(0);
    await awaitTimeout(200);

    pwrKey.digitalWrite(1);
    await awaitTimeout(2100);

    pwrKey.digitalWrite(0);
  }

  async awaitHandshake(timeout = 10000) {
    return new Promise(async (resolve, reject) => {
      // console.info('  STARTING handshake...');
        const startTime = new Date().getTime();
        let handshake = false;
        while ((new Date().getTime() - startTime < timeout) && !handshake) {
            handshake = await this.sendHandshake();
            // console.info('  Handshake:', handshake);
            await awaitTimeout(1000);
        }
        resolve(handshake);
    });
  }

  // Open connection
  async openConnection(timeout = 10000) {
    const isLocked = await this.isPortLocked(this.port);
    if (isLocked) {
      console.error(`Modem port ${this.port} is locked`);
      return false;
    }
    // console.info(`Opening port ${this.port} ...`);
    const isOpen = await this.open();
    if (!isOpen) {
      console.log('Cannot open Modem connection');
      return false;
    }

    // console.info('sending handshake...');
    const handshake = await this.awaitHandshake(timeout);
    // console.info('Handshake resp:', handshake);
    if (!handshake) {
      console.log('Communication with Modem failed');
      return false;
    }

    console.info('Modem is ready');

    // await this.getSignalQuality();
    // console.info('Signal Quality:', this.signalQualityDisplay());

    return true;
  }

  async isPortLocked(port) {
    return new Promise((resolve, reject) => {
      // console.info(`Checking if port ${port} is locked...`);
      exec(`sudo lsof ${port} 2>/dev/null`, (error, stdout, stderr) => {
        // console.info(`CHECK resp:`, error, stdout, stderr);
          // TODO: implement proper error handling
          if (error) {
              // console.error(`Error executing lsof: ${stderr}`);
              // reject(error);
              // assuming port is not locked
              resolve(false);
              return;
          }

          resolve(stdout);
      });
    });
  }

  // TODO: Implement proper reboot sequence
  async simReboot(awaitUP = false, timeout = 60000) {
    return new Promise((resolve, reject) => {
            this.queue.push({
                data: 'AT+CFUN=1,1',
                callback: (data) => {
                    console.info('Rebooting Modem:', data);
                    if (!awaitUP) {
                        resolve(data);
                    }
                }
            });
            if (!this.busy) {
                this.processQueue();
            }

            if (awaitUP) {
                const handshake = this.awaitHandshake(timeout);
                resolve(handshake);
            }
        });
  }

  // Get signal quality
  async getSignalQuality() {
    // Clear previous timeout
    if (this._signalQualityID) {
      clearTimeout(this._signalQualityID);
    }
    // Get signal quality
    this._signalQuality = await super.getSignalQuality();
    // Set new timeout
    this._signalQualityID = setTimeout(() => {
      this.getSignalQuality();
    }, this._signalQualityTimeout);
    // Return signal quality
    return this._signalQuality;
  }

  // Display signal quality
  async signalQualityDisplay() {
    return `${this._signalQuality} / ${this._signalQualityMax}`;
  }

  // TODO: make working
  async sendUSSD(ussdCode) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        data: `AT+CUSD=1,"${ussdCode}"`,
        callback: (response) => {
        //   if (response.includes('OK')) {
            resolve(response);
        //   } else {
        //     reject(new Error('Failed to send USSD'));
        //   }
        }
      });

      if (!this.busy) {
        this.processQueue();
      }
    });
  }

  // Get GSM location
  async getGSMLocation() {
    //   commands = [
    //     {"command": "AT+SAPBR=3,1,"Contype","GPRS"", "expected_response": Status.OK, "comment": "Set bearer parameter"},
    //     {"command": "AT+SAPBR=3,1,\"APN\",\"{:s}\"".format(APN_GATE), "expected_response": Status.OK, "comment": "Set bearer context"},
    //     {"command": "AT+SAPBR=1,1", "expected_response": Status.OK, "comment": "Activate bearer context"},
    //     {"command": "AT+SAPBR=2,1", "expected_response": Status.OK, "comment": "Read bearer parameter"},
    //     #-------GETTING LOCATION-------------
    //     {"command": "AT+CLBSCFG=0,1", "expected_response": Status.OK, "comment": "Get customer ID"},
    //     {"command": "AT+CLBSCFG=0,2", "expected_response": Status.OK, "comment": "Get Times have used positioning command"},
    //     {"command": "AT+CLBSCFG=0,3", "expected_response": Status.OK, "comment": "Get LBS server’s address"},
    //     {"command": "AT+CLBS=4,1", "expected_response": Status.OK, "comment": "Getting location"},
    //     {"command": "AT+SAPBR=0,1", "expected_response": Status.OK, "comment": "Deactivate bearer context"},
    // ]

    return new Promise((resolve, reject) => {

      if (this._gettingGSMLocation) {
        console.log('Getting GSM location already in progress');
        resolve(this._lastGSMLocation);
        return;
      }

      this._gettingGSMLocation = true;
      function parseCLBS(data) {
        // console.log('Getting location:', data);
        if (data.startsWith('+CLBS:')) {
          const split = data.split(',');
          if (split.length >= 4) {
            //+CLBS: 0,30.371534,50.372671,550,2024/12/25,22:05:00
            // const longitude = split[1];
            // const latitude = split[2];
            // const acuracy = split[3];
            // const date = split[4];
            // const time = split[5];
            let dateTime = undefined;
            try {
              dateTime = new Date(`${split[4]} ${split[5]}`);
            } catch (error) {
              console.error('Getting datetime error:', error);
            }
            this._lastGSMLocation = new Location(parseFloat(split[1]), parseFloat(split[2]), parseInt(split[3]), dateTime);

            console.log('GSMLocation:', this._lastGSMLocation);
          }
        } else {
          console.error('Failed to get GSM location:', data);
        }
        resolve(this._lastGSMLocation);
      }
      function callb(fName, data) {
        // console.info('Command response:', fName, data);
      }
      const commandsQueue = [
        { data: 'AT+SAPBR=3,1,\"Contype\",\"GPRS\"', callback: callb.bind(undefined, 'AT+SAPBR=3,1,\"Contype\",\"GPRS\"') }, // Set bearer parameter
        { data: `AT+SAPBR=3,1,\"APN\",\"${APN_GATE}\"`, callback: callb.bind(undefined, `AT+SAPBR=3,1,\"APN\",\"${APN_GATE}\"`) }, // Set bearer context
        { data: 'AT+SAPBR=1,1', callback: callb.bind(undefined, 'AT+SAPBR=1,1') }, // Activate bearer context
        { data: 'AT+SAPBR=2,1', callback: callb.bind(undefined, 'AT+SAPBR=2,1') }, // Read bearer parameter
        // { data: 'AT+CLBSCFG=0,1', callback: callb.bind(undefined,'AT+CLBSCFG=0,1') }, // Get customer ID
        // { data: 'AT+CLBSCFG=0,2', callback: callb.bind(undefined,'AT+CLBSCFG=0,2') }, // Get Times have used positioning command
        // { data: 'AT+CLBSCFG=0,3', callback: callb.bind(undefined,'AT+CLBSCFG=0,3') }, // Get LBS server’s address
        { data: 'AT+CLBS=4,1', callback: parseCLBS.bind(this) }, // Getting location
        { data: 'AT+SAPBR=0,1', callback: callb.bind(undefined, 'AT+SAPBR=0,1') }, // Deactivate bearer context
      ];

      for (const command of commandsQueue) {
        this.queue.push(command);
      }

      if (!this.busy) {
        this.processQueue();
      }

      this._gettingGSMLocation = false;
    });
  }

  // async execCommand(command) {
  //   return new Promise((resolve, reject) => {
  //     command.callback = (data) => {
  //       console.log('Command response:', data);
  //       resolve(data);
  //   };
  //     this.queue.push(command);

  //     if (!this.busy) {
  //       this.processQueue();
  //     } else {
  //       console.error('Busy...');
  //     }
  //   });
  // }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      const res = [];
      function parseResponse(data) {
        res.push(data);
        resolve({ 'resp': res });
      }
      function callbCollect(fName, data) {
        // res.push({ [fName]: data });
        res.push(data);
      }

      // const commandsQueue = [
      //   { data: 'AT+CSQ', callback: callbCollect.bind(undefined, 'AT+CSQ') }, // Get signal quality
      //   { data: `AT+CENG=${mode},1`, callback: callbCollect.bind(undefined, `AT+CENG=${mode},1`) }, // Set mode
      //   { data: 'AT+CENG?', callback: callbCollect.bind(undefined, `AT+CENG?`) }, // Getting location
      //   { data: 'AT+CENG=0', callback: parseResponse },
      // ];
      const commandsQueue = command.map(item => {
        return { data: item.data, callback: callbCollect.bind(undefined, item) };
      })
      commandsQueue[commandsQueue.length - 1].callback = parseResponse;

      for (const command of commandsQueue) {
        this.queue.push(command);
      }

      resolve({ 'resp': commandsQueue });
      // if (!this.busy) {
      //   this.processQueue();
      // }

    });
  }

  async checkGNSS() {
    return new Promise((resolve, reject) => {
      this.queue.push({
        data: 'AT+CGNSPWR?',
        callback: (data) => {
          if (data.startsWith('+CGNSPWR:')) {
            const split = data.split(':');
            if (split.length < 1) {
              resolve(0);
            }
            resolve(parseFloat(split[1]));
          }
          console.error('GNSS power status:', data);
          resolve(data);
        }
      });

      if (!this.busy) {
        this.processQueue();
      }
    });
  }

  async getSimNumber() {
    return new Promise((resolve, reject) => {
      this.queue.push({
        data: 'AT+CNUM',
        callback: (data) => {
          console.log('SIM number:', data);
          // if (data.startsWith('+CGNSPWR:')) {
          //   const split = data.split(':');
          //   if (split.length < 1) {
          //     resolve(0);
          //   }
          //   resolve(parseFloat(split[1]));
          // }
          // console.error('GNSS power status:', data);
          resolve(data);
        }
      });

      if (!this.busy) {
        this.processQueue();
      }
    });
  }

  async enableGNSS() {

    if (await this.checkGNSS() === 1) {
      // console.log('GNSS already enabled');
      return;
    }

    // Enable GPS
    this.queue.push({
      data: 'AT+CGNSPWR=1',
    });

    if (!this.busy) {
      this.processQueue();
    }

    console.info('Waiting for 30sec...');
    // Wait for GPS initialization
    // await new Promise((resolve, reject) => {
    //   setTimeout(() => {
    //     resolve();
    //   }, 30000);
    // });
    await awaitTimeout(30000);

    await this.checkGNSS();
  }

  async disableGNSS() {
    // Disable GPS
    this.queue.push({
      data: 'AT+CGNSPWR=0',
    });

    if (!this.busy) {
      this.processQueue();
    }
  }

  async getGNSSStatus() {
    // Get GPS status
    this.queue.push({
      data: 'AT+CGNSSTATUS',
    });

    if (!this.busy) {
      this.processQueue();
    }
  }

  async getGNSSLocation(keepOn = false) {

      if (this._gettingGNSSLocation) {
        console.log('Getting GNSS location already in progress');
        return this._lastGNSSLocation;
      }

      this._gettingGNSSLocation = true;
      console.info('Enabling GNSS receiver...');
      await this.enableGNSS();

      console.info('Getting GPS coordinates...');
      // Get GPS coordinates
      let gpsFixed = false;
      const startTime = new Date().getTime();
      while ((new Date().getTime() - startTime < 60000) && !gpsFixed) {
        // console.info('Push command to queue...');
        // Get GPS coordinates
        //+CGNSINF: 1,1,20241226080453.000,50.375451,30.382872,7.600,0.00,152.5,1,,2.1,2.3,1.0,,15,3,3,,,36,,
        this.queue.push({
          data: 'AT+CGNSINF',
          callback: (data) => {
            console.log('GPS data:', data);
            if (data.startsWith('+CGNSINF:')) {
              const split = data.split(',');
              if (split.length >= 6 && split[1] === '1') {
                const resp = parseCGNSINF(data);
                // console.log('GNSS data:', resp);
                this._lastGNSSLocation = new LocationGNSS(
                  resp.latitude,
                  resp.longitude,
                  resp.hpa,
                  resp.fixStatus === '1',
                  resp.gnssSatellitesInView,
                  resp.gnssSatellitesUsed,
                  resp.utcDateTime
                );
                // console.log('GNSSLocation:', this._lastGNSSLocation);
                gpsFixed = true;
                this._gettingGNSSLocation = false;
                return;
              } else {
                console.log('GPS coordinates are not available (no fix), retrying...');
              }
            } else {
              console.error('Failed to get GNSS location:', data);
            }
          }
        });

        // console.info('Executing queue...');
        // processQueue may not start at all if was busy
        if (!this.busy) {
          this.processQueue();
        }

        console.info('Retry get GNSS data. Waiting for 5sec...');
        await awaitTimeout(5000);
      }

      if (!gpsFixed) {
        console.log('Failed to get GPS coordinates within 60 seconds');
      }

      if (!keepOn) {
        await this.disableGNSS();
      }

      this._gettingGNSSLocation = false;

      return this._lastGNSSLocation;
  }

  // Get GSM towers
  async getGSMTowers(mode=1) {
//   commands = [
//     {"command": "AT+CSQ", "expected_response": Status.OK},
//     {"command": "AT+CENG={:d},1".format(mode), "expected_response": Status.OK},
//     {"command": "AT+CENG?", "expected_response": Status.OK, "output": True},
//     {"command": "AT+CENG=0", "expected_response": Status.OK},
// ]

    return new Promise((resolve, reject) => {

      const res = [];

      function parseResponse(data) {
        res.push(data);
        resolve({ 'resp': res });
      }

      function callbCollect(fName, data) {
        res.push(data);
      }

      const commandsQueue = [
        { data: 'AT+CSQ', callback: callbCollect.bind(undefined, 'AT+CSQ') }, // Get signal quality
        { data: `AT+CENG=${mode},1`, callback: callbCollect.bind(undefined, `AT+CENG=${mode},1`) }, // Set mode
        { data: 'AT+CENG?', callback: callbCollect.bind(undefined, `AT+CENG?`) }, // Getting location
        { data: 'AT+CENG=0', callback: parseResponse },
      ];

      for (const command of commandsQueue) {
        this.queue.push(command);
      }

      if (!this.busy) {
        this.processQueue();
      }

    });
  }

  // Get GSM tower info
  async getGSMTower() {
    //   commands = [
    //     {"command": "AT+CREG?", "expected_response": Status.OK, "output": True},
    // ]

    return new Promise((resolve, reject) => {

      const res = [];

      function parseResponse(data) {
        res.push(data);
        resolve({ 'resp': res });
      }

      const commandsQueue = [
        { data: 'AT+CREG?', callback: parseResponse },
      ];

      for (const command of commandsQueue) {
        this.queue.push(command);
      }

      if (!this.busy) {
        this.processQueue();
      }

    });
  }

}

export { CommunicationModule, Location };

// TODO: implement chain of commands
// ATI;+CSUB;+CSQ;+CPIN?;+COPS?;+CGREG?;&D2

// SIM7000E R1351

// +CSUB: V03

// +CSQ: 31,99

// +CPIN: READY

// +COPS: 0,0,"Vodafone UA Vodafone UA",3

// +CGREG: 0,1

// OK

// AT+CGDCONT=1,"IP","INTERNET",,0,0

// OK

// ATD*99#

// CONNECT