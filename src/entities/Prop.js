export class Prop {
    constructor(game, x, y, type, angle = 0, w = 32, h = 32) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true; // Active = Collidable
        this.width = w;   
        this.height = h;  
        this.angle = angle;

        this.hp = 3;
        this.destroyed = false;
        
        this.debris = [];

        this.isOpen = false;
        this.currentSwing = 0;
        this.targetSwing = 0;
        this.hingeSide = -1; 
        this.hingeResolved = false; 
        
        this.jitter = {
            x: (Math.random() - 0.5) * 1.5,
            y: (Math.random() - 0.5) * 1.5
        };
    }

    generateDebris() {
        this.debris = [];
        const area = this.width * this.height;
        const targetCount = Math.max(3, Math.floor(area / 350)); 

        for (let i = 0; i < targetCount; i++) {
            const lx = (Math.random() - 0.5) * this.width;
            const ly = (Math.random() - 0.5) * this.height;
            const spread = 1.8; 
            const chaos = 40;
            const explodeX = (lx * spread) + ((Math.random() - 0.5) * chaos);
            const explodeY = (ly * spread) + ((Math.random() - 0.5) * chaos);

            let shape = 'line'; 
            if (this.type === 'door') shape = 'rect'; 
            else if (this.type === 'destructibleLargeWall') shape = Math.random() < 0.4 ? 'rect' : 'line';       
            else if (this.type === 'destructibleSmallWall') shape = Math.random() > 0.4 ? 'shard' : 'line';

            if (shape === 'rect') {
                const w = (this.type === 'door') ? 12 + Math.random() * 12 : 14 + Math.random() * 12;
                const h = (this.type === 'door') ? 2 + Math.random() * 2 : 14 + Math.random() * 12;
                this.debris.push({ type: 'rect', x: lx + explodeX, y: ly + explodeY, w: w, h: h, angle: Math.random() * Math.PI * 2 });
            } 
            else if (shape === 'line') {
                this.debris.push({ type: 'line', x: lx + explodeX, y: ly + explodeY, len: 16 + Math.random() * 16, angle: Math.random() * Math.PI * 2 });
            } 
            else if (shape === 'shard') {
                const size = 16 + Math.random() * 12; 
                this.debris.push({ 
                    type: 'shard', x: lx + explodeX, y: ly + explodeY, 
                    p1: { x: (Math.random() - 0.5) * size, y: -size/2 }, 
                    p2: { x: -size/2, y: size/2 }, 
                    p3: { x: size/2, y: size/2 },
                    angle: Math.random() * Math.PI * 2 
                });
            }
        }
    }

    resolveHinge() {
        if (this.type !== 'door') return;

        const g = this.game.level.toGrid(this.x, this.y);
        const grid = this.game.level.grid;
        const rows = this.game.level.rows;
        const cols = this.game.level.cols;

        const isStaticWall = (c, r) => {
            if (c < 0 || c >= cols || r < 0 || r >= rows) return true; 
            if (grid[r][c] !== 1) return false; 
            // Doors count as "Non-Static" for hinge logic (prevents pivoting off another door)
            const prop = this.game.level.getPropAtGrid(c, r);
            return (!prop || prop.type !== 'door');
        };

        if (Math.abs(this.angle) < 0.1) {
            const leftSolid = isStaticWall(g.col - 1, g.row);
            const rightSolid = isStaticWall(g.col + 1, g.row);
            if (leftSolid && !rightSolid) this.hingeSide = -1; 
            else if (rightSolid && !leftSolid) this.hingeSide = 1; 
        }
        else {
            const topSolid = isStaticWall(g.col, g.row - 1);
            const bottomSolid = isStaticWall(g.col, g.row + 1);
            if (topSolid && !bottomSolid) this.hingeSide = -1; 
            else if (bottomSolid && !topSolid) this.hingeSide = 1; 
        }
        this.hingeResolved = true;
    }

    takeDamage(amount) {
        if (!this.active) return;
        this.hp -= amount;
        this.game.particles.emit(this.x, this.y, 'spark');

        if (this.hp <= 0) {
            this.destroyed = true;
            this.active = false;
            this.generateDebris();

            // Clear grid collision
            const startX = this.x - this.width / 2;
            const startY = this.y - this.height / 2;
            const cols = Math.ceil(this.width / 32);
            const rows = Math.ceil(this.height / 32);

            for(let r = 0; r < rows; r++) {
                for(let c = 0; c < cols; c++) {
                    const sampleX = startX + (c * 32) + 16;
                    const sampleY = startY + (r * 32) + 16;
                    const g = this.game.level.toGrid(sampleX, sampleY);
                    if (this.game.level.grid[g.row]) this.game.level.grid[g.row][g.col] = 0;
                }
            }
            for (let i = 0; i < 8; i++) this.game.particles.emit(this.x, this.y, 'spark');
        }
    }

    interact(triggerType, source) {
        if (this.type === 'door' && !this.isOpen && !this.destroyed) {

            if (!this.hingeResolved) this.resolveHinge();

            // --- 1. CALCULATE SWING DIRECTION ---
            // We ALWAYS want to swing away from the source (Player/Enemy).
            // Even if it's a 'CHAIN' reaction, we use the original source (The Kicker) 
            // so double doors split open correctly.
            let swing = Math.PI / 2;

            if (source) {
                if (Math.abs(this.angle) < 0.1) { 
                    // Horizontal Door
                    if (this.hingeSide === -1) {
                        swing = (source.y < this.y) ? Math.PI / 2 : -Math.PI / 2;
                    } else {
                        swing = (source.y < this.y) ? -Math.PI / 2 : Math.PI / 2;
                    }
                } else { 
                    // Vertical Door
                    if (this.hingeSide === -1) {
                        swing = (source.x < this.x) ? -Math.PI / 2 : Math.PI / 2;
                    } else {
                        swing = (source.x < this.x) ? Math.PI / 2 : -Math.PI / 2;
                    }
                }
            } else {
                swing = Math.PI / 2 * -this.hingeSide;
            }

            this.isOpen = true;
            this.active = false; // Disable collision immediately
            this.targetSwing = swing;

            // --- 2. HANDLE SOUND & LOGIC ---
            
            // CASE A: PLAYER KICK
            if (triggerType === 'KICK') {
                this.game.sounds.play('doorSlam', 0.8);
                
                this.game.camera.shake(3, 0.1);
                if (this.game.level.emitNoise) this.game.level.emitNoise(this.x, this.y, 250);

                // Check Breaching (Stun Enemies behind door)
                const dx = this.x - source.x;
                const dy = this.y - source.y;
                const kickAngle = Math.atan2(dy, dx);
                const bx = this.x + Math.cos(kickAngle) * 40;
                const by = this.y + Math.sin(kickAngle) * 40;
                this.game.level.checkBreach(bx, by, 50, source);

                // Chain Reaction: Open Neighbors
                // We use 'CHAIN' type so they don't Slam, but we pass 'source' so they swing away from player
                const neighbors = [
                    { x: this.x + 32, y: this.y }, { x: this.x - 32, y: this.y },
                    { x: this.x, y: this.y + 32 }, { x: this.x, y: this.y - 32 }
                ];
                for (const n of neighbors) {
                    const neighborProp = this.game.level.props.find(p =>
                        p.type === 'door' && !p.isOpen && Math.abs(p.x - n.x) < 10 && Math.abs(p.y - n.y) < 10
                    );
                    if (neighborProp) neighborProp.interact('CHAIN', source);
                }
            } 
            
            // CASE B: AUTOMATIC / CHAIN REACTION
            else if (triggerType === 'CHAIN') {
                this.game.sounds.play('doorOpen', 0.6);
            }
            
            // CASE C: BUMP (Walk into door)
            else {
                if (source === this.game.player) {
                    this.game.sounds.play('doorSlam', 0.8); // Player Bump = Slam
                } else {
                    this.game.sounds.play('doorOpen', 0.6); // Enemy Bump = Open
                }
            }
        }
    }

    draw(ctx) {
        if (this.type === 'door' && !this.hingeResolved) this.resolveHinge();

        if (this.currentSwing !== this.targetSwing) {
            const diff = this.targetSwing - this.currentSwing;
            if (Math.abs(diff) < 0.1) this.currentSwing = this.targetSwing;
            else this.currentSwing += diff * 0.25; 
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const borderColor = '#FFFFFF'; 
        const fillColor = '#000000';   
        ctx.lineWidth = 2;
        ctx.strokeStyle = borderColor;
        ctx.fillStyle = fillColor;

        ctx.translate(this.jitter.x, this.jitter.y);

        if (this.destroyed) {
            for (const d of this.debris) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(d.angle);
                if (d.type === 'rect') {
                    ctx.fillRect(-d.w/2, -d.h/2, d.w, d.h);
                    ctx.strokeRect(-d.w/2, -d.h/2, d.w, d.h);
                } else if (d.type === 'shard') {
                    ctx.beginPath();
                    ctx.moveTo(d.p1.x, d.p1.y); ctx.lineTo(d.p2.x, d.p2.y); ctx.lineTo(d.p3.x, d.p3.y);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                } else if (d.type === 'line') {
                    ctx.beginPath(); ctx.moveTo(-d.len/2, 0); ctx.lineTo(d.len/2, 0); ctx.stroke();
                }
                ctx.restore();
            }
        } else {
            if (this.type === 'destructibleLargeWall') {
                const w = this.width; const h = this.height;
                ctx.fillRect(-w/2, -h/2, w, h); ctx.strokeRect(-w/2, -h/2, w, h);
                if (w > 16 && h > 16) ctx.strokeRect(-w/2 + 6, -h/2 + 6, w - 12, h - 12);
            }
            else if (this.type === 'destructibleSmallWall') {
                const s = 32; const hS = s / 2; 
                ctx.fillRect(-hS, -hS, s, s); ctx.strokeRect(-hS, -hS, s, s);
                ctx.beginPath();
                ctx.moveTo(-hS + this.jitter.x, -hS + this.jitter.y); ctx.lineTo(hS + this.jitter.x, hS + this.jitter.y);
                ctx.moveTo(hS - this.jitter.x, -hS + this.jitter.y); ctx.lineTo(-hS - this.jitter.x, hS + this.jitter.y);
                ctx.stroke();
            }
            else if (this.type === 'door') {
                ctx.translate(16 * this.hingeSide, 0);
                ctx.rotate(this.currentSwing);
                const dir = -this.hingeSide;
                const doorThick = 12; const offset = doorThick / 2;

                ctx.fillRect(0, -offset, 32 * dir, doorThick); 
                ctx.strokeRect(0, -offset, 32 * dir, doorThick);

                ctx.fillStyle = borderColor;
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();

                if (!this.isOpen) {
                    ctx.fillStyle = fillColor; 
                    ctx.beginPath(); ctx.arc(26 * dir, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
}