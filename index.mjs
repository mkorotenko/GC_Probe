import { CommunicationModule } from './modem-driver/sim-driver.mjs';
import { UART_PATH, BAUDRATE } from './modem-driver/modem-config.mjs';
import { connectionManager } from './connection/index.mjs';
import BatteryManager from './bat-driver/bat-driver.mjs';
import { updateManager, restartSystem } from './update-manager.mjs';

let comModule, BM;
BM = new BatteryManager();
BM.setCheckInterval(10000);

function stringifyError(error) {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
}

async function comModuleHandler(comModule, reqData) {
    const fn = reqData.function;
    const params = reqData.options || [];
    if (!comModule[fn]) {
        throw new Error(`Function "${fn}" not found in comModule.`);
    }
    return await comModule[fn](...params);
}

connectionManager.on('data', async data => {
    // console.log('Data:', data);
    // connectionManager.send({ 'Peer response': data });
    if (data?.message) {
        // messageHandler(data);
        switch (data.message) {
            case 'reboot':
                connectionManager.send({ 'reboot': "Restarting system..." });
                restartSystem();
                break;
            case 'update':
                connectionManager.send({ 'update': "Updating..." });
                updateManager();
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
                // try {
                //     const reqData = data.request;
                //     const fn = reqData.function;
                //     const params = reqData.options || [];
                //     if (!comModule[fn]) {
                //         throw new Error(`Function "${fn}" not found in comModule.`);
                //     }
                //     const result = await comModule[fn](...params);
                //     connectionManager.send({ 'comModule': { [fn]: result } });
                // } catch (error) {
                //     console.error('Failed to process comModule request:', error);
                //     const erroStr = stringifyError(error);
                //     connectionManager.send({ 'Response': `Failed to process comModule request: ${erroStr}` });
                // }
                const reqData = data.request;
                if (Array.isArray(reqData)) {
                    const results = [];
                    for (const reqItem of reqData) {
                        try {
                            const result = await comModuleHandler(comModule, reqItem);
                            results.push({ [reqItem.function]: result });
                            // connectionManager.send({ 'comModule': { [reqItem.function]: result } });
                        } catch (error) {
                            console.error('Failed to process comModule request:', error);
                            const erroStr = stringifyError(error);
                            results.push({ [reqItem.function]: `Failed to process comModule request: ${erroStr}` });
                            // connectionManager.send({ 'Response': `Failed to process comModule request: ${erroStr}` });
                        }
                    }
                    connectionManager.send({ 'comModule': results });
                } else {
                    try {
                        const result = await comModuleHandler(comModule, reqData);
                        connectionManager.send({ 'comModule': { [reqData.function]: result } });
                    } catch (error) {
                        console.error('Failed to process comModule request:', error);
                        const erroStr = stringifyError(error);
                        connectionManager.send({ 'Response': `Failed to process comModule request: ${erroStr}` });
                    }
                }
                break;
            case 'batModule':
                try {
                    const reqData = data.request;
                    const fn = reqData.function;
                    const params = reqData.options || [];
                    if (!BM[fn]) {
                        throw new Error(`Function "${fn}" not found in batModule.`);
                    }
                    const result = await BM[fn](...params);
                    connectionManager.send({ 'batModule': { [fn]: result } });
                } catch (error) {
                    console.error('Failed to process batModule request:', error);
                    const erroStr = stringifyError(error);
                    connectionManager.send({ 'Response': `Failed to process batModule request: ${erroStr}` });
                }
                break;
            default:
                connectionManager.send({ 'Response': ` Feature "${data.message}" not implemented.` });
        }
    }
})

async function comModuleConnect() {
    comModule = new CommunicationModule(UART_PATH, BAUDRATE);
    return await comModule.openConnection();
};

await comModuleConnect();

BM.on('lowCharge', () => {
    console.log('Low charge:', BM.charge);
    connectionManager.send({ 'batModule': { 'charge': BM.charge } });
});
