// import wrtc from 'wrtc';

// import { iceServers, wsURL } from './config.mjs';
import WebSocketClient from './socket-client.mjs';

const wsURL = process.env.WS_URL;
if (!wsURL) {
  console.error('No WS_URL environment variable set');
  process.exit(1);
}

const connectionManager = new WebSocketClient(`ws://${wsURL}`);
// connectionManager.on('connected', () => {
//   console.log('Client connected to signaling server');
// });
// connectionManager.on('disconnected', () => {
//   console.log('Client disconnected from signaling server');
// });
connectionManager.on('error', (error) => {
  console.error('Client encountered an error:', error);
});

export { connectionManager };