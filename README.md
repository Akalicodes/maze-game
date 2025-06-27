# 3D Maze Game 🎮

A multiplayer 3D maze game built with Three.js and WebSocket for real-time multiplayer functionality.

## Recent Code Cleanup & Optimizations 🛠️

### Performance Improvements
- **Reduced Position Update Frequency**: Changed from 50ms to 100ms intervals for better performance
- **Optimized Rotation Buffer**: Reduced buffer size from 5 to 3 rotations for memory efficiency  
- **Throttled Arrow Updates**: Increased arrow update interval to 100ms
- **Memory Leak Prevention**: Added proper cleanup for animation frames, event listeners, and intervals

### Code Quality Improvements
- **Reduced Console Spam**: Removed excessive logging that was flooding the console during gameplay
- **Enhanced Logging**: Added emojis and structured logging for better debugging experience
- **Proper Cleanup**: Added comprehensive cleanup functions for renderer, event listeners, and multiplayer connections
- **Error Handling**: Improved error handling patterns throughout the codebase

### Bug Fixes
- **Event Listener Cleanup**: Fixed potential memory leaks from uncleaned event listeners
- **Animation Frame Management**: Proper cancellation of animation frames on cleanup
- **WebSocket Connection Handling**: Improved connection stability and reconnection logic

### Multiplayer Stability
- **Connection Resilience**: Better handling of disconnections and reconnections
- **Session Management**: Improved session lifecycle management
- **Resource Cleanup**: Proper cleanup of multiplayer resources on disconnect

## Features

- **3D First-Person Maze Navigation** with WASD controls and mouse look
- **Real-time Multiplayer** with WebSocket connections
- **Three Player Roles**:
  - **Player**: Navigate through the maze to find the exit
  - **Guide**: Top-down 2D view to help the player
  - **Monster**: Hunt the player in first-person view
- **Room-based System** with unique join codes
- **Automatic Maze Generation** with configurable difficulty

## How to Play

1. **Start the Server**: Run `npm start` to start the game server
2. **Create or Join Room**: Use the web interface to create a new room or join with a code
3. **Wait for Players**: Game requires 3 players (Player, Guide, Monster)
4. **Play**: Navigate the maze, help teammates, or hunt other players!

## Controls

- **WASD**: Move around
- **Mouse**: Look around
- **Click**: Enter pointer lock mode for better controls

## Technical Details

- **Frontend**: Three.js, HTML5, JavaScript
- **Backend**: Node.js, Express, WebSocket (ws)
- **Real-time Communication**: WebSocket for position updates and game state
- **3D Graphics**: Three.js with texture mapping and lighting

## Installation

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm start` to start the server
4. Open `http://localhost:8000` in your browser

## Architecture

- **server.js**: Main server handling WebSocket connections and game rooms
- **index.html**: Main game client with 3D rendering
- **js/multiplayer.js**: Multiplayer connection management
- **js/maze-generator.js**: Procedural maze generation algorithm

---

*Game is now optimized for better performance and stability! 🚀* 