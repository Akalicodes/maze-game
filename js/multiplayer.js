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
        this.onGameReady = null;
        this.onError = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 10;
        this.disconnecting = false;
        this.connecting = false;
        this.keepAliveInterval = null;
        this.role = null;
        this.gameState = {
            active: false,
            sessionId: null,
            players: new Set(),
            lastActivity: Date.now(),
            reconnecting: false,
            lastKnownState: null,
            allPlayersJoined: false,
            playerCount: 0,
            canStart: false,
            requiredPlayers: 3
        };
    }

    startSession() {
        this.gameState.active = true;
        this.gameState.sessionId = Math.random().toString(36).substring(2, 15);
        this.gameState.lastActivity = Date.now();
        this.gameState.lastKnownState = {
            roomCode: this.roomCode,
            role: this.role,
            isHost: this.isHost
        };
        console.log('Starting new game session:', this.gameState.sessionId);
    }

    endSession() {
        this.gameState.active = false;
        this.gameState.sessionId = null;
        this.gameState.players.clear();
        this.gameState.lastKnownState = null;
        this.gameState.reconnecting = false;
        console.log('Ending game session');
    }

    updateActivity() {
        this.gameState.lastActivity = Date.now();
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'activity_update',
                sessionId: this.gameState.sessionId,
                timestamp: this.gameState.lastActivity,
                state: {
                    roomCode: this.roomCode,
                    role: this.role,
                    isHost: this.isHost
                }
            }));
        }
    }

    connect() {
        if (this.connecting || (this.socket && this.socket.readyState === WebSocket.OPEN)) {
            console.log('Already connected or connecting');
            return;
        }

        try {
            console.log('Starting new connection...');
            this.disconnecting = false;
            this.connecting = true;
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsPort = 8000;
            const wsUrl = `${wsProtocol}//localhost:${wsPort}/ws`;
            
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('Connection established');
                this.connected = true;
                this.connecting = false;
                this.connectionAttempts = 0;
                
                // Start activity monitoring
                this.startKeepAlive();
                
                // If we're reconnecting and have a previous state, restore it
                if (this.gameState.reconnecting && this.gameState.lastKnownState) {
                    console.log('Restoring previous session state');
                    this.socket.send(JSON.stringify({
                        type: 'restore_session',
                        sessionId: this.gameState.sessionId,
                        state: this.gameState.lastKnownState
                    }));
                }
                
                if (this.onConnectionSuccess) {
                    this.onConnectionSuccess();
                }
            };

            this.socket.onclose = () => {
                console.log('Connection closed');
                this.connected = false;
                this.connecting = false;
                this.stopKeepAlive();
                
                if (!this.disconnecting && this.gameState.active) {
                    console.log('Unexpected disconnection during active game, attempting to reconnect');
                    this.gameState.reconnecting = true;
                    
                    // Calculate backoff delay based on connection attempts
                    const backoffDelay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
                    this.connectionAttempts++;
                    
                    if (this.connectionAttempts <= this.maxConnectionAttempts) {
                        console.log(`Reconnecting in ${backoffDelay}ms (attempt ${this.connectionAttempts})`);
                        setTimeout(() => this.connect(), backoffDelay);
                    } else {
                        console.log('Max reconnection attempts reached');
                        this.endSession();
                        if (this.onError) {
                            this.onError('Failed to reconnect after multiple attempts');
                        }
                    }
                }
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (this.onError) {
                    this.onError('Connection error occurred');
                }
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    // Reset connection attempts on successful message
                    if (this.gameState.reconnecting) {
                        this.connectionAttempts = 0;
                        this.gameState.reconnecting = false;
                    }
                    
                    this.handleMessage(message);
                    this.updateActivity();
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            };
        } catch (error) {
            console.error('Connection error:', error);
            this.connecting = false;
            if (this.onError) {
                this.onError('Failed to establish connection');
            }
        }
    }

    createRoom() {
        if (!this.connected) {
            console.log('Not connected, connecting first...');
            this.connect();
            this.socket.onopen = () => this.createRoom();
            return;
        }

        console.log('Creating new room...');
        this.startSession();
        
        this.socket.send(JSON.stringify({
            type: 'create_room',
            sessionId: this.gameState.sessionId
        }));
    }

    joinRoom(roomCode) {
        if (!this.connected) {
            console.log('Not connected, connecting first...');
            this.connect();
            this.socket.onopen = () => this.joinRoom(roomCode);
            return;
        }

        console.log('Joining room:', roomCode);
        this.startSession();
        
        this.socket.send(JSON.stringify({
            type: 'join_room',
            roomCode: roomCode,
            sessionId: this.gameState.sessionId
        }));
    }

    handleMessage(message) {
        console.log('Handling message:', message);
        
        switch (message.type) {
            case 'room_created':
                this.roomCode = message.roomCode;
                this.isHost = true;
                this.role = message.role;
                this.gameState.players.add('host');
                this.gameState.playerCount = 1;
                this.gameState.canStart = false;
                this.gameState.allPlayersJoined = false;
                if (this.onRoomCreated) {
                    this.onRoomCreated(message.roomCode);
                }
                break;

            case 'room_joined':
                this.roomCode = message.roomCode;
                this.role = message.role;
                this.gameState.canStart = false;
                this.gameState.allPlayersJoined = false;
                if (this.onRoomJoined) {
                    this.onRoomJoined();
                }
                break;

            case 'player_joined':
                this.gameState.players.add(message.playerId);
                this.gameState.playerCount++;
                
                // Check if we have all required players
                if (this.gameState.playerCount === this.gameState.requiredPlayers) {
                    this.gameState.allPlayersJoined = true;
                    this.gameState.canStart = true;
                    if (this.onGameReady) {
                        this.onGameReady();
                    }
                }
                
                if (this.onPlayerJoined) {
                    this.onPlayerJoined(message.playerId, message.role);
                }
                break;

            case 'player_left':
                this.gameState.players.delete(message.playerId);
                this.gameState.playerCount--;
                this.gameState.canStart = false;
                this.gameState.allPlayersJoined = false;
                if (this.onPlayerLeft) {
                    this.onPlayerLeft(message.playerId);
                }
                break;

            case 'game_ready':
                this.gameState.allPlayersJoined = true;
                this.gameState.canStart = true;
                if (this.onGameReady) {
                    this.onGameReady();
                }
                break;

            case 'waiting_for_players':
                this.gameState.allPlayersJoined = false;
                this.gameState.canStart = false;
                break;

            case 'session_expired':
                console.log('Session expired, ending game');
                this.endSession();
                if (this.onError) {
                    this.onError('Game session expired');
                }
                break;
        }
    }

    startKeepAlive() {
        this.stopKeepAlive();
        
        // Increase keep-alive frequency for more reliable connection monitoring
        this.keepAliveInterval = setInterval(() => {
            if (this.connected && this.gameState.active) {
                this.updateActivity();
                
                // Check if we haven't received a response in a while
                const inactiveTime = Date.now() - this.gameState.lastActivity;
                if (inactiveTime > 10000) { // 10 seconds threshold
                    console.log('No activity detected, checking connection...');
                    this.socket.send(JSON.stringify({
                        type: 'ping',
                        timestamp: Date.now()
                    }));
                }
            }
        }, 3000); // Check every 3 seconds
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    disconnect() {
        console.log('Disconnecting...');
        this.disconnecting = true;
        this.endSession();
        this.stopKeepAlive();
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.connected = false;
        this.roomCode = null;
        this.isHost = false;
        this.role = null;
    }

    sendPosition(position, rotation) {
        if (!this.connected || !this.gameState.active) return;
        
        const messageType = this.role === 'monster' ? 'monster_position' : 'player_position';
        
        this.socket.send(JSON.stringify({
            type: messageType,
            position: position,
            rotation: rotation,
            roomCode: this.roomCode,
            sessionId: this.gameState.sessionId,
            role: this.role
        }));
    }
}

// Export the MultiplayerManager class
window.MultiplayerManager = MultiplayerManager; 