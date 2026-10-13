/**
 * @file Plays an attack cue plan (#594) on this client: each step's visual through a
 * Sequencer (when active and the step has an animation file) or the system's own
 * procedural PIXI effect, and its sound through Foundry's AudioHelper. Every client
 * plays a plan itself, so each user's settings (animations, sounds, volume) and their
 * reduced-motion preference apply to what they see and hear.
 *
 * The outcome → cue mapping is pure and lives in `rules/attack-cue.ts`; the renderer
 * choice in `rules/attack-cue-playback.ts`. This module only resolves anchors to
 * canvas points and draws.
 */

import { type CueRenderer, cueSoundVolume, selectCueRenderer } from '../rules/attack-cue-playback.ts';
import { type CueAnchor, type CueEvent, type CuePlan, type CuePoint, type CuePreset, type CueStep, missPoint } from '../rules/attack-cue.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/** How long a travelling visual (a shot, a swing, a cone) takes, in ms. Matches the mapping's travel time. */
const TRAVEL_MS = 250;
/** How long a stationary visual (an impact, a puff, an aura) lasts, in ms. */
const LINGER_MS = 450;
/** How long a large visual (an explosion, Perils, a blast) lasts, in ms. */
const LARGE_LINGER_MS = 800;

/** How a preset draws its shot. */
type ShotMotion = 'beam' | 'bolt' | 'stream' | 'swing';

interface PresetStyle {
    colour: number;
    width: number;
    motion: ShotMotion;
}

/** The procedural looks, as drawing primitives (no content: colours and stroke shapes). */
const PRESET_STYLE: Readonly<Record<CuePreset, PresetStyle>> = {
    tracer: { colour: 0xffe08a, width: 2, motion: 'bolt' },
    las: { colour: 0xff3030, width: 3, motion: 'beam' },
    solid: { colour: 0xfff2c0, width: 2, motion: 'bolt' },
    bolt: { colour: 0xffb040, width: 4, motion: 'bolt' },
    plasma: { colour: 0x60c8ff, width: 6, motion: 'bolt' },
    melta: { colour: 0xff8020, width: 8, motion: 'beam' },
    flame: { colour: 0xff6a00, width: 10, motion: 'stream' },
    launcher: { colour: 0xd0d0d0, width: 4, motion: 'bolt' },
    arc: { colour: 0x9fd8ff, width: 3, motion: 'beam' },
    blade: { colour: 0xe8e8e8, width: 3, motion: 'swing' },
    chain: { colour: 0xffd060, width: 4, motion: 'swing' },
    power: { colour: 0x80b0ff, width: 5, motion: 'swing' },
    blunt: { colour: 0xc8b090, width: 6, motion: 'swing' },
    warp: { colour: 0xb050ff, width: 5, motion: 'bolt' },
};

/** Colours of the outcomes that look the same whatever the weapon. */
const OUTCOME_COLOUR = {
    smoke: 0x808080,
    heat: 0xff7a1a,
    fire: 0xffa030,
    warp: 0xb050ff,
    spark: 0xfff0a0,
} as const;

/* -------------------------------------------- */
/*  Sequencer (optional module)                 */
/* -------------------------------------------- */

/** The slice of Sequencer's effect section this module calls. */
interface SequencerEffect {
    file: (path: string) => SequencerEffect;
    atLocation: (target: CuePoint) => SequencerEffect;
    stretchTo: (target: CuePoint) => SequencerEffect;
    delay: (ms: number) => SequencerEffect;
    tint: (colour: string) => SequencerEffect;
    locally: (local?: boolean) => SequencerEffect;
}

interface SequenceLike {
    effect: () => SequencerEffect;
    play: () => Promise<void>;
}

type SequenceConstructor = new () => SequenceLike;

/** Sequencer's `Sequence` class when the module is active, else null. */
function sequencerConstructor(): SequenceConstructor | null {
    if (game.modules.get('sequencer')?.active !== true) return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Sequencer registers `Sequence` on globalThis at init; it ships no types for this system
    const ctor = (globalThis as { Sequence?: SequenceConstructor }).Sequence;
    return typeof ctor === 'function' ? ctor : null;
}

/* -------------------------------------------- */
/*  Anchors                                     */
/* -------------------------------------------- */

/** A resolved template's geometry in canvas pixels. */
interface TemplatePlacement {
    origin: CuePoint;
    /** Cone length or circle radius in pixels. */
    reach: number;
    /** Bearing in degrees (0 = +x, clockwise). */
    direction: number;
    /** Cone opening in degrees. */
    angle: number;
}

function tokenCentre(tokenId: string): CuePoint | null {
    const token = canvas.tokens?.get(tokenId);
    return token === undefined ? null : { x: token.center.x, y: token.center.y };
}

function templatePlacement(templateId: string): TemplatePlacement | null {
    const doc = canvas.scene?.templates.get(templateId);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `canvas.dimensions` is null until a scene is drawn
    const perUnit = canvas.dimensions?.distancePixels;
    if (doc === undefined || perUnit === undefined) return null;
    return { origin: { x: doc.x, y: doc.y }, reach: doc.distance * perUnit, direction: doc.direction, angle: doc.angle };
}

function resolveAnchor(anchor: CueAnchor): CuePoint | null {
    if (anchor.kind === 'token') return tokenCentre(anchor.tokenId);
    if (anchor.kind === 'template') return templatePlacement(anchor.templateId)?.origin ?? null;
    const target = tokenCentre(anchor.tokenId);
    const from = tokenCentre(anchor.fromTokenId);
    if (target === null || from === null) return null;
    return missPoint(from, target, canvas.grid?.size ?? 100, anchor.side);
}

/* -------------------------------------------- */
/*  Procedural drawing                          */
/* -------------------------------------------- */

/** Run `frame(progress)` each animation frame for `durationMs`, then `done()`. */
function animate(durationMs: number, frame: (progress: number) => void, done: () => void): void {
    const start = performance.now();
    const tick = (now: number): void => {
        const progress = Math.min(1, (now - start) / durationMs);
        frame(progress);
        if (progress < 1) requestAnimationFrame(tick);
        else done();
    };
    requestAnimationFrame(tick);
}

/** Draw a short-lived graphic on the interface layer, redrawn each frame until it ends. */
function drawTransient(durationMs: number, draw: (graphic: PIXI.Graphics, progress: number) => void): void {
    const layer = canvas.interface;
    if (layer === undefined) return;
    const graphic = new PIXI.Graphics();
    layer.addChild(graphic);
    animate(
        durationMs,
        (progress) => {
            graphic.clear();
            draw(graphic, progress);
        },
        () => {
            layer.removeChild(graphic);
            graphic.destroy();
        },
    );
}

function lerp(a: CuePoint, b: CuePoint, t: number): CuePoint {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** A shot from `from` to `to`: a beam that flashes the whole line, a bolt that travels, or a gout that spreads. */
function drawShot(from: CuePoint, to: CuePoint, style: PresetStyle, colour: number): void {
    drawTransient(TRAVEL_MS, (g, p) => {
        if (style.motion === 'beam') {
            g.lineStyle(style.width, colour, 1 - p);
            g.moveTo(from.x, from.y).lineTo(to.x, to.y);
            return;
        }
        if (style.motion === 'stream') {
            const front = lerp(from, to, p);
            g.lineStyle(style.width * (0.5 + p), colour, 0.8 * (1 - p * 0.5));
            g.moveTo(from.x, from.y).lineTo(front.x, front.y);
            return;
        }
        const head = lerp(from, to, p);
        const tail = lerp(from, to, Math.max(0, p - 0.25));
        g.lineStyle(style.width, colour, 1);
        g.moveTo(tail.x, tail.y).lineTo(head.x, head.y);
        g.beginFill(colour, 1).drawCircle(head.x, head.y, style.width).endFill();
    });
}

/** A swing across the target: an arc sweeping through it. A whiff fades without its flash. */
function drawSwing(at: CuePoint, style: PresetStyle, colour: number, landed: boolean): void {
    const radius = (canvas.grid?.size ?? 100) * 0.6;
    drawTransient(TRAVEL_MS, (g, p) => {
        const startAngle = -Math.PI * 0.75;
        const sweep = Math.PI * 1.5 * p;
        g.lineStyle(style.width, colour, landed ? 1 - p * 0.3 : 0.5 * (1 - p));
        g.arc(at.x, at.y, radius, startAngle, startAngle + sweep);
    });
    if (landed) drawBurst(at, colour, 0.35, LINGER_MS);
}

/** An expanding, fading ring and disc: an impact, a puff, an aura. `scale` is in grid squares. */
function drawBurst(at: CuePoint, colour: number, scale: number, durationMs: number): void {
    const size = (canvas.grid?.size ?? 100) * scale;
    drawTransient(durationMs, (g, p) => {
        g.beginFill(colour, 0.5 * (1 - p))
            .drawCircle(at.x, at.y, size * (0.4 + 0.6 * p))
            .endFill();
        g.lineStyle(2, colour, 1 - p).drawCircle(at.x, at.y, size * (0.6 + 0.6 * p));
    });
}

/** Radial sparks thrown out from a point. */
function drawSparks(at: CuePoint, colour: number, scale: number, durationMs: number): void {
    const size = (canvas.grid?.size ?? 100) * scale;
    const rays = 10;
    drawTransient(durationMs, (g, p) => {
        g.lineStyle(2, colour, 1 - p);
        for (let ray = 0; ray < rays; ray++) {
            const angle = (ray / rays) * Math.PI * 2;
            const inner = size * p * 0.5;
            const outer = size * (0.3 + p);
            g.moveTo(at.x + Math.cos(angle) * inner, at.y + Math.sin(angle) * inner);
            g.lineTo(at.x + Math.cos(angle) * outer, at.y + Math.sin(angle) * outer);
        }
    });
}

/** An area cone flaring out from the template's apex along its bearing. */
function drawCone(placement: TemplatePlacement, colour: number): void {
    const half = (placement.angle / 2) * (Math.PI / 180);
    const bearing = placement.direction * (Math.PI / 180);
    drawTransient(LARGE_LINGER_MS, (g, p) => {
        const reach = placement.reach * Math.min(1, p * 2);
        g.beginFill(colour, 0.45 * (1 - p));
        g.moveTo(placement.origin.x, placement.origin.y);
        g.arc(placement.origin.x, placement.origin.y, reach, bearing - half, bearing + half);
        g.lineTo(placement.origin.x, placement.origin.y);
        g.endFill();
    });
}

/** A blast filling the template's circle. */
function drawBlast(placement: TemplatePlacement, colour: number): void {
    drawTransient(LARGE_LINGER_MS, (g, p) => {
        g.beginFill(colour, 0.5 * (1 - p))
            .drawCircle(placement.origin.x, placement.origin.y, placement.reach * Math.min(1, 0.3 + p))
            .endFill();
    });
    drawSparks(placement.origin, OUTCOME_COLOUR.spark, placement.reach / (canvas.grid?.size ?? 100), LARGE_LINGER_MS);
}

/** A stationary cue at one point, by event. */
const POINT_CUES: Readonly<Partial<Record<CueEvent, (at: CuePoint, colour: number) => void>>> = {
    hit: (at, colour) => drawBurst(at, colour, 0.35, LINGER_MS),
    miss: (at) => drawBurst(at, OUTCOME_COLOUR.smoke, 0.25, LINGER_MS),
    critical: (at, colour) => {
        drawBurst(at, colour, 0.7, LARGE_LINGER_MS);
        drawSparks(at, OUTCOME_COLOUR.spark, 0.8, LARGE_LINGER_MS);
    },
    jam: (at) => drawBurst(at, OUTCOME_COLOUR.smoke, 0.3, LINGER_MS),
    overheat: (at) => drawBurst(at, OUTCOME_COLOUR.heat, 0.5, LARGE_LINGER_MS),
    explode: (at) => {
        drawBurst(at, OUTCOME_COLOUR.fire, 1, LARGE_LINGER_MS);
        drawSparks(at, OUTCOME_COLOUR.spark, 1.2, LARGE_LINGER_MS);
    },
    parry: (at) => drawSparks(at, OUTCOME_COLOUR.spark, 0.5, LINGER_MS),
    dodge: (at, colour) => drawBurst(at, colour, 0.5, LINGER_MS),
    manifest: (at) => drawBurst(at, OUTCOME_COLOUR.warp, 0.6, LINGER_MS),
    phenomena: (at) => drawBurst(at, OUTCOME_COLOUR.warp, 0.9, LARGE_LINGER_MS),
    perils: (at) => {
        drawBurst(at, OUTCOME_COLOUR.warp, 1.5, LARGE_LINGER_MS);
        drawSparks(at, OUTCOME_COLOUR.warp, 1.5, LARGE_LINGER_MS);
    },
};

/** Draw one step with the system's procedural effect. */
function drawProcedural(step: CueStep): void {
    const style = PRESET_STYLE[step.preset];
    const colour = step.tint === '' ? style.colour : Number.parseInt(step.tint.slice(1), 16);
    const from = resolveAnchor(step.from);
    if (from === null) return;
    if (step.event === 'spray' && step.to?.kind === 'template') {
        const placement = templatePlacement(step.to.templateId);
        if (placement !== null) drawCone(placement, colour);
        return;
    }
    if (step.event === 'blast' && step.from.kind === 'template') {
        const placement = templatePlacement(step.from.templateId);
        if (placement !== null) drawBlast(placement, colour);
        return;
    }
    if (step.event === 'melee-hit' || step.event === 'melee-miss') {
        const at = step.to === null ? from : resolveAnchor(step.to) ?? from;
        drawSwing(at, style, colour, step.event === 'melee-hit');
        return;
    }
    if (step.event === 'fire' || step.event === 'scatter') {
        const to = step.to === null ? null : resolveAnchor(step.to);
        if (to === null) drawBurst(from, colour, 0.25, LINGER_MS);
        else drawShot(from, to, style, colour);
        return;
    }
    POINT_CUES[step.event]?.(from, colour);
}

/** Play one step's animation file through Sequencer, locally. */
function playSequencer(ctor: SequenceConstructor, step: CueStep): void {
    const from = resolveAnchor(step.from);
    if (from === null) return;
    const to = step.to === null ? null : resolveAnchor(step.to);
    const sequence = new ctor();
    let effect = sequence.effect().file(step.animation).atLocation(from);
    if (to !== null) effect = effect.stretchTo(to);
    if (step.tint !== '') effect = effect.tint(step.tint);
    effect.locally(true);
    void sequence.play();
}

/** Would a reduced-motion preference suppress animations here? */
function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Play one step's visual and sound on this client. */
function playStep(
    step: CueStep,
    renderer: (step: CueStep) => CueRenderer,
    sequencer: SequenceConstructor | null,
    volumeFor: (src: string) => number | null,
): void {
    const chosen = renderer(step);
    if (chosen === 'sequencer' && sequencer !== null) playSequencer(sequencer, step);
    else if (chosen === 'canvas') drawProcedural(step);
    const volume = volumeFor(step.sound);
    if (volume !== null) void foundry.audio.AudioHelper.play({ src: step.sound, volume, loop: false }, false);
}

/**
 * Play a cue plan on this client, honouring its settings and reduced motion. Steps
 * are scheduled by their delays. A client whose canvas shows another scene (or none)
 * still hears the sounds but draws nothing.
 */
export function playCuePlan(plan: CuePlan): void {
    if (plan.steps.length === 0) return;
    const settings = WH40KSettings.getAttackCueSettings();
    if (!settings.worldEnabled) return;
    const sequencer = sequencerConstructor();
    const context = {
        worldEnabled: settings.worldEnabled,
        animationsEnabled: settings.animationsEnabled,
        reducedMotion: prefersReducedMotion(),
        canvasReady: canvas.ready && canvas.scene?.id === plan.sceneId,
        sequencerActive: sequencer !== null,
    };
    const renderer = (step: CueStep): CueRenderer => selectCueRenderer({ ...context, hasAnimation: step.animation !== '' });
    const volumeFor = (src: string): number | null =>
        cueSoundVolume({ worldEnabled: settings.worldEnabled, soundsEnabled: settings.soundsEnabled, volume: settings.volume, src });
    for (const step of plan.steps) {
        if (step.delayMs <= 0) playStep(step, renderer, sequencer, volumeFor);
        else setTimeout(() => playStep(step, renderer, sequencer, volumeFor), step.delayMs);
    }
}
