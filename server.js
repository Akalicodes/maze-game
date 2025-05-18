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
    
    console.log(`Creating new room with code: ${roomCode}`);
    
    // Create new room
    rooms.set(roomCode, {
        host: playerId,
        players: new Map([[playerId, ws]]),
        playerPositions: new Map()
    });

    // Store room code and player ID in the WebSocket object
    ws.roomCode = roomCode;
    ws.playerId = playerId;

    // Send room created confirmation
    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode: roomCode
    }));

    console.log(`Room ${roomCode} created by player ${playerId}`);
    console.log(`Active rooms: ${Array.from(rooms.keys()).join(', ')}`);
}

function handleJoinRoom(ws, roomCode) {
    console.log(`Attempting to join room: ${roomCode}`);
    console.log(`Available rooms: ${Array.from(rooms.keys()).join(', ')}`);
    
    const room = rooms.get(roomCode);
    
    if (!room) {
        console.log(`Room ${roomCode} not found`);
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room not found'
        }));
        return;
    }

    if (room.players.size >= 2) {
        console.log(`Room ${roomCode} is full`);
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Room is full'
        }));
        return;
    }

    const playerId = uuidv4();
    room.players.set(playerId, ws);
    
    // Store room code and player ID in the WebSocket object
    ws.roomCode = roomCode;
    ws.playerId = playerId;

    // Notify the joining player
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomCode: roomCode,
        playerId: playerId
    }));

    // Notify the host
    const hostWs = room.players.get(room.host);
    if (hostWs && hostWs.readyState === WebSocket.OPEN) {
        hostWs.send(JSON.stringify({
            type: 'player_joined',
            playerId: playerId
        }));
    }

    console.log(`Player ${playerId} joined room ${roomCode}`);
}

function handlePlayerMove(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Store the player's position
    room.playerPositions.set(ws.playerId, {
        position: data.position,
        rotation: data.rotation
    });

    // Broadcast position to other player
    room.players.forEach((playerWs, playerId) => {
        if (playerId !== ws.playerId) {
            playerWs.send(JSON.stringify({
                type: 'player_move',
                playerId: ws.playerId,
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
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Only allow host to send maze data
    if (ws.playerId !== room.host) return;

    // Store maze data in room
    room.mazeData = data.maze;

    // Send maze data to other players
    room.players.forEach((playerWs, playerId) => {
        if (playerId !== ws.playerId) {
            playerWs.send(JSON.stringify({
                type: 'maze_data',
                maze: data.maze
            }));
        }
    });
}

function validateMessage(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid message format: message must be an object');
    }
    
    if (!data.type) {
        throw new Error('Invalid message format: missing type field');
    }
    
    switch (data.type) {
        case 'create_room':
            // No additional validation needed
            break;
            
        case 'join_room':
            if (!data.roomCode || typeof data.roomCode !== 'string') {
                throw new Error('Invalid join_room message: missing or invalid roomCode');
            }
            break;
            
        case 'maze_data':
            if (!data.maze || typeof data.maze !== 'object') {
                throw new Error('Invalid maze_data message: missing or invalid maze data');
            }
            break;
            
        case 'player_move':
            if (!data.roomCode || typeof data.roomCode !== 'string') {
                throw new Error('Invalid player_move message: missing or invalid roomCode');
            }
            if (!data.position || typeof data.position !== 'object') {
                throw new Error('Invalid player_move message: missing or invalid position');
            }
            if (!data.rotation || typeof data.rotation !== 'object') {
                throw new Error('Invalid player_move message: missing or invalid rotation');
            }
            break;
            
        case 'ping':
            // No additional validation needed
            break;
            
        default:
            throw new Error(`Unknown message type: ${data.type}`);
    }
}

// Handle new WebSocket connections
wss.on('connection', (ws, req) => {
    console.log('New client connected');
    
    // Set keep-alive to prevent timeouts
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            // Convert Buffer to string if needed
            const messageStr = message instanceof Buffer ? message.toString() : message;
            const data = JSON.parse(messageStr);
            console.log('Received:', data);

            // Validate message format
            validateMessage(data);

            switch (data.type) {
                case 'create_room':
                    handleCreateRoom(ws);
                    break;
                case 'join_room':
                    handleJoinRoom(ws, data.roomCode);
                    break;
                case 'player_move':
                    handlePlayerMove(ws, data);
                    break;
                case 'maze_data':
                    handleMazeData(ws, data);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error.message);
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    error: error.message || 'Invalid message format'
                }));
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
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

// Keep-alive interval
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            handleDisconnect(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
}); 