const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Create Express app
const app = express();

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Store active rooms and their players
const rooms = new Map();
const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes room timeout
const ACTIVITY_TIMEOUT = 15000; // 15 seconds activity timeout

// Function to generate a unique room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(code));
    return code;
}

// Define port
const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws'  // Specify WebSocket endpoint
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server is available on ws://localhost:${PORT}/ws`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please stop any other instances of the server.`);
        process.exit(1);
    }
});

// Add this function near the top with other utility functions
function getRoomStatus(room) {
    const playerCount = room.players.size;
    const roles = Array.from(room.roles.values());
    return {
        isFull: playerCount >= 3,  // Only full when 3 or more players
        isReady: playerCount === 3 && roles.includes('player') && roles.includes('guide') && roles.includes('monster'),
        currentPlayers: playerCount,
        hasGuide: roles.includes('guide'),
        hasMonster: roles.includes('monster'),
        hasPlayer: roles.includes('player'),
        availableRoles: roles
    };
}

function handleCreateRoom(ws) {
    const roomCode = generateRoomCode();
    const playerId = uuidv4();
    const mazeSeed = Math.floor(Math.random() * 1000000);
    
    console.log(`Creating new room with code: ${roomCode}, seed: ${mazeSeed}`);
    
    // Create new room with roles and seed - first player is always the regular player
    const room = {
        host: playerId,
        players: new Map([[playerId, ws]]),
        playerPositions: new Map(),
        roles: new Map([[playerId, 'player']]), // First player is always the regular player
        mazeSeed: mazeSeed,
        mazeData: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        playerActivity: new Map([[playerId, Date.now()]]),
        gameStarted: false,
        sharedMazeInstance: null  // Add this to store the shared maze instance
    };
    
    rooms.set(roomCode, room);

    // Store room code and player ID in the WebSocket object
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = 'player';
    ws.isAlive = true;

    // Send room created confirmation
    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode: roomCode,
        role: 'player',
        mazeSeed: mazeSeed,
        canStart: false
    }));

    console.log(`Room ${roomCode} created by player ${playerId} as player with seed ${mazeSeed}`);
    console.log(`Active rooms: ${Array.from(rooms.keys()).join(', ')}`);
}

function handleJoinRoom(ws, roomCode) {
    console.log(`Attempting to join room: ${roomCode}`);
    
    const room = rooms.get(roomCode);
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room not found. Please check the room code and try again.'
        }));
        return;
    }

    const status = getRoomStatus(room);
    
    if (status.isFull) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room is full. Please create a new room or wait for a spot to open.'
        }));
        return;
    }

    const playerId = uuidv4();
    
    // Determine role based on what's already taken
    let role;
    if (!status.hasGuide) {
        role = 'guide';
    } else if (!status.hasMonster) {
        role = 'monster';
    } else if (!status.hasPlayer) {
        role = 'player';
    } else {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'No roles available. Please try another room.'
        }));
        return;
    }

    console.log(`Assigning role ${role} to player ${playerId} in room ${roomCode}`);
    
    // Add player to room
    room.players.set(playerId, ws);
    room.roles.set(playerId, role);
    room.playerActivity.set(playerId, Date.now());
    
    // Update WebSocket state
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = role;
    ws.isAlive = true;

    // Send join confirmation
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomCode: roomCode,
        role: role,
        mazeSeed: room.mazeSeed
    }));

    // If maze data exists, send it
    if (room.mazeData) {
        ws.send(JSON.stringify({
            type: 'maze_data',
            maze: room.mazeData
        }));
    }

    // Notify all players about the new player
    room.players.forEach((playerWs, pid) => {
        if (pid !== playerId) {
            playerWs.send(JSON.stringify({
                type: 'player_joined',
                playerId: playerId,
                role: role
            }));
        }
    });

    // Check if room is ready to start
    const newStatus = getRoomStatus(room);
    if (newStatus.isReady) {
        console.log('Room is ready to start game');
        room.gameStarted = true;
        room.players.forEach((playerWs) => {
            playerWs.send(JSON.stringify({
                type: 'game_ready',
                message: 'All players have joined. The game can now begin!',
                canStart: true
            }));
        });
    } else {
        console.log('Waiting for more players');
        const remainingPlayers = 3 - room.players.size;
        const message = `Waiting for ${remainingPlayers} more player${remainingPlayers > 1 ? 's' : ''}...`;
        room.players.forEach((playerWs) => {
            playerWs.send(JSON.stringify({
                type: 'waiting_for_players',
                message: message,
                currentPlayers: room.players.size,
                canStart: false
            }));
        });
    }
}

function handlePlayerMove(ws, data) {
    console.log('Received position update:', data);
    const room = rooms.get(ws.roomCode);
    if (!room) {
        console.log('Room not found for position update:', ws.roomCode);
        return;
    }

    // Validate the message type matches the sender's role
    if ((data.type === 'player_position' && ws.role !== 'player') ||
        (data.type === 'monster_position' && ws.role !== 'monster')) {
        console.error('Invalid position update type for role:', data.type, ws.role);
        return;
    }

    // Update player/monster position
    room.playerPositions.set(ws.playerId, {
        position: data.position,
        rotation: data.rotation,
        role: ws.role
    });

    // Send position to appropriate players based on type
    room.players.forEach((playerWs, playerId) => {
        const receiverRole = room.roles.get(playerId);
        
        // Guide sees all positions
        if (receiverRole === 'guide') {
            playerWs.send(JSON.stringify({
                type: data.type,
                position: data.position,
                rotation: data.rotation,
                playerId: ws.playerId,
                role: ws.role
            }));
        }
        // Monster sees player positions
        else if (receiverRole === 'monster' && data.type === 'player_position') {
            playerWs.send(JSON.stringify({
                type: data.type,
                position: data.position,
                rotation: data.rotation,
                playerId: ws.playerId,
                role: ws.role
            }));
        }
        // Player sees monster positions
        else if (receiverRole === 'player' && data.type === 'monster_position') {
            playerWs.send(JSON.stringify({
                type: data.type,
                position: data.position,
                rotation: data.rotation,
                playerId: ws.playerId,
                role: ws.role
            }));
        }
    });
}

function handleDisconnect(ws) {
    if (!ws.roomCode) return;

    const room = rooms.get(ws.roomCode);
    if (!room) return;

    console.log(`Player ${ws.playerId} disconnecting from room ${ws.roomCode}`);

    // Remove player from all room data structures
    room.players.delete(ws.playerId);
    room.playerPositions.delete(ws.playerId);
    room.roles.delete(ws.playerId);
    room.playerActivity.delete(ws.playerId);

    // If this was the host, assign a new host if possible
    if (room.host === ws.playerId && room.players.size > 0) {
        room.host = Array.from(room.players.keys())[0];
        const newHostWs = room.players.get(room.host);
        if (newHostWs) {
            newHostWs.send(JSON.stringify({
                type: 'host_assigned',
                message: 'You are now the host'
            }));
        }
    }

    // Get current room status
    const status = getRoomStatus(room);

    // Notify remaining players
    room.players.forEach((playerWs) => {
        playerWs.send(JSON.stringify({
            type: 'player_left',
            playerId: ws.playerId,
            currentPlayers: status.currentPlayers,
            availableRoles: status.availableRoles
        }));

        // Send waiting message since we lost a player
        playerWs.send(JSON.stringify({
            type: 'waiting_for_players',
            message: `A player left. Waiting for ${3 - status.currentPlayers} more player(s)...`,
            currentPlayers: status.currentPlayers,
            canStart: false
        }));
    });

    // Reset game state since we lost a player
    if (room.gameStarted) {
        room.gameStarted = false;
        room.mazeData = null; // Clear maze data to force regeneration
    }

    // If room is empty or only has disconnected players, delete it
    if (room.players.size === 0 || Array.from(room.players.values()).every(p => !p.isAlive)) {
        console.log(`Deleting empty room ${ws.roomCode}`);
        rooms.delete(ws.roomCode);
    }

    console.log(`Player ${ws.playerId} disconnected from room ${ws.roomCode}`);
    console.log(`Room status: ${status.currentPlayers} players, roles: ${status.availableRoles.join(', ')}`);
}

function handleMazeData(ws, data) {
    console.log(`Handling maze data for room: ${ws.roomCode}`);
    const room = rooms.get(ws.roomCode);
    if (!room) {
        console.error('Room not found for maze data:', ws.roomCode);
        return;
    }

    // Only allow host to send maze data
    if (ws.playerId !== room.host) {
        console.log('Ignoring maze data from non-host');
        return;
    }

    // Validate maze data
    if (!data.maze || !data.maze.maze || !Array.isArray(data.maze.maze) || 
        !data.maze.startPosition || !data.maze.endPosition || !data.maze.cellSize) {
        console.error('Invalid maze data received:', data.maze);
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid maze data format'
        }));
        return;
    }

    // Store maze data in room and set as shared instance
    room.mazeData = data.maze;
    room.sharedMazeInstance = data.maze;

    // Send maze data to ALL players, not just guide
    room.players.forEach((playerWs, playerId) => {
        console.log(`Sending maze data to player ${playerId} with role ${room.roles.get(playerId)}`);
        playerWs.send(JSON.stringify({
            type: 'maze_data',
            maze: room.sharedMazeInstance
        }));
    });
}

function updateRoomActivity(roomCode, playerId) {
    const room = rooms.get(roomCode);
    if (room) {
        room.lastActivity = Date.now();
        if (playerId) {
            room.playerActivity.set(playerId, Date.now());
        }
    }
}

function handleMessage(ws, data) {
    try {
        switch (data.type) {
            case 'create_room':
                handleCreateRoom(ws);
                break;
            case 'join_room':
                handleJoinRoom(ws, data.roomCode);
                break;
            case 'restore_session':
                handleRestoreSession(ws, data);
                break;
            case 'activity_update':
                handleActivityUpdate(ws, data);
                break;
            case 'ping':
                handlePing(ws);
                break;
            case 'player_position':
            case 'monster_position':
                handlePlayerMove(ws, data);
                break;
            case 'maze_data':
                handleMazeData(ws, data);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to process message'
        }));
    }
}

function handleRestoreSession(ws, data) {
    const { sessionId, state } = data;
    const { roomCode, role, isHost } = state;
    
    console.log(`Attempting to restore session for room ${roomCode}`);
    
    const room = rooms.get(roomCode);
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room no longer exists'
        }));
        return;
    }
    
    // Generate new player ID for the restored session
    const playerId = uuidv4();
    
    // Update room state
    room.players.set(playerId, ws);
    room.roles.set(playerId, role);
    room.playerActivity.set(playerId, Date.now());
    
    if (isHost) {
        room.host = playerId;
    }
    
    // Update WebSocket state
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = role;
    
    // Send confirmation
    ws.send(JSON.stringify({
        type: 'session_restored',
        roomCode,
        role,
        mazeSeed: room.mazeSeed
    }));
    
    // Notify other players
    room.players.forEach((playerWs, pid) => {
        if (pid !== playerId) {
            playerWs.send(JSON.stringify({
                type: 'player_rejoined',
                playerId,
                role
            }));
        }
    });
}

function handleActivityUpdate(ws, data) {
    const { sessionId, timestamp, state } = data;
    if (ws.roomCode) {
        updateRoomActivity(ws.roomCode, ws.playerId);
    }
}

function handlePing(ws) {
    ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
    }));
    if (ws.roomCode) {
        updateRoomActivity(ws.roomCode, ws.playerId);
    }
}

// Handle new WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    // Set initial connection state
    ws.isAlive = true;

    // Handle pong responses
    ws.on('pong', () => {
        ws.isAlive = true;
        if (ws.roomCode) {
            updateRoomActivity(ws.roomCode, ws.playerId);
        }
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            ws.isAlive = true;
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        try {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'WebSocket connection error'
            }));
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
        }
    });
});

// Keep-alive and room cleanup interval
const interval = setInterval(() => {
    const now = Date.now();
    
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Client connection timed out, disconnecting...');
            handleDisconnect(ws);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        try {
            ws.ping();
        } catch (error) {
            console.error('Error sending ping:', error);
        }
    });

    // Clean up inactive rooms and players
    for (const [roomCode, room] of rooms.entries()) {
        const inactiveTime = now - room.lastActivity;
        
        // Check individual player activity
        for (const [playerId, lastActivity] of room.playerActivity.entries()) {
            const playerInactiveTime = now - lastActivity;
            if (playerInactiveTime > ACTIVITY_TIMEOUT) {
                console.log(`Player ${playerId} inactive for ${playerInactiveTime}ms in room ${roomCode}`);
                const playerWs = room.players.get(playerId);
                if (playerWs) {
                    playerWs.send(JSON.stringify({
                        type: 'warning',
                        message: 'No activity detected, please respond to maintain connection'
                    }));
                }
            }
        }
        
        // Clean up room if inactive
        if (inactiveTime > ROOM_TIMEOUT) {
            console.log(`Room ${roomCode} inactive for ${inactiveTime}ms, cleaning up...`);
            room.players.forEach((ws) => {
                try {
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Room timed out due to inactivity'
                    }));
                    handleDisconnect(ws);
                    ws.close();
                } catch (error) {
                    console.error('Error closing connection:', error);
                }
            });
            rooms.delete(roomCode);
        }
    }
}, 5000); // Check every 5 seconds

wss.on('close', () => {
    clearInterval(interval);
}); 