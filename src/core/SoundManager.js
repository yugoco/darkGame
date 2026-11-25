export class SoundManager {
    constructor() {
        // --- SFX SYSTEM (Web Audio API) ---
        this.buffers = {};
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContext({ latencyHint: 'interactive' });

        // --- MUSIC SYSTEM (HTML5 Streaming) ---
        this.musicPaths = {};
        this.currentMusic = null;
        this.currentMusicKey = null;
        this.musicVolume = 0.4; // Default music volume (40%)
    }

    // 1. SFX LOADER (Pre-decodes into RAM for instant playback)
    async load(soundMap) {
        const promises = [];
        for (const [key, path] of Object.entries(soundMap)) {
            promises.push(this._loadSound(key, path));
        }
        await Promise.all(promises);
        console.log("Audio System: SFX loaded.");
    }

    async _loadSound(key, path) {
        try {
            const response = await fetch(path);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            this.buffers[key] = audioBuffer;
        } catch (e) {
            console.error(`Failed to load sound: ${key}`, e);
        }
    }

    // 2. MUSIC REGISTRY (Just stores paths, doesn't load yet)
    loadMusic(musicMap) {
        this.musicPaths = musicMap;
        console.log("Audio System: Music paths registered.");
    }

    // 3. SFX PLAYER
    play(key, volume = 1.0, pitchVariation = 0.1) {
        const buffer = this.buffers[key];
        if (!buffer) return;

        // Resume context if browser suspended it (common Chrome policy)
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        // Apply Pitch Variation (Randomness makes it feel organic)
        if (pitchVariation > 0) {
            const detune = (Math.random() * pitchVariation * 2) - pitchVariation;
            source.playbackRate.value = 1.0 + detune; 
        }

        const gainNode = this.context.createGain();
        gainNode.gain.value = Math.max(0, Math.min(1, volume));

        source.connect(gainNode);
        gainNode.connect(this.context.destination);

        source.start(0);
    }

    // 4. MUSIC PLAYER (Streaming)
    playMusic(key) {
        // PERISTENCE CHECK: If the song is already playing, DO NOTHING.
        // This allows moving from 01A -> 01B without restarting the track.
        if (this.currentMusicKey === key) return;

        // Stop previous track
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
        }

        const path = this.musicPaths[key];
        if (!path) {
            console.warn(`Music track not found: ${key}`);
            this.currentMusicKey = null;
            return;
        }

        // Start new track
        this.currentMusic = new Audio(path);
        this.currentMusic.loop = true;
        this.currentMusic.volume = this.musicVolume;
        
        const playPromise = this.currentMusic.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Music autoplay blocked. Waiting for interaction.");
            });
        }

        this.currentMusicKey = key;
        console.log(`Now Playing: ${key}`);
    }

    // --- NEW: Helper to force-start audio on user click ---
    unlockBrowserAudio() {
        // 1. Resume Web Audio API (SFX)
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
        
        // 2. Resume Music (if it was blocked)
        if (this.currentMusic && this.currentMusic.paused) {
            this.currentMusic.play().catch(e => console.warn("Still blocked", e));
        }
    }

    stopMusic() {
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic = null;
            this.currentMusicKey = null;
        }
    }
}