export class Player {
    constructor(game) {
        this.game = game;

        // --- PHYSICS & WORLD ---
        this.x = 0;
        this.y = 0;
        this.width = 30;
        this.height = 30;
        this.recoilVelocity = { x: 0, y: 0 };

        // --- VISUALS ---
        this.scale = 0.09;
        this.baseSpeed = 250;
        this.speed = this.baseSpeed;

        this.impactAnimDuration = 0.40; //impact dust anim duration

        // Animation State
        this.animTimer = 0;
        this.walkFrameIndex = 0;
        // [UPDATED] Initialize sequences (Defaults to Combat)
        this.walkSequence = ['playerWalk1', 'playerWalk1', 'playerIdle', 'playerWalk2', 'playerWalk2', 'playerIdle'];
        this.idleKey = 'playerIdle'; // Default Idle

        // [UPDATED] Added anchors for Free/Hub sprites (Assuming similar offsets to Combat sprites)
        this.anchorMap = {
            'playerWalk1': { x: 460, y: 480 },
            'playerWalk2': { x: 467, y: 444 },
            'playerKick': { x: 435, y: 409 },
            'playerIdle': { x: 435, y: 409 },
            
            // Hub / Free Anchors
            'playerIdleFree': { x: 210, y: 270 },       
            'playerWalkFree1': { x: 445, y: 455 },      
            'playerWalkFree2': { x: 445, y: 455 }       
        };

        // --- INPUT BUFFER (Game Feel) ---
        // 180ms delay before walking starts to allow for Double-Click detection without moving.
        this.inputBufferTimer = 0;
        this.isWalking = false;
        this.bufferThreshold = 0.18;

        // --- DASH (LUNGE) STATS ---
        this.dashDuration = 0.25;
        this.maxDashDistance = 200;
        this.dashSpeed = 0;
        this.dashCooldown = 1.5;
        this.dashCooldownTimer = 0;
        this.dashTimer = 0;
        this.isDashing = false;
        this.dashVector = { x: 0, y: 0 };
        this.cancelSlam = false;

        // --- PARRY STATS ---
        this.isParrying = false;
        this.parryDuration = 0.18;
        this.parryCooldown = 0.75;    // High penalty for missing the parry
        this.parryTimer = 0;
        this.parryCooldownTimer = 0;

        // --- KICK STATS ---
        this.kickTimer = 0;
        this.kickDuration = 0.25;

        // --- COMBAT STATS (Heavy Slam) ---
        this.isAttacking = false;
        this.isHeavy = false;
        this.heavyDuration = 0.65;
        this.heavyHitWindow = 0.15;
        this.heavyRadius = 60;
        this.heavyOffset = { x: 50, y: -3 };
        this.attackTimer = 0;
        this.angle = 0;
        this.hitList = new Set();
        this.hasHitWall = false;
        this.hasHitFloor = false;

        // Flag to ensure swing sound plays exactly once per attack
        this.hasPlayedSwingSound = false;

        // --- EXECUTION STATS ("Finish Him") ---
        this.isExecuting = false;
        this.executionTimer = 0;
        this.executionTarget = null;
        this.hasDealtExecutionDamage = false;
        this.executionImpactAnimTimer = 0;

        // Execution Kinematics
        this.executionStartPos = { x: 0, y: 0 };
        this.executionEndPos = { x: 0, y: 0 };

        // --- AIM LOCK ---
        // Locks rotation after an attack/execution for stability
        this.angleLock = false;
        this.lockMousePos = { x: 0, y: 0 };

        this.dead = false;
    }

    reset() {
        this.hp = 100; // Or max HP
        this.dead = false;
        this.speed = this.baseSpeed;

        // Reset Physics
        this.recoilVelocity = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 }; // If you use this

        // Reset Combat States
        this.isParrying = false;
        this.isAttacking = false;
        this.isHeavy = false;
        this.isDashing = false;
        this.isExecuting = false;
        this.angleLock = false;

        // Reset Timers
        this.parryCooldownTimer = 0;
        this.dashCooldownTimer = 0;
        this.dashTimer = 0;
        this.attackTimer = 0;
        this.parryTimer = 0;
        this.executionTimer = 0;
        this.inputBufferTimer = 0;

        // Clear Lists
        this.hitList.clear();
        this.hasHitWall = false;
        this.hasHitFloor = false;

        // [FIX] Use the Game's tracked ID, not the Campaign's
        const isHub = (this.game.currentLevelID === 'level00');

        if (isHub) {
            // Set Hub Sprites
            this.walkSequence = ['playerWalkFree1', 'playerWalkFree1', 'playerIdleFree', 'playerWalkFree2', 'playerWalkFree2', 'playerIdleFree'];
            this.idleKey = 'playerIdleFree';
        } else {
            // Set Combat Sprites
            this.walkSequence = ['playerWalk1', 'playerWalk1', 'playerIdle', 'playerWalk2', 'playerWalk2', 'playerIdle'];
            this.idleKey = 'playerIdle';
        }
    }

    die(source) {
        if (this.dead) return;
        this.dead = true;

        this.game.sounds.play('deadPlayer', 1.2);

        // 1. Face the killer
        if (source && source.angle !== undefined) {
            this.angle = source.angle;
        }

        this.game.triggerGameOver();
        console.log("Player Died");

        // --- GORE CALCULATIONS ---
        const cfg = this.getDeadBodySettings();

        // A. Neck Position (Where the head starts)
        const distFromCenter = cfg.visualOffset + ((cfg.headImageY - cfg.anchor.y) * cfg.scale);
        const backwardAngle = this.angle + Math.PI;

        const neckX = this.x + Math.cos(backwardAngle) * distFromCenter;
        const neckY = this.y + Math.sin(backwardAngle) * distFromCenter;

        // B. Blood Splat Direction (Towards Killer)
        const sprayAngle = this.angle;

        // C. Detached Head Calculation
        // Distance: 10 to 25 pixels away from the neck
        const headDist = 10 + Math.random() * 15;
        const coneOffset = (Math.random() - 0.5) * (Math.PI / 4);
        const headMoveAngle = sprayAngle + coneOffset;

        // Final World Position of the detached head
        const finalHeadX = neckX + Math.cos(headMoveAngle) * headDist;
        const finalHeadY = neckY + Math.sin(headMoveAngle) * headDist;

        // Store Offset relative to Player (for Drawing)
        this.deadHeadState = {
            offsetX: finalHeadX - this.x,
            offsetY: finalHeadY - this.y,
            rotation: headMoveAngle + (Math.random() * 1.0 - 0.5)
        };

        // --- NEW: DROPPED HAMMER CALCULATION ---
        // We place it slightly offset from the head so they don't overlap perfectly
        const hammerDist = 20 + Math.random() * 10;
        const hammerAngle = headMoveAngle + (Math.random() - 0.5); // Roughly same direction as head

        const hammerX = neckX + Math.cos(hammerAngle) * hammerDist;
        const hammerY = neckY + Math.sin(hammerAngle) * hammerDist;

        this.deadHammerState = {
            offsetX: hammerX - this.x,
            offsetY: hammerY - this.y,
            rotation: Math.random() * Math.PI * 2 // Random rotation for the tool
        };

        // D. Spawn Effects
        this.game.level.createViolentSplat(neckX, neckY, sprayAngle, 30);
        this.game.level.createViolentSplat(neckX, neckY, sprayAngle + 0.2, 20);
        this.game.level.createViolentSplat(neckX, neckY, sprayAngle - 0.2, 20);

        this.game.sounds.play('bloodSplat', 1.0);
    }

    // --- HIT HANDLER ---
    // Called by Enemy.js when they attempt to hit the player
    takeHit(source) {
        if (this.dead) return;

        // 1. Parry Check
        if (this.isParrying) {
            const angleToEnemy = Math.atan2(source.y - this.y, source.x - this.x);
            let angleDiff = angleToEnemy - this.angle;

            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            if (Math.abs(angleDiff) < (Math.PI * 0.65)) {

                // --- SUCCESSFUL PARRY ---
                this.parryCooldownTimer = 0;
                this.parryTimer = Math.max(this.parryTimer, 0.1);

                // RECOIL
                const recoilForce = 450;
                this.recoilVelocity.x = -Math.cos(angleToEnemy) * recoilForce;
                this.recoilVelocity.y = -Math.sin(angleToEnemy) * recoilForce;

                // VISUALS
                this.game.camera.shake(8, 0.1);
                this.game.particles.emit(this.x + Math.cos(this.angle) * 20, this.y + Math.sin(this.angle) * 20, 'spark');

                // SOUND: PARRY (Always play the metallic "Clang" requested)
                this.game.sounds.play('hittingCrowbar', 0.8);

                // PHYSICS
                source.applyForce(this.x, this.y, 300);
                source.getStunned(this.x, this.y);

                return; // <--- SUCCESS: We return here, so the hit sound below never plays.
            }
        }

        // 2. HIT (FAILURE)

        // SOUND: WEAPON HIT
        // We read the sound directly from the enemy (source). 
        // If you create a new enemy with "this.attackSound = 'knifeStab'", it will work automatically.
        if (source && source.attackSound) {
            this.game.sounds.play(source.attackSound, 0.8);
        }

        this.die(source);
    }

    update(deltaTime) {
        if (this.dead) return;

        const input = this.game.input;
        const dt = deltaTime / 1000;
        
        const isHub = (this.game.currentLevelID === 'level00');

        // Decrement Kick Timer
        if (this.kickTimer > 0) this.kickTimer -= dt;

        // --- APPLY RECOIL PHYSICS ---
        if (Math.abs(this.recoilVelocity.x) > 1 || Math.abs(this.recoilVelocity.y) > 1) {
            const rx = this.recoilVelocity.x * dt;
            const ry = this.recoilVelocity.y * dt;

            this.x += rx; if (this.checkCollision()) this.x -= rx;
            this.y += ry; if (this.checkCollision()) this.y -= ry;

            const friction = 10.0;
            this.recoilVelocity.x -= this.recoilVelocity.x * friction * dt;
            this.recoilVelocity.y -= this.recoilVelocity.y * friction * dt;
        }

        const worldMouse = input.getWorldMouse(this.game.camera);

        this.animTimer += dt;
        if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
        if (this.parryCooldownTimer > 0) this.parryCooldownTimer -= dt;

        // --- 1. EXECUTION SEQUENCE ---
        // (Logic remains for continuity, though disabled in Hub via Input check)
        if (this.executionImpactAnimTimer > 0) this.executionImpactAnimTimer -= dt;

        if (this.isExecuting) {
            this.executionTimer -= dt;

            // Phase A: The Jump
            if (this.executionTimer > 0.60) {
                const totalJumpTime = 0.30;
                const currentJumpProgress = (0.90 - this.executionTimer) / totalJumpTime;
                const t = Math.max(0, Math.min(1, currentJumpProgress));
                this.x = this.executionStartPos.x + (this.executionEndPos.x - this.executionStartPos.x) * t;
                this.y = this.executionStartPos.y + (this.executionEndPos.y - this.executionStartPos.y) * t;
                this.game.level.checkBreachCollision(this.getBounds());
            }
            // Phase B: The Impact
            else if (!this.hasDealtExecutionDamage) {
                this.hasDealtExecutionDamage = true;
                this.executionImpactAnimTimer = this.impactAnimDuration;
                this.x = this.executionEndPos.x;
                this.y = this.executionEndPos.y;
                this.game.camera.shake(20, 0.4);
                this.game.sounds.play('execution', 0.6);
                this.game.level.emitHeavyNoise(this.x, this.y, 500, 200, true);
                this.game.sounds.play('crushedEnemy', 1.0);
                this.game.sounds.play('bloodSplat', 0.8);
                this.game.level.emitNoise(this.x, this.y, 600);
                this.game.level.breakPropsInRadius(this.x, this.y, 200);

                const shockRadius = 200;
                for (const enemy of this.game.level.enemies) {
                    if (enemy === this.executionTarget || enemy.dead) continue;
                    const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                    if (dist < shockRadius) {
                        const wallHit = this.game.level.getClosestObstacleIntersection(this.x, this.y, enemy.x, enemy.y);
                        if (wallHit) continue;
                        if (enemy.state === 'MORTAL' || enemy.state === 'STUNNED') {
                            const angle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                            this.game.level.createViolentSplat(enemy.x, enemy.y, angle, 120);
                            if (enemy.state !== 'MORTAL') this.game.level.spawnWeapon(enemy);
                            enemy.die();
                        } else {
                            enemy.getStunned(this.x, this.y);
                            enemy.applyForce(this.x, this.y, 400);
                        }
                    }
                }

                if (this.executionTarget) {
                    this.game.level.createExecutionSplat(this.executionTarget.x, this.executionTarget.y);
                    if (this.executionTarget.state !== 'MORTAL') this.game.level.spawnWeapon(this.executionTarget);
                    this.executionTarget.die();
                }
            }

            // Phase C: Cooldown/End
            if (this.executionTimer <= 0) {
                this.isExecuting = false;
                this.executionTarget = null;
                this.speed = this.baseSpeed;
                this.angleLock = true;
                this.lockMousePos = { x: worldMouse.x, y: worldMouse.y };
            }
            return;
        }

        // --- COMBAT INPUTS (DISABLED IN HUB) ---
        if (!isHub) {
            
            // --- 2. INPUT: DASH ---
            if (input.dashTriggered && !this.isDashing && !this.isAttacking && !this.isParrying && this.dashCooldownTimer <= 0) {
                this.startDash(worldMouse);
                this.isWalking = false;
                this.inputBufferTimer = 0;
            }

            // --- 3. INPUT: RIGHT CLICK ACTIONS ---
            if (input.attackTriggered && !this.isParrying && !this.isDashing) {
                let actionTaken = false;

                // A. SMART PARRY
                if (this.parryCooldownTimer <= 0) {
                    const threatDetected = this.game.level.enemies.some(e => {
                        if (e.dead || e.state === 'STUNNED' || e.state === 'MORTAL') return false;
                        const dist = Math.hypot(this.x - e.x, this.y - e.y);
                        if (dist > 250) return false;
                        const isAggro = (e.state === 'CHASE' || e.state === 'HUNT') || dist < 80;
                        if (!isAggro) return false;
                        if (!this.game.level.hasLineOfSight(this, e)) return false;
                        return true;
                    });
                    if (threatDetected) {
                        this.startParry();
                        actionTaken = true;
                    }
                }

                // B. DOOR KICK
                if (!actionTaken) {
                    let bestDoor = null;
                    let minDoorDist = Infinity;
                    const kickRange = 65;

                    for (const prop of this.game.level.props) {
                        if (prop.type === 'door' && !prop.isOpen && !prop.destroyed) {
                            const dist = Math.hypot(prop.x - this.x, prop.y - this.y);
                            if (dist < kickRange) {
                                const angleToDoor = Math.atan2(prop.y - this.y, prop.x - this.x);
                                let angleDiff = angleToDoor - this.angle;
                                while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                                if (Math.abs(angleDiff) < Math.PI / 6) {
                                    if (dist < minDoorDist) { minDoorDist = dist; bestDoor = prop; }
                                }
                            }
                        }
                    }
                    if (bestDoor) {
                        bestDoor.interact('KICK', this);
                        this.startKick();
                        actionTaken = true;
                    }
                }

                // C. EXECUTION
                if (!actionTaken) {
                    let bestTarget = null;
                    let minDist = 200;
                    for (const enemy of this.game.level.enemies) {
                        if (enemy.state === 'STUNNED' || enemy.state === 'MORTAL') {
                            const d = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                            if (d < minDist) {
                                minDist = d;
                                bestTarget = enemy;
                            }
                        }
                    }
                    if (bestTarget) {
                        this.performExecution(bestTarget);
                        actionTaken = true;
                    }
                }

                // D. FALLBACK PARRY
                if (!actionTaken && this.parryCooldownTimer <= 0) {
                    this.startParry();
                }
            }
        }

        // --- 4. STATE MACHINE UPDATE ---
        // (Note: Since inputs are blocked in Hub, these states will naturally not trigger)

        if (this.isParrying) {
            this.parryTimer -= dt;
            this.speed = 50; 
            this.angle = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
            if (this.parryTimer <= 0) {
                this.isParrying = false;
                this.speed = this.baseSpeed;
            }
        }
        else if (this.isDashing) {
            this.dashTimer -= dt;
            const moveX = this.dashVector.x * this.dashSpeed * dt;
            const moveY = this.dashVector.y * this.dashSpeed * dt;
            this.x += moveX; if (this.game.level.checkBreachCollision(this.getBounds())) this.x -= moveX;
            this.y += moveY; if (this.game.level.checkBreachCollision(this.getBounds())) this.y -= moveY;

            if (this.dashTimer <= 0) {
                this.isDashing = false;
                if (this.cancelSlam) {
                    this.game.camera.shake(2, 0.1);
                } else {
                    this.game.camera.shake(5, 0.2);
                    this.startAttack(true);
                }
            }
        }
        else if (this.isAttacking) {
            this.attackTimer -= dt;
            if (this.isHitboxActive()) {
                if (!this.hasPlayedSwingSound) {
                    this.game.sounds.play('heavyHit', 0.7);
                    this.hasPlayedSwingSound = true;
                }
                if (!this.hasHitWall && this.game.level.checkPlayerAttack) {
                    this.game.level.checkPlayerAttack(this);
                }
            }
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.isHeavy = false;
                this.hasHitWall = false;
            }
        }
        // MOVEMENT & IDLE (Available in Hub)
        else {
            if (this.angleLock) {
                const mouseDist = Math.hypot(worldMouse.x - this.lockMousePos.x, worldMouse.y - this.lockMousePos.y);
                if (mouseDist > 50) this.angleLock = false;
            }
            if (!this.angleLock) {
                this.angle = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
            }

            if (input.mouse.leftDown) {
                if (this.isWalking) {
                    const dx = worldMouse.x - this.x;
                    const dy = worldMouse.y - this.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 5) {
                        const moveX = (dx / distance) * this.speed * dt;
                        const moveY = (dy / distance) * this.speed * dt;

                        this.angleLock = false; 
                        this.x += moveX; if (this.checkCollision()) this.x -= moveX;
                        this.y += moveY; if (this.checkCollision()) this.y -= moveY;

                        const frameDuration = 0.1;
                        const rawFrame = Math.floor(this.animTimer / frameDuration);
                        this.walkFrameIndex = rawFrame % this.walkSequence.length;
                    }
                } else {
                    this.inputBufferTimer += dt;
                    if (this.inputBufferTimer > this.bufferThreshold) {
                        this.isWalking = true;
                    } else {
                        this.walkFrameIndex = 0;
                    }
                }
            } else {
                this.isWalking = false;
                this.inputBufferTimer = 0;
                this.walkFrameIndex = 0;
            }
        }
    }

    performExecution(enemy) {
        this.isExecuting = true;
        this.isParrying = false;
        this.isAttacking = false;
        this.executionTimer = 0.90;
        this.executionTarget = enemy;
        this.hasDealtExecutionDamage = false;

        enemy.isLocked = true;

        this.executionStartPos = { x: this.x, y: this.y };

        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const angleToPlayer = Math.atan2(dy, dx);

        const idealDist = 50;
        let targetX = enemy.x + Math.cos(angleToPlayer) * idealDist;
        let targetY = enemy.y + Math.sin(angleToPlayer) * idealDist;

        // UPDATED FILTER: Ignore Table, Crate, Door
        const wallHit = this.game.level.getClosestObstacleIntersection(
            enemy.x, enemy.y, targetX, targetY,
            (prop) => prop.type !== 'destructibleSmallWall' && prop.type !== 'door' && prop.type !== 'destructibleLargeWall'
        );

        if (wallHit) {
            const distToWall = Math.hypot(wallHit.x - enemy.x, wallHit.y - enemy.y);
            const safeDist = Math.max(10, distToWall - 20);
            targetX = enemy.x + Math.cos(angleToPlayer) * safeDist;
            targetY = enemy.y + Math.sin(angleToPlayer) * safeDist;
        }

        let finalX = targetX;
        let finalY = targetY;
        let validSpotFound = false;

        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const checkX = targetX + (this.x - targetX) * t;
            const checkY = targetY + (this.y - targetY) * t;
            const testRect = { x: checkX - this.width / 2, y: checkY - this.height / 2, w: this.width, h: this.height };

            // Use standard collision check for "landing safety"
            if (!this.game.level.checkCollision(testRect)) {
                finalX = checkX;
                finalY = checkY;
                validSpotFound = true;
                break;
            }
        }

        if (!validSpotFound) { finalX = this.x; finalY = this.y; }

        this.executionEndPos = { x: finalX, y: finalY };
        this.angle = Math.atan2(enemy.y - finalY, enemy.x - finalX);
    }

    startDash(worldMouse) {
        this.isDashing = true;
        this.dashTimer = this.dashDuration;
        this.dashCooldownTimer = this.dashCooldown;
        this.animTimer = 0;
        this.cancelSlam = false;
        this.angleLock = false;

        const dx = worldMouse.x - this.x;
        const dy = worldMouse.y - this.y;
        const distToMouse = Math.sqrt(dx * dx + dy * dy);

        // 1. Calculate Target Distance
        let targetTravelDist = distToMouse - this.heavyOffset.x;
        if (targetTravelDist < 0) targetTravelDist = 0;
        if (targetTravelDist > this.maxDashDistance) targetTravelDist = this.maxDashDistance;

        // 2. Raycast for Walls/Obstacles
        const targetX = this.x + (dx / distToMouse) * targetTravelDist;
        const targetY = this.y + (dy / distToMouse) * targetTravelDist;

        // UPDATED FILTER: Ignore Table, Crate, Door (Aim through them)
        const obstacleHit = this.game.level.getClosestObstacleIntersection(
            this.x, this.y, targetX, targetY,
            (prop) => prop.type !== 'destructibleSmallWall' && prop.type !== 'door' && prop.type !== 'destructibleLargeWall'
        );

        if (obstacleHit) {
            const distToObstacle = Math.sqrt((obstacleHit.x - this.x) ** 2 + (obstacleHit.y - this.y) ** 2);
            targetTravelDist = Math.max(0, distToObstacle - 20);
            this.cancelSlam = true;
        }

        // 3. Set Physics
        this.dashSpeed = targetTravelDist / this.dashDuration;
        this.dashVector = (distToMouse > 0.1) ? { x: dx / distToMouse, y: dy / distToMouse } : { x: 1, y: 0 };

        this.game.level.spawnEffect('dash', this.x, this.y, this.angle);
    }

    startParry() {
        this.isParrying = true;
        this.isAttacking = false;
        this.parryTimer = this.parryDuration;
        this.parryCooldownTimer = this.parryCooldown;
        this.angleLock = false;
    }

    startAttack(isHeavy) {
        this.isAttacking = true;
        this.isHeavy = isHeavy;
        this.attackTimer = isHeavy ? this.heavyDuration : 0.3;
        this.hasHitWall = false;
        this.hasHitFloor = false;
        this.hitList.clear();
        this.angleLock = false;

        // RESET SOUND FLAG
        this.hasPlayedSwingSound = false;
    }

    // Add inside Player class
    startKick() {
        this.kickTimer = this.kickDuration;
        this.isAttacking = false;
        this.isDashing = false;
    }

    // --- UTILS & HELPERS ---

    raycastWalls(x1, y1, x2, y2) {
        // Alias for Level function to ensure backward compatibility
        return this.game.level.getClosestObstacleIntersection(x1, y1, x2, y2);
    }

    getDeadBodySettings() {
        return {
            scale: 0.11,
            anchor: { x: 420, y: 640 }, // Body Anchor
            headImageY: 10,             // Neck location on Body Sprite
            visualOffset: -25,           // Shift body backward
            headAnchor: { x: 70, y: 170 } // NEW: Head Anchor
        };
    }

    getSpriteState() {
        // 1. Parry / Kick
        if (this.isParrying || this.kickTimer > 0) {
            const key = 'playerKick';
            const anchor = this.anchorMap[key];
            return { key: key, anchorX: anchor.x, anchorY: anchor.y };
        }

        // 2. Execution
        if (this.isExecuting) {
            if (this.executionTimer > 0.60) {
                return { key: 'playerDashJump', anchorX: null, anchorY: null };
            } else {
                return { key: 'playerSlam', anchorX: null, anchorY: null };
            }
        }

        // 3. Dash
        if (this.isDashing) {
            const progress = 1 - (this.dashTimer / this.dashDuration);
            return (progress < 0.75)
                ? { key: 'playerDashJump', anchorX: null, anchorY: null }
                : { key: 'playerDashPrep', anchorX: null, anchorY: null };
        }

        // 4. Attack
        if (this.isAttacking) {
            return { key: 'playerSlam', anchorX: null, anchorY: null };
        }

        // 5. Walk/Idle
        const isMoving = (this.game.input.mouse.leftDown && this.isWalking);

        // [UPDATED] Use dynamic idle key (Supports 'playerIdleFree' for Hub)
        let key = this.idleKey;
        if (isMoving) {
            key = this.walkSequence[this.walkFrameIndex];
        }

        // Retrieve anchor from the map
        const anchor = this.anchorMap[key];
        // Handle missing anchors safely (e.g. for playerSlam which uses default centering)
        const ax = anchor ? anchor.x : null;
        const ay = anchor ? anchor.y : null;

        return { key: key, anchorX: ax, anchorY: ay };
    }

    getHeavyImpactCenter() {
        const cos = Math.cos(this.angle); const sin = Math.sin(this.angle);
        const localX = this.heavyOffset.x; const localY = this.heavyOffset.y;
        return { x: this.x + (localX * cos - localY * sin), y: this.y + (localX * sin + localY * cos) };
    }

    isHitboxActive() { return this.isHeavy && this.attackTimer > (this.heavyDuration - this.heavyHitWindow); }
    getBounds() { return { x: this.x - this.width / 2, y: this.y - this.height / 2, w: this.width, h: this.height }; }
    checkCollision() { return this.game.level.checkCollision(this.getBounds(), this); }

    draw(ctx) {

        // --- 1. IMPACT VISUALS ---

        // A. HEAVY ATTACK DUST
        if (this.isAttacking && this.isHeavy && !this.dead) {

            const impact = this.getHeavyImpactCenter();

            // Calculate how long we've been swinging
            // attackTimer counts DOWN from heavyDuration (0.65).
            const timeSinceStart = this.heavyDuration - this.attackTimer;

            // --- 1. HIT DUST ANIMATION ---
            // SETTING: How long the visual lasts (independent of hitbox)
            const visualDuration = this.impactAnimDuration;

            if (timeSinceStart < visualDuration) {
                const totalFrames = 6;
                const progress = timeSinceStart / visualDuration;

                let frameIndex = Math.floor(progress * totalFrames) + 1;
                if (frameIndex > totalFrames) frameIndex = totalFrames;
                if (frameIndex < 1) frameIndex = 1;

                const dustImg = this.game.assets.getImage(`hitDust${frameIndex}`);

                if (dustImg) {
                    ctx.save();
                    ctx.translate(impact.x, impact.y);

                    ctx.rotate(this.angle + Math.PI / 2);

                    ctx.scale(0.7, 0.7); // Size
                    ctx.drawImage(dustImg, -150, -230); // Anchor: 150, 230

                    ctx.restore();
                }
            }

            // --- 2. DEBUG ONION ---
            // We only draw this when the damage window is actually active (0.15s)
            if (this.isHitboxActive()) {
                /*
                ctx.save();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#FFA500'; ctx.beginPath(); ctx.arc(impact.x, impact.y, 75, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = '#FFFF00'; ctx.beginPath(); ctx.arc(impact.x, impact.y, 55, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = '#FF0000'; ctx.beginPath(); ctx.arc(impact.x, impact.y, 35, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; ctx.beginPath(); ctx.arc(impact.x, impact.y, 12, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                */
            }
        }

        // B. EXECUTION DUST (NEW)
        if (this.executionImpactAnimTimer > 0) {
            const visualDuration = this.impactAnimDuration;
            const timeSinceStart = visualDuration - this.executionImpactAnimTimer;

            const totalFrames = 6;
            const progress = timeSinceStart / visualDuration;

            let frameIndex = Math.floor(progress * totalFrames) + 1;
            if (frameIndex > totalFrames) frameIndex = totalFrames;
            if (frameIndex < 1) frameIndex = 1;

            const dustImg = this.game.assets.getImage(`hitDust${frameIndex}`);
            const impact = this.getHeavyImpactCenter();

            if (dustImg) {
                ctx.save();

                ctx.translate(impact.x, impact.y);

                // Rotation: 180 deg flip relative to player
                ctx.rotate(this.angle + Math.PI / 2);

                ctx.scale(0.8, 0.8);
                ctx.drawImage(dustImg, -150, -230); // Anchor: 150, 230

                ctx.restore();
            }
        }


        ctx.save();

        let drawX = this.x;
        let drawY = this.y;

        // Buffer Pullback
        if (this.inputBufferTimer > 0 && !this.isWalking) {
            const pullbackDist = 4;
            drawX -= Math.cos(this.angle) * pullbackDist;
            drawY -= Math.sin(this.angle) * pullbackDist;
        }

        ctx.translate(drawX, drawY);

        if (this.dead) {
            const cfg = this.getDeadBodySettings();

            // A. Draw Body (Headless) - BOTTOM LAYER
            ctx.save();
            ctx.rotate(this.angle - Math.PI / 2); // Base Rotation
            ctx.rotate(Math.PI); // Flip 180
            ctx.translate(0, cfg.visualOffset); // Apply Body Offset

            const bodyImg = this.game.assets.getImage('playerDead');
            if (bodyImg) {
                ctx.scale(cfg.scale, cfg.scale);
                ctx.drawImage(bodyImg, -cfg.anchor.x, -cfg.anchor.y);
            }
            ctx.restore();

            // --- NEW: Draw Dropped Hammer ---
            // Draw AFTER body so it appears ON TOP
            if (this.deadHammerState) {
                const hammerImg = this.game.assets.getImage('hammer');
                if (hammerImg) {
                    ctx.save();
                    // Move to Hammer Position
                    ctx.translate(this.deadHammerState.offsetX, this.deadHammerState.offsetY);

                    // Rotate Hammer
                    ctx.rotate(this.deadHammerState.rotation);

                    // SCALE
                    const hScale = 0.1;
                    ctx.scale(hScale, hScale);

                    // Draw Centered
                    ctx.drawImage(hammerImg, -hammerImg.width / 2, -hammerImg.height / 2);
                    ctx.restore();
                }
            }

            // B. Draw Detached Head - TOP LAYER
            if (this.deadHeadState) {
                const headImg = this.game.assets.getImage('playerHead');
                if (headImg) {
                    ctx.save();
                    // Move to Head Position (calculated in die())
                    // Note: We do NOT apply visualOffset here, as the position 
                    // was already calculated in world space including that offset.
                    ctx.translate(this.deadHeadState.offsetX, this.deadHeadState.offsetY);

                    // Rotate Head
                    ctx.rotate(this.deadHeadState.rotation);

                    // Draw with NEW Anchor (70, 170)
                    ctx.scale(cfg.scale, cfg.scale);
                    ctx.drawImage(headImg, -cfg.headAnchor.x, -cfg.headAnchor.y);
                    ctx.restore();
                }
            }
        }
        else {
            // LIVING STATE
            ctx.rotate(this.angle - Math.PI / 2);
            // If we are in the "Punishment" window (Cooldown > 0), but not currently doing an action,
            // dim the player sprite to look "Vulnerable" or "Exhausted".
            if (this.parryCooldownTimer > 0 && !this.isParrying && !this.isDashing && !this.isAttacking) {
                ctx.filter = 'brightness(0.5)';
            }
            const state = this.getSpriteState();
            const img = this.game.assets.getImage(state.key);
            const s = this.scale;

            if (img) {
                const aX = state.anchorX !== null ? state.anchorX : img.width / 2;
                const aY = state.anchorY !== null ? state.anchorY : img.height / 2;

                ctx.scale(s, s);
                ctx.drawImage(img, -aX, -aY);
            } else {
                ctx.fillStyle = this.isDashing ? 'cyan' : 'red';
                ctx.fillRect(-15, -15, 30, 30);
            }
            ctx.filter = 'none';
        }

        // Debug & Parry (Only if alive)
        if (!this.dead) {
            ctx.fillStyle = '#00FFFF';
            ctx.fillRect(-2, -2, 4, 4);

            if (this.isParrying) {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 40, 0, Math.PI);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}