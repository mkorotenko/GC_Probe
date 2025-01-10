import { WebSocket } from 'ws';
// import wrtc from 'wrtc';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers';
// import { wsURL, iceServers } from './config.mjs';

function checkMessageData(data) {
  return new Promise((resolve, reject) => {
    if (typeof data === 'string') {
      resolve(data);
    } else if (typeof data === 'number') {
      resolve(data);
    } else if (typeof data === 'boolean') {
      resolve(data);
    } else if (data instanceof Array) {
      resolve(data);
    } else if (data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject('Error reading Blob data');
      reader.readAsText(data);
    } else if (data instanceof ArrayBuffer || data instanceof Buffer) {
      const decoder = new TextDecoder('utf-8');
      resolve(decoder.decode(new Uint8Array(data)));
    } else if (data instanceof Object) {
      resolve(data);
    } else {
      console.error('Signalig server data: Unknown data type - ', data);
      resolve(undefined);
    }
  });
}

class WebSocketClient extends EventEmitter {

  signalingReconnectTimeout = 5000;
  signalingReconnectID = null;

  messageQueueTimeout = 120000;
  messageQueueID = null;

  lastReconnectRequest = null;
  minReconnectInterval = 2000;

  isConnected = false;
  pingInterval = 30000; // 30 секунд
  pingIntervalID = null;

  constructor(url) {
    super();
    this.url = url;
    // this.signalingSocket = new WebSocket(url);
    // this.peerConnection = new wrtc.RTCPeerConnection({
    //   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    // });
    this.dataChannel = null;

    // this.signalingSocket.on('open', this.onOpen.bind(this));
    // this.signalingSocket.on('message', this.onMessage.bind(this));
    // this.signalingSocket.on('close', this.onClose.bind(this));
    // this.signalingSocket.on('error', this.onError.bind(this));

    // this.peerConnection.onicecandidate = this.onIceCandidate.bind(this);
    // this.peerConnection.ondatachannel = this.onDataChannel.bind(this);
    this.signalingSocketConnect();
  }

  signalingSocketConnect() {
    // Checking if last reconnect request was too soon
    if (this.lastReconnectRequest) {
      const diff = new Date().getTime() - this.lastReconnectRequest;
      if (diff < this.minReconnectInterval) {
        console.log('Reconnect interval is too small. Waiting...');
        setTimeout(() => {
          this.signalingSocketConnect();
        }, this.minReconnectInterval - diff);
        return;
      }
    }
    this.lastReconnectRequest = new Date().getTime();

    this.signalingSocket = new WebSocket(this.url);
    this.signalingSocket.binaryType = "arraybuffer";
    // this.signalingSocket.onmessage = this.handleSignalingMessage.bind(this);
    // this.signalingSocket.onopen = this.handleSignalingOpen.bind(this);
    // this.signalingSocket.onclose = this.handleSignalingClosed.bind(this);
    // this.signalingSocket.onerror = (error) => console.error('Signaling socket error:', error);
    this.signalingSocket.on('open', this.onOpen.bind(this));
    this.signalingSocket.on('message', this.onMessage.bind(this));
    this.signalingSocket.on('close', this.onClose.bind(this));
    this.signalingSocket.on('error', this.onError.bind(this));
    this.signalingSocket.on('pong', this.onPong.bind(this)); // Додано обробку події pong
  }

  signalingSocketClose() {
    this.isConnected = false;
    this.signalingSocket?.close();
    if (this.messageQueueID) {
      clearTimeout(this.messageQueueID);
    }
  }

  signalingSocketReconnect() {
    this.signalingSocketClose();
    this.signalingSocketConnect();
  }

  tryToReconnect() {
    console.log('Try to reconnect');
    if (this.signalingReconnectID) {
      clearTimeout(this.signalingReconnectID);
    }
    // this.signalingSocketReconnect();
    this.signalingReconnectID = setInterval(() => {
      this.signalingSocketReconnect()
    }, this.signalingReconnectTimeout);
  }

  restartWatchdog() {
    if (this.messageQueueID) {
      clearTimeout(this.messageQueueID);
    }
    if (this.isConnected) {
      this.messageQueueID = setTimeout(() => {
        console.error('No messages for a long time. Reconnecting');
        this.tryToReconnect();
      }, this.messageQueueTimeout);
    }
  }

  onOpen() {
    console.log('Connected to signaling server');
    if (this.signalingReconnectID) {
      clearTimeout(this.signalingReconnectID);
    }

    this.isConnected = true;
    // If no messages during this time then consider no connection
    this.restartWatchdog();

    this.emit('connected');

    this.startPing();
    
    // console.log('Sending offer in 1 second');
    // setTimeout(async () => {
    //   console.log('Sending offer');
    //   await this.sendOffer()
    // }, 1000);
  }

  async onMessage(message) {
    // console.log('Received:', message);
    this.restartWatchdog();
    this.restartPing();
    let data = await checkMessageData(message);
    if (typeof data === 'string') {
      const parsed = this.tryParseJSON(data);
      if (parsed) {
        data = parsed;
      } 
    }

    console.log('Received:', data);
    setTimeout(() => {
      this.emit('data', data);
    });
    // if (!data) {
      // if (typeof message === 'string') {
      //   console.log('Received string:', message);
      //   this.emit('data', message);
      //   return;
      // }
      // console.error('Invalid JSON');
      // return;
    // }
    // console.log('Parsed:', data);

    // if (!data) {
    //   console.error('Invalid JSON');
    //   return;
    // }

    // switch (data.type) {
    //   case 'offer':
    //     await this.handleOffer(data.offer);
    //     break;
    //   case 'answer':
    //     await this.handleAnswer(data.answer);
    //     break;
    //   case 'ice-candidate':
    //     await this.handleIceCandidate(data.candidate);
    //     break;
    //   default:
    //     console.error('Unknown message type:', data.type);
    // }
  }

  onClose() {
    console.log('Disconnected from signaling server');
    this.emit('disconnected');
    this.tryToReconnect();
    this.isConnected = false;
    this.restartWatchdog();
    this.stopPing();
  }

  onError(error) {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  onPong() {
    console.log('Received pong from WebSocket server');
    // Обробка pong відповіді
    this.restartWatchdog();
  }

  startPing() {
    this.pingIntervalID = setInterval(() => {
      if (this.isConnected) {
        console.log('Sending ping to WebSocket server');
        this.signalingSocket.ping(); // Відправка пінг-повідомлення
      }
    }, this.pingInterval);
  }

  restartPing() {
    this.stopPing();
    this.startPing();
  }

  stopPing() {
    if (this.pingIntervalID) {
      clearInterval(this.pingIntervalID);
      this.pingIntervalID = null;
    }
  }

  async sendOffer() {
    console.log('Creating offer');
    // const offer = await this.peerConnection.createOffer();
    // console.log('Setting local description', offer);
    // await this.peerConnection.setLocalDescription(offer);
    // this.signalingSocket.send(JSON.stringify({ type: 'offer', offer }));
  }

  async handleOffer(offer) {
    console.log('Received offer:', offer);
    // await this.peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(offer));
    // const answer = await this.peerConnection.createAnswer();
    // await this.peerConnection.setLocalDescription(answer);
    // this.signalingSocket.send(JSON.stringify({ type: 'answer', answer }));
  }

  async handleAnswer(answer) {
    // await this.peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate) {
    // await this.peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(candidate));
  }

  onIceCandidate(event) {
    if (event.candidate) {
      this.signalingSocket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
    }
  }

  onDataChannel(event) {
    this.dataChannel = event.channel;
    this.dataChannel.onopen = () => console.log('Data channel opened');
    // this.dataChannel.onmessage = (event) => console.log('Data channel message:', event.data);
    this.dataChannel.onmessage = this.onDataChannelMessage.bind(this);
    this.dataChannel.onerror = (error) => console.error('Data channel error:', error);
    this.dataChannel.onclose = () => console.log('Data channel closed');
  }

  isConnected() {
    return this.dataChannel && this.dataChannel.readyState === 'open';
  }

  tryParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (error) {
      // console.error('Error parsing JSON:', error, ' DATA:', str);
      return null;
    }
  }

  onDataChannelMessage(event) {
    console.log('Data channel message:', event.data);
    this.emit('data', event.data);
  }

  // async sendOffer(offer) {
  //   this.signalingSocket.send(JSON.stringify({ type: 'offer', offer }));
  // }

  async receiveAnswer(answer) {
    await this.handleAnswer(answer);
  }

  send(data) {
    if (typeof data !== 'string') {
      data = JSON.stringify(data);
    }
    this.signalingSocket.send(data);
  } 
}

export default WebSocketClient;
