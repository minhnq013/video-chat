const {
  createChatRoom,
  joinChatRoom,
  tryGetUserMedia,
  loadChatRoomList,
  SignalConn,
} = window.videoChat;
const { React, ReactDOM } = window;

const Video = props => (
  <div>
    <video
      ref={(video) => {
        if (video && props.mediaStream) video.srcObject = props.mediaStream;
        if (video && props.src) video.src = props.src;
      }}
      autoPlay
    >
      <track kind="captions" />
    </video>
  </div>
);

const ChatControl = props => (
  <div className="chat-controls">
    <button onClick={props.createRoom}>Create Room</button>
    <label>
      Video
      <input type="checkbox" value />
    </label>
    <label>
      Mic
      <input type="checkbox" value />
    </label>
  </div>
);

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      tryGetUserMediaPromisePending: false,
      selfMediaStream: null,
      mediaStream: null,
      signalConnection: null,
      chatRoomSessionList: [],
    };

    this.getUserMediaStream = () => {
      this.setState({ tryGetUserMediaPromisePending: true });
      return tryGetUserMedia().then((stream) => {
        this.setState({
          mediaStream: stream,
          selfMediaStream: stream,
          tryGetUserMediaPromisePending: false,
        });
        return stream;
      });
    };

    this.onRecieveStream = (otherStream) => {
      this.setState({ mediaStream: otherStream });
    };

    // Bind call method
    this.createRoom = function () {
      return createChatRoom({
        signalConnection: this.state.signalConnection,
        mediaStream: this.state.mediaStream,
        onRecieveStream: this.onRecieveStream,
      });
    }.bind(this);

    this.joinRoom = function (chatRoomSessionId) {
      return joinChatRoom({
        chatRoomSessionId,
        signalConnection: this.state.signalConnection,
        mediaStream: this.state.mediaStream,
        onRecieveStream: this.onRecieveStream,
      });
    }.bind(this);

    this.loadChatRoomsList = loadChatRoomList;
  }

  componentWillMount() {
    // Enable loading state
    this.setState({ tryGetUserMediaPromisePending: true });

    const getUserMediaPromise = this.getUserMediaStream();

    // Connect to signaling server
    const signalConnection = new SignalConn();
    const signalConnectingPromise = signalConnection.connect().then(() => {
      this.setState({ signalConnection });

      // Load the available chat room list
      return this.loadChatRoomsList({ signalConnection }).then(list =>
        this.setState({ chatRoomSessionList: list }));
    });

    // Disable loading state
    return Promise.all([getUserMediaPromise, signalConnectingPromise]).then(() =>
      this.setState({ tryGetUserMediaPromisePending: false }));
  }

  render() {
    return (
      <div>
        <div>
          Chat rooms:
          {this.state.chatRoomSessionList.map(session => (
            <button key={session.id} onClick={() => this.joinRoom(session.id)}>
              {session.id}
            </button>
          ))}
        </div>

        {this.state.tryGetUserMediaPromisePending ? (
          <h2>Loading...</h2>
        ) : (
          <div>
            <Video mediaStream={this.state.mediaStream} />
            <Video mediaStream={this.state.selfMediaStream} />
          </div>
        )}
        <ChatControl createRoom={this.createRoom} />
      </div>
    );
  }
}

function index() {
  ReactDOM.render(<App />, document.getElementById('root'));
}
index();
