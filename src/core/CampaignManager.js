export class CampaignManager {
    constructor() {
        this.storageKey = 'DFP_SAVE_v1'; 

        // The Master Narrative Flow
        // Note: 'level00' appears twice because we return to the Hub.
        // We save the 'index', so the game knows WHICH visit to the Hub it is.
        this.missionFlow = [
            'level00',   // Start: The Hub
            'level01A', 
            'level01B',
            'level01C',
            'level01D',
            'level00',   
            'level02A',
            'level02B'
        ];

        this.currentIndex = 0;
        this.loadProgress();
    }

    getCurrentLevelID() {
        if (this.currentIndex >= this.missionFlow.length) {
            this.currentIndex = 0; // Loop back or handle End Game
        }
        return this.missionFlow[this.currentIndex];
    }

    completeLevel() {
        this.currentIndex++;
        // If finished 02A, loop back to start for now
        if (this.currentIndex >= this.missionFlow.length) {
            this.currentIndex = 0; 
        }
        this.saveProgress();
    }

    saveProgress() {
        const data = {
            index: this.currentIndex,
            timestamp: Date.now()
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        console.log(`[Campaign] Progress Saved. Next Level Index: ${this.currentIndex} (${this.getCurrentLevelID()})`);
    }

    loadProgress() {
        const data = localStorage.getItem(this.storageKey);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.currentIndex = parsed.index || 0;
                console.log(`[Campaign] Loaded Save. Starting at Index: ${this.currentIndex}`);
            } catch (e) {
                console.warn("[Campaign] Save file corrupted. Resetting.");
                this.resetProgress();
            }
        } else {
            console.log("[Campaign] No save found. Starting fresh.");
        }
    }

    resetProgress() {
        this.currentIndex = 0;
        this.saveProgress();
        console.log("[Campaign] Progress Reset.");
    }
}