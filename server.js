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

function handleCreateRoom(ws) {
    const roomCode = generateRoomCode();
    const playerId = uuidv4();
    const mazeSeed = Math.floor(Math.random() * 1000000);
    
    console.log(`Creating new room with code: ${roomCode}, seed: ${mazeSeed}`);
    
    // Create new room with roles and seed
    const room = {
        host: playerId,
        players: new Map([[playerId, ws]]),
        playerPositions: new Map(),
        roles: new Map([[playerId, 'player']]),
        mazeSeed: mazeSeed,
        mazeData: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        playerActivity: new Map([[playerId, Date.now()]])
    };
    
    rooms.set(roomCode, room);

    // Store room code and player ID in the WebSocket object
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = 'player';
    ws.isAlive = true;

    // Send room created confirmation with seed
    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode: roomCode,
        role: 'player',
        mazeSeed: mazeSeed
    }));

    console.log(`Room ${roomCode} created by player ${playerId} as player with seed ${mazeSeed}`);
    console.log(`Active rooms: ${Array.from(rooms.keys()).join(', ')}`);
}

function handleJoinRoom(ws, roomCode) {
    console.log(`Attempting to join room: ${roomCode}`);
    console.log(`Available rooms: ${Array.from(rooms.keys()).join(', ')}`);
    
    const room = rooms.get(roomCode);
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room not found'
        }));
        return;
    }

    if (room.players.size >= 2) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room is full'
        }));
        return;
    }

    const playerId = uuidv4();
    room.players.set(playerId, ws);
    room.roles.set(playerId, 'guide');
    
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = 'guide';

    // Send join confirmation with role
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomCode: roomCode,
        role: 'guide'
    }));

    // If maze data exists, send it immediately
    if (room.mazeData) {
        ws.send(JSON.stringify({
            type: 'maze_data',
            maze: room.mazeData
        }));
    }

    // Notify host about the new player
    const hostWs = room.players.get(room.host);
    if (hostWs) {
        hostWs.send(JSON.stringify({
            type: 'player_joined',
            playerId: playerId,
            role: 'guide'
        }));
    }

    console.log(`Player ${playerId} joined room ${roomCode} as guide`);
}

function handlePlayerMove(ws, data) {
    console.log('Received player position:', data);
    const room = rooms.get(ws.roomCode);
    if (!room) {
        console.log('Room not found for player position:', ws.roomCode);
        return;
    }

    // Update player position
    room.playerPositions.set(ws.playerId, {
        position: data.position,
        rotation: data.rotation
    });

    // Send position to all guide players
    room.players.forEach((playerWs, playerId) => {
        if (room.roles.get(playerId) === 'guide') {
            console.log('Sending position to guide:', {
                position: data.position,
                guideId: playerId
            });
            playerWs.send(JSON.stringify({
                type: 'player_position',
                position: data.position,
                rotation: data.rotation
            }));
        }
    });
}

function handleDisconnect(ws) {
    if (!ws.roomCode) return;

    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Remove player from room
    room.players.delete(ws.playerId);
    room.playerPositions.delete(ws.playerId);

    // Notify other players
    room.players.forEach((playerWs) => {
        playerWs.send(JSON.stringify({
            type: 'player_left',
            playerId: ws.playerId
        }));
    });

    // If room is empty, delete it
    if (room.players.size === 0) {
        rooms.delete(ws.roomCode);
        console.log(`Room ${ws.roomCode} deleted`);
    }

    console.log(`Player ${ws.playerId} disconnected from room ${ws.roomCode}`);
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

    // Store maze data in room
    room.mazeData = data.maze;

    // Send maze data to all guide players
    room.players.forEach((playerWs, playerId) => {
        if (room.roles.get(playerId) === 'guide') {
            playerWs.send(JSON.stringify({
                type: 'maze_data',
                maze: room.mazeData
            }));
        }
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