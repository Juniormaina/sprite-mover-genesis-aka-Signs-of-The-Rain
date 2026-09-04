import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// SIGNS OF THE RAIN — Savanna Foundation (top-down 2D exploration)
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

const WORLD_W = 1600;
const WORLD_H = 1200;
const MOVE_SPEED = 200;
const ACCEL = 1400;
const FRICTION = 0.86;
const SPAWN_X = 600;
const SPAWN_Y = 450;

export const COLORS = {
    GRASS_A: 0xd9a05b,
    GRASS_B: 0xc48d48,
    DIRT: 0x8d5b2d,
    DIRT_DARK: 0x78491f,
    CLAY: 0xb57c48,
    WATER: 0x2b7a9e,
    WATER_LIGHT: 0x48a6c8,
    FOLIAGE: 0x4d6e37,
    FOLIAGE_DARK: 0x395526,
    TRUNK: 0x593c20,
    BOULDER: 0x696259,
    MOUND: 0xa04e2a,
} as const;

// Event-name constants shared with App.tsx so the two sides can't drift.
export const EVT_SCENE_READY = 'current-scene-ready';
export const EVT_PHASE_CHANGED = 'phase-changed';
export const EVT_CHARACTER_POS = 'character-pos';
export const EVT_TOGGLE_PAUSE = 'toggle-pause';
export const EVT_RESET_CHARACTER = 'reset-character';
export const EVT_SET_TOUCH_DIR = 'set-touch-dir';

export const EventBus = new Phaser.Events.EventEmitter();

const StartGame = (parent: string) => {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent,
        backgroundColor: '#caa061',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
            default: 'arcade',
            arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [Game],
    };

    const game = new Phaser.Game(config);
    if (typeof window !== 'undefined') {
        (window as any).__PHASER_GAME__ = game;
        (window as any).__PHASER_EVENT_BUS__ = EventBus;
    }
    return game;
};

// ---------------------------------------------------------------------------
// THE GAME SCENE — top-down savanna exploration.
// ---------------------------------------------------------------------------
export class Game extends Phaser.Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private solids!: Phaser.Physics.Arcade.StaticGroup;
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private touchDir = { x: 0, y: 0 };
    private paused = false;
    private telemetryTick = 0;
    private lastHeading = 'south';
    private ripples: Phaser.GameObjects.Image[] = [];

    constructor() {
        super('Game');
    }

    preload() {
        const ws = 'assets/2D-assets/Tiny_Swords/Tiny Swords (Free Pack)/Units/Blue Units/Warrior';
        this.load.spritesheet('player_warrior', `${ws}/Warrior_Idle.png`, { frameWidth: 192, frameHeight: 192 });
        this.load.spritesheet('player_run', `${ws}/Warrior_Run.png`, { frameWidth: 192, frameHeight: 192 });
        this.load.audio('bgm_savanna', 'assets/audio/bgm_chill.mp3');
        this.load.audio('sfx_step', 'assets/audio/sfx_jump.mp3');
    }

    // ---- procedural texture helpers --------------------------------------
    private makeTexture(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
        if (this.textures.exists(key)) return;
        const g = this.add.graphics();
        draw(g);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    private buildTextures() {
        // grass tuft
        this.makeTexture('tuft', 16, 14, (g) => {
            g.lineStyle(2, COLORS.FOLIAGE_DARK, 1);
            for (let i = 0; i < 4; i++) {
                const x = 3 + i * 3;
                g.beginPath();
                g.moveTo(x, 14);
                g.lineTo(x + (i % 2 === 0 ? 1 : -1), 3 + (i % 3) * 2);
                g.strokePath();
            }
        });
        // shrub
        this.makeTexture('shrub', 34, 26, (g) => {
            g.fillStyle(COLORS.FOLIAGE_DARK, 1);
            g.fillEllipse(17, 18, 30, 14);
            g.fillStyle(COLORS.FOLIAGE, 1);
            g.fillCircle(10, 14, 9);
            g.fillCircle(22, 13, 10);
            g.fillCircle(16, 9, 8);
            g.fillStyle(0x5f8342, 1);
            g.fillCircle(14, 8, 4);
        });
        // boulder
        this.makeTexture('boulder', 56, 44, (g) => {
            g.fillStyle(0x544e46, 1);
            g.fillEllipse(28, 30, 52, 24);
            g.fillStyle(COLORS.BOULDER, 1);
            g.fillEllipse(24, 22, 40, 30);
            g.fillStyle(0x7d766c, 1);
            g.fillEllipse(20, 18, 26, 18);
            g.lineStyle(2, 0x4a453e, 1);
            g.beginPath();
            g.moveTo(14, 26);
            g.lineTo(26, 22);
            g.lineTo(34, 30);
            g.strokePath();
        });
        // termite mound
        this.makeTexture('mound', 60, 56, (g) => {
            g.fillStyle(0x7d3a1e, 1);
            g.fillEllipse(30, 46, 56, 18);
            g.fillStyle(COLORS.MOUND, 1);
            g.fillTriangle(30, 6, 6, 48, 54, 48);
            g.fillStyle(0xb85f33, 1);
            g.fillTriangle(30, 12, 18, 46, 42, 46);
            g.fillStyle(0x6e3319, 1);
            g.fillCircle(24, 36, 3);
            g.fillCircle(36, 30, 2.5);
        });
        // acacia (trunk + flat canopy) — large, depth sorted by y
        this.makeTexture('acacia', 200, 180, (g) => {
            // canopy shadow
            g.fillStyle(0x000000, 0.12);
            g.fillEllipse(100, 168, 150, 26);
            // trunk
            g.fillStyle(COLORS.TRUNK, 1);
            g.fillTriangle(92, 168, 108, 168, 100, 70);
            g.fillRect(96, 60, 8, 30);
            g.lineStyle(5, 0x4a3119, 1);
            g.beginPath(); g.moveTo(100, 78); g.lineTo(64, 60); g.strokePath();
            g.beginPath(); g.moveTo(100, 78); g.lineTo(140, 60); g.strokePath();
            // flat-topped canopy layers
            g.fillStyle(COLORS.FOLIAGE_DARK, 1);
            g.fillEllipse(100, 58, 176, 52);
            g.fillStyle(COLORS.FOLIAGE, 1);
            g.fillEllipse(100, 50, 168, 44);
            g.fillStyle(0x5f8342, 1);
            g.fillEllipse(78, 46, 70, 26);
            g.fillEllipse(128, 48, 66, 24);
            g.fillStyle(0x6f9749, 1);
            g.fillEllipse(100, 42, 90, 22);
        });
        // baobab — stout trunk, small high canopy
        this.makeTexture('baobab', 170, 200, (g) => {
            g.fillStyle(0x000000, 0.12);
            g.fillEllipse(85, 188, 120, 24);
            // fat trunk
            g.fillStyle(0x6b4a2a, 1);
            g.fillRoundedRect(52, 70, 66, 118, 26);
            g.fillStyle(COLORS.TRUNK, 1);
            g.fillRoundedRect(60, 74, 50, 112, 22);
            g.lineStyle(3, 0x4a3119, 0.7);
            g.beginPath(); g.moveTo(74, 90); g.lineTo(74, 170); g.strokePath();
            g.beginPath(); g.moveTo(96, 96); g.lineTo(96, 168); g.strokePath();
            // branch stubs
            g.lineStyle(9, 0x5e3f22, 1);
            g.beginPath(); g.moveTo(85, 80); g.lineTo(46, 56); g.strokePath();
            g.beginPath(); g.moveTo(85, 80); g.lineTo(126, 54); g.strokePath();
            g.beginPath(); g.moveTo(85, 78); g.lineTo(85, 44); g.strokePath();
            // sparse canopy
            g.fillStyle(COLORS.FOLIAGE_DARK, 1);
            g.fillEllipse(85, 40, 120, 34);
            g.fillStyle(COLORS.FOLIAGE, 1);
            g.fillEllipse(60, 36, 44, 22);
            g.fillEllipse(112, 36, 46, 22);
            g.fillEllipse(86, 30, 50, 24);
        });
        // campfire ring
        this.makeTexture('campfire', 48, 40, (g) => {
            g.fillStyle(0x6e6a63, 1);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                g.fillCircle(24 + Math.cos(a) * 18, 20 + Math.sin(a) * 14, 5);
            }
            g.fillStyle(0x3a2a1a, 1);
            g.fillEllipse(24, 20, 26, 18);
            g.lineStyle(4, COLORS.TRUNK, 1);
            g.beginPath(); g.moveTo(14, 26); g.lineTo(34, 16); g.strokePath();
            g.beginPath(); g.moveTo(14, 16); g.lineTo(34, 26); g.strokePath();
            g.fillStyle(0xff8a3c, 1);
            g.fillTriangle(24, 6, 18, 22, 30, 22);
            g.fillStyle(0xffd24a, 1);
            g.fillTriangle(24, 12, 21, 22, 27, 22);
        });
        // tent
        this.makeTexture('tent', 76, 64, (g) => {
            g.fillStyle(0x000000, 0.12);
            g.fillEllipse(38, 58, 70, 14);
            g.fillStyle(0xc9b48a, 1);
            g.fillTriangle(38, 6, 6, 58, 70, 58);
            g.fillStyle(0xa8926a, 1);
            g.fillTriangle(38, 6, 38, 58, 70, 58);
            g.fillStyle(0x5c4a30, 1);
            g.fillTriangle(38, 26, 28, 58, 48, 58);
            g.lineStyle(3, 0x7a6242, 1);
            g.beginPath(); g.moveTo(38, 6); g.lineTo(38, 26); g.strokePath();
        });
        // explorer flag
        this.makeTexture('flag', 30, 58, (g) => {
            g.fillStyle(0x000000, 0.12);
            g.fillEllipse(12, 54, 22, 8);
            g.fillStyle(0xe8e2d4, 1);
            g.fillRect(10, 4, 4, 50);
            g.fillStyle(0xd94f30, 1);
            g.fillTriangle(14, 6, 14, 24, 30, 15);
        });
        // ripple ring (for water shimmer)
        this.makeTexture('ripple', 48, 48, (g) => {
            g.lineStyle(3, 0xbfeaf5, 0.9);
            g.strokeCircle(24, 24, 20);
        });
        // reed clump
        this.makeTexture('reed', 24, 30, (g) => {
            g.lineStyle(2, 0x4f6b34, 1);
            for (let i = 0; i < 5; i++) {
                const x = 4 + i * 4;
                const lean = i % 2 ? 6 : -6;
                g.beginPath();
                g.moveTo(x, 30);
                g.lineTo(x + lean * 0.4, 16);
                g.lineTo(x + lean, 2);
                g.strokePath();
            }
        });
    }

    // ---- ground painting --------------------------------------------------
    private paintGround() {
        const ground = this.add.graphics().setDepth(-20);
        // base grass
        ground.fillStyle(COLORS.GRASS_A, 1);
        ground.fillRect(0, 0, WORLD_W, WORLD_H);
        // mottled grass patches
        for (let i = 0; i < 140; i++) {
            const x = Phaser.Math.Between(0, WORLD_W);
            const y = Phaser.Math.Between(0, WORLD_H);
            ground.fillStyle(i % 2 ? COLORS.GRASS_B : 0xe0ac68, Phaser.Math.FloatBetween(0.25, 0.55));
            ground.fillEllipse(x, y, Phaser.Math.Between(40, 130), Phaser.Math.Between(24, 70));
        }
        // cracked clay patches
        for (let i = 0; i < 26; i++) {
            const x = Phaser.Math.Between(0, WORLD_W);
            const y = Phaser.Math.Between(0, WORLD_H);
            ground.fillStyle(COLORS.CLAY, Phaser.Math.FloatBetween(0.3, 0.5));
            ground.fillEllipse(x, y, Phaser.Math.Between(60, 150), Phaser.Math.Between(40, 90));
            ground.lineStyle(1, 0x8a5a30, 0.5);
            ground.beginPath();
            ground.moveTo(x - 18, y);
            ground.lineTo(x + 18, y + 8);
            ground.moveTo(x, y - 12);
            ground.lineTo(x + 4, y + 14);
            ground.strokePath();
        }
        // winding dirt trails
        const trails: number[][] = [
            [600, 450, 780, 560, 960, 620, 1180, 640, 1380, 720],
            [600, 450, 520, 360, 430, 320, 380, 240],
            [600, 450, 640, 640, 600, 820, 700, 1000, 860, 1120],
            [600, 450, 420, 470, 240, 520, 120, 700],
            [960, 620, 1040, 420, 1180, 260, 1360, 200],
        ];
        for (const pts of trails) {
            for (let w = 0; w < 3; w++) {
                ground.lineStyle(46 - w * 12, w === 0 ? COLORS.DIRT_DARK : COLORS.DIRT, w === 0 ? 0.5 : 0.85);
                ground.beginPath();
                ground.moveTo(pts[0], pts[1]);
                for (let i = 2; i < pts.length; i += 2) {
                    const cx = pts[i - 2] + (pts[i] - pts[i - 2]) / 2;
                    const cy = pts[i - 1] + (pts[i + 1] - pts[i - 1]) / 2;
                    ground.lineTo(cx, cy);
                }
                ground.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
                ground.strokePath();
            }
        }
    }

    private buildWaterhole() {
        const cx = 400, cy = 300;
        const water = this.add.graphics().setDepth(-15);
        // wet sand fringe
        water.fillStyle(0xb98d55, 1);
        water.fillEllipse(cx, cy, 380, 300);
        // shore
        water.fillStyle(0xd8b06a, 1);
        water.fillEllipse(cx, cy, 340, 260);
        // water body
        water.fillStyle(COLORS.WATER, 1);
        water.fillEllipse(cx, cy, 300, 220);
        water.fillStyle(COLORS.WATER_LIGHT, 0.9);
        water.fillEllipse(cx - 20, cy - 16, 220, 150);
        water.fillStyle(0x6fc4dd, 0.7);
        water.fillEllipse(cx - 40, cy - 30, 120, 60);

        // shimmering ripple rings (tweened)
        for (let i = 0; i < 4; i++) {
            const r = this.add.image(cx + Phaser.Math.Between(-60, 60), cy + Phaser.Math.Between(-40, 40), 'ripple')
                .setDepth(-14)
                .setScale(0.4);
            this.ripples.push(r);
            this.tweens.add({
                targets: r,
                scale: { from: 0.4, to: 3.2 },
                alpha: { from: 0.9, to: 0 },
                duration: 2600 + i * 500,
                delay: i * 700,
                repeat: -1,
                ease: 'Sine.easeOut',
            });
        }

        // reeds around the shore
        const reedAngles = [0.3, 1.1, 2.2, 2.9, 3.7, 4.6, 5.5];
        for (const a of reedAngles) {
            const rx = cx + Math.cos(a) * Phaser.Math.Between(150, 175);
            const ry = cy + Math.sin(a) * Phaser.Math.Between(100, 125);
            this.add.image(rx, ry, 'reed').setDepth(ry).setScale(Phaser.Math.FloatBetween(0.8, 1.3));
        }
    }

    private addTree(x: number, y: number, key: string, scale: number, trunkR: number) {
        const img = this.add.image(x, y, key).setOrigin(0.5, 0.94).setScale(scale);
        img.setDepth(y);
        // invisible collider at trunk base
        const body = this.solids.create(x, y - 6 * scale, undefined) as Phaser.Physics.Arcade.Sprite;
        body.setVisible(false);
        (body.body as Phaser.Physics.Arcade.StaticBody).setSize(trunkR * 2, trunkR * 1.4);
        body.refreshBody();
    }

    private addProp(x: number, y: number, key: string, scale: number, collW: number, collH: number) {
        const img = this.add.image(x, y, key).setDepth(y);
        img.setScale(scale);
        const body = this.solids.create(x, y, undefined) as Phaser.Physics.Arcade.Sprite;
        body.setVisible(false);
        (body.body as Phaser.Physics.Arcade.StaticBody).setSize(collW, collH);
        body.refreshBody();
        return img;
    }

    create() {
        if (!this.anims.exists('warrior_idle')) {
            this.anims.create({
                key: 'warrior_idle',
                frames: this.anims.generateFrameNumbers('player_warrior', { start: 0, end: 7 }),
                frameRate: 8,
                repeat: -1,
            });
        }
        if (!this.anims.exists('warrior_run')) {
            this.anims.create({
                key: 'warrior_run',
                frames: this.anims.generateFrameNumbers('player_run', { start: 0, end: 5 }),
                frameRate: 10,
                repeat: -1,
            });
        }
        this.buildTextures();
        this.paintGround();
        this.buildWaterhole();

        // grass tufts scattered
        const decor = this.add.graphics().setDepth(-12);
        for (let i = 0; i < 220; i++) {
            const x = Phaser.Math.Between(0, WORLD_W);
            const y = Phaser.Math.Between(0, WORLD_H);
            const d = this.add.image(x, y, 'tuft').setDepth(y).setScale(Phaser.Math.FloatBetween(0.6, 1.2));
            d.setTint(i % 3 ? 0xffffff : 0xc8a86a);
        }
        void decor;

        // static collider group
        this.solids = this.physics.add.staticGroup();

        // acacia trees + baobabs
        const trees: Array<[number, number, string, number, number]> = [
            [820, 220, 'acacia', 1.0, 16],
            [1180, 320, 'acacia', 1.15, 18],
            [1380, 560, 'baobab', 1.0, 26],
            [980, 760, 'acacia', 0.95, 15],
            [1240, 940, 'acacia', 1.2, 18],
            [300, 760, 'baobab', 1.1, 28],
            [520, 980, 'acacia', 1.0, 16],
            [180, 980, 'acacia', 0.85, 14],
            [1420, 1040, 'baobab', 0.95, 24],
            [720, 120, 'acacia', 0.8, 13],
            [1080, 560, 'acacia', 0.7, 12],
        ];
        for (const [x, y, key, s, tr] of trees) this.addTree(x, y, key, s, tr);

        // boulders & termite mounds
        this.addProp(680, 300, 'boulder', 1.0, 40, 22);
        this.addProp(1050, 200, 'boulder', 0.8, 34, 18);
        this.addProp(1320, 760, 'boulder', 1.1, 44, 24);
        this.addProp(420, 640, 'boulder', 0.9, 36, 20);
        this.addProp(880, 1080, 'mound', 1.0, 40, 22);
        this.addProp(220, 420, 'mound', 0.85, 34, 18);
        this.addProp(1180, 700, 'mound', 1.1, 44, 24);
        this.addProp(560, 760, 'mound', 0.8, 32, 16);

        // shrubs (non-colliding decor)
        for (let i = 0; i < 26; i++) {
            const x = Phaser.Math.Between(40, WORLD_W - 40);
            const y = Phaser.Math.Between(40, WORLD_H - 40);
            this.add.image(x, y, 'shrub').setDepth(y).setScale(Phaser.Math.FloatBetween(0.7, 1.3));
        }

        // base camp at (600, 450)
        this.add.image(600, 470, 'campfire').setDepth(470);
        this.add.image(540, 430, 'tent').setDepth(430);
        this.add.image(660, 432, 'tent').setDepth(432).setFlipX(true).setScale(0.85);
        this.add.image(628, 410, 'flag').setOrigin(0.5, 0.96).setDepth(410);
        // bedroll markers
        const bed = this.add.graphics().setDepth(440);
        bed.fillStyle(0x8a5a30, 1); bed.fillRoundedRect(556, 492, 34, 14, 6);
        bed.fillStyle(0xd9c08a, 1); bed.fillRoundedRect(560, 494, 26, 10, 4);

        // ---- Player ----
        this.player = this.physics.add.sprite(SPAWN_X, SPAWN_Y, 'player_warrior');
        this.player.setScale(0.42);
        this.player.setOrigin(0.5, 0.72);
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setSize(46, 34);
        body.setOffset(73, 100);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(SPAWN_Y);
        this.player.play('warrior_idle');

        this.physics.add.collider(this.player, this.solids);

        // ---- Camera ----
        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setBackgroundColor('#caa061');

        // ---- Input ----
        this.keys = this.input.keyboard!.addKeys('W,A,S,D,R,P,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.input.keyboard!.on('keydown-R', () => this.resetCharacter());
        this.input.keyboard!.on('keydown-P', () => this.togglePause());
        this.input.keyboard!.on('keydown-ESC', () => this.togglePause());

        // ---- React -> Scene commands ----
        EventBus.on(EVT_TOGGLE_PAUSE, this.togglePause, this);
        EventBus.on(EVT_RESET_CHARACTER, this.resetCharacter, this);
        EventBus.on(EVT_SET_TOUCH_DIR, this.onTouchDir, this);

        // ---- Audio ----
        if (this.cache.audio.exists('bgm_savanna')) {
            const bgm = this.sound.add('bgm_savanna', { loop: true, volume: 0.35 });
            bgm.play();
        }

        EventBus.emit(EVT_PHASE_CHANGED, 'PLAYING');
        EventBus.emit(EVT_SCENE_READY, this);

        this.events.once('shutdown', () => {
            this.time.removeAllEvents();
            this.tweens.killAll();
            this.input.keyboard?.removeAllListeners();
            this.sound.stopAll();
            EventBus.off(EVT_TOGGLE_PAUSE, this.togglePause, this);
            EventBus.off(EVT_RESET_CHARACTER, this.resetCharacter, this);
            EventBus.off(EVT_SET_TOUCH_DIR, this.onTouchDir, this);
        });
    }

    private onTouchDir(payload: { x: number; y: number }) {
        if (!payload) return;
        const x = typeof payload.x === 'number' ? Math.max(-1, Math.min(1, payload.x)) : 0;
        const y = typeof payload.y === 'number' ? Math.max(-1, Math.min(1, payload.y)) : 0;
        this.touchDir = { x, y };
    }

    private resetCharacter() {
        if (!this.player) return;
        this.player.setPosition(SPAWN_X, SPAWN_Y);
        this.player.setVelocity(0, 0);
        this.player.setFlipX(false);
        this.player.play('warrior_idle', true);
        this.lastHeading = 'south';
    }

    private togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.physics.world.pause();
            this.tweens.pauseAll();
            this.sound.pauseAll();
            EventBus.emit(EVT_PHASE_CHANGED, 'PAUSED');
        } else {
            this.physics.world.resume();
            this.tweens.resumeAll();
            this.sound.resumeAll();
            EventBus.emit(EVT_PHASE_CHANGED, 'PLAYING');
        }
    }

    update(_time: number, delta: number) {
        if (this.paused || !this.player) return;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        // Gather 8-way input vector (keyboard + touch D-pad)
        let ix = 0, iy = 0;
        if (this.keys.A.isDown || this.cursors.left.isDown) ix -= 1;
        if (this.keys.D.isDown || this.cursors.right.isDown) ix += 1;
        if (this.keys.W.isDown || this.cursors.up.isDown) iy -= 1;
        if (this.keys.S.isDown || this.cursors.down.isDown) iy += 1;
        if (ix === 0 && iy === 0) { ix = this.touchDir.x; iy = this.touchDir.y; }

        // Normalize diagonal movement
        const len = Math.hypot(ix, iy);
        if (len > 0) {
            const nx = ix / Math.max(1, len);
            const ny = iy / Math.max(1, len);
            body.velocity.x += nx * ACCEL * (delta / 1000);
            body.velocity.y += ny * ACCEL * (delta / 1000);
            // clamp to max speed
            const sp = Math.hypot(body.velocity.x, body.velocity.y);
            if (sp > MOVE_SPEED) {
                body.velocity.x = (body.velocity.x / sp) * MOVE_SPEED;
                body.velocity.y = (body.velocity.y / sp) * MOVE_SPEED;
            }
        } else {
            body.velocity.x *= FRICTION;
            body.velocity.y *= FRICTION;
            if (Math.abs(body.velocity.x) < 4) body.velocity.x = 0;
            if (Math.abs(body.velocity.y) < 4) body.velocity.y = 0;
        }

        // Heading + horizontal flip
        const moving = Math.hypot(body.velocity.x, body.velocity.y) > 12;
        if (body.velocity.x < -8) this.player.setFlipX(true);
        else if (body.velocity.x > 8) this.player.setFlipX(false);

        if (body.velocity.y < -12) this.lastHeading = 'north';
        else if (body.velocity.y > 12) this.lastHeading = 'south';
        else if (body.velocity.x < -12) this.lastHeading = 'west';
        else if (body.velocity.x > 12) this.lastHeading = 'east';

        // Depth sorting (walk behind/in front of props)
        this.player.setDepth(this.player.y);

        // Animation
        if (moving) {
            if (this.player.anims.currentAnim?.key !== 'warrior_run') this.player.play('warrior_run', true);
        } else {
            if (this.player.anims.currentAnim?.key !== 'warrior_idle') this.player.play('warrior_idle', true);
        }

        // Telemetry (throttled ~12 fps)
        this.telemetryTick += delta;
        if (this.telemetryTick >= 80) {
            this.telemetryTick = 0;
            EventBus.emit(EVT_CHARACTER_POS, {
                x: Math.round(this.player.x),
                y: Math.round(this.player.y),
                state: moving ? 'walking' : 'idle',
                heading: this.lastHeading,
            });
        }
    }
}

export default StartGame;