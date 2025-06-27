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
    console.log(`🎮 Maze Game Server running on port ${PORT}`);
    console.log(`🔗 WebSocket server available on ws://localhost:${PORT}/ws`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
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
        availableRoles: roles,
        allPlayersJoined: playerCount === 3
    };
}

// Function to randomly assign roles when all players have joined
function assignRandomRoles(room) {
    const allRoles = ['player', 'guide', 'monster'];
    const playerIds = Array.from(room.players.keys());
    
    // Shuffle the roles array
    for (let i = allRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allRoles[i], allRoles[j]] = [allRoles[j], allRoles[i]];
    }
    
    // Assign shuffled roles to players
    playerIds.forEach((playerId, index) => {
        const role = allRoles[index];
        room.roles.set(playerId, role);
        
        const playerWs = room.players.get(playerId);
        if (playerWs) {
            playerWs.role = role;
        }
    });
    
    console.log(`🎲 Roles randomly assigned in room ${room.host}: ${playerIds.map((id, i) => `${id.slice(0, 8)}=${allRoles[i]}`).join(', ')}`);
}

function handleCreateRoom(ws) {
    const roomCode = generateRoomCode();
    const playerId = uuidv4();
    const mazeSeed = Math.floor(Math.random() * 1000000);
    
    // Create new room with temporary roles - roles will be assigned randomly when all players join
    const room = {
        host: playerId,
        players: new Map([[playerId, ws]]),
        playerPositions: new Map(),
        roles: new Map([[playerId, 'waiting']]), // Temporary role until all players join
        mazeSeed: mazeSeed,
        mazeData: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        playerActivity: new Map([[playerId, Date.now()]]),
        gameStarted: false,
        sharedMazeInstance: null
    };
    
    rooms.set(roomCode, room);

    // Store room code and player ID in the WebSocket object
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = 'waiting';
    ws.isAlive = true;

    // Send room created confirmation
    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode: roomCode,
        role: 'waiting',
        mazeSeed: mazeSeed,
        canStart: false
    }));

    console.log(`🏠 Room ${roomCode} created | Player: ${playerId} (waiting) | Seed: ${mazeSeed}`);
    console.log(`📊 Active rooms: ${rooms.size} | Codes: [${Array.from(rooms.keys()).join(', ')}]`);
}

function handleJoinRoom(ws, roomCode) {
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
    
    // Add player to room with temporary "waiting" role
    room.players.set(playerId, ws);
    room.roles.set(playerId, 'waiting');
    room.playerActivity.set(playerId, Date.now());
    
    // Update WebSocket state
    ws.roomCode = roomCode;
    ws.playerId = playerId;
    ws.role = 'waiting';
    ws.isAlive = true;

    // Send join confirmation with waiting role
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomCode: roomCode,
        role: 'waiting',
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
                role: 'waiting'
            }));
        }
    });

    // Check if all players have joined (3 players total)
    const newStatus = getRoomStatus(room);
    if (newStatus.allPlayersJoined) {
        console.log(`🎮 Room ${roomCode} - all players joined, assigning random roles...`);
        
        // Assign random roles to all players
        assignRandomRoles(room);
        
        // Mark game as ready to start
        room.gameStarted = true;
        
        // Send role assignments and game ready message to all players
        room.players.forEach((playerWs, pid) => {
            const assignedRole = room.roles.get(pid);
            
            console.log(`📨 Sending role_assigned to player ${pid.slice(0, 8)}: ${assignedRole}`);
            // Send role assignment
            playerWs.send(JSON.stringify({
                type: 'role_assigned',
                role: assignedRole,
                message: `You have been assigned the role: ${assignedRole}`
            }));
            
            console.log(`📨 Sending game_ready to player ${pid.slice(0, 8)}`);
            // Send game ready message
            playerWs.send(JSON.stringify({
                type: 'game_ready',
                message: 'All players have joined and roles have been assigned. The game can now begin!',
                canStart: true
            }));
        });
        
        console.log(`🎮 Room ${roomCode} ready to start with random roles assigned`);
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
    const room = rooms.get(ws.roomCode);
    if (!room) {
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
        else if (receiverRole === 'monster' && ws.role === 'player') {
            playerWs.send(JSON.stringify({
                type: 'player_position',
                position: data.position,
                rotation: data.rotation,
                playerId: ws.playerId,
                role: ws.role
            }));
        }
        // Player sees monster positions
        else if (receiverRole === 'player' && ws.role === 'monster') {
            playerWs.send(JSON.stringify({
                type: 'monster_position',
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

    console.log(`👋 Player disconnected | Room: ${ws.roomCode} | Players: ${status.currentPlayers} | Roles: [${status.availableRoles.join(', ')}]`);
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
            case 'game_over':
                handleGameOver(ws, data);
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

function handleGameOver(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    console.log(`Game over in room ${ws.roomCode}, winner: ${data.winner}`);

    // Notify all players in the room (including guide, player, and monster)
    room.players.forEach((playerWs, playerId) => {
        const role = room.roles.get(playerId);
        console.log(`Notifying ${role} (${playerId}) of game termination`);
        
        try {
            playerWs.send(JSON.stringify({
                type: 'game_terminated',
                winner: data.winner
            }));
        } catch (error) {
            console.error(`Error sending game over message to ${role}:`, error);
        }
    });

    // Wait a moment for messages to be sent, then force disconnect all players
    setTimeout(() => {
        room.players.forEach((playerWs, playerId) => {
            const role = room.roles.get(playerId);
            console.log(`Force disconnecting ${role} (${playerId})`);
            
            try {
                playerWs.close();
            } catch (error) {
                console.error(`Error closing connection for ${role}:`, error);
            }
        });

        // Delete the room
        rooms.delete(ws.roomCode);
        console.log(`Room ${ws.roomCode} terminated and deleted`);
    }, 100); // Small delay to ensure messages are sent
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