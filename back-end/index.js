const http = require('http');
const WebSocket = require('ws');
const uuidv4 = require('uuid/v4');

function sendData(wsConnection, data) {
  wsConnection.send(JSON.stringify(data));
}

http
  .createServer((request, response) => {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:8080',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, PATCH, DELETE',

      // Request headers you wish to allow
      'Access-Control-Allow-Headers': 'content-type',

      // Set to true if you need the website to include cookies in the requests sent
      // to the API (e.g. in case you use sessions)
      'Access-Control-Allow-Credentials': true,
    });
    response.end('hello');
  })
  .listen(8125);
console.log('Server running at http://127.0.0.1:8125/');

const wss = new WebSocket.Server({
  port: 9989,
});

const rtcOfferSignalSession = {};
// const rtcSession = {
//   offer: null,
//   answer: null,
//   offerConnection: null,
//   answerConnection: null
// };

wss.on('connection', (connection) => {
  connection.on('message', (message) => {
    // const payload = {
    //   type: 'offer' || 'answer' || 'offer-accepted' || 'get-offer' || 'leave' || 'leave-other',
    //   status: 'success' || 'error',
    //   data: '*'
    // }

    const payload = JSON.parse(message);
    const { type, data } = payload;

    switch (type) {
      case 'offer': {
        const uuid = uuidv4();

        rtcOfferSignalSession[uuid] = {
          offer: data.offer,
          offerConnection: connection,
          id: uuid,
        };

        // Send back the session id
        sendData(connection, {
          type: 'offer',
          status: 'success',
          data: {
            sessionId: uuid,
          },
        });
        break;
      }

      case 'get-offer': {
        const session = rtcOfferSignalSession[data.sessionId];

        if (session) {
          // Send offer-sdp to client
          sendData(connection, {
            type: 'get-offer',
            status: 'success',
            data: { offer: session.offer },
          });

          break;
        }
        sendData(connection, {
          type: 'get-offer',
          status: 'error',
          data: 'No offer matched the id sent',
        });
        break;
      }

      case 'get-all-offers': {
        const sessionList = Object.values(rtcOfferSignalSession)

          // Only take room with an open session connection
          .filter(session => session.offerConnection && session.offerConnection.readyState === 1)

          // Remove the connection object
          .map(session => ({
            id: session.id,
            offer: session.offer,
            answer: session.answer,
          }));

        sendData(connection, {
          type: 'get-all-offers',
          status: 'success',
          data: { chatRoomList: sessionList },
        });
        break;
      }

      case 'answer': {
        const session = rtcOfferSignalSession[data.sessionId];
        session.answerConnection = connection;

        // Send the answer-sdp to offer client
        sendData(session.offerConnection, {
          type: 'offer-accepted',
          data: { answer: data.answer },
        });

        // Send offer-sdp to client
        sendData(connection, {
          type: 'answer',
          status: 'success',
        });
        break;
      }

      case 'leave': {
        const session = rtcOfferSignalSession[data.sessionId];

        // Check what is the connection position
        // If current connection is the offer session then the other is the answer connection
        const otherConnection =
          connection === session.offerConnection
            ? session.answerConnection
            : session.offerConnection;

        // Send hangup message to other connection
        sendData(otherConnection, {
          type: 'leave-other',
        });
        break;
      }

      case 'leave-other': {
        const session = rtcOfferSignalSession[data.sessionId];

        // Check what is the connection position
        // If current connection is the offer session then the other is the answer connection
        const otherConnection =
          connection === session.offerConnection
            ? session.answerConnection
            : session.offerConnection;

        sendData(otherConnection, {
          type: 'leave',
          status: 'success',
        });

        sendData(connection, {
          type: 'leave-other',
          status: 'success',
        });

        // Delete session data
        delete rtcOfferSignalSession[data.sessionId];
        break;
      }

      case 'send-icecandidate': {
        const session = rtcOfferSignalSession[data.sessionId];

        // Check what is the connection position
        // If current connection is the offer session then the other is the answer connection
        const otherConnection =
          connection === session.offerConnection
            ? session.answerConnection
            : session.offerConnection;

        sendData(otherConnection, {
          type: 'receieve-icecandidate',
          data: {
            iceCandidates: data.iceCandidates,
          },
        });
        break;
      }

      default:
        sendData(connection, {
          type: 'default',
          status: 'error',
          message: 'Invalid command',
        });
    }
  });
});
console.log('Web socket running at ws://127.0.0.1:9989/');
