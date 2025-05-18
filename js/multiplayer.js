class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.isHost = false;
        this.roomCode = null;
        this.connected = false;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onPlayerMove = null;
        this.onConnectionSuccess = null;
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onError = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.disconnecting = false;
        this.connecting = false;
        this.keepAliveInterval = null;
    }

    connect() {
        if (this.connecting) {
            console.log('Already attempting to connect...');
            return;
        }

        if (this.socket) {
            console.log('Already have a socket, disconnecting first...');
            this.disconnect();
        }

        try {
            console.log('Attempting to connect to WebSocket server...');
            this.disconnecting = false;
            this.connecting = true;
            
            // Add protocol and handle connection with proper headers
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsPort = 8000;
            const wsUrl = `${wsProtocol}//localhost:${wsPort}/ws`;
            
            console.log('Connecting to WebSocket server at:', wsUrl);
            
            // Create WebSocket connection
            this.socket = new WebSocket(wsUrl);
            
            // Set binary type
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('Successfully connected to server');
                this.connected = true;
                this.connecting = false;
                this.connectionAttempts = 0;
                
                // Start keep-alive
                this.startKeepAlive();
                
                if (this.onConnectionSuccess) {
                    this.onConnectionSuccess();
                }
            };

            this.socket.onclose = (event) => {
                const codes = {
                    1000: 'Normal closure',
                    1001: 'Going away',
                    1002: 'Protocol error',
                    1003: 'Unsupported data',
                    1005: 'No status received',
                    1006: 'Abnormal closure',
                    1007: 'Invalid frame payload data',
                    1008: 'Policy violation',
                    1009: 'Message too big',
                    1010: 'Mandatory extension',
                    1011: 'Internal server error',
                    1015: 'TLS handshake'
                };
                
                console.log('WebSocket closed:', event.code, codes[event.code] || 'Unknown', event.reason);
                this.connected = false;
                this.connecting = false;
                
                // Stop keep-alive
                this.stopKeepAlive();
                
                // Only try to reconnect if we're not intentionally disconnecting
                if (!this.disconnecting && this.connectionAttempts < this.maxConnectionAttempts) {
                    console.log(`Attempting to reconnect (${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`);
                    this.connectionAttempts++;
                    setTimeout(() => this.connect(), 1000);
                } else if (this.onError && !this.disconnecting) {
                    let errorMsg = 'Unable to connect to game server. ';
                    if (event.code === 1006) {
                        errorMsg += 'The server might be down or unreachable.';
                    } else if (event.code === 1015) {
                        errorMsg += 'There was a problem with the secure connection.';
                    } else if (codes[event.code]) {
                        errorMsg += codes[event.code];
                    } else {
                        errorMsg += 'Please try again later.';
                    }
                    this.onError(errorMsg);
                }
            };

            this.socket.onmessage = (event) => {
                try {
                    // Handle different message types
                    if (typeof event.data === 'string') {
                        const message = JSON.parse(event.data);
                        
                        // Validate message structure
                        if (!message || typeof message !== 'object') {
                            throw new Error('Invalid message format: message must be an object');
                        }
                        
                        if (!message.type) {
                            throw new Error('Invalid message format: missing type field');
                        }
                        
                        console.log('Received message:', message);
                        this.handleMessage(message);
                    } else {
                        throw new Error('Unsupported message format: expected string data');
                    }
                } catch (error) {
                    console.error('Error processing server message:', error);
                    if (this.onError) {
                        this.onError(`Error processing server message: ${error.message}`);
                    }
                }
            };

            this.socket.onerror = (error) => {
                if (this.disconnecting) return;
                console.error('WebSocket error:', error);
                this.connecting = false;
                if (this.onError) {
                    this.onError('Error connecting to game server. Please check if the server is running and try again.');
                }
            };
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            this.connecting = false;
            if (this.onError && !this.disconnecting) {
                this.onError('Error connecting to game server. Please try again later.');
            }
        }
    }

    startKeepAlive() {
        // Send ping every 20 seconds
        this.keepAliveInterval = setInterval(() => {
            if (this.connected) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 20000);
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    handleMessage(message) {
        console.log('Handling message:', message);
        try {
            switch (message.type) {
                case 'room_created':
                    if (!message.roomCode) {
                        throw new Error('Missing roomCode in room_created message');
                    }
                    this.roomCode = message.roomCode;
                    this.isHost = true;
                    console.log('Room created:', this.roomCode);
                    if (this.onRoomCreated) {
                        this.onRoomCreated(this.roomCode);
                    }
                    break;
                    
                case 'room_joined':
                    if (!message.roomCode || !message.playerId) {
                        throw new Error('Missing required fields in room_joined message');
                    }
                    this.roomCode = message.roomCode;
                    console.log('Room joined:', this.roomCode);
                    if (this.onRoomJoined) {
                        this.onRoomJoined(message.playerId);
                    }
                    if (this.onPlayerJoined) {
                        this.onPlayerJoined(message.playerId);
                    }
                    break;
                    
                case 'player_joined':
                    if (!message.playerId) {
                        throw new Error('Missing playerId in player_joined message');
                    }
                    console.log('Player joined:', message.playerId);
                    if (this.onPlayerJoined) {
                        this.onPlayerJoined(message.playerId);
                    }
                    break;
                    
                case 'player_left':
                    if (!message.playerId) {
                        throw new Error('Missing playerId in player_left message');
                    }
                    console.log('Player left:', message.playerId);
                    if (this.onPlayerLeft) {
                        this.onPlayerLeft(message.playerId);
                    }
                    break;
                    
                case 'player_move':
                    if (!message.playerId || !message.position || !message.rotation) {
                        throw new Error('Missing required fields in player_move message');
                    }
                    if (this.onPlayerMove) {
                        this.onPlayerMove(message.playerId, message.position, message.rotation);
                    }
                    break;
                    
                case 'error':
                    console.error('Server error:', message.error);
                    if (this.onError) {
                        this.onError(message.error || 'Unknown server error');
                    }
                    break;
                    
                case 'pong':
                    // Handle server pong response
                    console.log('Received pong from server');
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
                    throw new Error(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            if (this.onError) {
                this.onError(`Error handling message: ${error.message}`);
            }
        }
    }

    createRoom() {
        console.log('Attempting to create room...');
        if (!this.connected) {
            this.connect();
            // Wait for connection before creating room
            this.socket.onopen = () => {
                this.sendCreateRoom();
            };
        } else {
            this.sendCreateRoom();
        }
    }

    sendCreateRoom() {
        console.log('Sending create room request...');
        if (!this.connected) {
            if (this.onError) {
                this.onError('Not connected to server. Please try again.');
            }
            return;
        }
        
        this.socket.send(JSON.stringify({
            type: 'create_room'
        }));
    }

    joinRoom(roomCode) {
        console.log('Attempting to join room:', roomCode);
        if (!this.connected) {
            this.connect();
            // Wait for connection before joining room
            this.socket.onopen = () => {
                this.sendJoinRoom(roomCode);
            };
        } else {
            this.sendJoinRoom(roomCode);
        }
    }

    sendJoinRoom(roomCode) {
        console.log('Sending join room request for room:', roomCode);
        if (!this.connected) {
            if (this.onError) {
                this.onError('Not connected to server. Please try again.');
            }
            return;
        }

        this.socket.send(JSON.stringify({
            type: 'join_room',
            roomCode: roomCode
        }));
    }

    sendPosition(position, rotation) {
        if (this.connected && this.roomCode) {
            this.socket.send(JSON.stringify({
                type: 'player_move',
                roomCode: this.roomCode,
                position: {
                    x: position.x,
                    y: position.y,
                    z: position.z
                },
                rotation: {
                    x: rotation.x,
                    y: rotation.y,
                    z: rotation.z
                }
            }));
        }
    }

    disconnect() {
        console.log('Disconnecting from server...');
        this.disconnecting = true;
        this.connecting = false;
        this.stopKeepAlive();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.roomCode = null;
        this.isHost = false;
    }
}

// Export the MultiplayerManager class
window.MultiplayerManager = MultiplayerManager; 