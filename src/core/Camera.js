export class Camera {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        
        // Public Render Coordinates
        this.x = 0;
        this.y = 0;

        // Internal Tracking Coordinates
        this._trackX = 0;
        this._trackY = 0;

        this.shakeTimer = 0;
        this.shakeIntensity = 0;

        // --- CONFIGURATION ---
        this.deadZone = 0.45; 
        this.panAmplitude = 220; 
        this.smoothing = 0.05; 
        
        this.initialized = false;
    }

    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    snap(target) {
        const tx = target.x - this.width / 2;
        const ty = target.y - this.height / 2;

        // 1. Set Render Coordinates
        this.x = tx;
        this.y = ty;

        // 2. RESET INTERNAL TRACKER
        // This stops the camera from "remembering" the old position
        // and trying to smooth-pan from there.
        this._trackX = tx;
        this._trackY = ty;
    }

    update(target, deltaTime, mouse) {
        // 1. INITIALIZE
        let targetX = target.x - this.width / 2;
        let targetY = target.y - this.height / 2;

        if (!this.initialized) {
            this._trackX = targetX;
            this._trackY = targetY;
            this.x = targetX;
            this.y = targetY;
            this.initialized = true;
        }

        // 2. CALCULATE NORMALIZED OFFSET
        if (mouse) {
            const centerX = this.width / 2;
            const centerY = this.height / 2;

            const nX = (mouse.x - centerX) / centerX;
            const nY = (mouse.y - centerY) / centerY;
            
            const nDist = Math.sqrt(nX * nX + nY * nY);

            if (nDist > this.deadZone) {
                const nExcess = nDist - this.deadZone;
                const dirX = nX / nDist;
                const dirY = nY / nDist;

                targetX += dirX * nExcess * this.panAmplitude;
                targetY += dirY * nExcess * this.panAmplitude;
            }
        }

        // 3. SMOOTH MOVEMENT (Internal Physics)
        this._trackX += (targetX - this._trackX) * this.smoothing;
        this._trackY += (targetY - this._trackY) * this.smoothing;

        // 4. APPLY SHAKE (Visual Only)
        let shakeX = 0;
        let shakeY = 0;

        if (this.shakeTimer > 0) {
            const dt = deltaTime / 1000;
            this.shakeTimer -= dt;
            shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
        }

        this.x = this._trackX + shakeX;
        this.y = this._trackY + shakeY;
    }
}