import { CommunicationModule } from './modem-driver/sim-driver.mjs';
import { UART_PATH, BAUDRATE } from './modem-driver/modem-config.mjs';
import { connectionManager } from './connection/index.mjs';
import BatteryManager from './bat-driver/bat-driver.mjs';
import { updateManager, restartSystem } from './update-manager.mjs';
import { StateNotificator } from './connection/state-notification.mjs';

let comModule, BM;
BM = new BatteryManager();
BM.setCheckInterval(10000);

async function comModuleConnect() {
    comModule = new CommunicationModule(UART_PATH, BAUDRATE);
    return await comModule.openConnection();
};

await comModuleConnect();

const modules = {
    comModule: comModule,
    batModule: BM
};

const SN = new StateNotificator(modules);
SN.on('data', data => connectionManager.send(data));
SN.on('error', error => connectionManager.send(error));

connectionManager.on('connected', () => {
    // console.log('Connected to server.');
    // setTimeout(() => {
    //     connectionManager.send({ 'ping': 'pong' });
    // }, 500);
    SN.resumeTasks();
});

connectionManager.on('disconnected', () => {
    // console.log('Disconnected from server.');
    SN.terminateTasks();
});

connectionManager.on('data', async data => {
    if (data?.message) {
        switch (data.message) {
            case 'reboot':
                connectionManager.send({ 'reboot': "Restarting system..." });
                restartSystem();
                break;
            case 'update':
                connectionManager.send({ 'update': "Updating..." });
                updateManager();
                break;
            case 'ping':
                connectionManager.send({ 'ping': 'pong' });
                break;
            case 'comModule':
            case 'batModule':
                SN.requestHandler(data);
                break;
            default:
                connectionManager.send({ 'Response': ` Feature "${data.message}" not implemented.` });
        }
    }
})

BM.on('lowCharge', () => {
    console.log('Low charge:', BM.charge);
    connectionManager.send({ 'batModule': { 'charge': BM.charge } });
});
