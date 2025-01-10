import { CommunicationModule } from './modem-driver/sim-driver.mjs';
import { UART_PATH, BAUDRATE } from './modem-driver/modem-config.mjs';
import { connectionManager } from './connection/index.mjs';
import BatteryManager from './bat-driver/bat-driver.mjs';
import updateManager from './update-manager.mjs';

// Some service messages
const serviceMess = [
    '/startPeer',
    '/help'
];

let comModule;

connectionManager.on('data', async data => {
    // console.log('Data:', data);
    // connectionManager.send({ 'Peer response': data });
    if (data?.message) {
        // messageHandler(data);
        switch (data.message) {
            case 'update':
                connectionManager.send({ 'Not implemented': data });
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

async function comModuleHandler(comModule, reqData) {
    //         if (event.data?.includes('function')) {
//             try {
//                 const reqData = JSON.parse(event.data);
    const fn = reqData.function;
    const params = reqData.options || [];
                // const modem = peerConnection.modem;
    if (comModule[fn]) {
        // console.info(`Calling function: ${fn}`);
//                     const params = reqData.options || [];

        const result = await comModule[fn](...params);
        // console.info(`Function "${fn}" result:`, result);
        return result;
//                     sendToChannel(JSON.stringify({[functionName]: result}));
//                 } else {
//                     sendToChannel(`Function "${functionName}" not found`);
//                 }
//             } catch (error) {
//                 sendToChannel('Invalid function call:', error.message);
//                 console.error(`Invalid function call:`, error);
//             }
    } else {
        console.error('Function not found');
    }
}

async function messageHandler(msg) {
    if (!msg?.text) {
        return;
    }

    const msgText = msg.text;
    if (serviceMess.some((messStart) => msgText.startWith(messStart))) {
        return;
    }

    try {
        const reqData = JSON.parse(msgText);
        if (reqData?.function) {
            // const comModule = await comModuleConnect();
            const result = await comModuleHandler(comModule, reqData);
            console.log(`Function "${reqData.function}" result:`, result);
            this.send(result);
        }
    } catch (error) {
        console.error('Failed to process message:', error);
    }
        // if (msg.text !== '/startPeer' && msg.text !== '/help') {
        // peerBot.sendChatMessage(`Ви написали: ${msg.text}`);
    // try {
    //     const offer = JSON.parse(msgText);
    //     peerConnection.setOffer(offer).then(() => {
    //         peerBot.sendChatMessage('Offer is set');
    //         peerBot.sendChatMessage(JSON.stringify(peerConnection.localDescription));
    //     });
    // } catch (error) {
    //     console.error('Failed to set offer:', error);
    // }
    // }
};

const bm = new BatteryManager();
bm.setCheckInterval(10000);

bm.on('lowCharge', () => {
    console.log('Low charge:', bm.charge);
});

// connectionManager.on('connected', async () => {
//     console.log('Connected to server');
// });

// connectionManager.on('disconnected', async () => {
//     console.log('Disconnected from server');
// });

// connectionManager.on('message', messageHandler.bind(connectionManager));

// // Обробка каналу передачі даних
// peerConnection.ondatachannel = (event) => {
//     const dataChannel = event.channel;

//     function sendToChannel(data) {
//         if (dataChannel.readyState !== 'open') {
//             console.error('Data channel is not open');
//             return;
//         }
//         dataChannel.send(data);
//     }

//     dataChannel.onopen = async () => {
//         console.log('Data channel open');
//         sendToChannel('Привіт від Peer 2!');
//         if (await peerConnection.connectModem()) {
//             sendToChannel('Modem connected');
//         } else {
//             sendToChannel('Modem connection failed');
//         }
//     };

//     // let gettingLocation = false;
//     dataChannel.onmessage = async (event) => {
//         console.log('Повідомлення від Peer 1:', event.data);
//         if (event.data?.includes('function')) {
//             try {
//                 const reqData = JSON.parse(event.data);
//                 const functionName = reqData.function;
//                 const modem = peerConnection.modem;
//                 if (modem && modem[functionName]) {
//                     console.info(`Calling function: ${functionName}`);
//                     const params = reqData.options || [];
//                     const result = await modem[functionName](...params);
//                     console.info(`Function "${functionName}" result:`, result);
//                     sendToChannel(JSON.stringify({[functionName]: result}));
//                 } else {
//                     sendToChannel(`Function "${functionName}" not found`);
//                 }
//             } catch (error) {
//                 sendToChannel('Invalid function call:', error.message);
//                 console.error(`Invalid function call:`, error);
//             }
//         }
//     };

//     // Збереження оригінального методу console.log
//     const originalConsoleLog = console.log;

//     // Перевизначення console.log
//     console.log = function(...args) {

//         // Відправка повідомлення через Telegram бот
//         sendToChannel(`LOG: ${args.join(' ')}`);

//         // Виклик оригінального методу console.log
//         originalConsoleLog.apply(console, args);
//     };
// };

// // const superOnconnectionstatechange = peerConnection.onconnectionstatechange.bind(peerConnection);
// // Обробка стану з'єднання
// peerConnection.onconnectionstatechange = () => {
//     // superOnconnectionstatechange();
//     switch (peerConnection.connectionState) {
//         case 'connected':
//             console.log('The connection has become fully connected');
//             // connectModem();
//             break;
//         case 'disconnected':
//         case 'failed':
//             console.log('The connection has been disconnected or failed');
//             break;
//         case 'closed':
//             console.log('The connection has been closed');
//             break;
//     }
// };

// // const superOniceconnectionstatechange = peerConnection.oniceconnectionstatechange.bind(peerConnection);
// // Обробка стану ICE-кандидатів
// peerConnection.oniceconnectionstatechange = () => {
//     // superOniceconnectionstatechange();
//     switch (peerConnection.iceConnectionState) {
//         case 'checking':
//             console.log('Connecting to peer...');
//             break;
//         case 'connected':
//         case 'completed':
//             console.log('Connection established');
//             break;
//         case 'disconnected':
//             console.log('Disconnected from peer');
//             break;
//         case 'failed':
//             console.log('Failed to connect to peer');
//             break;
//         case 'closed':
//             console.log('Connection closed');
//             break;
//     }
// };

// peerConnection.setOffer = (offer) => {
//     // const offer = JSON.parse(data.toString());
//     return peerConnection.setRemoteDescription(offer)
//         .then(() => peerConnection.createAnswer())
//         .then((answer) => peerConnection.setLocalDescription(answer))
//         .then(() => {
//             console.log('Peer 2 Answer:', JSON.stringify(peerConnection.localDescription));
//         });
// }

// // Отримання пропозиції від Peer 1
// process.stdin.on('data', (data) => {
//     const offer = JSON.parse(data.toString());
//     peerConnection.setOffer(offer);
// });

// process.stdout.on('data', (data) => {
//     peerBot.sendChatMessage('LOG:', data.toString());
// });

// peerBot.off('message', peerBot.onMessage);
// peerBot.on('message', (msg) => {
//     if (msg.text !== '/startPeer' && msg.text !== '/help') {
//         // peerBot.sendChatMessage(`Ви написали: ${msg.text}`);
//         try {
//             const offer = JSON.parse(msg.text);
//             peerConnection.setOffer(offer).then(() => {
//                 peerBot.sendChatMessage('Offer is set');
//                 peerBot.sendChatMessage(JSON.stringify(peerConnection.localDescription));
//             });
//         } catch (error) {
//             console.error('Failed to set offer:', error);
//         }
//     }
// });
