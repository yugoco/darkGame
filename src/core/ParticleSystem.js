export class ParticleSystem {
    constructor(game) {
        this.game = game;
        this.pool = [];
        this.activeParticles = [];
        this.maxParticles = 100; // Less particles needed now

        // Initialize Pool
        for (let i = 0; i < this.maxParticles; i++) {
            this.pool.push({
                x: 0, y: 0,
                vx: 0, vy: 0,
                life: 0, maxLife: 0,
                size: 0,
                color: '',
                drag: 0.95, 
                type: '',
                active: false
            });
        }
    }

    emit(x, y, type) {
        let count = 0;
        
        if (type === 'spark') count = 8;
        // Dash handling removed (Moved to Level.js sprites)

        for (let i = 0; i < count; i++) {
            if (this.pool.length === 0) return;
            
            const p = this.pool.pop();
            this.resetParticle(p, x, y, type);
            this.activeParticles.push(p);
        }
    }

    resetParticle(p, x, y, type) {
        p.active = true;
        p.x = x;
        p.y = y;
        
        const angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 100 + 50;

        if (type === 'spark') {
            p.color = '#FFFF00'; 
            p.size = Math.random() * 2 + 1;
            p.life = Math.random() * 0.1 + 0.1;
            p.drag = 0.90;
            speed = Math.random() * 300 + 100;
        }

        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.maxLife = p.life;
    }

    update(dt) {
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const p = this.activeParticles[i];
            
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= p.drag;
            p.vy *= p.drag;

            if (p.life <= 0) {
                p.active = false;
                this.pool.push(p);
                this.activeParticles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = 1.0; 

        for (const p of this.activeParticles) {
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
        }
        
        ctx.restore();
    }
}