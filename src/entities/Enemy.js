export class Enemy {
    constructor(game, x, y, behavior = 'SENTRY', initialAngle = 0) {
        this.game = game;
        this.id = Math.random().toString(36).substr(2, 9);

        // --- PHYSICS (COLLIDER) ---
        // distinct from Combat Hurtbox. Keep small to avoid wall sticking.
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;

        // --- VISUALS ---
        this.scale = 0.09;
        this.anchor = { x: 445, y: 320 };
        this.visualSize = 30;

        // --- SOUNDS ---
        this.attackSound = 'enemyGotYou';

        this.animTimer = 0;

        // --- NEW: CENTRALIZED CRAWL TIMING ---
        this.crawlFrameDuration = 1.5;

        // --- CRAWL VARIABLES ---
        this.lastCrawlFrame = -1;
        this.crawlBurstTimer = 0;

        // Timer for spawning blood trail
        this.bloodTimer = 0;

        this.velocity = { x: 0, y: 0 };
        this.friction = 0.92;

        this.hp = 2.5;

        // --- SPEED ---
        this.runSpeed = 375;
        this.walkSpeed = 200;
        this.crawlSpeed = 110;
        this.speed = this.walkSpeed;

        // --- AI STATE ---
        this.state = 'IDLE';
        this.behavior = behavior;

        this.stunVariation = 'FRONT';

        // --- ATTACK LOGIC ---
        this.attackVisualRange = 65;
        this.killRange = 25;
        this.attackTimer = 0;

        // --- MEMORY ---
        this.returnPos = { x: x, y: y };
        this.lastKnownPos = { x: x, y: y };

        // --- ORIENTATION ---
        this.angle = initialAngle;
        this.originalAngle = initialAngle;
        this.sentryState = 'CENTER';
        this.sentryTimer = Math.random() * 2.0;

        // --- VISION SETTINGS ---
        this.dead = false;
        this.visionRadius = 400;
        this.fov = 160 * (Math.PI / 180);

        // --- LOCKS ---
        this.isLocked = false;

        // --- NAVIGATION ---
        this.path = [];
        this.currentWaypoint = 0;

        // --- TIMERS ---
        this.patrolTimer = 0;
        this.patrolZone = [];
        this.stunTimer = 0;
        this.mortalTimer = 0;
        this.searchTimer = 0;
        this.investigateTimer = 0;
    }

    // --- NEW: COMBAT HURTBOX ---
    // Returns the dimensions for hitting the enemy, distinct from physics
    getHurtbox() {
        if (this.state === 'STUNNED' || this.state === 'MORTAL') {
            // Lying down: Much larger target (Head to Toe)
            // Width 25 (Shoulders), Height 55 (Length)
            return { w: 16, h: 45 };
        }
        // Standing: Match physics box
        return { w: this.width, h: this.height };
    }

    hearNoise(sourceX, sourceY, isAlarm = false) {
        if (this.dead || this.state === 'MORTAL' || this.state === 'STUNNED') return;
        if (this.state === 'CHASE') return;

        // If we are already Hunting (High Priority), ignore low priority noises
        if (this.state === 'HUNT' && !isAlarm) return;

        if (this.state === 'IDLE' || this.state === 'RETURNING') {
            this.returnPos = { x: this.x, y: this.y };
        }

        this.lastKnownPos = { x: sourceX, y: sourceY };

        if (isAlarm) {
            // EXECUTION: SPRINT (HUNT)
            this.state = 'HUNT';
            this.speed = this.runSpeed;
            this.calculatePath(this.lastKnownPos);
        } else {
            // WALL HIT / AMBUSH: WALK (INVESTIGATE)
            if (this.state !== 'HUNT') {
                this.state = 'INVESTIGATE';
                this.speed = this.walkSpeed * 0.65; // Slow approach
                this.investigateTimer = 0;
                this.calculatePath(this.lastKnownPos);
            }
        }
    }

    takeDamage(amount) {
        if (this.state === 'MORTAL') { this.die(); return; }
        this.hp -= amount;

        if (this.hp <= 0) {
            this.triggerMortalWound();
        } else {
            if (this.state !== 'STUNNED' && !this.game.input.keys['KeyI']) {
                if (this.state === 'IDLE' || this.state === 'RETURNING') {
                    this.returnPos = { x: this.x, y: this.y };
                }
                this.state = 'CHASE';
                this.speed = this.runSpeed;
                this.path = [];
                this.sentryState = 'CENTER';
                this.lastKnownPos = { x: this.game.player.x, y: this.game.player.y };
            }
        }
    }

    applyForce(sourceX, sourceY, magnitude) {
        const dx = this.x - sourceX;
        const dy = this.y - sourceY;
        const angle = Math.atan2(dy, dx);
        this.velocity.x += Math.cos(angle) * magnitude;
        this.velocity.y += Math.sin(angle) * magnitude;
    }

    getStunned(sourceX, sourceY) {
        if (this.state === 'MORTAL') return;

        const sx = (sourceX !== undefined) ? sourceX : this.game.player.x;
        const sy = (sourceY !== undefined) ? sourceY : this.game.player.y;

        const knockbackAngle = Math.atan2(this.y - sy, this.x - sx);

        let angleDiff = knockbackAngle - this.angle;
        while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (Math.abs(angleDiff) < Math.PI / 2) {
            this.stunVariation = 'BACK';
        } else {
            this.stunVariation = 'FRONT';
        }

        this.state = 'STUNNED';
        this.stunTimer = 2.0;
        this.lastKnownPos = { x: sx, y: sy };
        this.angle = knockbackAngle;
    }

    triggerMortalWound() {
        if (this.state === 'MORTAL') return;
        this.state = 'MORTAL';
        this.hp = 0;
        this.mortalTimer = 20.0 + Math.random() * 10.0;
        this.path = [];
        this.animTimer = 0;

        // Reset sync vars
        this.lastCrawlFrame = -1;
        this.crawlBurstTimer = 0;

        this.findHidingSpot();
    }

    findHidingSpot() {
        // Reduced speed for pathfinding calculation reference
        this.speed = this.walkSpeed * 0.4;
        let bestTarget = null;
        let maxDist = -1;
        const player = this.game.player;

        for (let i = 0; i < 15; i++) {
            const rCol = Math.floor(Math.random() * this.game.level.cols);
            const rRow = Math.floor(Math.random() * this.game.level.rows);

            if (this.game.level.isNavigable(rCol, rRow)) {
                const worldPos = this.game.level.toWorld(rCol, rRow);
                const d = Math.hypot(worldPos.x - player.x, worldPos.y - player.y);
                if (d > maxDist) {
                    maxDist = d;
                    bestTarget = worldPos;
                }
            }
        }

        if (bestTarget) { this.calculatePath(bestTarget); } else { this.triggerGlobalRoam(); }
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        this.game.level.spawnCorpse(this);
    }

    update(deltaTime) {
        if (this.dead) return;
        const dt = deltaTime / 1000;
        this.animTimer += dt;
        if (this.attackTimer > 0) this.attackTimer -= dt;

        const player = this.game.player;

        // --- PHYSICS ---
        if (Math.abs(this.velocity.x) > 1 || Math.abs(this.velocity.y) > 1) {
            this.x += this.velocity.x * dt;
            this.y += this.velocity.y * dt;

            if (this.checkCollision()) {
                this.x -= this.velocity.x * dt;
                this.y -= this.velocity.y * dt;
                this.velocity.x = 0;
                this.velocity.y = 0;
            }

            const timeCorrection = dt * 60;
            this.velocity.x *= Math.pow(this.friction, timeCorrection);
            this.velocity.y *= Math.pow(this.friction, timeCorrection);
        }

        if (!player || player.dead) return;

        // --- AI STATES ---
        if (this.state === 'MORTAL') {
            if (this.isLocked) return;
            this.mortalTimer -= dt;

            // Death Check
            if (this.mortalTimer <= 0) {
                this.game.level.createViolentSplat(this.x, this.y, Math.random() * Math.PI * 2, 20);
                this.die();
                return;
            }

            // --- VISCERAL CRAWL LOGIC ---
            // UPDATED: Now uses centralized variable
            const frameDuration = this.crawlFrameDuration;
            const sequenceLen = 2; // Frame 0, Frame 1
            const frameIndex = Math.floor(this.animTimer / frameDuration) % sequenceLen;

            // Detect ANY frame change (0->1 OR 1->0)
            if (frameIndex !== this.lastCrawlFrame) {
                this.lastCrawlFrame = frameIndex;
                // Trigger burst on EVERY step
                this.crawlBurstTimer = 0.1;
            }

            // Move ONLY during the burst
            if (this.crawlBurstTimer > 0) {
                this.crawlBurstTimer -= dt;

                // --- BLOOD TRAIL ---
                this.bloodTimer -= dt;
                if (this.bloodTimer <= 0) {
                    this.game.level.createDragMark(this.x, this.y);
                    this.bloodTimer = 0.10; // Consistent blood spots during movement
                }

                this.speed = this.crawlSpeed;

                if (this.path.length > 0) {
                    this.followPath(dt, () => { this.path = []; });
                } else {
                    if (!this.hasFailedHiding) {
                        this.findHidingSpot();
                        if (this.path.length === 0) this.hasFailedHiding = true;
                    } else {
                        // Manual roam
                        this.x += Math.cos(this.angle) * this.speed * dt;
                        this.y += Math.sin(this.angle) * this.speed * dt;
                        if (this.checkCollision()) this.die();
                    }
                }
            }
            return;
        }

        if (this.state === 'STUNNED') {
            if (this.isLocked) return;
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) {
                this.state = this.game.input.keys['KeyI'] ? 'IDLE' : 'CHASE';
            }
            return;
        }

        const isInvisible = this.game.input.keys['KeyI'];
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        // Immediate Aggro
        if (!isInvisible && dist < 50) {
            if (this.state === 'IDLE' || this.state === 'SEARCH' || this.state === 'RETURNING') {
                this.state = 'CHASE';
                this.lastKnownPos = { x: player.x, y: player.y };
            }
        }

        // Vision Cone
        let hasSight = false;
        if (!isInvisible) {
            const angleToPlayer = Math.atan2(dy, dx);
            let angleDiff = angleToPlayer - this.angle;
            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            const inCone = dist < this.visionRadius && Math.abs(angleDiff) < (this.fov / 2);

            if (inCone && this.hasLineOfSight(player)) {
                hasSight = true;
                this.lastKnownPos = { x: player.x, y: player.y };
                if (this.state !== 'CHASE' && this.state !== 'HUNT') {
                    this.returnPos = { x: this.x, y: this.y };
                }
                this.state = 'CHASE';
                this.path = [];
                this.speed = this.runSpeed;
                this.sentryState = 'CENTER';
                this.investigateTimer = 0;
            }
        }

        if (isInvisible && (this.state === 'CHASE' || this.state === 'HUNT')) {
            this.state = 'SEARCH';
            this.searchTimer = 5.0;
            this.path = [];
        }

        // --- MAIN CHASE LOGIC ---
        if (this.state === 'CHASE') {
            if (!hasSight) {
                // LOST SIGHT: Transition to INVESTIGATE
                // We keep runSpeed here so they rush to the corner they saw you disappear behind.
                this.state = 'INVESTIGATE';
                this.speed = this.runSpeed;
                this.calculatePath(this.lastKnownPos);
            } else {
                this.angle = Math.atan2(player.y - this.y, player.x - this.x);
                this.moveTowards(player.x, player.y, dt);

                if (dist < this.attackVisualRange) {
                    if (this.attackTimer <= 0) {
                        this.attackTimer = 0.3;
                    }
                }
                if (dist < this.killRange) {
                    // Deal Damage (Player checks for Parry/Death)
                    player.takeHit(this);
                }
            }
        }
        else if (this.state === 'HUNT') {
            this.speed = this.runSpeed;
            this.followPath(dt, () => {
                // Arrived at source. Skip staring, go straight to Search.
                this.state = 'SEARCH';
                this.speed = this.walkSpeed;
                this.searchTimer = 10.0 + Math.random() * 5.0;
                this.triggerSearchBehavior();
            });
        }
        // --- INVESTIGATE ---
        else if (this.state === 'INVESTIGATE') {
            // 1. Move to the target (Noise Source or Last Known Pos)
            // Note: The speed was set when entering the state (Slow for noise, Fast for chase)
            this.followPath(dt, () => {
                this.path = [];
                // Upon arrival, if we haven't started staring yet, begin.
                if (this.investigateTimer === 0) {
                    this.investigateTimer = 1.5; // Stare for 1.5 seconds
                }
            });

            // 2. Stare Logic (Only runs after path is complete)
            if (this.path.length === 0 && this.investigateTimer > 0) {
                this.investigateTimer -= dt;

                // When staring is done, switch to SEARCH
                if (this.investigateTimer <= 0) {
                    this.state = 'SEARCH';
                    this.speed = this.walkSpeed * 0.6;
                    this.searchTimer = 10.0 + Math.random() * 5.0;
                    this.triggerSearchBehavior();
                }
            }
        }
        else if (this.state === 'SEARCH') {
            this.searchTimer -= dt;
            if (this.path.length === 0) { this.triggerSearchBehavior(); }
            this.followPath(dt, () => { this.path = []; });
            if (this.searchTimer <= 0) {
                this.state = 'RETURNING';
                this.calculatePath(this.returnPos);
            }
        }
        else if (this.state === 'RETURNING') {
            this.speed = this.walkSpeed;
            this.followPath(dt, () => {
                this.state = 'IDLE';
                this.path = [];
                if (this.behavior === 'SENTRY') {
                    this.angle = this.originalAngle;
                    this.sentryState = 'CENTER';
                    this.sentryTimer = Math.random() * 2.0;
                }
            });
        }
        else if (this.state === 'IDLE') {
            this.speed = this.walkSpeed;
            this.updateIdleBehavior(dt);
        }
    }

    followPath(dt, onComplete) {
        if (this.path.length === 0 || this.currentWaypoint >= this.path.length) { onComplete(); return; }

        let target = this.path[this.currentWaypoint];
        let dist = Math.hypot(target.x - this.x, target.y - this.y);

        if (dist < 10) {
            this.currentWaypoint++;
            if (this.currentWaypoint >= this.path.length) { onComplete(); return; }
            target = this.path[this.currentWaypoint];
        }

        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.moveTowards(target.x, target.y, dt);
    }

    updateIdleBehavior(dt) {
        if (this.path.length > 0) {
            this.followPath(dt, () => {
                this.path = [];
                this.patrolTimer = 5.0;
                if (this.behavior === 'GUARD') {
                    const current = this.game.level.toGrid(this.x, this.y);
                    if (this.game.level.zoneGrid[current.row] && this.game.level.zoneGrid[current.row][current.col]) {
                        this.floodFillZone(current);
                    }
                }
            });
            return;
        }
        if (this.behavior === 'SENTRY') { this.updateSentryLogic(dt); return; }
        if (this.behavior === 'GUARD') {
            const gridPos = this.game.level.toGrid(this.x, this.y);
            const inZone = this.game.level.zoneGrid[gridPos.row] && this.game.level.zoneGrid[gridPos.row][gridPos.col];
            if (!inZone) { this.returnToNearestPatrol(); return; }
            const isKnown = this.patrolZone.some(p => p.col === gridPos.col && p.row === gridPos.row);
            if (!isKnown) { this.floodFillZone(gridPos); }
        }
        if (this.patrolTimer > 0) { this.patrolTimer -= dt; return; }
        if (this.behavior === 'ROAMER') this.triggerGlobalRoam();
        else if (this.behavior === 'GUARD') this.triggerZonePatrol();
    }

    updateSentryLogic(dt) {
        this.sentryTimer -= dt;

        if (this.sentryTimer <= 0) {
            // 1. ORGANIC CONE: +/- 45 Degrees (PI/4)
            // This creates the "North-West to North-East" sweep requested.
            const coneSize = Math.PI / 4;

            // Generate a random offset between -45 and +45
            const randomOffset = (Math.random() * 2 - 1) * coneSize;

            // 2. APPLY ANGLE
            // We behave like a human scanning: looking at random points of interest
            // rather than a mechanical "ping-pong" sweep.
            this.angle = this.originalAngle + randomOffset;

            // 3. FASTER FOCUS CHANGE
            // Change gaze every 2.0 to 4.5 seconds (Natural "checking" speed)
            this.sentryTimer = 2.0 + Math.random() * 2.5;
        }
    }

    findPatrolZone() {
        if (this.behavior !== 'GUARD') return;
        const start = this.game.level.toGrid(this.x, this.y);
        this.floodFillZone(start);
    }

    floodFillZone(startNode) {
        const zoneGrid = this.game.level.zoneGrid;
        if (!zoneGrid[startNode.row] || !zoneGrid[startNode.row][startNode.col]) return;
        const stack = [startNode]; const visited = new Set(); const key = (c, r) => `${c},${r}`;
        this.patrolZone = [];
        while (stack.length > 0) {
            const { col, row } = stack.pop(); const k = key(col, row);
            if (visited.has(k)) continue; visited.add(k);
            if (col < 0 || col >= this.game.level.cols || row < 0 || row >= this.game.level.rows) continue;
            if (zoneGrid[row][col]) {
                this.patrolZone.push({ col, row }); stack.push({ col: col + 1, row: row }); stack.push({ col: col - 1, row: row }); stack.push({ col: col, row: row + 1 }); stack.push({ col: col, row: row - 1 });
            }
        }
    }

    returnToNearestPatrol() {
        const zoneGrid = this.game.level.zoneGrid; let closestNode = null; let minDist = Infinity;
        for (let y = 0; y < this.game.level.rows; y++) {
            for (let x = 0; x < this.game.level.cols; x++) {
                if (zoneGrid[y][x]) {
                    const worldPos = this.game.level.toWorld(x, y); const dist = Math.hypot(worldPos.x - this.x, worldPos.y - this.y);
                    if (dist < minDist) { minDist = dist; closestNode = worldPos; }
                }
            }
        }
        if (closestNode) { this.calculatePath(closestNode); } else { this.behavior = 'SENTRY'; }
    }

    triggerGlobalRoam() {
        for (let i = 0; i < 10; i++) {
            const c = Math.floor(Math.random() * this.game.level.cols); const r = Math.floor(Math.random() * this.game.level.rows);
            if (this.game.level.isNavigable(c, r)) { this.calculatePath(this.game.level.toWorld(c, r)); return; }
        }
        this.patrolTimer = 1.0;
    }

    triggerZonePatrol() {
        if (this.patrolZone.length === 0) { this.state = 'IDLE'; return; }
        
        // Pick 5 random spots and choose the FURTHEST one to ensure longer walks
        let bestTarget = null;
        let maxDist = -1;

        for (let i = 0; i < 5; i++) {
            const node = this.patrolZone[Math.floor(Math.random() * this.patrolZone.length)];
            const worldPos = this.game.level.toWorld(node.col, node.row);
            const dist = Math.hypot(worldPos.x - this.x, worldPos.y - this.y);
            
            if (dist > maxDist) {
                maxDist = dist;
                bestTarget = worldPos;
            }
        }

        if (bestTarget) this.calculatePath(bestTarget);
    }

    triggerSearchBehavior() {
        const current = this.game.level.toGrid(this.x, this.y);
        let validTarget = null;
        for (let i = 0; i < 10; i++) {
            const offsetCol = Math.floor(Math.random() * 9) - 4;
            const offsetRow = Math.floor(Math.random() * 9) - 4;
            const targetCol = current.col + offsetCol;
            const targetRow = current.row + offsetRow;
            if (this.game.level.isNavigable(targetCol, targetRow)) { validTarget = this.game.level.toWorld(targetCol, targetRow); break; }
        }
        if (validTarget) this.calculatePath(validTarget);
    }

    calculatePath(targetPos) {
        const start = this.game.level.toGrid(this.x, this.y);
        const end = this.game.level.toGrid(targetPos.x, targetPos.y);

        // --- NEW: ZONE RESTRICTION CHECK ---
        // If we are a GUARD and currently IDLE (Patrolling), we must restrict movement
        // strictly to tiles marked in the zoneGrid.
        const restrictToZone = (this.behavior === 'GUARD' && this.state === 'IDLE');
        
        const queue = [start]; 
        const visited = new Set(); 
        const cameFrom = {}; 
        const key = (n) => `${n.col},${n.row}`;
        
        visited.add(key(start)); 
        let found = false;

        while (queue.length > 0) {
            const current = queue.shift();
            if (current.col === end.col && current.row === end.row) { found = true; break; }
            
            const neighbors = [
                { col: current.col, row: current.row - 1 }, 
                { col: current.col, row: current.row + 1 }, 
                { col: current.col - 1, row: current.row }, 
                { col: current.col + 1, row: current.row }
            ];

            for (const n of neighbors) {
                const k = key(n);
                
                // 1. Standard Validity Check (Not visited + No Wall)
                let isValid = !visited.has(k) && this.game.level.isNavigable(n.col, n.row);

                // 2. Strict Zone Check
                if (isValid && restrictToZone) {
                    // Check level.zoneGrid to see if this specific tile belongs to a zone
                    const zRow = this.game.level.zoneGrid[n.row];
                    const inZone = zRow && zRow[n.col];
                    
                    // If the tile is not in a zone, treat it as a wall
                    if (!inZone) isValid = false;
                }

                if (isValid) {
                    visited.add(k); 
                    cameFrom[k] = current; 
                    queue.push(n);
                }
            }
        }

        if (found) {
            let curr = end; const pathGrid = [];
            while (key(curr) !== key(start)) { pathGrid.push(curr); curr = cameFrom[key(curr)]; }
            pathGrid.reverse();
            this.path = pathGrid.map(node => this.game.level.toWorld(node.col, node.row));
            this.currentWaypoint = 0;
        } else {
            this.path = [];
        }
    }

    checkCollisionAt(x, y) {
        return this.game.level.checkCollision({
            x: x - this.width / 2,
            y: y - this.height / 2,
            w: this.width,
            h: this.height
        });
    }

    moveTowards(targetX, targetY, dt) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        let angle = Math.atan2(dy, dx);

        if (this.state === 'CHASE') {
            const lookAheadDist = this.speed * dt * 4;
            const futureX = this.x + Math.cos(angle) * lookAheadDist;
            const futureY = this.y + Math.sin(angle) * lookAheadDist;

            if (this.checkCollisionAt(futureX, futureY)) {
                const offset = 0.6;
                const leftAngle = angle - offset;
                const rightAngle = angle + offset;

                const leftX = this.x + Math.cos(leftAngle) * lookAheadDist;
                const leftY = this.y + Math.sin(leftAngle) * lookAheadDist;

                const rightX = this.x + Math.cos(rightAngle) * lookAheadDist;
                const rightY = this.y + Math.sin(rightAngle) * lookAheadDist;

                const leftBlocked = this.checkCollisionAt(leftX, leftY);
                const rightBlocked = this.checkCollisionAt(rightX, rightY);

                if (!leftBlocked && rightBlocked) {
                    angle = leftAngle;
                }
                else if (!rightBlocked && leftBlocked) {
                    angle = rightAngle;
                }
                else if (!leftBlocked && !rightBlocked) {
                    angle = rightAngle;
                }
            }
        }

        const moveX = Math.cos(angle) * this.speed * dt;
        const moveY = Math.sin(angle) * this.speed * dt;

        this.x += moveX; if (this.checkCollision()) this.x -= moveX;
        this.y += moveY; if (this.checkCollision()) this.y -= moveY;
    }

    hasLineOfSight(target) { return this.game.level.hasLineOfSight(this, target); }
    checkCollision() { return this.game.level.checkCollision(this.getBounds()); }
    getBounds() { return { x: this.x - this.width / 2, y: this.y - this.height / 2, w: this.width, h: this.height }; }

    getSpriteKey() {
        // 1. Determine Prefix based on Behavior
        let prefix = 'enemy'; // Default (SENTRY)
        if (this.behavior === 'GUARD') prefix = 'guard';
        if (this.behavior === 'ROAMER') prefix = 'roamer';

        if (this.attackTimer > 0) return `${prefix}Attack`;

        if (this.state === 'STUNNED') {
            return (this.stunVariation === 'BACK') ? `${prefix}Knockback2` : `${prefix}Knockback1`;
        }

        if (this.state === 'MORTAL') {
            const sequence = [`${prefix}Crawl1`, `${prefix}Crawl2`];
            const frameDuration = this.crawlFrameDuration;
            const frameIndex = Math.floor(this.animTimer / frameDuration) % sequence.length;
            return sequence[frameIndex];
        }

        const isMoving = (
            this.state === 'CHASE' ||
            this.state === 'HUNT' ||
            this.state === 'SEARCH' ||
            this.state === 'RETURNING' ||
            (this.state === 'IDLE' && this.path.length > 0) ||
            (this.state === 'INVESTIGATE' && this.path.length > 0)
        );

        if (isMoving) {
            const isRunning = (this.state === 'CHASE' || this.state === 'HUNT');

            const frameDuration = isRunning ? 0.12 : 0.25;
            const frame = Math.floor(this.animTimer / frameDuration) % 4;

            // Use the prefix for movement frames too
            if (frame === 0) return `${prefix}Run1`;
            if (frame === 2) return `${prefix}Run2`;
            return `${prefix}Idle`;
        }

        return `${prefix}Idle`;
    }

    // In Enemy.js

    draw(ctx) {
        if (this.dead) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // --- 1. DEBUG CONES (COMMENTED OUT) ---
        /* if (this.state !== 'MORTAL' && this.state !== 'STUNNED') {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.visionRadius, -this.fov / 2, this.fov / 2);
            ctx.lineTo(0, 0);
            if (this.state === 'CHASE') ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
            else if (this.state === 'INVESTIGATE') ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            else if (this.state === 'SEARCH') ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
            else if (this.state === 'RETURNING') ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
            else {
                if (this.behavior === 'GUARD') ctx.fillStyle = 'rgba(255, 128, 0, 0.2)';
                else if (this.behavior === 'ROAMER') ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
                else ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
            }
            ctx.fill();
        }
        */

        // --- 2. SPRITE RENDER ---

        let spriteKey = this.getSpriteKey();
        let drawScale = this.scale;
        let drawRotation = -Math.PI / 2;
        let anchorX = this.anchor.x;
        let anchorY = this.anchor.y;

        // --- OVERRIDES PER STATE ---
        if (this.state === 'STUNNED') {
            drawScale = 0.11;
            drawRotation = Math.PI / 2;
            anchorX = 400;
            anchorY = 400;
        }
        else if (this.state === 'MORTAL') {
            drawScale = 0.115;
            drawRotation = Math.PI / 2;
            anchorX = 400;
            anchorY = 400;
        }

        let bobY = 0;
        let wobble = 0;

        if (this.state !== 'MORTAL' && this.state !== 'STUNNED') {
            const isMoving = (this.path.length > 0 || this.state === 'CHASE' || this.state === 'HUNT');
            if (isMoving) {
                bobY = Math.sin(this.animTimer * 15) * 2;
                wobble = Math.sin(this.animTimer * 10) * 0.05;
            } else {
                const breath = Math.sin(this.animTimer * 3);
                drawScale += breath * 0.002;
                wobble = Math.cos(this.animTimer * 2) * 0.02;
            }
        }

        // --- APPLY TRANSFORMS ---
        ctx.rotate(drawRotation);
        ctx.translate(0, bobY);
        ctx.rotate(wobble);

        const img = this.game.assets.getImage(spriteKey);
        if (img) {
            ctx.scale(drawScale, drawScale);
            ctx.drawImage(img, -anchorX, -anchorY);
        } else {
            // Fallback Box
            ctx.fillStyle = this.attackTimer > 0 ? 'white' : 'red';
            ctx.fillRect(-15, -15, 30, 30);
        }

        ctx.restore(); // Restore context to World Coordinates (Unrotated)

        // --- 3. STATUS ICONS ---
        // Draw AFTER restore so they stay upright (don't rotate with enemy body),
        // but manually calculate position to be "Behind" the enemy's facing direction.
        
        ctx.save();

        // 1. Calculate "Behind" Position
        // We project a point backwards from the enemy's center based on their angle.
        let distBehind = 35; // Distance behind the anchor point
        if (this.state === 'STUNNED') {
            distBehind = -15; // STARS : Distance behind the anchor point
        }
        const iconX = this.x - Math.cos(this.angle) * distBehind;
        const iconY = this.y - Math.sin(this.angle) * distBehind;

        ctx.translate(iconX, iconY);

        // Common Text Settings
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';

        // A. CHASE / HUNT (!)
        if (this.state === 'CHASE' || this.state === 'HUNT') {
            ctx.fillStyle = 'red';
            ctx.font = 'bold 32px Arial';
            
            // Shake Effect
            const shakeX = (Math.random() - 0.5) * 4;
            const shakeY = (Math.random() - 0.5) * 4;
            
            ctx.strokeText('!', shakeX, shakeY);
            ctx.fillText('!', shakeX, shakeY);
        }
        // B. INVESTIGATE / SEARCH (?)
        else if (this.state === 'INVESTIGATE' || this.state === 'SEARCH') {
            ctx.fillStyle = 'orange';
            ctx.font = 'bold 24px Arial';
            
            // Bobbing Motion
            const floatY = Math.sin(this.animTimer * 4) * 5;
            
            ctx.strokeText('?', 0, floatY);
            ctx.fillText('?', 0, floatY);
        }
        // C. STUNNED (*** Orbiting)
        else if (this.state === 'STUNNED') {
            ctx.fillStyle = '#E1AD01'; // Mustard Yellow
            ctx.font = 'bold 30px Courier New';
            
            // Orbit Settings
            const radiusX = 20;  // Width of orbit
            const radiusY = 20;  // Height of orbit (Circular)
            const speed = 5;     // Rotation speed

            for (let i = 0; i < 3; i++) {
                // Offset each star by 120 degrees (2 * PI / 3) for even spacing
                const offset = i * ((Math.PI * 2) / 3);
                const angle = (this.animTimer * speed) + offset;

                const starX = Math.cos(angle) * radiusX;
                const starY = Math.sin(angle) * radiusY;

                ctx.strokeText('*', starX, starY);
                ctx.fillText('*', starX, starY);
            }
        }

        ctx.restore();
    }
}