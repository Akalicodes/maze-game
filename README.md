# 3D Multiplayer Maze Game 🎮

A real-time multiplayer 3D maze game built with Three.js and WebSockets, featuring unique player roles and procedural maze generation.

## Game Overview

Navigate through a dynamically generated 3D maze in an exciting multiplayer experience where each player has a unique role and perspective.

### Game Modes

#### Single Player
- Navigate a procedurally generated 3D maze
- First-person perspective with WASD controls and mouse look
- Find the exit to win

#### Multiplayer (4 Players)
An asymmetric multiplayer experience where each player has a unique role:

- **🏃 Player (Runner)**: First-person view - Navigate the maze to reach the exit while avoiding the Monster
- **🗺️ Guide**: Top-down 2D view of the entire maze - Help guide the Player to safety
- **👹 Monster (Hunter)**: First-person view - Hunt down the Player before they escape
- **🏗️ Architect**: Modify the maze in real-time by adding or removing walls (with cooldown restrictions)

Roles are randomly assigned when all 4 players join the room.

## Features

✨ **Procedural Maze Generation** - Unique maze layout every game  
🎭 **Asymmetric Multiplayer** - Four unique roles with different abilities  
🌐 **Real-time Synchronization** - Instant updates across all players  
🎨 **3D Graphics** - Textured walls, floors, and ceilings  
🔄 **Dynamic Maze Modification** - Architect can reshape the maze during gameplay  
📡 **Room-based Matchmaking** - Create or join games with unique room codes

## How to Play

### Starting the Game

1. **Start the Server**
   ```bash
   npm install
   npm start
   ```
   The server will start on `http://localhost:8000`

2. **Create or Join a Room**
   - Open the game in your browser
   - Click "Multiplayer"
   - Click "Create Room" to host or "Join Room" with an existing code
   
3. **Wait for Players**
   - Game requires 4 players to start
   - Share the room code with other players
   - Roles are automatically assigned once all players join

4. **Play!**
   - Follow your role-specific objectives
   - Work together (or against each other) to win

### Controls

**Player/Monster (First-Person View)**
- `W/A/S/D` - Move forward/left/backward/right
- `Mouse` - Look around
- `Click` - Lock cursor for better control

**Guide (Top-Down View)**
- View entire maze layout
- See Player and Monster positions
- Communicate with team

**Architect**
- `Click walls` - Toggle walls on/off (with cooldown)
- Strategic wall placement to help or hinder players

## Technical Details

### Technology Stack
- **Frontend**: Three.js (3D graphics), HTML5, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: WebSocket (ws library)
- **Procedural Generation**: Custom recursive backtracking algorithm

### Architecture
```
├── index.html           # Main game client
├── server.js            # WebSocket server & game logic
├── js/
│   ├── maze-generator.js    # Maze generation algorithm
│   ├── multiplayer.js       # Multiplayer connection manager
│   └── three.min.js         # Three.js library
├── textures/            # Floor, wall, ceiling textures
└── package.json         # Dependencies
```

### Key Files
- `server.js` - Handles WebSocket connections, room management, role assignment, and game state
- `index.html` - Complete game client with 3D rendering and game logic
- `js/maze-generator.js` - Procedural maze generation using recursive backtracking
- `js/multiplayer.js` - Client-side WebSocket management with reconnection logic

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Modern web browser with WebGL support

### Setup
```bash
# Clone the repository
git clone <repository-url>

# Navigate to project directory
cd maze-game

# Install dependencies
npm install

# Start the server
npm start
```

### Access the Game
Open your browser and navigate to:
```
http://localhost:8000
```

## Multiplayer Setup

### Hosting a Game
1. Click "Multiplayer" → "Create Room"
2. Share the displayed room code with 3 other players
3. Wait for all players to join
4. Roles will be automatically assigned

### Joining a Game
1. Click "Multiplayer" → "Join Room"
2. Enter the room code
3. Wait for all players to join

## Game Rules

### Winning Conditions
- **Player wins**: Reach the maze exit without being caught
- **Monster wins**: Catch the Player before they escape

### Role Abilities
- **Player**: Can see walls and navigate the maze
- **Guide**: Has full visibility of maze layout and all player positions
- **Monster**: Can see Player position and walls, must catch the Player
- **Architect**: Can add/remove walls (limited by cooldown) to influence the game

## Development

### Project Structure
The game uses a client-server architecture:
- Client handles rendering, input, and game visuals
- Server manages game state, player synchronization, and maze data
- WebSocket provides real-time bidirectional communication

### Maze Generation
Uses a recursive backtracking algorithm with:
- Configurable maze dimensions (default 25x25)
- Random start and end positions
- Path validation to ensure solvability
- Complexity parameters for varied difficulty

## Deployment

### 🌐 Deploy to the Web

Want to share your game with friends online? See the **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for step-by-step instructions to:

1. Push your code to GitHub
2. Deploy to Render (free hosting)
3. Get a public URL to share

**Quick Deploy**: The game works out-of-the-box on platforms like Render, Railway, and Fly.io!

## Troubleshooting

**Connection Issues**
- Ensure server is running on port 8000
- Check firewall settings
- Try refreshing the browser

**Game Not Starting**
- Verify all 4 players have joined
- Check browser console for errors
- Ensure WebSocket connection is established

**Performance Issues**
- Close other browser tabs
- Update graphics drivers
- Lower browser zoom level

## Credits

Built with:
- [Three.js](https://threejs.org/) - 3D graphics library
- [ws](https://github.com/websockets/ws) - WebSocket implementation
- [Express](https://expressjs.com/) - Web server framework

## License

This project is open source and available for educational purposes.

---

**Enjoy the game!** 🎮✨
