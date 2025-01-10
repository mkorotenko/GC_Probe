"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIM7000 = void 0;
const serialport_1 = require("serialport");
class SIM7000 {
    constructor(port, options = undefined) {
        this.port = port;
        this.options = options;
        this.queue = [];
        this.current = undefined;
        this.busy = false;
        this.tty = new serialport_1.SerialPort({
            path: port,
            baudRate: (options === null || options === void 0 ? void 0 : options.baudRate) || 115200,
            autoOpen: false,
            endOnClose: true,
        });
        this.parser = this.tty.pipe(new serialport_1.ReadlineParser({ delimiter: '\r\n', }));
        this.parser.on('data', data => {
            const trimData = data.trim();
            if (!trimData.length) {
                return;
            }
            // if (trimData === 'Call Ready' || trimData === 'SMS Ready') {
            //     return;
            // }
            // if (trimData.at(0) === '+' && trimData.substring(0, 4) !== '+CSQ') {
            //     if (trimData.startsWith('+CMT')) {
            //         const split = trimData.split('"');
            //         if (split.length >= 1) {
            //             this.receivePhone = split[1];
            //         }
            //     }
            //     return;
            // }
            // if (this.receivePhone) {
            //     if (this.receiveMessageCallback) {
            //         this.receiveMessageCallback(this.receivePhone, trimData);
            //     }
            //     this.receivePhone = undefined;
            //     return;
            // }
            if (this.current && this.current.data.replace(String.fromCharCode(0x1A), '') !== trimData && this.current.callback) {
                this.current.callback(trimData);
                this.current = undefined;
            }
            if (trimData === 'OK' || trimData === '>' || trimData === 'ERROR') {
                this.processQueue();
            }
        });
    }
    open() {
        return new Promise((resolve, reject) => {
            this.tty.open(err => {
                // console.info('     Opened tty:', this.tty);
                if (err) {
                    console.error('Error opening tty:', err);
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    }
    isOpen() {
        return this.tty.isOpen;
    }
    close() {
        return new Promise((resolve, reject) => {
            this.tty.close(err => {
                if (err) {
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
    sendHandshake() {
        return new Promise((resolve, reject) => {
            this.queue.push({
                data: 'AT',
                callback: (data) => {
                    if (data === 'OK') {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                }
            });
            // console.info('     COMMAND: AT busy:', this.busy);
            if (!this.busy) {
                this.processQueue();
            }
        });
    }
    getSignalQuality() {
        return new Promise((resolve, reject) => {
            this.queue.push({
                data: 'AT+CSQ',
                callback: (data) => {
                    const split = data.split(':');
                    if (split.length < 1) {
                        resolve(0);
                    }
                    resolve(parseFloat(split[1]));
                }
            });
            if (!this.busy) {
                this.processQueue();
            }
        });
    }
    getSimInfo() {
        return new Promise((resolve, reject) => {
            this.queue.push({
                data: 'AT+CCID',
                callback: (data) => {
                    resolve(data);
                }
            });
            if (!this.busy) {
                this.processQueue();
            }
        });
    }
    sendMessage(phone, text) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                data: 'AT+CMGF=1',
            });
            this.queue.push({
                data: `AT+CMGS="${phone}"`,
            });
            this.queue.push({
                data: `${text}${String.fromCharCode(0x1A)}`,
                ignoreDelimeter: true,
                callback: (data) => {
                    console.log(data);
                    if (data === 'OK') {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                }
            });
            if (!this.busy) {
                this.processQueue();
            }
        });
    }
    onReceiveMessage(callback) {
        this.receiveMessageCallback = callback;
        this.queue.push({
            data: 'AT+CMGF=1',
        });
        this.queue.push({
            data: 'AT+CNMI=1,2,0,0,0',
        });
        if (!this.busy) {
            this.processQueue();
        }
    }
    processQueue() {
        const next = this.queue.shift();
        this.current = next;
        if (!next) {
            this.busy = false;
            return;
        }
        this.busy = true;
        let data = next.data;
        if (!next.ignoreDelimeter) {
            data += '\r\n';
        }
        const buf = Buffer.from(data, 'ascii');
        this.tty.write(buf, (err) => {
            if (err) {
                console.error('Error writing to tty:', err);
                this.busy = false;
                this.processQueue();
            }
        });
    }
}
exports.SIM7000 = SIM7000;
