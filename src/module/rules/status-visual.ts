/**
 * @file Status-effect visuals (#595): how a condition shows on the token that bears it.
 *
 * The look is content. Each condition's compendium document authors a `system.visual`
 * block (Direction #7) — a procedural preset, a tint, a token filter, an optional
 * looping overlay file, how stacking raises the intensity, and optional apply / remove
 * sounds. This module holds only what is not content: the vocabulary, the reading of
 * the authored block, the stack → intensity rule, the merge of a bearer's sources,
 * the renderer-mode decision and the start / update / stop diff. Nothing here names a
 * condition; one vocabulary serves every line, read through the shared condition
 * registry (`rules/condition-registry.ts`).
 *
 * Pure: no Foundry globals. `canvas/status-visual-canvas.ts` draws a visual and
 * `canvas/status-visual-layer.ts` keeps the token → status registry.
 */

import { type CueAssetOf, type CueAssetSource, cueAssetSources, readCueAssets, readHexTint } from './cue-common.ts';

/** The procedural looks the canvas draws without any art file. */
export const STATUS_VISUAL_PRESETS = ['burning', 'bleeding', 'stunned', 'pinned', 'prone', 'frightened', 'poisoned', 'warp'] as const;
export type StatusVisualPreset = (typeof STATUS_VISUAL_PRESETS)[number];

/** Static filters applied to the token's own art. */
export const STATUS_VISUAL_FILTERS = ['desaturate', 'dim', 'blur'] as const;
export type StatusVisualFilter = (typeof STATUS_VISUAL_FILTERS)[number];

/** When a status sound plays. */
export const STATUS_SOUND_EVENTS = ['apply', 'remove'] as const;
export type StatusSoundEvent = (typeof STATUS_SOUND_EVENTS)[number];

/** The highest intensity a visual may reach however many stacks it has. */
export const STATUS_INTENSITY_CEILING = 3;

/** A condition's visual, as authored on its compendium document. */
export interface StatusVisual {
    /** Procedural preset, or '' for none. */
    preset: StatusVisualPreset | '';
    /** `#rrggbb` colour override for the preset, or '' for its own colour. */
    tint: string;
    /** Filter on the token's art, or '' for none. */
    filter: StatusVisualFilter | '';
    /** Looping overlay file (image or video) drawn over the token, or ''. */
    overlay: string;
    intensity: {
        /** Intensity added by each stack past the first (0 = stacking does not change the look). */
        perStack: number;
        /** Highest intensity stacking can reach (1 – {@link STATUS_INTENSITY_CEILING}). */
        max: number;
    };
    sounds: CueAssetOf<StatusSoundEvent>[];
}

/** The authored block before narrowing. */
export interface StatusVisualSource {
    preset?: string | undefined;
    tint?: string | undefined;
    filter?: string | undefined;
    overlay?: string | undefined;
    intensity?: { perStack?: number | undefined; max?: number | undefined } | undefined;
    sounds?: readonly CueAssetSource[] | undefined;
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
    return (list as readonly string[]).includes(value);
}

function isSoundEvent(value: string): value is StatusSoundEvent {
    return includes(STATUS_SOUND_EVENTS, value);
}

function finiteOr(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/**
 * Narrow an authored `visual` block. An unknown preset or filter, a malformed tint and
 * sounds with an unknown event or no file are dropped, never guessed.
 */
export function readStatusVisual(source: StatusVisualSource | null | undefined): StatusVisual {
    const preset = source?.preset ?? '';
    const filter = source?.filter ?? '';
    return {
        preset: includes(STATUS_VISUAL_PRESETS, preset) ? preset : '',
        tint: readHexTint(source?.tint),
        filter: includes(STATUS_VISUAL_FILTERS, filter) ? filter : '',
        overlay: (source?.overlay ?? '').trim(),
        intensity: {
            perStack: Math.max(0, finiteOr(source?.intensity?.perStack, 0)),
            max: Math.min(STATUS_INTENSITY_CEILING, Math.max(1, finiteOr(source?.intensity?.max, 1))),
        },
        sounds: readCueAssets(source?.sounds, isSoundEvent),
    };
}

function intensitySource(raw: object): StatusVisualSource['intensity'] {
    if (!('intensity' in raw) || typeof raw.intensity !== 'object' || raw.intensity === null) return undefined;
    const block = raw.intensity;
    return {
        ...('perStack' in block && typeof block.perStack === 'number' ? { perStack: block.perStack } : {}),
        ...('max' in block && typeof block.max === 'number' ? { max: block.max } : {}),
    };
}

/**
 * Read the `visual` block off a condition's `system` payload — a pack-index row or an
 * owned condition item, both untyped here. Anything that is not the authored shape
 * reads as no visual.
 */
export function statusVisualOf(system: object | null | undefined): StatusVisual {
    if (system === null || system === undefined || !('visual' in system)) return readStatusVisual(null);
    const raw = system.visual;
    if (typeof raw !== 'object' || raw === null) return readStatusVisual(null);
    return readStatusVisual({
        ...('preset' in raw && typeof raw.preset === 'string' ? { preset: raw.preset } : {}),
        ...('tint' in raw && typeof raw.tint === 'string' ? { tint: raw.tint } : {}),
        ...('filter' in raw && typeof raw.filter === 'string' ? { filter: raw.filter } : {}),
        ...('overlay' in raw && typeof raw.overlay === 'string' ? { overlay: raw.overlay } : {}),
        intensity: intensitySource(raw),
        sounds: 'sounds' in raw ? cueAssetSources(raw.sounds) : [],
    });
}

/** Does the visual draw anything on the token? (Sounds alone do not.) */
export function hasStatusVisual(visual: StatusVisual): boolean {
    return visual.preset !== '' || visual.filter !== '' || visual.overlay !== '';
}

/** The intensity a visual plays at for `stacks` stacks: 1, plus `perStack` per extra stack, capped at its `max`. */
export function stackIntensity(visual: StatusVisual, stacks: number): number {
    const extra = Number.isFinite(stacks) ? Math.max(0, Math.trunc(stacks) - 1) : 0;
    return Math.min(visual.intensity.max, 1 + extra * visual.intensity.perStack);
}

/** One place a bearer's status comes from: an applied effect's status, or an owned condition item. */
export interface StatusVisualSourceEntry {
    id: string;
    stacks: number;
    visual: StatusVisual;
}

/** The slice of an actor its status visuals are read from. */
export interface StatusVisualBearer {
    /** Foundry's active effects (`Actor#appliedEffects`): each confers its `statuses`. */
    appliedEffects?: Iterable<{ statuses: Iterable<string> }> | undefined;
    items?: Iterable<{ type: string; system: object }> | undefined;
}

/** An owned condition item's status id and stacks, or null when it is not one. */
function conditionItemStatus(item: { type: string; system: object }): { id: string; stacks: number } | null {
    const system = item.system;
    if (item.type !== 'condition' || !('identifier' in system) || typeof system.identifier !== 'string' || system.identifier === '') return null;
    const stackable = 'stackable' in system && system.stackable === true;
    const stacks = stackable && 'stacks' in system && typeof system.stacks === 'number' ? system.stacks : 1;
    return { id: system.identifier, stacks };
}

/**
 * Every place a bearer's statuses come from: one entry per status of each applied
 * effect (several effects conferring one status are several stacks), and one per owned
 * condition item with its own stacks. A status's visual comes from the condition
 * catalog (`catalogVisual`); an owned item's own authored visual is the fallback.
 */
export function statusVisualSources(bearer: StatusVisualBearer, catalogVisual: (id: string) => StatusVisual): StatusVisualSourceEntry[] {
    const sources: StatusVisualSourceEntry[] = [];
    for (const effect of bearer.appliedEffects ?? []) {
        for (const id of effect.statuses) sources.push({ id, stacks: 1, visual: catalogVisual(id) });
    }
    for (const item of bearer.items ?? []) {
        const status = conditionItemStatus(item);
        if (status === null) continue;
        const catalog = catalogVisual(status.id);
        sources.push({ ...status, visual: hasStatusVisual(catalog) ? catalog : statusVisualOf(item.system) });
    }
    return sources;
}

/** A status a token should be showing. */
export interface DesiredStatusVisual {
    id: string;
    visual: StatusVisual;
    stacks: number;
    /** Stack intensity (before the user's own intensity scale). */
    intensity: number;
}

/**
 * Merge a bearer's sources into the visuals its token should show, keyed by status id.
 * Stacks of one status add up (several effects conferring it, an owned item's stacks);
 * the first source with a visual supplies it. A status with no visual is left out.
 */
export function desiredStatusVisuals(sources: Iterable<StatusVisualSourceEntry>): Map<string, DesiredStatusVisual> {
    const merged = new Map<string, { visual: StatusVisual | null; stacks: number }>();
    for (const source of sources) {
        const existing = merged.get(source.id) ?? { visual: null, stacks: 0 };
        existing.stacks += Math.max(1, Number.isFinite(source.stacks) ? Math.trunc(source.stacks) : 1);
        if (existing.visual === null && hasStatusVisual(source.visual)) existing.visual = source.visual;
        merged.set(source.id, existing);
    }
    const desired = new Map<string, DesiredStatusVisual>();
    for (const [id, { visual, stacks }] of merged) {
        if (visual !== null) desired.set(id, { id, visual, stacks, intensity: stackIntensity(visual, stacks) });
    }
    return desired;
}

/** How a visual renders on this client: in motion, as a still tint / filter / overlay, or not at all. */
export type StatusVisualMode = 'animated' | 'static' | 'none';

/** What decides a visual's mode on this client. */
export interface StatusVisualModeContext {
    /** The GM allows canvas cues for the world. */
    worldEnabled: boolean;
    /** This user wants status visuals. */
    enabled: boolean;
    /** This user's intensity scale, 0–1. */
    userIntensity: number;
    /** The user's system asks for reduced motion. */
    reducedMotion: boolean;
    /** The token is visible to this user. */
    visible: boolean;
}

/** The mode a visual renders in. Reduced motion keeps the still parts and drops all motion. */
export function statusVisualMode(context: StatusVisualModeContext): StatusVisualMode {
    if (!context.worldEnabled || !context.enabled || !(context.userIntensity > 0) || !context.visible) return 'none';
    return context.reducedMotion ? 'static' : 'animated';
}

/** The key a running visual is compared by: a change to any of it restarts the visual. */
export function statusVisualKey(visual: StatusVisual, mode: StatusVisualMode): string {
    return JSON.stringify([mode, visual.preset, visual.tint, visual.filter, visual.overlay]);
}

/** What a token is showing now, per status. */
export interface RunningStatusVisual {
    key: string;
    intensity: number;
}

/** Desired visuals paired with the key they would run under. */
export interface KeyedStatusVisual {
    desired: DesiredStatusVisual;
    mode: Exclude<StatusVisualMode, 'none'>;
    key: string;
}

/** The changes that bring a token's running visuals to the desired set. */
export interface StatusVisualDiff {
    start: KeyedStatusVisual[];
    /** Same look, new intensity. */
    update: KeyedStatusVisual[];
    /** Look changed: stopped and started again. */
    restart: KeyedStatusVisual[];
    stop: string[];
}

/** Diff a token's running visuals against the desired ones. */
export function diffStatusVisuals(running: ReadonlyMap<string, RunningStatusVisual>, desired: ReadonlyMap<string, KeyedStatusVisual>): StatusVisualDiff {
    const diff: StatusVisualDiff = { start: [], update: [], restart: [], stop: [] };
    for (const [id, next] of desired) {
        const current = running.get(id);
        if (current === undefined) diff.start.push(next);
        else if (current.key !== next.key) diff.restart.push(next);
        else if (current.intensity !== next.desired.intensity) diff.update.push(next);
    }
    for (const id of running.keys()) {
        if (!desired.has(id)) diff.stop.push(id);
    }
    return diff;
}
