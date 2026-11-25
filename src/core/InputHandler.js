export class InputHandler {
    constructor(canvas) {
        this.canvas = canvas;

        // Mouse State
        this.mouse = {
            x: 0,
            y: 0,
            leftDown: false,
            rightDown: false
        };

        // Event Flags
        this.dashTriggered = false; 
        this.attackTriggered = false;
        
        // Keyboard State
        this.keys = {}; 

        // Timing for double-click detection
        this.lastClickTime = 0;
        this.doubleClickDelay = 250; 

        this._initListeners();
    }

    // Translates screen coordinates (mouse) to world coordinates (game space)
    getWorldMouse(camera) {
        return {
            x: this.mouse.x + camera.x,
            y: this.mouse.y + camera.y
        };
    }

    _initListeners() {
        // Track Mouse Position
        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        // Handle Mouse Down
        window.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;

            if (e.button === 0) { // Left Click
                const currentTime = Date.now();
                if (currentTime - this.lastClickTime < this.doubleClickDelay) {
                    this.dashTriggered = true; 
                    this.mouse.leftDown = false; 
                } else {
                    this.mouse.leftDown = true;
                }
                this.lastClickTime = currentTime;
            }
            else if (e.button === 2) { // Right Click
                this.mouse.rightDown = true;
                this.attackTriggered = true;
            }
        });

        // Handle Mouse Up
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.leftDown = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });

        // Keyboard Listeners
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Backup dash on Spacebar
            if (e.code === 'Space') this.dashTriggered = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
}