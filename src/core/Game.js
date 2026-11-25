import { InputHandler } from './InputHandler.js';
import { Player } from '../entities/Player.js';
import { Camera } from './Camera.js';
import { Level } from './Level.js';
import { ParticleSystem } from './ParticleSystem.js';
import { CampaignManager } from './CampaignManager.js';
import { SoundManager } from './SoundManager.js';

export class Game {
    constructor(width, height) {
        // --- 1. REAL DISPLAY CANVAS (800x600) ---
        this.canvas = document.getElementById('gameCanvas');
        this.canvas.style.cursor = 'none';
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        // --- 2. VIRTUAL CANVAS (Low Res) ---
        this.pixelScale = 1.6;
        this.virtualWidth = Math.ceil(width / this.pixelScale);
        this.virtualHeight = Math.ceil(height / this.pixelScale);

        this.virtualCanvas = document.createElement('canvas');
        this.virtualCanvas.width = this.virtualWidth;
        this.virtualCanvas.height = this.virtualHeight;
        this.vCtx = this.virtualCanvas.getContext('2d');

        this.ctx.imageSmoothingEnabled = false;
        this.vCtx.imageSmoothingEnabled = false;

        this.input = new InputHandler(this.canvas);
        this.campaign = new CampaignManager();
        this.sounds = new SoundManager();

        this.currentLevelID = 'level00';
        this.player = null;
        this.assets = null;

        this.camera = new Camera(width, height);
        this.level = new Level(this);
        this.particles = new ParticleSystem(this);

        this.backgroundColor = '#000000';
        this.lastTime = 0;

        // --- STATES ---
        this.gameState = 'WELCOME';
        this.gameOver = false;
        this.gameWon = false;
        this.extractionActive = false;

        this.timeScale = 1.0;
        this.sequenceTimer = 0;
        this.pendingState = null;

        // --- TRANSITION STATE (IRIS WIPE) ---
        this.state = 'PLAYING'; 
        this.irisRadius = 0;
        this.maxIrisRadius = Math.sqrt(width * width + height * height); // Covers corners
        this.transitionSpeed = 1500; 
        
        // Restart Lock (Prevents double-triggering while holding R)
        this.restartLocked = false; 
    }

    triggerGameOver() {
        if (this.pendingState) return;
        this.pendingState = 'LOSE';
        this.timeScale = 0.2;
        this.sequenceTimer = 1.0;
        this.deathSoundPlayed = false;
        this.camera.shake(10, 0.4);
    }

    triggerVictory() {
        if (this.pendingState || this.extractionActive) return;

        this.pendingState = 'WIN';
        this.timeScale = 0.2;
        this.sequenceTimer = 2.0;
        this.campaign.completeLevel();
    }

    playMusicForLevel(levelName) {
        let musicKey = 'music_menu';
        if (!levelName || levelName === 'hub') {
            musicKey = 'music_0';
        }
        else if (levelName && levelName.startsWith('level')) {
            const match = levelName.match(/level(\d+)/);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num)) musicKey = `music_${num}`;
            }
        }
        this.sounds.playMusic(musicKey);
    }

    transitionToLevel(levelID) {
        // Reset Game Flags
        this.currentLevelID = levelID;
        this.pendingState = null;
        this.gameWon = false;
        this.gameOver = false;
        this.extractionActive = false;
        this.timeScale = 1.0;
        this.sequenceTimer = 0;

        this.particles.activeParticles = [];
        this.playMusicForLevel(levelID);

        console.log(`[Game] Transitioning to: ${levelID}`);
        this.level.load(levelID);

        if (this.level.enemies.length === 0) {
            this.extractionActive = true;
            this.campaign.completeLevel();
        }

        if (!this.player) {
            this.player = new Player(this);
        } else {
            this.player.reset(); 
        }

        this.player.x = this.level.spawnPoint.x;
        this.player.y = this.level.spawnPoint.y;

        // Initial Snap
        this.camera.snap(this.player);

        this.input.attackTriggered = false;
        this.input.dashTriggered = false;
    }

    completeAndTransition() {
        const nextLevel = this.campaign.getCurrentLevelID();
        this.transitionToLevel(nextLevel);
    }

    // --- IRIS RESET LOGIC ---
    // This is called exactly once when the screen is fully black
    performLevelReset() {
        // 1. Reset Player
        this.player.reset();

        // 2. Reset Level
        this.level = new Level(this);
        const currentID = this.campaign.getCurrentLevelID();
        this.level.load(currentID); 

        // 3. Reset Position
        this.player.x = this.level.spawnPoint.x;
        this.player.y = this.level.spawnPoint.y;

        // 4. Snap Camera (Manual Safety Fallback included)
        if (this.camera.snap) {
            this.camera.snap(this.player);
        } else {
            // Fallback if Camera.js wasn't updated
            this.camera.x = this.player.x - (this.canvas.width / this.pixelScale) / 2;
            this.camera.y = this.player.y - (this.canvas.height / this.pixelScale) / 2;
        }

        // 5. Reset Global Flags
        this.particles.activeParticles = [];
        this.gameOver = false;
        this.gameWon = false;
        this.pendingState = null;
        this.timeScale = 1.0;
        this.extractionActive = false;
        
        // Check for safe zones (Hub logic)
        if (this.level.enemies.length === 0) {
            this.extractionActive = true;
        }
    }

    handleWelcomeInput() {
        if (this.input.mouse.leftDown || this.input.attackTriggered) {
            this.sounds.unlockBrowserAudio();
            const levelID = this.campaign.getCurrentLevelID();
            this.transitionToLevel(levelID);
            this.gameState = 'PLAYING';
        }
    }

    update(deltaTime) {
        // --- 1. RESTART & TRANSITION LOGIC ---
        
        // Unlock restart if key is released
        if (!this.input.keys['KeyR']) {
            this.restartLocked = false;
        }

        // A. Trigger Restart (Only if Playing/GameOver and Key is fresh)
        if (this.input.keys['KeyR'] && this.state === 'PLAYING') {
            if (!this.pendingState && !this.extractionActive && !this.restartLocked) {
                this.restartLocked = true; // Lock it
                this.state = 'IRIS_CLOSE';
                this.irisRadius = this.maxIrisRadius; 
            }
        }

        const dtSeconds = deltaTime / 1000;

        // B. Handle Iris Wipe
        if (this.state === 'IRIS_CLOSE') {
            this.irisRadius -= this.transitionSpeed * dtSeconds;
            if (this.irisRadius <= 0) {
                this.irisRadius = 0;
                this.performLevelReset(); // <--- Single Reset Point
                this.state = 'IRIS_OPEN';
            }
            return; // STOP UPDATING GAME LOGIC
        }
        else if (this.state === 'IRIS_OPEN') {
            this.irisRadius += this.transitionSpeed * dtSeconds;
            if (this.irisRadius >= this.maxIrisRadius) {
                this.state = 'PLAYING';
            }
            return; // STOP UPDATING GAME LOGIC
        }

        // --- 2. WELCOME SCREEN ---
        if (this.gameState === 'WELCOME') {
            this.handleWelcomeInput();
            return;
        }

        // --- 3. MAIN GAME LOOP ---
        const scaledDeltaTime = deltaTime * this.timeScale;
        const scaledDtSeconds = dtSeconds * this.timeScale;

        if (this.pendingState) {
            this.sequenceTimer -= dtSeconds;

            // --- NEW: Play Sound EARLY (0.2s before the screen appears) ---
            if (this.pendingState === 'LOSE' && this.sequenceTimer <= 0.2 && !this.deathSoundPlayed) {
                this.sounds.play('bloodSplat', 1.0);
                this.deathSoundPlayed = true;
            }

            if (this.sequenceTimer <= 0) {
                if (this.pendingState === 'LOSE') { 
                    this.timeScale = 0; 
                    this.gameOver = true; 
                    // (Sound removed from here so it doesn't play late)
                }
                else if (this.pendingState === 'WIN') { 
                    this.timeScale = 1.0; 
                    this.extractionActive = true; 
                }
                this.pendingState = null;
            }
        }

        if (this.gameOver) return;
        if (this.gameWon) return;

        if (this.player) {
            this.player.update(scaledDeltaTime);
            
            this.camera.update(
                this.player,
                deltaTime,
                this.input.mouse,
                this.canvas.width,
                this.canvas.height
            );

            // Exit Logic
            if (this.level.hubStartPoint) {
                const p = this.level.hubStartPoint;
                if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < 40) {
                    if (this.input.attackTriggered) this.completeAndTransition();
                }
            }

            if (this.extractionActive) {
                if (this.level.exitPoint) {
                    const p = this.level.exitPoint;
                    if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < 50) this.completeAndTransition();
                }
                if (this.level.stairsPoint) {
                    const p = this.level.stairsPoint;
                    if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < 40) this.completeAndTransition();
                }
            }
        }

        this.level.update(scaledDeltaTime);
        this.particles.update(scaledDtSeconds);

        if (this.level.enemies.length === 0 && !this.extractionActive && !this.pendingState && !this.gameWon) {
            this.triggerVictory();
        }

        this.input.dashTriggered = false;
        this.input.attackTriggered = false;
    }

    drawWelcomeScreen(ctx) {
        // Fix 1: Black Background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const img = this.assets.getImage('welcome');
        if (img) {
            // Fix 2: Centered Square (Not Stretched)
            const size = 500; 
            const x = (this.canvas.width - size) / 2;
            const y = (this.canvas.height - size) / 2;
            ctx.drawImage(img, x, y, size, size);
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        const alpha = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 30px "Courier New"';
        ctx.fillText("CLICK TO START", 400, 550);
        ctx.globalAlpha = 1.0;
    }

    renderVirtualWorld() {
        this.vCtx.fillStyle = this.backgroundColor;
        this.vCtx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        this.vCtx.save();
        const s = 1 / this.pixelScale;
        this.vCtx.scale(s, s);
        this.vCtx.translate(-this.camera.x, -this.camera.y);

        this.level.draw(this.vCtx);
        this.particles.draw(this.vCtx);
        if (this.player) this.player.draw(this.vCtx);

        this.vCtx.restore();
    }

    draw() {
        if (this.gameState === 'WELCOME') {
            this.drawWelcomeScreen(this.ctx);
            return;
        }

        // Step A: Draw World to Virtual Canvas
        this.renderVirtualWorld();

        // Step B: Compose Final Frame
        
        // --- TRANSITION: IRIS WIPE ---
        if (this.state === 'IRIS_CLOSE' || this.state === 'IRIS_OPEN') {
            
            // Fix 1: Fill background with Black first (Fixes transparency)
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // 1. Draw Welcome Image (Background)
            const welcomeImg = this.assets.getImage('welcome');
            if (welcomeImg) {
                // Fix 2: Draw centered square (Fixes stretching)
                const size = 500; 
                const x = (this.canvas.width - size) / 2;
                const y = (this.canvas.height - size) / 2;
                this.ctx.drawImage(welcomeImg, x, y, size, size);
            }

            // 2. Masking
            this.ctx.save();
            this.ctx.beginPath();
            
            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2;
            
            this.ctx.arc(cx, cy, Math.max(0, this.irisRadius), 0, Math.PI * 2);
            this.ctx.clip(); // <--- Game draws only inside this circle

            // 3. Draw Game
            this.drawGameUpscaled(this.ctx);

            this.ctx.restore(); 
        }
        // --- NORMAL PLAY ---
        else {
            this.drawGameUpscaled(this.ctx);
        }

        this.drawCursor(this.ctx);
    }

    drawGameUpscaled(ctx) {
        ctx.drawImage(
            this.virtualCanvas,
            0, 0,
            this.virtualWidth, this.virtualHeight,
            0, 0,
            this.canvas.width, this.canvas.height
        );

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.gameOver) this.drawGameOverUI(ctx);
        else if (this.gameWon) this.drawVictoryUI(ctx);
        else if (this.extractionActive || this.pendingState === 'WIN') {
            this.drawHUD(ctx);
            this.drawExtractionUI(ctx);
        }
        else {
            this.drawHUD(ctx);
        }
    }

    drawCursor(ctx) {
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;

        // --- 1. MOVEMENT CURSOR (White Ring) ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.stroke();

        if (!this.player || this.player.dead) return;

        // --- 2. CALCULATE IMPACT TARGET ---
        const worldMx = mx + this.camera.x;
        const worldMy = my + this.camera.y;
        
        const dx = worldMx - this.player.x;
        const dy = worldMy - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Max Range
        const maxEffectiveRange = (this.player.maxDashDistance || 200) + (this.player.heavyOffset?.x || 50);
        
        let worldTargetX = worldMx;
        let worldTargetY = worldMy;
        let isRangeClamped = false;

        if (dist > maxEffectiveRange) {
            const ratio = maxEffectiveRange / dist;
            worldTargetX = this.player.x + dx * ratio;
            worldTargetY = this.player.y + dy * ratio;
            isRangeClamped = true;
        }

        // Wall Check
        // UPDATED: Check for renamed destructible wall types
        const wallHit = this.level.getClosestObstacleIntersection(
            this.player.x, this.player.y, 
            worldTargetX, worldTargetY,
            (prop) => prop.type !== 'destructibleSmallWall' && prop.type !== 'destructibleLargeWall' && prop.type !== 'door'
        );

        let isObstructed = false;
        
        if (wallHit) {
            worldTargetX = wallHit.x;
            worldTargetY = wallHit.y;
            isObstructed = true;
        }

        const screenTx = worldTargetX - this.camera.x;
        const screenTy = worldTargetY - this.camera.y;
        const screenPx = this.player.x - this.camera.x;
        const screenPy = this.player.y - this.camera.y;

        // --- 3. DRAW ARROW TRAJECTORY ---
        const trajDx = screenTx - screenPx;
        const trajDy = screenTy - screenPy;
        const trajDist = Math.sqrt(trajDx * trajDx + trajDy * trajDy);
        const trajAngle = Math.atan2(trajDy, trajDx);

        if (trajDist > 30) { 
            ctx.save();
            
            const gap = 35; 
            const arrowCount = Math.floor(trajDist / gap);
            
            // UPDATED COLOR: Subtle Cyan (0, 255, 255) to match brackets
            ctx.strokeStyle = isObstructed ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 255, 0.3)';
            ctx.lineWidth = 2;

            for (let i = 1; i <= arrowCount; i++) {
                const currentDist = i * gap;
                if (currentDist > trajDist - 15) break;

                const ax = screenPx + Math.cos(trajAngle) * currentDist;
                const ay = screenPy + Math.sin(trajAngle) * currentDist;

                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(trajAngle);

                // Draw Chevron ">"
                ctx.beginPath();
                ctx.moveTo(-4, -4);
                ctx.lineTo(2, 0);
                ctx.lineTo(-4, 4);
                ctx.stroke();

                ctx.restore();
            }
            ctx.restore();
        }

        // --- 4. DRAW BRACKETS (Target) ---
        ctx.save();
        ctx.translate(screenTx, screenTy);

        if (isObstructed) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; 
        } else {
            ctx.strokeStyle = isRangeClamped ? 'rgba(0, 255, 255, 0.5)' : 'rgba(0, 255, 255, 0.9)';
        }
        
        ctx.lineWidth = 2;
        const size = 12; 
        const len = 7;   

        ctx.beginPath();
        // Brackets
        ctx.moveTo(-size, -size + len); ctx.lineTo(-size, -size); ctx.lineTo(-size + len, -size);
        ctx.moveTo(size - len, -size); ctx.lineTo(size, -size); ctx.lineTo(size, -size + len);
        ctx.moveTo(size, size - len); ctx.lineTo(size, size); ctx.lineTo(size - len, size);
        ctx.moveTo(-size + len, size); ctx.lineTo(-size, size); ctx.lineTo(-size, size - len);
        ctx.stroke();
        
        // Center Dot
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.fillRect(-2, -2, 4, 4);
        
        ctx.restore();
    }

    drawExtractionUI(ctx) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00FFFF';

        if (this.pendingState === 'WIN') {
            ctx.font = 'bold 50px "Courier New"';
            ctx.fillText("LEVEL CLEARED", 400, 300);
            return;
        }

        if (this.extractionActive) {
            let target = this.level.stairsPoint || this.level.exitPoint;

            if (target) {
                const label = this.level.stairsPoint ? "PROCEED TO STAIRS" : "RETURN TO EXTRACTION";

                ctx.font = 'bold 25px "Courier New"';
                ctx.fillText(label, 400, 60);

                if (this.player) {
                    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
                    const arrowX = 400 + Math.cos(angle) * 100;
                    const arrowY = 300 + Math.sin(angle) * 100;

                    ctx.save();
                    ctx.translate(arrowX, arrowY);
                    ctx.rotate(angle);
                    ctx.fillStyle = this.level.stairsPoint ? '#008080' : '#00FFFF';
                    ctx.beginPath();
                    ctx.moveTo(10, 0);
                    ctx.lineTo(-10, 10);
                    ctx.lineTo(-10, -10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
    }

    drawHUD(ctx) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px "Courier New"';
        ctx.textAlign = 'left';
        ctx.fillText(`HOSTILES: ${this.level.enemies.length}`, 20, 40);
    }

    drawGameOverUI(ctx) {
        this.drawOverlay(ctx);

        const img = this.assets.getImage('youdied');
        
        if (img) {
            // --- FIX: HALF SIZE ---
            const scale = 0.5;
            const w = img.width * scale;
            const h = img.height * scale;

            // Center based on new size
            const x = (this.canvas.width - w) / 2;
            const y = (this.canvas.height - h) / 2;
            
            ctx.drawImage(img, x, y, w, h);
        } else {
            this.drawText(ctx, "YOU DIED", 400, 280, 60, '#FF0000');
        }

        this.drawText(ctx, "[R] RESTART", 400, 450, 24); 
    }

    drawVictoryUI(ctx) {
        this.drawOverlay(ctx);
        this.drawText(ctx, "MISSION COMPLETE", 400, 280, 60, '#00FFFF');
        this.drawText(ctx, "PRESS [R] TO RESET", 400, 340, 24);
    }

    drawOverlay(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawText(ctx, text, x, y, size, color = 'white') {
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.font = `bold ${size}px "Courier New"`;
        ctx.fillText(text, x, y);
    }

    start() {
        const loop = (timestamp) => {
            const deltaTime = timestamp - this.lastTime;
            this.lastTime = timestamp;

            this.update(deltaTime);
            this.draw();

            if (!this.gameQuit) requestAnimationFrame(loop);
        };
        loop(0);
    }
}