import { AssetLoader } from './core/AssetLoader.js';
import { Game } from './core/Game.js';

const loader = new AssetLoader();

// Helper to generate paths for different enemy types
const getEnemyAssets = (prefix, folder) => {
    return {
        [`${prefix}Idle`]: `assets/sprites/characters/${folder}/enemy_idle.png`,
        [`${prefix}Run1`]: `assets/sprites/characters/${folder}/enemy_walking_cycle_1.png`,
        [`${prefix}Run2`]: `assets/sprites/characters/${folder}/enemy_walking_cycle_2.png`,
        [`${prefix}Attack`]: `assets/sprites/characters/${folder}/enemy_attack.png`,
        [`${prefix}Knockback1`]: `assets/sprites/characters/${folder}/enemy_knockback_1.png`,
        [`${prefix}Knockback2`]: `assets/sprites/characters/${folder}/enemy_knockback_2.png`,
        [`${prefix}Crawl1`]: `assets/sprites/characters/${folder}/enemy_crawl_cycle_1.png`,
        [`${prefix}Crawl2`]: `assets/sprites/characters/${folder}/enemy_crawl_cycle_3.png`,
        [`${prefix}Crowbar`]: `assets/sprites/characters/${folder}/enemy_crowbar.png`
    };
};

const assetsToLoad = {
    // --- UI ---
    welcome: 'assets/UI/welcome.png',
    youdied: 'assets/UI/DIED.png',

    // --- PLAYER ---
    playerIdle: 'assets/sprites/characters/HammerJane_idle.png',
    playerDead: 'assets/sprites/characters/HammerJane_dead.png',
    playerHead: 'assets/sprites/characters/HammerJane_head.png',
    hammer: 'assets/sprites/characters/hammer.png',

    // --- PLAYER (Hub / Free) ---
    playerIdleFree: 'assets/sprites/characters/HammerJane_idle_free.png',
    playerWalkFree1: 'assets/sprites/characters/HammerJane_walking_cycle/walking_cycle_free1.png',
    playerWalkFree2: 'assets/sprites/characters/HammerJane_walking_cycle/walking_cycle_free2.png',
    
    // --- LEVEL ASSETS ---
    level00:  'assets/levels/level_00.png',
    level01A: 'assets/levels/level_01A.png',
    level01B: 'assets/levels/level_01B.png',
    level01C: 'assets/levels/level_01C.png',
    level01D: 'assets/levels/level_01D.png',
    level02A: 'assets/levels/level_02A.png',
    level02B: 'assets/levels/level_02B.png',
    level1: 'assets/levels/level_01.png',

    // --- ENVIRONMENT ---
    broken_floor_tile: 'assets/sprites/environment/broken_floor_tile_large.png',

    // --- PLAYER ACTIONS ---
    playerDashJump: 'assets/sprites/characters/HammerJane_overhead1.png',
    playerDashPrep: 'assets/sprites/characters/HammerJane_overhead2.png',
    playerSlam: 'assets/sprites/characters/HammerJane_slam.png',
    playerKick: 'assets/sprites/characters/HammerJane_kick.png',
   // playerParry2: 'assets/sprites/characters/HammerJane_block2.png',

    // --- DASH FX ---
    dash1: 'assets/sprites/fx/dash/frame1.png',
    dash2: 'assets/sprites/fx/dash/frame2.png',
    dash3: 'assets/sprites/fx/dash/frame3.png',
    dash4: 'assets/sprites/fx/dash/frame4.png',
    dash5: 'assets/sprites/fx/dash/frame5.png',
    dash6: 'assets/sprites/fx/dash/frame6.png',

    // --- HIT DUST FX ---
    hitDust1: 'assets/sprites/fx/hit/hit_dust_1.png',
    hitDust2: 'assets/sprites/fx/hit/hit_dust_2.png',
    hitDust3: 'assets/sprites/fx/hit/hit_dust_3.png',
    hitDust4: 'assets/sprites/fx/hit/hit_dust_4.png',
    hitDust5: 'assets/sprites/fx/hit/hit_dust_5.png',
    hitDust6: 'assets/sprites/fx/hit/hit_dust_6.png',

    // --- ENEMY 1: SENTRY (Default Folder) ---
    ...getEnemyAssets('enemy', 'Enemy'),

    // --- ENEMY 2: GUARD (New Folder) ---
    ...getEnemyAssets('guard', 'Enemy_Guard'),

    // --- ENEMY 3: ROAMER (New Folder) ---
    ...getEnemyAssets('roamer', 'Enemy_Roamer'),

    // --- SHARED DEAD SPRITES (Randomized) ---
    // Note: enemy_dead.png is mapped to enemyDead1 for consistency
    enemyDead1: 'assets/sprites/characters/Enemy/enemy_dead.png',
    enemyDead2: 'assets/sprites/characters/Enemy/enemy_dead2.png',
    enemyDead3: 'assets/sprites/characters/Enemy/enemy_dead3.png',
    enemyDead4: 'assets/sprites/characters/Enemy/enemy_dead4.png',
    enemyDead5: 'assets/sprites/characters/Enemy/enemy_dead5.png',
};

// --- WALKING CYCLE LOOP ---
for (let i = 1; i <= 2; i++) {
    assetsToLoad[`playerWalk${i}`] = `assets/sprites/characters/HammerJane_walking_cycle/walking_cycle_new${i}.png`;
}

// --- SOUNDS ---
const soundsToLoad = {
    bloodSmallSplat: 'assets/sounds/bloodSmallSplat.mp3',
    bloodSplat: 'assets/sounds/bloodSplat.mp3',
    breakingConcrete: 'assets/sounds/breakingConcrete.wav',
    crushedEnemy: 'assets/sounds/crushedEnemy.mp3',
    doorOpen: 'assets/sounds/doorOpen.mp3',
    doorSlam: 'assets/sounds/doorSlam.mp3',
    execution: 'assets/sounds/execution.mp3',
    heavyHit: 'assets/sounds/heavyHit.mp3',
    knickedEnemy: 'assets/sounds/knickedEnemy.mp3',
    deadPlayer: 'assets/sounds/deadPlayer.mp3',
    hittingCrowbar: 'assets/sounds/hittingCrowbar.wav',
    enemyGotYou: 'assets/sounds/enemyGotYou.mp3'
};

// --- MUSIC ---
const musicToRegister = {
    'music_menu': 'assets/music/_Menu - Fractured Core.mp3',
    'music_0': 'assets/music/0 - Fuse.mp3',
    'music_1': 'assets/music/1 - Hydraulic.mp3',
    'music_2': 'assets/music/2 - Concrete Pressure Dream.mp3',
    'music_3': 'assets/music/3 - PISTON.mp3',
    'music_4': 'assets/music/4 - Factory Cathedral.mp3',
    'music_5': 'assets/music/5 - Corroded.mp3',
    'music_6': 'assets/music/6 - Monolith.mp3',
    'music_7': 'assets/music/7 - Wired & Circuits.mp3',
    'music_8': 'assets/music/8 - Solid.mp3',
    'music_9': 'assets/music/9 - Clock In.mp3',
    'music_10': 'assets/music/10 - Gasoil.mp3',
    'music_11': 'assets/music/11 - Corrosive.mp3',
    'music_12': 'assets/music/12 - Night Shift Circuit.mp3',
    'music_13': 'assets/music/13 - Concrete Static Relay.mp3',
    'music_14': 'assets/music/14 - Lungs.mp3',
    'music_15': 'assets/music/15 - Night Circuit Swagger.mp3',
    'music_16': 'assets/music/16 - Brainrot.mp3',
    'music_17': 'assets/music/17 - Parameters.mp3',
    'music_18': 'assets/music/18 - Brutal.mp3',
    'music_19': 'assets/music/19 - Rust.mp3'
};

loader.loadImages(assetsToLoad).then(async () => {
    const game = new Game(800, 600);
    game.assets = loader; 
    
    await game.sounds.load(soundsToLoad);
    game.sounds.loadMusic(musicToRegister);

    window.game = game; 
    console.log("Dark Fantasy Protocol: Assets & Sounds Loaded");
    game.start();
}).catch(error => {
    console.error("Asset Load Failed:", error);
});