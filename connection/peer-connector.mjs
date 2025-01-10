import wrtc from 'wrtc';
import EventEmitter from 'events';

class PeerConnector extends wrtc.RTCPeerConnection {
    constructor() {
        super({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        // this.peerConnection = new wrtc.RTCPeerConnection({
        //     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // });

        process.stdin.on('data', (data) => {
            const offer = JSON.parse(data.toString());
            this.setOffer(offer);
        });

        this.ondatachannel = (event) => {
            // console.log('Data channel event:', event);
            this.dataChannel = event.channel;
    
            this.dataChannel.onopen = async () => {
                // console.log('Data channel is open');
                this.emitter.emit('hostConnected');
            };
    
            this.dataChannel.onmessage = (event) => {
                // console.log('Received message:', event.data);
                this.emitter.emit('hostMessage', event.data);
            };
    
            this.dataChannel.onerror = (error) => {
                console.error('Data channel error:', error);
                this.emitter.emit('hostError', error);
            };
    
            this.dataChannel.onclose = () => {
                console.log('Data channel closed');
                this.emitter.emit('hostDisconnected');
            };
        }
    }

    emitter = new EventEmitter();

    setOffer(offer) {
        return this.setRemoteDescription(offer)
            .then(() => this.createAnswer())
            .then((answer) => this.setLocalDescription(answer))
            .then(() => {
                console.log('Peer 2 Answer:', JSON.stringify(this.localDescription));
            });
    }

    // ondatachannel(event) {
    //     this.dataChannel = event.channel;

    //     this.dataChannel.onopen = async () => {
    //         console.log('Data channel is open');
    //         this.emitter.emit('hostConnected');
    //     };

    //     this.dataChannel.onmessage = (event) => {
    //         console.log('Received message:', event.data);
    //         this.emitter.emit('hostMessage', event.data);
    //     };

    //     this.dataChannel.onerror = (error) => {
    //         console.error('Data channel error:', error);
    //     };

    //     this.dataChannel.onclose = () => {
    //         console.log('Data channel closed');
    //         this.emitter.emit('hostDisconnected');
    //     };
    // }
}
// const peerConnection = new wrtc.RTCPeerConnection({
//     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
// });

// peerConnection.setOffer = (offer) => {
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
export default PeerConnector;