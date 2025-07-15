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
        this.onRoleAssigned = null;
        this.onMazeDataReceived = null;
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
        console.log('🎮 Session started:', this.gameState.sessionId);
    }

    endSession() {
        this.gameState.active = false;
        this.gameState.sessionId = null;
        this.gameState.players.clear();
        this.gameState.lastKnownState = null;
        this.gameState.reconnecting = false;
        console.log('🛑 Session ended');
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
                console.log('🔥🔥🔥 WEBSOCKET MESSAGE RECEIVED! 🔥🔥🔥', event.data);
                try {
                    console.log('🚨 RAW WebSocket DATA RECEIVED by', this.role, ':', event.data);
                    const message = JSON.parse(event.data);
                    console.log('🔥 PARSED MESSAGE by', this.role, ':', message.type, message);
                    
                    // Special check for architect messages
                    if (message.type === 'architect_update') {
                        console.log('🔥🔥🔥 ARCHITECT_UPDATE MESSAGE DETECTED! 🔥🔥🔥');
                        console.log('🔥 Message data:', JSON.stringify(message, null, 2));
                        console.log('🔥 About to call handleMessage...');
                        console.log('🔥 this.role:', this.role);
                        console.log('🔥 this object:', this);
                    }
                    
                    // Special logging for architect messages
                    if (message.type === 'architect_update' || message.type === 'wall_changed') {
                        console.log('🏗️🏗️🏗️ ARCHITECT MESSAGE DETECTED!', message);
                        console.log('🏗️ Message details:', JSON.stringify(message, null, 2));
                    }
                    
                    // Reset connection attempts on successful message
                    if (this.gameState.reconnecting) {
                        this.connectionAttempts = 0;
                        this.gameState.reconnecting = false;
                    }
                    
                    this.handleMessage(message);
                    this.updateActivity();
                } catch (error) {
                    console.error('Error processing message:', error);
                    console.error('Raw event data was:', event.data);
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
        this.roomCode = roomCode;
        
        this.socket.send(JSON.stringify({
            type: 'join_room',
            roomCode: roomCode,
            sessionId: this.gameState.sessionId
        }));
    }

    handleMessage(message) {
        console.log('🔥 [' + this.role + '] Handling message:', message.type, message);
        
        // Extra debugging for architect messages
        if (message.type === 'architect_update') {
            console.log('🔥🔥🔥 INSIDE handleMessage for architect_update! 🔥🔥🔥');
        }
        
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

            case 'role_assigned':
                this.role = message.role;
                console.log(`🎭 Role assigned: ${message.role}`);
                // Update the UI or notify about role assignment
                if (this.onRoleAssigned) {
                    this.onRoleAssigned(message.role, message.message);
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

            case 'maze_data':
                console.log('🗺️ Received maze data');
                if (this.onMazeDataReceived) {
                    this.onMazeDataReceived(message.maze);
                }
                break;

            case 'session_expired':
                console.log('Session expired, ending game');
                this.endSession();
                if (this.onError) {
                    this.onError('Game session expired');
                }
                break;

            case 'wall_changed':
            case 'architect_update':  // Handle both old and new message types
                console.log('🔥🔥🔥 REACHED ARCHITECT_UPDATE CASE STATEMENT! 🔥🔥🔥');
                console.log('🏗️ ARCHITECT UPDATE received by', this.role, ':', message);
                console.log('🏗️ Player role:', this.role, 'Connected:', this.connected, 'Active:', this.gameState.active);
                
                // Check if the function exists on window
                console.log('🏗️ window.handleWallChanged exists:', typeof window.handleWallChanged);
                console.log('🏗️ window object keys:', Object.keys(window).filter(k => k.includes('handle')));
                
                if (window.handleWallChanged) {
                    console.log('🏗️ Calling handleWallChanged function for', this.role);
                    try {
                        window.handleWallChanged(message);
                        console.log('🏗️ handleWallChanged completed successfully for', this.role);
                    } catch (error) {
                        console.error('🏗️ Error in handleWallChanged for', this.role, ':', error);
                        console.error('🏗️ Error stack:', error.stack);
                    }
                } else {
                    console.error('🏗️ handleWallChanged function not available for', this.role, '!');
                    console.error('🏗️ Available window functions:', Object.keys(window).filter(k => typeof window[k] === 'function'));
                }
                break;

            case 'architect_cooldown':
                console.log('🔥 Architect on cooldown:', message.remainingSeconds);
                if (window.showArchitectCooldown) {
                    window.showArchitectCooldown(message.remainingSeconds);
                }
                break;

            case 'architect_error':
                console.log('🏗️ Architect error:', message.error);
                if (window.showArchitectError) {
                    window.showArchitectError(message.error);
                } else {
                    console.log('🏗️ Architect action blocked:', message.error);
                }
                // Don't call this.onError - no disconnection for architect errors
                break;

            case 'error':
                console.log('❌ Server error:', message.error);
                // Fallback check for any architect-related errors that might use the generic error type
                if (message.error.includes('architect') || message.error.includes('wall') || 
                    message.error.includes('cooldown') || message.error.includes('boundary') ||
                    message.error.includes('player position') || message.error.includes('path') ||
                    message.error.includes('already exists') || message.error.includes('remove') ||
                    message.error.includes('bounds') || message.error.includes('modify') ||
                    message.error.includes('maze data') || message.error.includes('Room not found')) {
                    // Use the in-game error display function for architect-related errors
                    console.log('🏗️ Architect-related error caught by fallback:', message.error);
                    if (window.showArchitectError) {
                        window.showArchitectError(message.error);
                    } else {
                        console.log('🏗️ Architect action blocked:', message.error);
                    }
                    // Don't call this.onError for architect-related errors - no disconnection
                } else if (this.onError) {
                    // Only disconnect for non-architect related errors
                    this.onError(message.error);
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