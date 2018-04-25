/* eslint func-names: 0 */
(function () {
  /**
   * Attempt to get user media usage permission
   *
   * @return {Promise}
   */
  function tryGetUserMedia({ useHd = false } = {}) {
    // Try to get user media stream
    const userMedia =
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia({
        video: {
          // Use hd or not
          width: { min: useHd ? 1280 : 640 },
          height: { min: useHd ? 720 : 480 },
        },
        audio: false,
      });

    // Throw if not supported
    if (!userMedia) throw new Error('getUserMedia not supported');
    return userMedia;
  }

  function openDataChannel(peerConnection) {
    const dataChannel = peerConnection.createDataChannel();

    dataChannel.onopen = () => {
      dataChannel.send('hahahaha');
    };

    dataChannel.onerror = function (error) {
      console.log('Error:', error);
    };

    dataChannel.onmessage = function (event) {
      console.log('Got message:', event.data);
    };
    return dataChannel;
  }

  function setupCallerPeerConnection() {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { url: 'stun:stun.stunprotocol.org:3478' },
        { url: 'stun:stun.l.google.com:19302' },
      ],
    });
    openDataChannel(peerConnection);

    // TODO remove
    window.peer = peerConnection;
    return peerConnection;
  }

  function loadChatRoomList({ signalConnection }) {
    return new Promise((resolve) => {
      signalConnection.send({
        type: 'get-all-offers',
      });

      signalConnection.once('get-all-offers', data => resolve(data.chatRoomList));
    });
  }

  function createChatRoom({ signalConnection, mediaStream, onRecieveStream }) {
    const peerConnection = setupCallerPeerConnection();

    const iceCandidates = [];
    let sessionId = null;

    mediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, mediaStream);
    });

    // Add the ice candidate to send later
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) iceCandidates.push(event.candidate);
    };

    // Create local offer
    return peerConnection.createOffer().then((offer) => {
      peerConnection.setLocalDescription(offer);

      // Set up the room
      signalConnection.send({
        type: 'offer',
        data: { offer },
      });

      signalConnection.once('offer', (data) => {
        sessionId = data.sessionId;
      });

      // If someone join our room
      signalConnection.once('offer-accepted', (data) => {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

        // when a remote peer adds stream to the peer connection
        peerConnection.ontrack = event => onRecieveStream(event.streams[0]);

        // Receive ice candidates
        signalConnection.once('receieve-icecandidate', (data) => {
          data.iceCandidates.forEach((candidate) => {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          });

          // Send ice candidates
          signalConnection.send({
            type: 'send-icecandidate',
            data: { sessionId, iceCandidates },
          });
        });
      });

      return peerConnection;
    });
  }

  function joinChatRoom({
    chatRoomSessionId, signalConnection, mediaStream, onRecieveStream,
  }) {
    const peerConnection = setupCallerPeerConnection();

    const iceCandidates = [];

    mediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, mediaStream);
    });

    // Add the ice candidate to send later
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) iceCandidates.push(event.candidate);
      else {
        // Send ice candidates
        signalConnection.send({
          type: 'send-icecandidate',
          data: { sessionId: chatRoomSessionId, iceCandidates },
        });
      }
    };

    // Wrap around a promise
    const promise = new Promise((resolve) => {
      // Get the chatroom sdp
      signalConnection.send({
        type: 'get-offer',
        data: { sessionId: chatRoomSessionId },
      });

      // After we get the sdp of the session
      signalConnection.once('get-offer', (data) => {
        const remoteSdp = data.offer;

        // Set the remote sdp
        peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));

        // Create and send the answer sdp to remote peer
        return peerConnection.createAnswer().then((answerSdp) => {
          peerConnection.setLocalDescription(answerSdp);

          // Send the answer sdp
          signalConnection.send({
            type: 'answer',
            data: {
              sessionId: chatRoomSessionId,
              answer: answerSdp,
            },
          });

          // Receive ice candidates
          signalConnection.on('receieve-icecandidate', (recieveIceCandidatesData) => {
            recieveIceCandidatesData.iceCandidates.forEach((candidate) => {
              peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
          });

          // when a remote peer adds stream to the peer connection
          peerConnection.ontrack = event => onRecieveStream(event.streams[0]);

          // Resolve the promise
          resolve();
        });
      });
    });
    return promise;
  }

  class SignalConn {
    constructor() {
      this.ws = null;

      // handler = {
      //  'offer': handlerFunction
      // }
      this.handlerMap = {};
    }

    connect(url = 'ws://127.0.0.1:9989') {
      return new Promise((resolve) => {
        this.ws = new WebSocket(url);

        this.ws.onmessage = this._handleMessage.bind(this);

        this.ws.onopen = resolve;
        return this;
      });
    }

    _handleMessage(message) {
      const { type, status, data } = JSON.parse(message.data);

      console.log('receive: ', { type, status, data });

      if (status === 'error') throw new Error(JSON.stringify(message.data));

      // Call the handler function
      if (this.handlerMap[type]) {
        return this.handlerMap[type](data);
      }
      return Promise.resolve(data);
    }

    send(data) {
      console.log('sending: ', data);
      window.printState();
      this.ws.send(JSON.stringify(data));
      return this;
    }

    on(eventType, handler) {
      this.handlerMap[eventType] = handler;
      return this;
    }

    once(eventType, handler) {
      this.handlerMap[eventType] = (...args) => {
        handler(...args);

        // Remove the handler
        this.handlerMap[eventType] = null;
      };
      return this;
    }
  }

  window.printState = () => {
    const peer = window.peer || {};
    console.log('peer-state: ', peer.signalingState);
    console.log('ice-state: ', peer.iceConnectionState);
  };

  window.videoChat = {
    createChatRoom,
    joinChatRoom,
    tryGetUserMedia,
    SignalConn,
    loadChatRoomList,
  };
}());
