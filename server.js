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
        isFull: playerCount >= 4,  // Only full when 4 or more players
        isReady: playerCount === 4 && roles.includes('player') && roles.includes('guide') && roles.includes('monster') && roles.includes('architect'),
        currentPlayers: playerCount,
        hasGuide: roles.includes('guide'),
        hasArchitect: roles.includes('architect'),
        hasMonster: roles.includes('monster'),
        hasPlayer: roles.includes('player'),
        availableRoles: roles,
        allPlayersJoined: playerCount === 4
    };
}

// Function to randomly assign roles when all players have joined
function assignRandomRoles(room) {
    const allRoles = ['player', 'guide', 'monster', 'architect'];
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

    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode: roomCode,
        role: 'waiting',
        mazeSeed: mazeSeed,
        canStart: false
    }));

    console.log(`Room ${roomCode} created with ${room.players.size} player(s)`);
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

    const newStatus = getRoomStatus(room);
    if (newStatus.allPlayersJoined) {
        assignRandomRoles(room);
        room.gameStarted = true;
        
        room.players.forEach((playerWs, pid) => {
            const assignedRole = room.roles.get(pid);
            
            playerWs.send(JSON.stringify({
                type: 'role_assigned',
                role: assignedRole,
                message: `You have been assigned the role: ${assignedRole}`
            }));
            
            playerWs.send(JSON.stringify({
                type: 'game_ready',
                message: 'All players have joined and roles have been assigned. The game can now begin!',
                canStart: true
            }));
        });
        
        console.log(`Room ${roomCode} ready with all roles assigned`);
    } else {
        const remainingPlayers = 4 - room.players.size;
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
        
        // Guide and Architect see all positions
        if (receiverRole === 'guide' || receiverRole === 'architect') {
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
            message: `A player left. Waiting for ${4 - status.currentPlayers} more player(s)...`,
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

    console.log(`Player disconnected from room ${ws.roomCode} | ${status.currentPlayers} player(s) remaining`);
}

function handleMazeData(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room || ws.playerId !== room.host) {
        return;
    }

    if (!data.maze || !data.maze.maze || !Array.isArray(data.maze.maze) || 
        !data.maze.startPosition || !data.maze.endPosition || !data.maze.cellSize) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid maze data format'
        }));
        return;
    }

    room.mazeData = data.maze;
    room.sharedMazeInstance = room.mazeData;

    room.players.forEach((playerWs) => {
        playerWs.send(JSON.stringify({
            type: 'maze_data',
            maze: room.mazeData
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

// Pathfinding utility for validating maze paths
function hasValidPath(maze, startPos, endPos, cellSize) {
    const width = maze[0].length;
    const height = maze.length;
    
    // Convert world positions to grid positions
    const startX = Math.floor(startPos.x / cellSize);
    const startZ = Math.floor(startPos.z / cellSize);
    const endX = Math.floor(endPos.x / cellSize);
    const endZ = Math.floor(endPos.z / cellSize);
    
    // Bounds check
    if (startX < 0 || startX >= width || startZ < 0 || startZ >= height ||
        endX < 0 || endX >= width || endZ < 0 || endZ >= height) {
        return false;
    }
    
    // Check if start or end positions are walls
    if (maze[startZ][startX] === 1 || maze[endZ][endX] === 1) {
        return false;
    }
    
    // BFS pathfinding
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const queue = [{x: startX, z: startZ}];
    visited[startZ][startX] = true;
    
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.x === endX && current.z === endZ) {
            return true;
        }
        
        for (const [dx, dz] of directions) {
            const newX = current.x + dx;
            const newZ = current.z + dz;
            
            if (newX >= 0 && newX < width && newZ >= 0 && newZ < height &&
                !visited[newZ][newX] && maze[newZ][newX] === 0) {
                visited[newZ][newX] = true;
                queue.push({x: newX, z: newZ});
            }
        }
    }
    
    return false;
}

function handleArchitectWallChange(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room || !room.mazeData) {
        return;
    }
    
    // Verify player is architect
    if (room.roles.get(ws.playerId) !== 'architect') {
        return;
    }
    
    const { x, z, action } = data; // action: 'add' or 'remove'
    const maze = room.mazeData.maze;
    const cellSize = room.mazeData.cellSize;
    
    // Convert world coordinates to grid coordinates
    const gridX = Math.floor(x / cellSize);
    const gridZ = Math.floor(z / cellSize);
    
    // Basic bounds check only
    if (gridX < 0 || gridX >= maze[0].length || gridZ < 0 || gridZ >= maze.length) {
        return;
    }
    
    // Apply the change directly
    const newValue = action === 'add' ? 1 : 0;
    maze[gridZ][gridX] = newValue;
    
    // Update the maze data - ensure both the room's maze data and shared instance are updated
    room.mazeData.maze = maze;
    room.sharedMazeInstance = room.mazeData; // Ensure shared instance is updated
    
    // Broadcast wall change to all players
    room.players.forEach((playerWs, playerId) => {
        try {
            const messageData = {
                type: 'architect_update',
                x: x,
                z: z,
                gridX: gridX,
                gridZ: gridZ,
                action: action
            };
            
            const messageString = JSON.stringify(messageData);
            
            if (playerWs.readyState === 1) { // WebSocket.OPEN
                playerWs.send(messageString);
            }
        } catch (error) {
            console.error(`Failed to send message:`, error.message);
        }
    });
}

function handleTestBroadcast(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    
    const testMessage = {
        type: 'architect_update',
        x: 100,
        z: 100,
        gridX: 10,
        gridZ: 10,
        action: 'add',
        test: true
    };
    
    room.players.forEach((playerWs) => {
        try {
            if (playerWs.readyState === 1) {
                playerWs.send(JSON.stringify(testMessage));
            }
        } catch (error) {
            console.error('Test broadcast failed:', error);
        }
    });
}

function handlePlayAgain(ws, data) {
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    // Initialize play again tracking
    if (!room.playAgainVotes) {
        room.playAgainVotes = new Set();
    }
    
    // Add this player's vote
    room.playAgainVotes.add(ws.playerId);
    console.log(`Play again vote: ${room.playAgainVotes.size}/4 players`);
    
    // If all 4 players voted, restart the game
    if (room.playAgainVotes.size === 4) {
        console.log('All players voted to play again, restarting...');
        
        // Reset game state
        room.gameStarted = false;
        room.mazeData = null;
        room.playerPositions.clear();
        room.playAgainVotes.clear();
        
        // Randomly reassign roles
        assignRandomRoles(room);
        
        // Send new role assignments
        room.players.forEach((playerWs, pid) => {
            const newRole = room.roles.get(pid);
            playerWs.send(JSON.stringify({
                type: 'role_assigned',
                role: newRole,
                message: `You have been assigned the role: ${newRole}`
            }));
        });
        
        // Send restart signal
        room.players.forEach((playerWs) => {
            playerWs.send(JSON.stringify({
                type: 'play_again_restart',
                roomCode: data.roomCode
            }));
        });
        
        // Trigger game ready after a short delay
        setTimeout(() => {
            room.gameStarted = true;
            room.players.forEach((playerWs) => {
                playerWs.send(JSON.stringify({
                    type: 'game_ready',
                    message: 'New game starting!',
                    canStart: true
                }));
            });
        }, 1000);
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
            case 'play_again':
                handlePlayAgain(ws, data);
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
            case 'architect_wall_change':
            case 'architect_update':
                handleArchitectWallChange(ws, data);
                break;
            case 'test_broadcast':
                handleTestBroadcast(ws, data);
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

    room.gameStarted = false;
    room.gameEnded = true;

    // Notify all players in the room of game termination
    const terminationMessage = JSON.stringify({
        type: 'game_terminated',
        winner: data.winner,
        message: `Game ended - ${data.winner} wins!`
    });

    console.log(`Game over in room ${ws.roomCode} - Winner: ${data.winner}`);
    
    // Send end message to all connected players
    room.players.forEach((playerWs, playerId) => {
        try {
            if (playerWs.readyState === 1) {
                playerWs.send(terminationMessage);
            }
        } catch (error) {
            console.error('Error sending game over message:', error.message);
        }
    });

    // DON'T terminate connections immediately - let players see the end screen
    // and choose to play again or leave naturally
    // The room stays active so players can click "Play Again"
}

wss.on('connection', (ws) => {
    
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
        
        for (const [playerId, lastActivity] of room.playerActivity.entries()) {
            const playerInactiveTime = now - lastActivity;
            if (playerInactiveTime > ACTIVITY_TIMEOUT) {
                const playerWs = room.players.get(playerId);
                if (playerWs) {
                    playerWs.send(JSON.stringify({
                        type: 'warning',
                        message: 'No activity detected, please respond to maintain connection'
                    }));
                }
            }
        }
        
        if (inactiveTime > ROOM_TIMEOUT) {
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