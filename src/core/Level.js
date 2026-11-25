import { Enemy } from '../entities/Enemy.js';
import { Prop } from '../entities/Prop.js';

export class Level {
    constructor(game) {
        this.game = game;
        this.tileSize = 32;

        this.walls = [];
        this.props = [];
        this.enemies = [];
        this.triggers = [];

        // Active Visual Effects List (Sprite Animations)
        this.activeEffects = [];

        this.grid = [];
        this.zoneGrid = [];

        // Store static offsets for every tile to create "imperfection"
        this.wallJitter = [];

        this.cols = 0;
        this.rows = 0;

        this.spawnPoint = { x: 0, y: 0 };
        this.exitPoint = null;      // Cyan (Extraction)
        this.stairsPoint = null;    // NEW: Teal (Stairs)
        this.hubStartPoint = null;  // NEW: Purple (Hub Start)

        this.width = 0;
        this.height = 0;

        this.decalCanvas = document.createElement('canvas');
        this.decalCtx = this.decalCanvas.getContext('2d');

        this.tileTypes = {
            '0,0,0': { type: 'wall' },
            '255,255,255': { type: 'floor' },
            '0,255,0': { type: 'zone_patrol' },
            '255,255,0': { type: 'marker' },
            '0,0,255': { type: 'spawn' },
            '0,0,100': { type: 'trigger' },
            '139,69,19': { type: 'door' },
            '128,128,128': { type: 'destructibleSmallWall' },
            '255,0,0': { type: 'enemy', behavior: 'SENTRY' },
            '255,0,255': { type: 'enemy', behavior: 'ROAMER' },
            '255,128,0': { type: 'enemy', behavior: 'GUARD' },
            '0,255,255': { type: 'exit' },       // Cyan: Extraction
            '0,128,128': { type: 'stairs' },     // Teal: Stairs 
            '128,0,128': { type: 'hub_start' }   // Purple: Hub Start
        };
    }

    spawnEffect(name, x, y, rotation) {
        let totalFrames = 0;
        let speed = 0.05; // Seconds per frame
        let anchor = { x: 0, y: 0 };
        let offset = { x: 0, y: 0 };
        let scale = 1.0;

        if (name === 'dash') {
            totalFrames = 6;
            speed = 0.02; // Very fast play speed
            anchor = { x: 195, y: 240 };
            rotation -= Math.PI / 2;
            scale = 0.3;
        }

        this.activeEffects.push({
            name: name,
            x: x + offset.x,
            y: y + offset.y,
            rotation: rotation,
            currentFrame: 1,
            totalFrames: totalFrames,
            timer: 0,
            frameDuration: speed,
            anchor: anchor,
            scale: scale
        });
    }

    generateDestructibleWalls(tempDestructibleGrid) {
        const rows = this.rows;
        const cols = this.cols;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (tempDestructibleGrid[y][x]) {

                    // 1. Try Horizontal Merge
                    let w = 1;
                    while (x + w < cols && tempDestructibleGrid[y][x + w]) {
                        w++;
                    }

                    if (w > 1) {
                        // Found a Horizontal Wall!
                        const pixelW = w * 32;
                        const pixelH = 32;
                        const centerX = (x * 32) + (pixelW / 2);
                        const centerY = (y * 32) + 16;

                        // RENAMED TYPE
                        this.props.push(new Prop(this.game, centerX, centerY, 'destructibleLargeWall', 0, pixelW, pixelH));

                        // Clear used cells
                        for (let k = 0; k < w; k++) tempDestructibleGrid[y][x + k] = false;
                    }
                    else {
                        // 2. Try Vertical Merge
                        let h = 1;
                        while (y + h < rows && tempDestructibleGrid[y + h][x]) {
                            h++;
                        }

                        if (h > 1) {
                            // Found a Vertical Wall!
                            const pixelW = 32;
                            const pixelH = h * 32;
                            const centerX = (x * 32) + 16;
                            const centerY = (y * 32) + (pixelH / 2);

                            // RENAMED TYPE
                            this.props.push(new Prop(this.game, centerX, centerY, 'destructibleLargeWall', 0, pixelW, pixelH));

                            // Clear used cells
                            for (let k = 0; k < h; k++) tempDestructibleGrid[y + k][x] = false;
                        }
                        else {
                            // 3. Just a Small Wall
                            const worldX = x * 32 + 16;
                            const worldY = y * 32 + 16;
                            // RENAMED TYPE
                            this.props.push(new Prop(this.game, worldX, worldY, 'destructibleSmallWall', 0));
                            tempDestructibleGrid[y][x] = false;
                        }
                    }
                }
            }
        }
    }

    load(imageKey) {
        const img = this.game.assets.getImage(imageKey);
        if (!img) return;

        this.width = img.width * this.tileSize;
        this.height = img.height * this.tileSize;
        this.cols = img.width;
        this.rows = img.height;

        if (this.width > 0 && this.height > 0) {
            this.decalCanvas.width = this.width;
            this.decalCanvas.height = this.height;
        }

        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
        this.zoneGrid = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        const tempDestructibleGrid = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));

        this.wallJitter = Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => ({
                x: (Math.random() - 0.5) * 1.5,
                y: (Math.random() - 0.5) * 1.5
            }))
        );

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        this.walls = [];
        this.enemies = [];
        this.props = [];
        this.triggers = [];
        // RESET POINTS
        this.spawnPoint = { x: 0, y: 0 };
        this.exitPoint = null;
        this.stairsPoint = null;    // Reset
        this.hubStartPoint = null;  // Reset

        const markers = new Set();
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const i = (y * img.width + x) * 4;
                if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 0) {
                    markers.add(`${x},${y}`);
                }
            }
        }

        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const index = (y * img.width + x) * 4;
                const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
                const def = this.tileTypes[key];

                if (def) {
                    const worldX = x * this.tileSize + this.tileSize / 2;
                    const worldY = y * this.tileSize + this.tileSize / 2;

                    if (def.type === 'wall') {
                        this.walls.push({ x: x * this.tileSize, y: y * this.tileSize, w: this.tileSize, h: this.tileSize });
                        this.grid[y][x] = 1;
                    }
                    else if (def.type === 'zone_patrol') {
                        this.zoneGrid[y][x] = true;
                    }
                    else if (def.type === 'trigger') {
                        this.triggers.push({ x: worldX, y: worldY, r: 20 });
                    }
                    else if (def.type === 'destructibleSmallWall') { // RENAMED CHECK
                        tempDestructibleGrid[y][x] = true;
                        this.grid[y][x] = 1;
                    }
                    else if (def.type === 'door') {
                        this.props.push(new Prop(this.game, worldX, worldY, 'door', 0));
                        this.grid[y][x] = 2;
                    }
                    else if (def.type === 'spawn') {
                        // --- CRITICAL FIX: Only set spawnPoint. Do NOT modify player here. ---
                        // The player might not exist yet during the initial load sequence.
                        this.spawnPoint = { x: worldX, y: worldY };
                    }
                    else if (def.type === 'exit') {
                        this.exitPoint = { x: worldX, y: worldY };
                    }
                    else if (def.type === 'stairs') {
                        this.stairsPoint = { x: worldX, y: worldY };
                    }
                    else if (def.type === 'hub_start') {
                        this.hubStartPoint = { x: worldX, y: worldY };
                    }
                    else if (def.type === 'enemy') {
                        if (def.behavior === 'GUARD') {
                            this.zoneGrid[y][x] = true;
                        }
                        let angle = 0;
                        if (def.behavior === 'SENTRY') {
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    if (markers.has(`${x + dx},${y + dy}`)) {
                                        angle = Math.atan2(dy, dx);
                                    }
                                }
                            }
                        }
                        this.enemies.push(new Enemy(this.game, worldX, worldY, def.behavior, angle));
                    }
                }
            }
        }

        this.generateDestructibleWalls(tempDestructibleGrid);

        this.finalizeDoors();
        this.enemies.forEach(e => { if (e.behavior === 'GUARD') e.findPatrolZone(); });
    }

    isNavigable(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        const val = this.grid[row][col];
        return val === 0 || val === 2;
    }

    isBlocked(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
        const val = this.grid[row][col];
        if (val === 1) return true;
        if (val === 2) {
            const prop = this.getPropAtGrid(col, row);
            if (prop) return prop.active;
            return false;
        }
        return false;
    }

    toGrid(x, y) { return { col: Math.floor(x / this.tileSize), row: Math.floor(y / this.tileSize) }; }
    toWorld(col, row) { return { x: col * this.tileSize + this.tileSize / 2, y: row * this.tileSize + this.tileSize / 2 }; }

    getPropAtGrid(col, row) {
        const cellX = col * this.tileSize;
        const cellY = row * this.tileSize;
        const cellSize = this.tileSize;
        return this.props.find(p => {
            if (!p.active) return false;
            return (p.x - p.width / 2 < cellX + cellSize &&
                p.x + p.width / 2 > cellX &&
                p.y - p.height / 2 < cellY + cellSize &&
                p.y + p.height / 2 > cellY);
        });
    }

    isWallAt(x, y) {
        const gridPos = this.toGrid(x, y);
        return this.isBlocked(gridPos.col, gridPos.row);
    }

    // --- EXECUTION SPLATTER (FIXED COLLISION & RAYCAST) ---
    createExecutionSplat(x, y) {
        if (!this.decalCtx || this.decalCanvas.width === 0) return;
        const ctx = this.decalCtx;
        const bloodColor = '#8a0303';

        // 1. Messy Core
        const coreRays = 24;
        for (let i = 0; i < coreRays; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 20 + 5;
            const cx = x + Math.cos(angle) * dist;
            const cy = y + Math.sin(angle) * dist;
            if (!this.isWallAt(cx, cy)) {
                ctx.fillStyle = bloodColor;
                const s = Math.random() * 10 + 8;
                ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
            }
        }

        // 2. 360 Degree Spikes
        const rays = 45;
        for (let i = 0; i < rays; i++) {
            const rayAngle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 80 + 40;
            let currentDist = 0;
            const stepSize = 4;
            let currentSize = Math.random() * 6 + 12;

            while (currentDist < dist) {
                // A. Calculate Spine
                const rx = x + Math.cos(rayAngle) * currentDist;
                const ry = y + Math.sin(rayAngle) * currentDist;

                // B. Jitter BEFORE collision check
                const jx = (Math.random() - 0.5) * 5;
                const jy = (Math.random() - 0.5) * 5;
                const checkX = rx + jx;
                const checkY = ry + jy;

                // C. Wall Check
                if (this.isWallAt(checkX, checkY)) break;

                ctx.fillStyle = bloodColor;

                // D. Draw at safe position
                const widthJitter = currentSize * (0.5 + Math.random() * 0.8);
                ctx.fillRect(checkX - widthJitter / 2, checkY - widthJitter / 2, widthJitter, widthJitter);

                currentDist += stepSize;
                currentSize *= 0.92; // Decay
                if (currentSize < 1) break;
            }
        }

        // 3. High Density Mist (RAY-MARCHED)
        const dropletCount = 120;
        for (let i = 0; i < dropletCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const targetDist = Math.random() * 120 + 20;

            // RAYCAST: Walk the droplet from source to target
            let currentDist = 0;
            const step = 6; // Granularity (check every 6px)
            let px = x;
            let py = y;
            let hitWall = false;

            while (currentDist < targetDist) {
                currentDist += step;
                // Don't overshoot target
                if (currentDist > targetDist) currentDist = targetDist;

                const tx = x + Math.cos(angle) * currentDist;
                const ty = y + Math.sin(angle) * currentDist;

                if (this.isWallAt(tx, ty)) {
                    hitWall = true;
                    px = tx; // Stop EXACTLY at the wall
                    py = ty;
                    break;
                }
                px = tx;
                py = ty;
                if (currentDist === targetDist) break;
            }

            // Draw droplet at the final valid position (or wall impact)
            ctx.fillStyle = bloodColor;
            const s = Math.random() * 2 + 1;
            ctx.beginPath();
            ctx.arc(px, py, s, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    createViolentSplat(x, y, impactAngle, force = 100) {
        if (!this.decalCtx || this.decalCanvas.width === 0) return;
        const ctx = this.decalCtx;
        const bloodColor = '#8a0303';

        // 1. Draw Core (Only if force is significant)
        // Glancing blows (Force < 15) won't create a solid puddle in the center
        if (!this.isWallAt(x, y) && force > 15) {
            ctx.fillStyle = bloodColor;
            // Scale core size by force
            const coreSize = Math.min(24, Math.max(10, force / 3));
            ctx.fillRect(x - coreSize / 2, y - coreSize / 2, coreSize, coreSize);
        }

        // 2. Draw Rays (Dynamic Count)
        // Glancing (10) -> ~3 rays
        // Kill (120)    -> ~24 rays
        const rayCount = Math.max(2, Math.floor(force / 5));

        for (let i = 0; i < rayCount; i++) {
            const rayAngle = impactAngle + (Math.random() - 0.5) * 2.5;
            const dist = Math.random() * force + 10; // Shorter minimum distance
            let currentDist = 0;
            const stepSize = 4;

            // Glancing blows have thinner lines
            let currentSize = (force < 20) ? (Math.random() * 2 + 4) : (Math.random() * 4 + 10);

            while (currentDist < dist) {
                const rx = x + Math.cos(rayAngle) * currentDist;
                const ry = y + Math.sin(rayAngle) * currentDist;

                const jx = (Math.random() - 0.5) * 3;
                const jy = (Math.random() - 0.5) * 3;
                const checkX = rx + jx;
                const checkY = ry + jy;

                if (this.isWallAt(checkX, checkY)) break;

                ctx.fillStyle = bloodColor;
                const widthJitter = currentSize * (0.6 + Math.random() * 0.8);
                ctx.fillRect(checkX - widthJitter / 2, checkY - widthJitter / 2, widthJitter, widthJitter);

                currentDist += stepSize;
                currentSize *= 0.94; // Decay
                if (currentSize < 1) break;
            }
        }

        // 3. Draw Droplet Streams (Dynamic Count)
        // Glancing blows (Force < 20) get ZERO streams (just a splatter)
        const streamCount = Math.floor(force / 20);

        for (let i = 0; i < streamCount; i++) {
            const dropAngle = impactAngle + (Math.random() - 0.5) * 2.0;
            let startDist = (Math.random() * 20) + (force / 2); // Start further out for big hits

            let pathBlocked = false;
            let checkDist = 0;
            const checkStep = 8;
            while (checkDist < startDist) {
                const cx = x + Math.cos(dropAngle) * checkDist;
                const cy = y + Math.sin(dropAngle) * checkDist;
                if (this.isWallAt(cx, cy)) { pathBlocked = true; break; }
                checkDist += checkStep;
            }
            if (pathBlocked) continue;

            const dropsInStream = Math.floor(Math.random() * 2) + 2;
            let currentDropDist = startDist;

            for (let j = 0; j < dropsInStream; j++) {
                const dx = x + Math.cos(dropAngle) * currentDropDist;
                const dy = y + Math.sin(dropAngle) * currentDropDist;
                if (this.isWallAt(dx, dy)) break;
                ctx.fillStyle = bloodColor;
                ctx.beginPath();
                const length = Math.random() * 3 + 2;
                const thickness = length * 0.5;
                ctx.ellipse(dx, dy, length, thickness, dropAngle, 0, Math.PI * 2);
                ctx.fill();
                currentDropDist += (length * 2) + (Math.random() * 5);
            }
        }
    }

    // --- NEW: Blood Trail (Drag Marks) ---
    createDragMark(x, y) {
        if (!this.decalCtx) return;
        const ctx = this.decalCtx;

        const size = Math.random() * 6 + 4;
        const angle = Math.random() * Math.PI * 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Use uniform blood color
        ctx.fillStyle = '#8a0303';
        ctx.globalAlpha = 0.7;

        // Draw an elongated splatter
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Add random droplets around
        for (let i = 0; i < 3; i++) {
            const dx = (Math.random() - 0.5) * 15;
            const dy = (Math.random() - 0.5) * 15;
            const dSize = Math.random() * 2 + 1;
            ctx.beginPath();
            ctx.arc(dx, dy, dSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // --- NEW: BROKEN TILE DECAL ---
    createBrokenTile(x, y) {
        if (!this.decalCtx) return;
        const ctx = this.decalCtx;
        
        // Now this will work because we loaded it in main.js
        const img = this.game.assets.getImage('broken_floor_tile');
        if (!img) return;

        ctx.save();
        ctx.translate(x, y);

        // 1. LAYER: Draw BEHIND blood/corpses
        ctx.globalCompositeOperation = 'destination-over';

        // 2. ALIGNMENT: Random 90-degree rotation
        const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        const randomRot = rotations[Math.floor(Math.random() * rotations.length)];
        ctx.rotate(randomRot);

        // 3. DRAW
        // Assuming the tile sprite is 32x32.
        const size = 48; 
        ctx.drawImage(img, -size / 2, -size / 2, size, size);

        ctx.restore();
    }

    finalizeDoors() {
        for (const prop of this.props) {
            if (prop.type === 'door') {
                const g = this.toGrid(prop.x, prop.y);
                const col = g.col;
                const row = g.row;
                const top = this.isStructure(col, row - 1);
                const bottom = this.isStructure(col, row + 1);
                const left = this.isStructure(col - 1, row);

                if (top || bottom) {
                    prop.angle = Math.PI / 2;
                    prop.hingeSide = top ? -1 : 1;
                } else {
                    prop.angle = 0;
                    prop.hingeSide = left ? -1 : 1;
                }
            }
        }
    }

    isStructure(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
        return this.grid[row][col] === 1 || this.grid[row][col] === 2;
    }

    emitNoise(x, y, range, isAlarm = false) {
        const mufflingFactor = 0.4;

        for (const enemy of this.enemies) {
            if (enemy.dead || enemy.state === 'MORTAL') continue;

            const dist = Math.hypot(enemy.x - x, enemy.y - y);
            if (dist > range) continue;

            const obstacle = this.getClosestObstacleIntersection(
                x, y, enemy.x, enemy.y,
                (prop) => prop.type === 'door'
            );

            const effectiveRange = obstacle ? (range * mufflingFactor) : range;

            // SAFETY CHECK: Ensure the entity actually has ears before yelling at it
            if (dist < effectiveRange && typeof enemy.hearNoise === 'function') {
                enemy.hearNoise(x, y, isAlarm);
            }
        }
    }

    emitHeavyNoise(x, y, maxRange, wallLeakRange = 200, isAlarm = false) {
        for (const enemy of this.enemies) {
            if (enemy.dead || enemy.state === 'MORTAL') continue;

            const distCenter = Math.hypot(x - enemy.x, y - enemy.y);
            if (distCenter > maxRange) continue;

            const wallHit = this.getClosestObstacleIntersection(x, y, enemy.x, enemy.y);

            // Logic: Either clear shot OR wall leak
            let canHear = false;

            if (!wallHit) {
                canHear = true;
            } else {
                const distToWall = Math.hypot(x - wallHit.x, y - wallHit.y);
                const distWallToEnemy = Math.hypot(wallHit.x - enemy.x, wallHit.y - enemy.y);
                if (distWallToEnemy <= wallLeakRange && (distToWall + distWallToEnemy) <= maxRange) {
                    canHear = true;
                }
            }

            // SAFETY CHECK: Applied here as well
            if (canHear && typeof enemy.hearNoise === 'function') {
                enemy.hearNoise(x, y, isAlarm);
            }
        }
    }

    checkBreach(x, y, radius, forceOrigin) {
        for (const enemy of this.enemies) {
            const d = Math.hypot(enemy.x - x, enemy.y - y);
            if (d < radius && enemy.state !== 'MORTAL') {
                const fx = forceOrigin ? forceOrigin.x : x;
                const fy = forceOrigin ? forceOrigin.y : y;
                enemy.getStunned(fx, fy);
                enemy.applyForce(fx, fy, 500);
                this.game.camera.shake(5, 0.2);
            }
        }
    }

    // Allows players to smash through destructibles, and Doors
    checkBreachCollision(rect) {
        // 1. Static Walls (Always Block)
        for (const wall of this.walls) {
            if (rect.x < wall.x + wall.w && rect.x + rect.w > wall.x &&
                rect.y < wall.y + wall.h && rect.y + rect.h > wall.y) return true;
        }

        // 2. Props
        for (const prop of this.props) {
            if (prop.active) {
                // Dynamic Hitbox
                const px = prop.x - prop.width / 2;
                const py = prop.y - prop.height / 2;

                if (rect.x < px + prop.width && rect.x + rect.w > px &&
                    rect.y < py + prop.height && rect.y + rect.h > py) {

                    if (prop.type === 'destructibleSmallWall' || prop.type === 'door' || prop.type === 'destructibleLargeWall') {
                        prop.takeDamage(100);
                        continue; // No Collision (Cleared)
                    }
                    return true; // Blocked by indestructible prop
                }
            }
        }
        return false;
    }

    getClosestObstacleIntersection(x1, y1, x2, y2, propFilter = null) {
        let closestHit = null; let minT = 1.0;

        for (const wall of this.walls) {
            const lines = [
                { p1: { x: wall.x, y: wall.y }, p2: { x: wall.x + wall.w, y: wall.y } },
                { p1: { x: wall.x + wall.w, y: wall.y }, p2: { x: wall.x + wall.w, y: wall.y + wall.h } },
                { p1: { x: wall.x + wall.w, y: wall.y + wall.h }, p2: { x: wall.x, y: wall.y + wall.h } },
                { p1: { x: wall.x, y: wall.y + wall.h }, p2: { x: wall.x, y: wall.y } }
            ];
            for (const line of lines) {
                const hit = this.checkLineIntersectionHit(x1, y1, x2, y2, line.p1.x, line.p1.y, line.p2.x, line.p2.y);
                if (hit && hit.t < minT) { minT = hit.t; closestHit = { x: hit.x, y: hit.y, type: 'wall' }; }
            }
        }

        for (const prop of this.props) {
            if (prop.active) {
                if (propFilter && !propFilter(prop)) continue;

                // Dynamic Hitbox
                const px = prop.x - prop.width / 2;
                const py = prop.y - prop.height / 2;
                const pw = prop.width;
                const ph = prop.height;

                const lines = [
                    { p1: { x: px, y: py }, p2: { x: px + pw, y: py } },
                    { p1: { x: px + pw, y: py }, p2: { x: px + pw, y: py + ph } },
                    { p1: { x: px + pw, y: py + ph }, p2: { x: px, y: py + ph } },
                    { p1: { x: px, y: py + ph }, p2: { x: px, y: py } }
                ];
                for (const line of lines) {
                    const hit = this.checkLineIntersectionHit(x1, y1, x2, y2, line.p1.x, line.p1.y, line.p2.x, line.p2.y);
                    if (hit && hit.t < minT) {
                        minT = hit.t;
                        closestHit = { x: hit.x, y: hit.y, type: prop.type, prop: prop };
                    }
                }
            }
        }
        return closestHit;
    }

    checkLineIntersectionHit(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y) {
        const s1_x = p1_x - p0_x; const s1_y = p1_y - p0_y;
        const s2_x = p3_x - p2_x; const s2_y = p3_y - p2_y;
        const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
        const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) { return { x: p0_x + (t * s1_x), y: p0_y + (t * s1_y), t: t }; }
        return null;
    }

    checkCollision(rect, source = null) {
        for (const wall of this.walls) {
            if (rect.x < wall.x + wall.w && rect.x + rect.w > wall.x &&
                rect.y < wall.y + wall.h && rect.y + rect.h > wall.y) return true;
        }
        for (const prop of this.props) {
            if (prop.active) {
                const px = prop.x - 14; const py = prop.y - 14;
                if (rect.x < px + 28 && rect.x + rect.w > px &&
                    rect.y < py + 28 && rect.y + rect.h > py) {

                    // [FIX] Check for DOOR interaction FIRST
                    if (prop.type === 'door') {
                        prop.interact('OPEN', source);
                        return false; // Don't block movement, let player pass
                    }

                    // [FIX] THEN check if it blocks the player
                    if (source && source === this.game.player) return true;
                    return true;
                }
            }
        }
        return false;
    }

    hasLineOfSight(source, target) {
        const p1 = { x: source.x, y: source.y };
        const p2 = { x: target.x, y: target.y };
        for (const wall of this.walls) {
            if (this.lineIntersectsRect(p1, p2, wall.x, wall.y, wall.w, wall.h)) return false;
        }
        for (const prop of this.props) {
            if (prop.active) {
                // Use dynamic dimensions (Supports Tables)
                const px = prop.x - prop.width / 2;
                const py = prop.y - prop.height / 2;
                if (this.lineIntersectsRect(p1, p2, px, py, prop.width, prop.height)) return false;
            }
        }
        return true;
    }

    lineIntersectsRect(p1, p2, rx, ry, rw, rh) {
        const left = [{ x: rx, y: ry }, { x: rx, y: ry + rh }];
        const right = [{ x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }];
        const top = [{ x: rx, y: ry }, { x: rx + rw, y: ry }];
        const bottom = [{ x: rx, y: ry + rh }, { x: rx + rw, y: ry + rh }];
        if (this.checkLineIntersection(p1, p2, left[0], left[1])) return true;
        if (this.checkLineIntersection(p1, p2, right[0], right[1])) return true;
        if (this.checkLineIntersection(p1, p2, top[0], top[1])) return true;
        if (this.checkLineIntersection(p1, p2, bottom[0], bottom[1])) return true;
        return false;
    }

    checkLineIntersection(a, b, c, d) {
        const det = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
        if (det === 0) return false;
        const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
        const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    }

    breakPropsInRadius(x, y, radius) {
        for (const prop of this.props) {
            // Include TABLE
            if (prop.active && (prop.type === 'destructibleSmallWall' || prop.type === 'door' || prop.type === 'destructibleLargeWall')) {
                // Check distance to prop center rectangle
                const closestX = Math.max(prop.x - prop.width / 2, Math.min(x, prop.x + prop.width / 2));
                const closestY = Math.max(prop.y - prop.height / 2, Math.min(y, prop.y + prop.height / 2));
                const dist = Math.hypot(x - closestX, y - closestY);

                if (dist < radius) {
                    prop.takeDamage(100);
                }
            }
        }
    }

    // --- NEW: Helper for Rotated Rectangle Distance ---
    getDistanceToRotatedRect(px, py, rx, ry, rw, rh, angle) {
        // 1. Translate point to rectangle center
        const tx = px - rx;
        const ty = py - ry;

        // 2. Rotate point by -angle to align with axis
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        const localX = tx * cos - ty * sin;
        const localY = tx * sin + ty * cos;

        // 3. Calculate distance to axis-aligned box
        // Box extends from -w/2 to w/2 and -h/2 to h/2
        const dx = Math.max(Math.abs(localX) - rw / 2, 0);
        const dy = Math.max(Math.abs(localY) - rh / 2, 0);

        return Math.sqrt(dx * dx + dy * dy);
    }

    checkPlayerAttack(player) {
        if (!player.isAttacking) return;
        if (player.hasHitWall) return;

        if (!player.isHeavy) {
            this.checkStandardAttack(player);
            return;
        }

        let impact = player.getHeavyImpactCenter();
        const obstacleHit = this.getClosestObstacleIntersection(player.x, player.y, impact.x, impact.y);

        // --- CASE 1: ATTACK HIT A WALL OR PROP ---
        if (obstacleHit) {
            const angle = Math.atan2(player.y - obstacleHit.y, player.x - obstacleHit.x);
            impact.x = obstacleHit.x + Math.cos(angle) * 5;
            impact.y = obstacleHit.y + Math.sin(angle) * 5;

            // 1. SPAWN DECAL (From previous instruction)
            this.createBrokenTile(impact.x, impact.y); 

            // 2. Play Sound (Wall is not an enemy, so we play it here too)
            this.game.sounds.play('breakingConcrete', 0.8);

            this.emitNoise(impact.x, impact.y, 500);
            this.game.camera.shake(5, 0.2);

            if (obstacleHit.prop) {
                const type = obstacleHit.prop.type;
                if (type === 'destructibleSmallWall' || type === 'destructibleLargeWall' || type === 'door') {
                    obstacleHit.prop.takeDamage(100);

                    if (obstacleHit.prop.type === 'door') {
                        const kickAngle = Math.atan2(impact.y - player.y, impact.x - player.x);
                        const bx = impact.x + Math.cos(kickAngle) * 60;
                        const by = impact.y + Math.sin(kickAngle) * 60;
                        this.checkBreach(bx, by, 100, { x: obstacleHit.prop.x, y: obstacleHit.prop.y });
                    }
                }
            }

            this.breakPropsInRadius(impact.x, impact.y, 75);

            player.hasHitWall = true;
            return;
        }

        // --- CASE 2: ATTACK HIT NOTHING (Open Air) ---
        const impactX = impact.x;
        const impactY = impact.y;
        const maxTotalRange = 500;
        
        // CAPTURE STATE: Is this the specific frame where we hit the floor?
        const isFirstFloorHit = !player.hasHitFloor;

        // 1. EXECUTE FLOOR LOGIC FIRST (Preserves "Break-Before-Hit" Logic)
        if (isFirstFloorHit) {
            this.createBrokenTile(impactX, impactY); 
            this.emitNoise(impactX, impactY, maxTotalRange);
            this.breakPropsInRadius(impactX, impactY, 75);
            
            player.hasHitFloor = true; // Lock it so this block only runs once
        }

        const wallLeakRange = 200;
        
        // 2. TRACK ENEMY HITS
        let hitAnEnemy = false;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.dead) continue;

            const hurt = enemy.getHurtbox();

            const distDirect = this.getDistanceToRotatedRect(
                impactX, impactY,
                enemy.x, enemy.y,
                hurt.w, hurt.h,
                enemy.angle
            );

            const distCenter = Math.hypot(impactX - enemy.x, impactY - enemy.y);

            if (distCenter <= maxTotalRange) {
                const wallHit = this.getClosestObstacleIntersection(impactX, impactY, enemy.x, enemy.y);
                if (!wallHit) {
                    if (distCenter <= maxTotalRange) enemy.hearNoise(impactX, impactY);
                } else {
                    const distToWall = Math.hypot(impactX - wallHit.x, impactY - wallHit.y);
                    const distWallToEnemy = Math.hypot(wallHit.x - enemy.x, wallHit.y - enemy.y);
                    if (distWallToEnemy <= wallLeakRange && (distToWall + distWallToEnemy) <= maxTotalRange) {
                        enemy.hearNoise(impactX, impactY);
                    }
                }
            }

            if (player.hitList.has(enemy.id)) continue;
            if (distDirect > 75) continue;
            if (!this.hasLineOfSight({ x: impactX, y: impactY }, enemy)) continue;

            // --- HIT CONFIRMED ---
            hitAnEnemy = true; 

            const hitAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);

            if (enemy.state === 'MORTAL') {
                this.game.sounds.play('crushedEnemy', 1.0);
                this.game.sounds.play('bloodSplat', 0.9);
                this.killEnemy(enemy, i, player, hitAngle);
                continue;
            }

            if (distDirect < 12) {
                this.game.sounds.play('crushedEnemy', 1.0);
                this.game.sounds.play('bloodSplat', 0.9);
                this.killEnemy(enemy, i, player, hitAngle);
                continue;
            }
            else if (distDirect < 35) {
                this.game.sounds.play('crushedEnemy', 0.8);
                this.game.sounds.play('bloodSplat', 0.8);

                if (enemy.state !== 'MORTAL') {
                    this.spawnWeapon(enemy);
                }

                enemy.triggerMortalWound(); 
                this.createViolentSplat(enemy.x, enemy.y, hitAngle, 40);
                enemy.applyForce(impactX, impactY, 200);
            }
            else if (distDirect < 55) {
                this.game.sounds.play('knickedEnemy', 0.8);
                this.game.sounds.play('bloodSmallSplat', 0.7);

                enemy.takeDamage(1.5);
                this.createViolentSplat(enemy.x, enemy.y, hitAngle, 20);
                if (enemy.state !== 'MORTAL') {
                    enemy.getStunned(impactX, impactY);
                    enemy.stunTimer = 1.5;
                }
                enemy.applyForce(impactX, impactY, 600);
            }
            else if (distDirect <= 75) {
                this.game.sounds.play('bloodSmallSplat', 0.5);
                enemy.takeDamage(1.0);
                this.createViolentSplat(enemy.x, enemy.y, hitAngle, 10);
                enemy.applyForce(impactX, impactY, 400);
            }

            player.hitList.add(enemy.id);
        }

        // 3. FINAL SOUND CHECK
        // We only play the concrete sound if:
        // A. We just hit the floor this frame (isFirstFloorHit)
        // B. AND we did NOT hit an enemy in the loop above (!hitAnEnemy)
        if (isFirstFloorHit && !hitAnEnemy) {
             this.game.sounds.play('breakingConcrete', 0.8);
        }
    }

    checkStandardAttack(player) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.dead) continue;
            if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > 150) continue;

            let isHit = false;
            if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 40) isHit = true;

            if (isHit && this.hasLineOfSight(player, enemy)) {
                if (!player.hitList.has(enemy.id)) {
                    const hitAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
                    this.killEnemy(enemy, i, player, hitAngle);
                }
            }
        }
    }

    killEnemy(enemy, index, player, hitAngle) {
        this.game.camera.shake(10, 0.1);
        const angle = hitAngle !== undefined ? hitAngle : enemy.angle;
        this.createViolentSplat(enemy.x, enemy.y, angle, 120);
        // --- WEAPON DROP (Instant Kill) ---
        // Only drop if they are NOT currently Mortal (otherwise they already dropped it)
        if (enemy.state !== 'MORTAL') {
            this.spawnWeapon(enemy);
        }
        this.spawnCorpse(enemy);
        this.enemies.splice(index, 1);
        player.hitList.add(enemy.id);
    }

    spawnWeapon(enemy) {
        if (!this.decalCtx) return;
        const ctx = this.decalCtx;

        // 1. Determine Prefix
        let prefix = 'enemy';
        if (enemy.behavior === 'GUARD') prefix = 'guard';
        if (enemy.behavior === 'ROAMER') prefix = 'roamer';

        const img = this.game.assets.getImage(`${prefix}Crowbar`);
        if (!img) return;

        ctx.save();

        // 2. Position: Randomly between 50 and 100 pixels ahead
        const minDrop = 50;
        const maxDrop = 100;
        const dropDist = Math.floor(Math.random() * (maxDrop - minDrop + 1)) + minDrop;

        const wx = enemy.x + Math.cos(enemy.angle) * dropDist;
        const wy = enemy.y + Math.sin(enemy.angle) * dropDist;

        ctx.translate(wx, wy);

        // 3. Rotation: Randomize for natural look
        const randomRotation = (Math.random() * Math.PI * 2);
        ctx.rotate(randomRotation);

        // 4. Scale of the weapon dropped
        const scale = 0.075;

        ctx.scale(scale, scale);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        ctx.restore();
    }

    spawnCorpse(enemy) {
        if (!this.decalCtx) return;
        const ctx = this.decalCtx;

        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.angle);

        let img;

        // --- UPDATED LOGIC ---
        // 1. If dying from CRAWLING (Mortal), freeze the last animation frame used
        if (enemy.state === 'MORTAL') {
            const currentKey = enemy.getSpriteKey(); // Gets 'crawl1' or 'crawl2'
            img = this.game.assets.getImage(currentKey);
        }
        // 2. Otherwise (Instant kill), pick a random dead body
        else {
            const randomCorpseIndex = Math.floor(Math.random() * 5) + 1;
            img = this.game.assets.getImage(`enemyDead${randomCorpseIndex}`);
        }

        if (img) {
            // Rotate 90 degrees (North Facing compensation)
            ctx.rotate(Math.PI / 2);

            const scale = 0.115;

            // Both Crawl and Dead sprites use the 400,400 center anchor
            const anchor = { x: 400, y: 400 };

            ctx.scale(scale, scale);
            ctx.drawImage(img, -anchor.x, -anchor.y);
        } else {
            // Fallback
            ctx.fillStyle = '#440000';
            const size = enemy.visualSize || 30;
            ctx.fillRect(-size / 2, -size / 2, size, size);
        }

        ctx.restore();
    }

    // --- PROCEDURAL BLUEPRINT WALLS ---
    drawAutotile(ctx, col, row, x, y) {
        const cx = x + 16;
        const cy = y + 16;

        const hasNorth = row > 0 && (this.grid[row - 1][col] === 1 || this.grid[row - 1][col] === 2);
        const hasSouth = row < this.rows - 1 && (this.grid[row + 1][col] === 1 || this.grid[row + 1][col] === 2);
        const hasWest = col > 0 && (this.grid[row][col - 1] === 1 || this.grid[row][col - 1] === 2);
        const hasEast = col < this.cols - 1 && (this.grid[row][col + 1] === 1 || this.grid[row][col + 1] === 2);

        // --- STATIC IMPERFECTION: Offset the blueprint lines based on pre-calc jitter ---
        // This ensures walls look crunchy/unstable but do NOT move every frame.
        const jitter = (this.wallJitter[row] && this.wallJitter[row][col]) ? this.wallJitter[row][col] : { x: 0, y: 0 };

        ctx.save();
        ctx.translate(jitter.x, jitter.y);

        ctx.fillStyle = '#FFFFFF';

        // 1. Center Hub
        ctx.fillRect(cx - 6, cy - 6, 12, 12);

        // 2. North Spoke
        if (hasNorth) {
            ctx.fillRect(cx - 6, cy - 16, 12, 10);
            ctx.fillRect(cx - 12, cy - 16, 2, 16);
            ctx.fillRect(cx + 10, cy - 16, 2, 16);
        } else {
            ctx.fillRect(cx - 6, cy - 6, 12, 2);
            ctx.fillRect(cx - 12, cy - 6, 2, 2);
            ctx.fillRect(cx + 10, cy - 6, 2, 2);
            ctx.fillRect(cx - 12, cy - 6, 24, 2);
        }

        // 3. South Spoke
        if (hasSouth) {
            ctx.fillRect(cx - 6, cy + 6, 12, 10);
            ctx.fillRect(cx - 12, cy, 2, 16);
            ctx.fillRect(cx + 10, cy, 2, 16);
        } else {
            ctx.fillRect(cx - 12, cy + 4, 24, 2);
        }

        // 4. West Spoke
        if (hasWest) {
            ctx.fillRect(cx - 16, cy - 6, 10, 12);
            ctx.fillRect(cx - 16, cy - 12, 16, 2);
            ctx.fillRect(cx - 16, cy + 10, 16, 2);
        } else {
            ctx.fillRect(cx - 6, cy - 12, 2, 24);
        }

        // 5. East Spoke
        if (hasEast) {
            ctx.fillRect(cx + 6, cy - 6, 10, 12);
            ctx.fillRect(cx, cy - 12, 16, 2);
            ctx.fillRect(cx, cy + 10, 16, 2);
        } else {
            ctx.fillRect(cx + 4, cy - 12, 2, 24);
        }

        ctx.restore();
    }

    draw(ctx) {
        if (this.decalCanvas.width > 0 && this.decalCanvas.height > 0) {
            ctx.drawImage(this.decalCanvas, 0, 0);
        }

        // --- UPDATED DRAW LOOP FOR BLUEPRINT WALLS ---
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] === 1) {
                    const x = c * this.tileSize;
                    const y = r * this.tileSize;

                    ctx.fillStyle = '#000000';
                    ctx.fillRect(x, y, 32, 32);

                    this.drawAutotile(ctx, c, r, x, y);
                }
            }
        }

        for (const prop of this.props) {
            prop.draw(ctx);
        }

        // --- UPDATED RENDER ORDER: CRAWLING FIRST (BOTTOM LAYER) ---

        // 1. Draw Mortal (Crawling) enemies FIRST so they are "under" everything else
        for (const enemy of this.enemies) {
            if (enemy.state === 'MORTAL') {
                enemy.draw(ctx);
            }
        }

        // 2. Draw Standing/Living enemies SECOND so they are "on top"
        for (const enemy of this.enemies) {
            if (enemy.state !== 'MORTAL') {
                enemy.draw(ctx);
            }
        }

        for (const fx of this.activeEffects) {
            const frameKey = `${fx.name}${fx.currentFrame}`;
            const img = this.game.assets.getImage(frameKey);
            if (img) {
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(fx.rotation);
                ctx.scale(fx.scale, fx.scale);
                ctx.drawImage(img, -fx.anchor.x, -fx.anchor.y);
                ctx.restore();
            }
        }

        // 1. HUB START (Purple Box)
        if (this.hubStartPoint) {
            ctx.fillStyle = 'rgba(128, 0, 128, 0.5)'; // Transparent Purple
            const p = this.hubStartPoint;
            ctx.fillRect(p.x - 20, p.y - 20, 40, 40);

            // Outline
            ctx.strokeStyle = '#FF00FF';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - 20, p.y - 20, 40, 40);
        }

        // 2. STAIRS (Teal Box)
        if (this.stairsPoint) {
            // Logic: Bright if active, Dim if inactive
            const isActive = this.game.extractionActive;

            ctx.fillStyle = isActive ? 'rgba(0, 255, 255, 0.6)' : 'rgba(0, 100, 100, 0.3)';
            const p = this.stairsPoint;
            ctx.fillRect(p.x - 20, p.y - 20, 40, 40);

            if (isActive) {
                ctx.strokeStyle = '#00FFFF';
                ctx.lineWidth = 2;
                ctx.strokeRect(p.x - 20, p.y - 20, 40, 40);
            }
        }

        // 3. EXIT (Cyan Circle) - Existing logic usually, but let's reinforce it
        if (this.exitPoint) {
            // Only draw if active (or always draw distinctively)
            if (this.game.extractionActive) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                ctx.beginPath();
                ctx.arc(this.exitPoint.x, this.exitPoint.y, 40, 0, Math.PI * 2);
                ctx.fill();

                // Pulsing outline
                const pulse = Math.sin(Date.now() / 200) * 5;
                ctx.strokeStyle = '#00FFFF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.exitPoint.x, this.exitPoint.y, 40 + pulse, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    update(deltaTime) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].dead) {
                this.enemies.splice(i, 1);
            } else {
                this.enemies[i].update(deltaTime);
            }
        }

        const dt = deltaTime / 1000;
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const fx = this.activeEffects[i];
            fx.timer += dt;
            if (fx.timer >= fx.frameDuration) {
                fx.timer = 0;
                fx.currentFrame++;
                if (fx.currentFrame > fx.totalFrames) {
                    this.activeEffects.splice(i, 1);
                }
            }
        }
    }
}