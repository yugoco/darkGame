export class AssetLoader {
    constructor() {
        this.assets = {};
        this.pixelMaps = {}; 
    }

    loadImages(imagePaths) {
        const promises = [];
        for (const [key, path] of Object.entries(imagePaths)) {
            promises.push(new Promise((resolve) => {
                const img = new Image();
                img.src = path;
                img.onload = () => {
                    this.assets[key] = img;
                    // Extract collision data immediately for hitboxes
                    if (key === 'attackHitbox') {
                        this._extractPixelData(key, img);
                    }
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${path}`);
                    resolve(); 
                }; 
            }));
        }
        return Promise.all(promises);
    }

    _extractPixelData(key, img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        this.pixelMaps[key] = {
            data: ctx.getImageData(0, 0, img.width, img.height).data,
            width: img.width,
            height: img.height
        };
    }

    getImage(key) { return this.assets[key]; }
    getPixelMap(key) { return this.pixelMaps[key]; }
}