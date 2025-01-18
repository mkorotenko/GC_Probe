import { CommunicationModule } from './modem-driver/sim-driver.mjs';
import { UART_PATH, BAUDRATE } from './modem-driver/modem-config.mjs';
import { connectionManager } from './connection/index.mjs';
import BatteryManager from './bat-driver/bat-driver.mjs';
import { updateManager, restartSystem } from './update-manager.mjs';
import { StateNotificator } from './connection/state-notification.mjs';

let comModule, BM;
BM = new BatteryManager();
BM.setCheckInterval(10000);

function stringifyError(error) {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
}

async function comModuleHandler(cModule, reqData) {
    const fn = reqData.function;
    const params = reqData.options || [];
    if (!cModule[fn]) {
        throw new Error(`Function "${fn}" not found.`);
    }
    return await cModule[fn](...params);
}

async function comModuleConnect() {
    comModule = new CommunicationModule(UART_PATH, BAUDRATE);
    return await comModule.openConnection();
};

await comModuleConnect();

const modules = {
    comModule: comModule,
    batModule: BM
};

connectionManager.on('connect', () => {
    console.log('Connected to server.');
    setTimeout(() => {
        connectionManager.send({ 'ping': 'pong' });
    }, 500);
});

const SN = new StateNotificator(modules);
SN.on('data', data => connectionManager.send(data));
SN.on('error', error => connectionManager.send(error));

connectionManager.on('data', async data => {
    if (data?.SN) {
        connectionManager.send({ 'Response': 'State notification handler.' });
        SN.requestHandler(data);
    } else
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
            case 'getRSSI':
                try {
                    await comModule.getSignalQuality();
                    const rssi = await comModule.signalQualityDisplay();
                    connectionManager.send({ 'RSSI': rssi });
                } catch (error) {
                    console.error('Failed to get RSSI:', error);
                    connectionManager.send({ 'RSSI': 'Failed to get RSSI' });
                }
                break;
            case 'comModule':
            case 'batModule':
                const module = modules[data.message];
                const reqData = data.request;
                if (Array.isArray(reqData)) {
                    const results = [];
                    for (const reqItem of reqData) {
                        try {
                            const result = await comModuleHandler(module, reqItem);
                            results.push({ [reqItem.function]: result });
                            // connectionManager.send({ 'comModule': { [reqItem.function]: result } });
                        } catch (error) {
                            console.error(`Failed to process ${data.message} request:`, error);
                            const erroStr = stringifyError(error);
                            results.push({ [reqItem.function]: `Failed to process ${data.message} request: ${erroStr}` });
                            // connectionManager.send({ 'Response': `Failed to process comModule request: ${erroStr}` });
                        }
                    }
                    connectionManager.send({ [data.message]: results });
                } else {
                    try {
                        const result = await comModuleHandler(module, reqData);
                        connectionManager.send({ [data.message]: { [reqData.function]: result } });
                    } catch (error) {
                        console.error(`Failed to process ${data.message} request:`, error);
                        const erroStr = stringifyError(error);
                        connectionManager.send({ 'Response': `Failed to process ${data.message} request: ${erroStr}` });
                    }
                }
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
