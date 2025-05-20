class MazeGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = Array(height).fill().map(() => Array(width).fill(1)); // 1 = wall, 0 = path
        this.cellSize = 3; // Smaller cell size for narrower paths
        this.wallHeight = 5; // Height of maze walls
        this.deadEndProbability = 0.8; // Much higher chance of dead ends
        this.forkProbability = 0.5; // Lower chance of forks to create more linear paths
        this.extraForkProbability = 0.4; // Fewer extra forks
        this.extraWallProbability = 0.7; // High chance of extra walls but will ensure paths remain
    }

    generate() {
        // Start from a random position in first row
        const startX = Math.floor(Math.random() * (this.width - 2)) + 1;
        this.startPosition = { x: startX * this.cellSize, z: 0 };
        
        // Create the main path
        this.carve(startX, 0);
        
        // Create end point at the opposite corner from start
        let endX;
        if (startX < this.width / 2) {
            endX = this.width - 2;
        } else {
            endX = 1;
        }
        
        // Ensure clear path near end
        this.grid[this.height - 1][endX] = 0;
        this.grid[this.height - 2][endX] = 0;
        
        // Set end position in world coordinates (multiply by cellSize)
        this.endPosition = { 
            x: endX * this.cellSize, 
            z: (this.height - 1) * this.cellSize 
        };

        // Add complexity while maintaining valid paths
        this.addComplexPaths();
        
        // Ensure path to end exists
        this.ensurePathToEnd();
        
        // Add final maze features while keeping paths valid
        this.addFinalComplexity();
        
        // One final check to ensure end is reachable
        this.ensurePathToEnd();

        return {
            maze: this.grid,
            startPosition: this.startPosition,
            endPosition: this.endPosition,
            cellSize: this.cellSize,
            wallHeight: this.wallHeight
        };
    }

    carve(x, y) {
        this.grid[y][x] = 0;

        // Randomize directions with more variations
        const directions = [
            [0, 2],  // Down
            [2, 0],  // Right
            [0, -2], // Up
            [-2, 0]  // Left
        ].sort(() => Math.random() - 0.5);

        for (const [dx, dy] of directions) {
            const newX = x + dx;
            const newY = y + dy;
            
            if (this.isValid(newX, newY) && this.grid[newY][newX] === 1) {
                // Create forks randomly (but less often)
                if (Math.random() < this.forkProbability) {
                    // Try to create a branch
                    const branchDirections = directions
                        .filter(([bx, by]) => 
                            this.isValid(newX + bx, newY + by) && 
                            this.grid[newY + by][newX + bx] === 1
                        );
                    
                    if (branchDirections.length > 0) {
                        const [bx, by] = branchDirections[Math.floor(Math.random() * branchDirections.length)];
                        // Carve the branch
                        this.grid[newY + by/2][newX + bx/2] = 0;
                        this.grid[newY + by][newX + bx] = 0;
                    }
                }

                // Carve the main path
                this.grid[y + dy/2][x + dx/2] = 0;
                this.carve(newX, newY);
            }
        }
    }

    addComplexPaths() {
        // Add branching paths that connect to existing paths
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (this.grid[y][x] === 0 && Math.random() < this.forkProbability) {
                    const directions = [[0, 2], [2, 0], [0, -2], [-2, 0]];
                    
                    for (const [dx, dy] of directions) {
                        const newX = x + dx;
                        const newY = y + dy;
                        
                        if (this.isValid(newX, newY) && this.grid[newY][newX] === 1) {
                            // Check if this new path connects to another path
                            const connectingPaths = this.findConnectingPaths(newX, newY);
                            if (connectingPaths.length > 0) {
                                // Create the path
                                this.grid[y + dy/2][x + dx/2] = 0;
                                this.grid[newY][newX] = 0;
                                // Connect to one of the found paths
                                const [cx, cy] = connectingPaths[Math.floor(Math.random() * connectingPaths.length)];
                                this.grid[cy][cx] = 0;
                            }
                        }
                    }
                }
            }
        }
    }

    findConnectingPaths(x, y) {
        const paths = [];
        const directions = [[0, 2], [2, 0], [0, -2], [-2, 0]];
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.isValid(nx, ny) && this.grid[ny][nx] === 0) {
                paths.push([nx, ny]);
            }
        }
        return paths;
    }

    addFinalComplexity() {
        // Add walls while ensuring paths remain connected
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (this.grid[y][x] === 0 && Math.random() < this.extraWallProbability) {
                    // Before adding a wall, check if it would create a dead end
                    const tempGrid = JSON.parse(JSON.stringify(this.grid));
                    tempGrid[y][x] = 1;
                    
                    // Only add the wall if it doesn't create a dead end and path remains valid
                    if (this.hasValidPath(tempGrid) && !this.wouldCreateDeadEnd(x, y, tempGrid)) {
                        this.grid[y][x] = 1;
                    }
                }
            }
        }
    }

    wouldCreateDeadEnd(x, y, testGrid) {
        // Check surrounding cells to see if this would create a dead end
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        for (let [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.isValid(nx, ny) && testGrid[ny][nx] === 0) {
                // Count walls around this neighbor
                let wallCount = 0;
                for (let [dx2, dy2] of directions) {
                    const nx2 = nx + dx2;
                    const ny2 = ny + dy2;
                    if (!this.isValid(nx2, ny2) || testGrid[ny2][nx2] === 1) {
                        wallCount++;
                    }
                }
                // If this would create a dead end, return true
                if (wallCount >= 3) return true;
            }
        }
        return false;
    }

    ensurePathToEnd() {
        // Use A* pathfinding to ensure the end is reachable
        const visited = Array(this.height).fill().map(() => Array(this.width).fill(false));
        const queue = [{x: this.startPosition.x / this.cellSize, y: 0, cost: 0}];
        const cameFrom = new Map();
        visited[0][Math.floor(this.startPosition.x / this.cellSize)] = true;
        let endReachable = false;
        let endNode = null;

        while (queue.length > 0) {
            // Sort by cost for A* behavior
            queue.sort((a, b) => a.cost - b.cost);
            const current = queue.shift();
            
            if (current.y === this.height - 1 && current.x === this.endPosition.x / this.cellSize) {
                endReachable = true;
                endNode = current;
                break;
            }

            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
            for (const [dx, dy] of directions) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                if (this.isValid(nx, ny) && !visited[ny][nx]) {
                    // Calculate cost (distance to end)
                    const cost = Math.abs(nx - this.endPosition.x / this.cellSize) + 
                               Math.abs(ny - (this.height - 1));
                    
                    if (this.grid[ny][nx] === 0) {
                        queue.push({x: nx, y: ny, cost});
                        visited[ny][nx] = true;
                        cameFrom.set(`${nx},${ny}`, current);
                    }
                }
            }
        }

        if (!endReachable) {
            // Carve a path from end to the closest reachable point
            let current = {
                x: this.endPosition.x / this.cellSize,
                y: this.height - 1
            };
            
            // Find the closest visited point
            let minDist = Infinity;
            let closestPoint = null;
            
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (visited[y][x]) {
                        const dist = Math.abs(x - current.x) + Math.abs(y - current.y);
                        if (dist < minDist) {
                            minDist = dist;
                            closestPoint = {x, y};
                        }
                    }
                }
            }
            
            // Carve path from end to closest point
            if (closestPoint) {
                let x = current.x;
                let y = current.y;
                
                while (x !== closestPoint.x || y !== closestPoint.y) {
                    this.grid[y][x] = 0;
                    if (x < closestPoint.x) x++;
                    else if (x > closestPoint.x) x--;
                    if (y > closestPoint.y) y--;
                }
            }
        }
    }

    isValid(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    hasValidPath(testGrid) {
        // Simple flood fill to check if end is still reachable
        const visited = Array(this.height).fill().map(() => Array(this.width).fill(false));
        const stack = [{x: Math.floor(this.width/2), y: 0}];
        
        while (stack.length > 0) {
            const {x, y} = stack.pop();
            if (y === this.height - 1 && x === Math.floor(this.width/2)) {
                return true;
            }
            
            if (!visited[y][x]) {
                visited[y][x] = true;
                for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (this.isValid(nx, ny) && testGrid[ny][nx] === 0 && !visited[ny][nx]) {
                        stack.push({x: nx, y: ny});
                    }
                }
            }
        }
        return false;
    }
} 