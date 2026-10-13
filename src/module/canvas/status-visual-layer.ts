/**
 * @file Status-effect visuals on tokens (#595): the registry of what each token is
 * showing, kept in step with document state on every client.
 *
 * Every client renders from its own copy of the documents — no socket: the
 * ActiveEffect / condition-item / token / canvas hooks fire everywhere, and each
 * reconciles the affected tokens against what their actors bear (the condition
 * catalog supplies each status's authored `system.visual`). Everything is keyed by
 * token id and status id; a visual starts when its status appears, changes intensity
 * when its stacks do, restarts when its look or mode changes, and is destroyed when
 * the status goes, the token is hidden, redrawn or destroyed, or the canvas is torn
 * down. One shared ticker animates every visual while any is animated and is removed
 * when none is. A global cap bounds the animated ones (the rest render still), and
 * visuals of off-screen tokens neither simulate nor render.
 *
 * Apply / remove sounds are one-shots, played by each client from the same hooks.
 */

import { SYSTEM_ID } from '../constants.ts';
import { cueSoundVolume } from '../rules/attack-cue-playback.ts';
import { bearerLine, resolveCondition } from '../rules/condition-registry.ts';
import { pickCueAsset } from '../rules/cue-common.ts';
import {
    desiredStatusVisuals,
    diffStatusVisuals,
    type KeyedStatusVisual,
    type StatusSoundEvent,
    type StatusVisual,
    type StatusVisualBearer,
    statusVisualKey,
    statusVisualMode,
    statusVisualOf,
    statusVisualSources,
} from '../rules/status-visual.ts';
import { hooksOn } from '../utils/hooks-on.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { playCueSound, prefersReducedMotion } from './cue-media.ts';
import { type StatusVisualHost, TokenStatusVisual } from './status-visual-canvas.ts';

/** Most visuals animated at once across the canvas; the rest render still. */
export const MAX_ANIMATED_STATUS_VISUALS = 40;

/** A screen-space rectangle. */
interface ScreenRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The actor slice the layer reads: its statuses, and the line its conditions resolve for. */
type StatusVisualActor = StatusVisualBearer & { system?: object | undefined };

/** The slice of a Token placeable the layer reads. */
interface StatusVisualToken extends StatusVisualHost {
    id: string;
    destroyed: boolean;
    isVisible: boolean;
    /** A drag / config preview clone of a real token. */
    isPreview: boolean;
    actor: StatusVisualActor | null;
    getBounds: () => ScreenRect;
}

/** The slice of the PIXI ticker the layer drives. */
interface TickerLike {
    deltaMS: number;
    add: (fn: () => void) => void;
    remove: (fn: () => void) => void;
}

/** A visual running on a token. */
interface RunningVisual {
    key: string;
    intensity: number;
    visual: StatusVisual;
    drawing: TokenStatusVisual;
    /** Wanted animated, but drawn still because the global cap was full. */
    capped: boolean;
}

interface TokenEntry {
    token: StatusVisualToken;
    visible: boolean;
    visuals: Map<string, RunningVisual>;
}

/** The registry of every token's running visuals on this client. */
class StatusVisualLayer {
    private readonly entries = new Map<string, TokenEntry>();
    private ticker: TickerLike | null = null;
    private readonly onTick = (): void => this.tick();

    /** How many visuals are running, animated or still. */
    get runningCount(): number {
        let count = 0;
        for (const entry of this.entries.values()) count += entry.visuals.size;
        return count;
    }

    /** How many visuals are animated. */
    get animatedCount(): number {
        let count = 0;
        for (const entry of this.entries.values()) {
            for (const running of entry.visuals.values()) if (running.drawing.animated) count++;
        }
        return count;
    }

    /** How many tokens the registry tracks. */
    get trackedTokens(): number {
        return this.entries.size;
    }

    /** Is the shared ticker attached? */
    get ticking(): boolean {
        return this.ticker !== null;
    }

    /** Bring one token's visuals in line with what its actor bears. */
    reconcile(token: StatusVisualToken): void {
        if (token.destroyed) {
            this.clearToken(token.id);
            return;
        }
        let entry = this.entries.get(token.id);
        if (entry?.token !== token) {
            // Unseen, or a new placeable under the same id: drop whatever the old one showed.
            this.clearToken(token.id);
            entry = { token, visible: token.isVisible, visuals: new Map() };
            this.entries.set(token.id, entry);
        }
        entry.visible = token.isVisible;
        const diff = diffStatusVisuals(entry.visuals, this.desiredFor(token));
        for (const id of diff.stop) this.stopVisual(entry, id);
        for (const next of diff.restart) {
            this.stopVisual(entry, next.desired.id);
            this.startVisual(entry, next);
        }
        for (const next of diff.start) this.startVisual(entry, next);
        for (const next of diff.update) {
            const running = entry.visuals.get(next.desired.id);
            if (running === undefined) continue;
            running.intensity = next.desired.intensity;
            running.drawing.setIntensity(next.desired.intensity);
        }
        this.promoteCapped();
        this.syncTicker();
    }

    /** A cheap per-refresh check: reconcile only a token the registry has not seen, was redrawn as a new object, or changed visibility. */
    refresh(token: StatusVisualToken): void {
        const entry = this.entries.get(token.id);
        if (entry?.token !== token || entry.visible !== token.isVisible) this.reconcile(token);
    }

    /** Stop and forget every visual on one token. */
    clearToken(tokenId: string): void {
        const entry = this.entries.get(tokenId);
        if (entry === undefined) return;
        for (const id of [...entry.visuals.keys()]) this.stopVisual(entry, id);
        this.entries.delete(tokenId);
        this.promoteCapped();
        this.syncTicker();
    }

    /** Stop and forget everything (canvas teardown). */
    clearAll(): void {
        for (const tokenId of [...this.entries.keys()]) this.clearToken(tokenId);
        this.syncTicker();
    }

    /** The visuals the token should show, keyed by status, with the user's intensity applied. */
    private desiredFor(token: StatusVisualToken): Map<string, KeyedStatusVisual> {
        const settings = WH40KSettings.getStatusVisualSettings();
        const mode = statusVisualMode({
            worldEnabled: settings.worldEnabled,
            enabled: settings.enabled,
            userIntensity: settings.intensity,
            reducedMotion: prefersReducedMotion(),
            visible: token.isVisible,
        });
        const keyed = new Map<string, KeyedStatusVisual>();
        const actor = token.actor;
        if (mode === 'none' || actor === null) return keyed;
        const scale = Math.min(1, settings.intensity);
        for (const [id, desired] of desiredStatusVisuals(statusVisualSources(actor, catalogVisualFor(actor)))) {
            keyed.set(id, { desired: { ...desired, intensity: desired.intensity * scale }, mode, key: statusVisualKey(desired.visual, mode) });
        }
        return keyed;
    }

    private startVisual(entry: TokenEntry, next: KeyedStatusVisual): void {
        const wantsMotion = next.mode === 'animated' && next.desired.visual.preset !== '';
        const capped = wantsMotion && this.animatedCount >= MAX_ANIMATED_STATUS_VISUALS;
        const drawing = new TokenStatusVisual(entry.token, next.desired.visual, wantsMotion && !capped, next.desired.intensity);
        entry.visuals.set(next.desired.id, { key: next.key, intensity: next.desired.intensity, visual: next.desired.visual, drawing, capped });
    }

    private stopVisual(entry: TokenEntry, id: string): void {
        entry.visuals.get(id)?.drawing.destroy();
        entry.visuals.delete(id);
    }

    /** Give a freed animation slot to a visual the cap held still. */
    private promoteCapped(): void {
        for (const entry of this.entries.values()) {
            for (const [id, running] of entry.visuals) {
                if (!running.capped) continue;
                if (this.animatedCount >= MAX_ANIMATED_STATUS_VISUALS) return;
                running.drawing.destroy();
                entry.visuals.set(id, { ...running, capped: false, drawing: new TokenStatusVisual(entry.token, running.visual, true, running.intensity) });
            }
        }
    }

    /** Attach the shared ticker while anything is animated; detach it when nothing is. */
    private syncTicker(): void {
        const wanted = this.animatedCount > 0;
        if (wanted && this.ticker === null) {
            this.ticker = canvasTicker();
            this.ticker?.add(this.onTick);
        } else if (!wanted && this.ticker !== null) {
            this.ticker.remove(this.onTick);
            this.ticker = null;
        }
    }

    private tick(): void {
        const delta = this.ticker?.deltaMS ?? 0;
        const viewport = canvasScreen();
        for (const entry of [...this.entries.values()]) {
            if (entry.token.destroyed) {
                this.clearToken(entry.token.id);
                continue;
            }
            const onScreen = entry.token.isVisible && (viewport === null || intersects(entry.token.getBounds(), viewport));
            for (const running of entry.visuals.values()) running.drawing.tick(delta, onScreen);
        }
    }
}

function intersects(a: ScreenRect, b: ScreenRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The canvas application's ticker, or null before a canvas exists. */
function canvasTicker(): TickerLike | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fvtt-types and strict tsc disagree on canvas.app nullability
    return canvas.app?.ticker ?? null;
}

/** The visible screen rectangle, or null before a canvas exists. */
function canvasScreen(): ScreenRect | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fvtt-types and strict tsc disagree on canvas.app nullability
    return canvas.app?.screen ?? null;
}

/** The catalog visual for a status, resolved for the bearer's game line. */
function catalogVisualFor(actor: StatusVisualActor): (id: string) => StatusVisual {
    const line = bearerLine(actor);
    return (id) => statusVisualOf(resolveCondition(id, line)?.system);
}

const layer = new StatusVisualLayer();

/** The canvas's token placeables, or none before a canvas is drawn. */
function canvasTokens(): StatusVisualToken[] {
    return canvas.tokens?.placeables ?? [];
}

/** Reconcile every token on the canvas (after the condition catalog loads, or a setting changes). */
export function refreshAllStatusVisuals(): void {
    for (const token of canvasTokens()) layer.reconcile(token);
}

/** The document an effect or condition item belongs to, as far as the layer reads it. */
interface EmbeddedLike {
    parent?: EmbeddedParent | null | undefined;
}

interface EmbeddedParent {
    documentName?: string | undefined;
    parent?: EmbeddedParent | null | undefined;
}

/** The actor an effect or item is embedded in (an effect on an item reaches through the item). */
function owningActor(doc: EmbeddedLike): EmbeddedParent | null {
    const parent = doc.parent ?? null;
    if (parent === null) return null;
    return parent.documentName === 'Actor' ? parent : owningActor(parent);
}

/** Reconcile the canvas tokens of the actor `doc` belongs to; returns those tokens. */
function reconcileActorOf(doc: EmbeddedLike): StatusVisualToken[] {
    const actor = owningActor(doc);
    if (actor === null) return [];
    const tokens = canvasTokens().filter((token) => token.actor === actor);
    for (const token of tokens) layer.reconcile(token);
    return tokens;
}

/** Play a status's apply / remove sound once on this client, when one of its tokens is visible here. */
function playStatusSound(statuses: Iterable<string>, event: StatusSoundEvent, tokens: readonly StatusVisualToken[]): void {
    const actor = tokens.find((candidate) => candidate.isVisible)?.actor ?? null;
    if (actor === null) return;
    const settings = WH40KSettings.getStatusVisualSettings();
    const visualFor = catalogVisualFor(actor);
    for (const id of statuses) {
        const src = pickCueAsset(visualFor(id).sounds, event, Math.random);
        playCueSound(src, cueSoundVolume({ worldEnabled: settings.worldEnabled, soundsEnabled: settings.soundsEnabled, volume: settings.volume, src }));
    }
}

/** An ActiveEffect as the hooks hand it over. */
interface EffectHookDoc extends EmbeddedLike {
    statuses: Iterable<string>;
}

/** An Item as the hooks hand it over. */
interface ItemHookDoc extends EmbeddedLike {
    type: string;
}

const SETTING_KEYS = new Set(
    [WH40KSettings.SETTINGS.attackCues, WH40KSettings.SETTINGS.statusVisuals, WH40KSettings.SETTINGS.statusVisualIntensity].map((key) => `${SYSTEM_ID}.${key}`),
);

/** Register the hooks that keep every token's status visuals in step with document state. Call once at init. */
export function registerStatusVisuals(): void {
    hooksOn('createActiveEffect', (effect: EffectHookDoc) => {
        playStatusSound(effect.statuses, 'apply', reconcileActorOf(effect));
    });
    hooksOn('updateActiveEffect', (effect: EffectHookDoc) => {
        reconcileActorOf(effect);
    });
    hooksOn('deleteActiveEffect', (effect: EffectHookDoc) => {
        playStatusSound(effect.statuses, 'remove', reconcileActorOf(effect));
    });
    const onConditionItem = (item: ItemHookDoc): void => {
        if (item.type === 'condition') reconcileActorOf(item);
    };
    hooksOn('createItem', onConditionItem);
    hooksOn('updateItem', onConditionItem);
    hooksOn('deleteItem', onConditionItem);
    // A drag preview is a clone under the real token's id: it must neither take over
    // nor tear down the real token's visuals.
    hooksOn('drawToken', (token: StatusVisualToken) => {
        if (token.isPreview) return;
        layer.clearToken(token.id);
        layer.reconcile(token);
    });
    hooksOn('refreshToken', (token: StatusVisualToken) => {
        if (!token.isPreview) layer.refresh(token);
    });
    hooksOn('destroyToken', (token: StatusVisualToken) => {
        if (!token.isPreview) layer.clearToken(token.id);
    });
    hooksOn('canvasReady', () => refreshAllStatusVisuals());
    hooksOn('canvasTearDown', () => layer.clearAll());
    hooksOn('clientSettingChanged', (key: string) => {
        if (SETTING_KEYS.has(key)) refreshAllStatusVisuals();
    });
    hooksOn('updateSetting', (setting: { key?: string }) => {
        if (setting.key !== undefined && SETTING_KEYS.has(setting.key)) refreshAllStatusVisuals();
    });
}

/** The registry's counters, for tests: nothing may be left running after a teardown. */
export function statusVisualStats(): { running: number; animated: number; tokens: number; ticking: boolean } {
    return { running: layer.runningCount, animated: layer.animatedCount, tokens: layer.trackedTokens, ticking: layer.ticking };
}
