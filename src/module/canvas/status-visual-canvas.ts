/**
 * @file Draws one status-effect visual (#595) on one token: the procedural preset in
 * PIXI (embers, drips, orbiting stars…), a static filter on the token's art, and an
 * optional looping overlay file. The look comes from the condition document's
 * authored `system.visual` (`rules/status-visual.ts`); this module holds only drawing
 * primitives, keyed by preset, and names no condition.
 *
 * A visual lives in its own container parented to the token, so it moves, hides and
 * is destroyed with it. In `static` mode (reduced motion, or past the global cap) it
 * draws a still ring in the preset's colour once and never moves; in `animated` mode
 * the layer's shared ticker calls {@link TokenStatusVisual.tick} each frame.
 */

import { tintColour } from '../rules/cue-common.ts';
import type { StatusVisual, StatusVisualFilter, StatusVisualPreset } from '../rules/status-visual.ts';

/** The slice of a token's art mesh a visual filters. */
interface StatusVisualMesh {
    filters: PIXI.Filter[] | null;
    destroyed: boolean;
}

/** The slice of a Token placeable a visual draws on. */
export interface StatusVisualHost {
    /** Width and height of the token in canvas pixels. */
    w: number;
    h: number;
    mesh?: StatusVisualMesh | null | undefined;
    addChild: (child: PIXI.Container) => PIXI.Container;
}

/** One particle of a preset's emitter, in the token's local pixels. */
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Vertical acceleration (px/s²): gravity for drips, lift for embers. */
    ay: number;
    age: number;
    life: number;
    size: number;
}

/** What a preset draws each frame, in the token's local pixels. */
interface PresetFrame {
    g: PIXI.Graphics;
    w: number;
    h: number;
    /** Size unit: one hundredth of the token's short side. */
    unit: number;
    /** Seconds since the visual started. */
    t: number;
    intensity: number;
    colour: number;
}

/** A preset: its colour, its emitter (if any) and its ambient drawing. */
interface PresetStyle {
    colour: number;
    /** Particles spawned per second at intensity 1; 0 for no emitter. */
    rate: number;
    spawn: (w: number, h: number, unit: number, rng: () => number) => Particle;
    /** Draw one particle. */
    particle: (g: PIXI.Graphics, p: Particle, colour: number, alpha: number) => void;
    /** Draw the preset's non-particle motion (a glow, an orbit, chevrons). */
    ambient: (frame: PresetFrame) => void;
}

/** Most particles one visual keeps alive at full intensity. */
const MAX_PARTICLES = 48;
/** Alpha of the still ring a static visual draws. */
const STATIC_RING_ALPHA = 0.7;
/** Longest frame step simulated at once (ms), so a stalled tab does not fling particles. */
const MAX_STEP_MS = 100;

const between = (rng: () => number, low: number, high: number): number => low + (high - low) * rng();

const noAmbient = (): void => undefined;

const noParticle = (): Particle => ({ x: 0, y: 0, vx: 0, vy: 0, ay: 0, age: 0, life: 0, size: 0 });

const dot = (g: PIXI.Graphics, p: Particle, colour: number, alpha: number): void => {
    g.beginFill(colour, alpha).drawCircle(p.x, p.y, p.size).endFill();
};

/** A small four-pointed star. */
function drawStar(g: PIXI.Graphics, x: number, y: number, size: number, colour: number, alpha: number): void {
    g.lineStyle(Math.max(1, size / 3), colour, alpha);
    g.moveTo(x - size, y).lineTo(x + size, y);
    g.moveTo(x, y - size).lineTo(x, y + size);
}

/** The procedural looks, as drawing primitives (no content: colours, emitters and shapes). */
const PRESET_STYLE: Readonly<Record<StatusVisualPreset, PresetStyle>> = {
    burning: {
        colour: 0xff6a00,
        rate: 14,
        spawn: (w, h, unit, rng) => ({
            x: between(rng, 0.2, 0.8) * w,
            y: 0.85 * h,
            vx: between(rng, -10, 10) * unit,
            vy: -between(rng, 40, 70) * unit,
            ay: -10 * unit,
            age: 0,
            life: between(rng, 0.8, 1.4),
            size: between(rng, 1.5, 3.5) * unit,
        }),
        particle: dot,
        ambient: ({ g, w, h, t, colour, intensity }) => {
            const flicker = 0.18 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29);
            g.beginFill(colour, Math.min(0.6, flicker * intensity))
                .drawEllipse(w / 2, h * 0.85, w * 0.42, h * 0.14)
                .endFill();
        },
    },
    bleeding: {
        colour: 0xa00000,
        rate: 3,
        spawn: (w, h, unit, rng) => ({
            x: between(rng, 0.3, 0.7) * w,
            y: between(rng, 0.4, 0.6) * h,
            vx: 0,
            vy: 5 * unit,
            ay: 120 * unit,
            age: 0,
            life: between(rng, 0.7, 1.1),
            size: between(rng, 1.5, 2.5) * unit,
        }),
        particle: (g, p, colour, alpha) => {
            g.lineStyle(p.size * 0.8, colour, alpha * 0.6);
            g.moveTo(p.x, p.y - p.size * 3).lineTo(p.x, p.y);
            g.lineStyle(0);
            dot(g, p, colour, alpha);
        },
        ambient: noAmbient,
    },
    stunned: {
        colour: 0xfff080,
        rate: 0,
        spawn: noParticle,
        particle: dot,
        ambient: ({ g, w, h, unit, t, colour, intensity }) => {
            const stars = 3 + Math.max(0, Math.floor(intensity - 1));
            for (let star = 0; star < stars; star++) {
                const angle = t * 3 + (star / stars) * Math.PI * 2;
                drawStar(g, w / 2 + Math.cos(angle) * w * 0.35, h * 0.08 + Math.sin(angle) * h * 0.08, 6 * unit, colour, 0.9);
            }
        },
    },
    pinned: {
        colour: 0xc8c8c8,
        rate: 0,
        spawn: noParticle,
        particle: dot,
        ambient: ({ g, w, h, unit, t, colour, intensity }) => {
            for (let chevron = 0; chevron < 2; chevron++) {
                const phase = (t * 0.8 + chevron / 2) % 1;
                const y = -0.15 * h + phase * 0.3 * h;
                g.lineStyle(3 * unit * intensity, colour, 1 - phase);
                g.moveTo(w * 0.35, y)
                    .lineTo(w / 2, y + h * 0.08)
                    .lineTo(w * 0.65, y);
            }
        },
    },
    prone: {
        colour: 0x8a7a60,
        rate: 0,
        spawn: noParticle,
        particle: dot,
        ambient: ({ g, w, h, t, colour, intensity }) => {
            g.beginFill(colour, Math.min(0.6, (0.3 + 0.08 * Math.sin(t * 2)) * intensity))
                .drawEllipse(w / 2, h * 0.9, w * 0.48, h * 0.09)
                .endFill();
        },
    },
    frightened: {
        colour: 0xd8e0ff,
        rate: 0,
        spawn: noParticle,
        particle: dot,
        ambient: ({ g, w, h, unit, t, colour, intensity }) => {
            const jitter = Math.sin(t * 40) * 2 * unit * intensity;
            g.lineStyle(2 * unit, colour, 0.8);
            for (const side of [-1, 1]) {
                const x = w / 2 + side * (w * 0.55 + jitter);
                for (let mark = 0; mark < 3; mark++) {
                    const y = h * (0.3 + mark * 0.15);
                    g.moveTo(x, y).lineTo(x + side * w * 0.06, y + h * 0.04);
                }
            }
        },
    },
    poisoned: {
        colour: 0x5ad13a,
        rate: 5,
        spawn: (w, h, unit, rng) => ({
            x: between(rng, 0.25, 0.75) * w,
            y: 0.7 * h,
            vx: between(rng, -5, 5) * unit,
            vy: -20 * unit,
            ay: 0,
            age: 0,
            life: between(rng, 1.2, 1.8),
            size: between(rng, 2, 5) * unit,
        }),
        particle: (g, p, colour, alpha) => {
            g.lineStyle(Math.max(1, p.size / 3), colour, alpha).drawCircle(p.x, p.y, p.size * (1 + p.age / p.life));
        },
        ambient: noAmbient,
    },
    warp: {
        colour: 0xb050ff,
        rate: 0,
        spawn: noParticle,
        particle: dot,
        ambient: ({ g, w, h, unit, t, colour, intensity }) => {
            const segments = 48;
            const radius = 0.55 * Math.min(w, h);
            g.lineStyle(3 * unit, colour, Math.min(1, 0.4 + 0.2 * intensity));
            for (let segment = 0; segment <= segments; segment++) {
                const theta = (segment / segments) * Math.PI * 2;
                const r = radius * (1 + 0.05 * intensity * Math.sin(theta * 6 + t * 4));
                const x = w / 2 + Math.cos(theta) * r;
                const y = h / 2 + Math.sin(theta) * r;
                if (segment === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
            }
        },
    },
};

/** A fresh PIXI filter for a filter id. */
function createFilter(filter: StatusVisualFilter): PIXI.Filter {
    if (filter === 'blur') return new PIXI.BlurFilter(2);
    const matrix = new PIXI.ColorMatrixFilter();
    if (filter === 'desaturate') matrix.desaturate();
    else matrix.brightness(0.6, false);
    return matrix;
}

/** One status visual on one token. */
export class TokenStatusVisual {
    private readonly container = new PIXI.Container();
    private readonly graphic = new PIXI.Graphics();
    private readonly style: PresetStyle | null;
    private readonly colour: number;
    private particles: Particle[] = [];
    private filter: PIXI.Filter | null = null;
    /** An overlay video texture this visual unlinked from the shared one, and so owns. */
    private ownedTexture: PIXI.Texture | null = null;
    private video: HTMLVideoElement | null = null;
    private elapsedMs = 0;
    private spawnDebt = 0;
    private stopped = false;
    /** Does this visual move each frame? Only a preset does; a filter or overlay alone is still. */
    readonly animated: boolean;

    /**
     * @param host       The token.
     * @param visual     The authored visual.
     * @param motion     Draw the preset in motion (else a still ring, drawn once).
     * @param intensity  Stack intensity × the user's scale.
     * @param rng        Random source for the emitter.
     */
    constructor(
        private readonly host: StatusVisualHost,
        visual: StatusVisual,
        private readonly motion: boolean,
        private intensity: number,
        private readonly rng: () => number = Math.random,
    ) {
        this.style = visual.preset === '' ? null : PRESET_STYLE[visual.preset];
        this.animated = motion && this.style !== null;
        this.colour = tintColour(visual.tint, this.style?.colour ?? 0xffffff);
        this.container.eventMode = 'none';
        this.container.addChild(this.graphic);
        host.addChild(this.container);
        if (visual.filter !== '') this.applyFilter(visual.filter);
        if (visual.overlay !== '') void this.loadOverlay(visual.overlay);
        if (!this.animated) this.drawStatic();
    }

    /** Has the visual been stopped (by the layer, or with its token)? A method, so a check after an await is not narrowed away. */
    private isGone(): boolean {
        return this.stopped || this.container.destroyed;
    }

    /** Change the intensity in place (more stacks, or the user's scale). */
    setIntensity(intensity: number): void {
        this.intensity = intensity;
        if (!this.animated) this.drawStatic();
    }

    /** Advance and redraw one frame. Off screen, the visual neither simulates nor renders. */
    tick(deltaMs: number, onScreen: boolean): void {
        if (this.isGone() || !this.animated) return;
        this.container.renderable = onScreen;
        if (!onScreen || this.style === null) return;
        const step = Math.min(MAX_STEP_MS, Math.max(0, deltaMs));
        this.elapsedMs += step;
        const seconds = step / 1000;
        const { w, h } = this.host;
        const unit = Math.min(w, h) / 100;
        this.emit(this.style, seconds, w, h, unit);
        this.graphic.clear();
        this.style.ambient({ g: this.graphic, w, h, unit, t: this.elapsedMs / 1000, intensity: this.intensity, colour: this.colour });
        for (const particle of this.particles) {
            this.style.particle(this.graphic, particle, this.colour, Math.max(0, 1 - particle.age / particle.life));
        }
    }

    /** Remove everything this visual added to the token. Safe to call twice, and after the token is gone. */
    destroy(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.particles = [];
        this.removeFilter();
        this.video?.pause();
        this.video = null;
        if (!this.container.destroyed) this.container.destroy({ children: true });
        this.ownedTexture?.destroy(true);
        this.ownedTexture = null;
    }

    private emit(style: PresetStyle, seconds: number, w: number, h: number, unit: number): void {
        for (const particle of this.particles) {
            particle.age += seconds;
            particle.vy += particle.ay * seconds;
            particle.x += particle.vx * seconds;
            particle.y += particle.vy * seconds;
        }
        this.particles = this.particles.filter((particle) => particle.age < particle.life);
        if (style.rate <= 0) return;
        this.spawnDebt += style.rate * this.intensity * seconds;
        const ceiling = Math.round(MAX_PARTICLES * Math.min(1, this.intensity));
        while (this.spawnDebt >= 1) {
            this.spawnDebt -= 1;
            if (this.particles.length < ceiling) this.particles.push(style.spawn(w, h, unit, this.rng));
        }
    }

    /** The still look: a ring in the preset's colour around the token. */
    private drawStatic(): void {
        this.graphic.clear();
        if (this.style === null) return;
        const { w, h } = this.host;
        const alpha = STATIC_RING_ALPHA * Math.min(1, this.intensity);
        this.graphic.lineStyle(Math.min(w, h) * 0.03, this.colour, alpha).beginFill(this.colour, alpha * 0.15);
        this.graphic.drawCircle(w / 2, h / 2, 0.5 * Math.min(w, h)).endFill();
    }

    private applyFilter(filter: StatusVisualFilter): void {
        const mesh = this.host.mesh;
        if (mesh === null || mesh === undefined || mesh.destroyed) return;
        this.filter = createFilter(filter);
        // Foundry leaves a mesh's `filters` null until something filters it.
        mesh.filters = [...(mesh.filters ?? []), this.filter];
    }

    private removeFilter(): void {
        if (this.filter === null) return;
        const filters = this.host.mesh?.destroyed === false ? this.host.mesh.filters : null;
        const index = filters?.indexOf(this.filter) ?? -1;
        if (index >= 0) filters?.splice(index, 1);
        this.filter.destroy();
        this.filter = null;
    }

    /** Load the overlay file. A video is unlinked from the shared texture so this visual can pause it alone. */
    private async loadOverlay(src: string): Promise<void> {
        const loaded = await foundry.canvas.loadTexture(src);
        if (this.isGone() || !(loaded instanceof PIXI.Texture)) return;
        let texture = loaded;
        const shared = game.video.getVideoSource(loaded);
        if (shared !== null) {
            texture = await game.video.cloneTexture(shared);
            if (this.isGone()) {
                texture.destroy(true);
                return;
            }
            this.ownedTexture = texture;
            this.video = game.video.getVideoSource(texture);
        }
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(this.host.w / 2, this.host.h / 2);
        sprite.width = this.host.w;
        sprite.height = this.host.h;
        this.container.addChildAt(sprite, 0);
        if (this.video !== null) {
            if (this.motion) game.video.play(this.video, { volume: 0, loop: true });
            else this.video.pause();
        }
    }
}
