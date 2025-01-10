import BatteryManager from './bat-driver.mjs';

const bm = new BatteryManager();

bm.on('lowCharge', (charge) => {
    console.log('Low charge:', charge);
});

bm.setCheckInterval(1000);

setInterval(() => {
    console.log('Battery:', {
        voltage: bm.voltage,
        current: bm.current,
        power: bm.power,
        charge: bm.charge,
        charging: bm.charging
    });
}, 5000);