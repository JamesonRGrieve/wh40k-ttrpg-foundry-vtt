/**
 * @file The one place a resolved roll becomes an attack cue (#594).
 *
 * The attack path calls {@link cueAttackResolved} once the attack card is posted (the
 * same resolved `ActionData` the card reads: success, hits landed, jam, overheat,
 * the placed area template, Phenomena / Perils), and {@link cueHitsResolved} once its
 * hits are rolled (criticals, and who an area attack actually hit). Each builds a plan
 * with the pure mapping in `rules/attack-cue.ts`, plays it here and sends it to every
 * other client over the system socket, where it plays under that user's own settings.
 *
 * A Dodge or Parry test is a skill roll through the same path; a successful one cues
 * on the defender.
 */

import { playCuePlan } from '../canvas/attack-cue-canvas.ts';
import {
    type AttackCueOutcome,
    type CueArea,
    type CueAttackKind,
    type CuePlan,
    type CueStep,
    cueProfileOf,
    type HitCue,
    planAttackCues,
    planHitCues,
    planReactionCues,
} from '../rules/attack-cue.ts';
import { emitSystemSocket, onSystemSocket, type SystemSocketMessage } from '../utils/system-socket.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/** Socket message type for a cue plan. */
const CUE_MESSAGE_TYPE = 'attackCue';

interface AttackCueMessage extends SystemSocketMessage {
    readonly type: typeof CUE_MESSAGE_TYPE;
    readonly plan: CuePlan;
}

function isAttackCueMessage(message: SystemSocketMessage): message is AttackCueMessage {
    return message.type === CUE_MESSAGE_TYPE && 'plan' in message;
}

/** The effect markers `ActionData.effects` carries that a cue reads. */
export const CUE_EFFECT = {
    jam: 'jam',
    overheat: 'overheat',
    broken: 'weapon-broken',
    phenomena: 'psychic-phenomena',
    perils: 'perils-of-the-warp',
} as const;

/** The skill keys whose successful test is a defensive reaction. */
const REACTION_KEYS: ReadonlySet<string> = new Set(['dodge', 'parry']);

/** An actor whose token on the viewed scene the cue plays at. */
interface CueActorLike {
    getActiveTokens: () => readonly { id: string }[];
}

/** The slice of a rolled weapon or power a cue reads. */
interface CueItemLike {
    readonly isMelee: boolean;
    readonly system: object;
}

/** The slice of a resolved `ActionData` a cue reads. Structural, so the roll layer need not be imported here. */
export interface CueActionLike {
    readonly effects: readonly string[];
    readonly rollData: {
        readonly sourceActor: CueActorLike | null;
        readonly targetActor: CueActorLike | null;
        readonly weapon?: CueItemLike | undefined;
        readonly power?: CueItemLike | undefined;
        readonly success: boolean;
        readonly rollKey: string;
        readonly isTargetOnly?: boolean | undefined;
        /** The area the attack's quality declared (#599): its shape, and whether it sits on the impact point. */
        readonly areaTemplate?: { readonly shape: 'cone' | 'circle'; readonly anchor: string } | null | undefined;
        /** The template the attack placed on the scene. */
        readonly areaTemplateRef?: { readonly templateId: string } | null | undefined;
        /** Who the resolved template caught, and whether the area hit each. */
        readonly areaResults?: readonly { readonly tokenId: string; readonly hit: boolean }[] | undefined;
    };
    readonly damageData?: { readonly hits: readonly { readonly righteousFury: readonly object[] }[]; readonly additionalHits: number } | undefined;
}

/** The first token of an actor on the viewed scene, or null. */
function tokenIdOf(actor: CueActorLike | null): string | null {
    return actor?.getActiveTokens()[0]?.id ?? null;
}

/** What the roll attacked with: a power, a melee weapon, a ranged weapon; null for any other roll. */
export function cueAttackKind(rollData: CueActionLike['rollData']): CueAttackKind | null {
    if (rollData.power !== undefined) return 'psychic';
    if (rollData.weapon === undefined) return null;
    return rollData.weapon.isMelee ? 'melee' : 'ranged';
}

/** The area an attack placed, once its template is on the scene. */
function cueArea(rollData: CueActionLike['rollData']): CueArea | null {
    const spec = rollData.areaTemplate ?? null;
    const ref = rollData.areaTemplateRef ?? null;
    if (spec === null || ref === null) return null;
    return { templateId: ref.templateId, shape: spec.shape, scattered: spec.anchor === 'impact' && !rollData.success };
}

/**
 * The cue-facing outcome of a resolved attack, or null when it cues nothing: not an
 * attack, a target-only post (no dice rolled yet), or no attacker token on the scene.
 */
export function attackCueOutcome(action: CueActionLike): AttackCueOutcome | null {
    const rollData = action.rollData;
    const kind = cueAttackKind(rollData);
    if (kind === null || rollData.isTargetOnly === true) return null;
    const sourceTokenId = tokenIdOf(rollData.sourceActor);
    if (sourceTokenId === null) return null;
    const effects = new Set(action.effects);
    return {
        kind,
        sourceTokenId,
        targetTokenId: tokenIdOf(rollData.targetActor),
        success: rollData.success,
        hits: rollData.success ? 1 + Math.max(0, action.damageData?.additionalHits ?? 0) : 0,
        area: cueArea(rollData),
        jammed: effects.has(CUE_EFFECT.jam),
        overheated: effects.has(CUE_EFFECT.overheat),
        exploded: effects.has(CUE_EFFECT.broken),
        phenomena: effects.has(CUE_EFFECT.phenomena),
        perils: effects.has(CUE_EFFECT.perils),
    };
}

/** The steps a resolved roll plays: its attack, or a successful Dodge / Parry. */
export function attackCueSteps(action: CueActionLike, rng: () => number = Math.random): CueStep[] {
    const rollData = action.rollData;
    const outcome = attackCueOutcome(action);
    if (outcome !== null) {
        const item = rollData.power ?? rollData.weapon;
        return planAttackCues(outcome, cueProfileOf(item?.system), rng);
    }
    if (cueAttackKind(rollData) !== null || !REACTION_KEYS.has(rollData.rollKey)) return [];
    const defenderTokenId = tokenIdOf(rollData.sourceActor);
    if (defenderTokenId === null) return [];
    const reaction = rollData.rollKey === 'parry' ? 'parry' : 'dodge';
    return planReactionCues({ reaction, defenderTokenId, success: rollData.success }, cueProfileOf(null), rng);
}

/**
 * The steps once an attack's hits are rolled: criticals on the hits that rolled
 * Righteous Fury (or the line's equivalent), and, for an area attack, an impact on
 * each creature hit and a dodge on each that avoided it.
 */
export function hitCueSteps(action: CueActionLike, rng: () => number = Math.random): CueStep[] {
    const rollData = action.rollData;
    const kind = cueAttackKind(rollData);
    const hits = action.damageData?.hits ?? [];
    if (kind === null || hits.length === 0) return [];
    const profile = cueProfileOf((rollData.power ?? rollData.weapon)?.system);
    const results = rollData.areaResults ?? [];
    if (rollData.areaTemplate !== null && rollData.areaTemplate !== undefined) {
        const caught = results.filter((result) => result.hit);
        const areaHits: HitCue[] = caught.map((result, index) => ({ tokenId: result.tokenId, critical: (hits[index]?.righteousFury.length ?? 0) > 0 }));
        const avoided = results.filter((result) => !result.hit).map((result) => result.tokenId);
        return planHitCues(areaHits, avoided, kind, profile, true, rng);
    }
    const targetTokenId = tokenIdOf(rollData.targetActor);
    if (targetTokenId === null) return [];
    const cues: HitCue[] = hits.map((hit) => ({ tokenId: targetTokenId, critical: hit.righteousFury.length > 0 }));
    return planHitCues(cues, [], kind, profile, false, rng);
}

/** The scene a drawn canvas shows, or null: no canvas before the scene draws, nor in headless contexts (tests). */
function viewedSceneId(): string | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: the `canvas` global is undefined until Foundry initialises its canvas, and in headless contexts
    if (typeof canvas === 'undefined' || !canvas.ready) return null;
    return canvas.scene?.id ?? null;
}

/** Play the steps here and on every other client. Nothing is planned or sent without a canvas or with cues off for the world. */
function broadcast(plan: (rng: () => number) => CueStep[]): void {
    const sceneId = viewedSceneId();
    if (sceneId === null || !WH40KSettings.getAttackCueSettings().worldEnabled) return;
    const steps = plan(Math.random);
    if (steps.length === 0) return;
    const message: AttackCueMessage = { type: CUE_MESSAGE_TYPE, plan: { sceneId, steps } };
    emitSystemSocket(message);
    playCuePlan(message.plan);
}

/** Cue a resolved attack (or Dodge / Parry). Called once the roll's card is posted. */
export function cueAttackResolved(action: CueActionLike): void {
    broadcast((rng) => attackCueSteps(action, rng));
}

/** Cue an attack's rolled hits. Called once its hits are calculated. */
export function cueHitsResolved(action: CueActionLike): void {
    broadcast((rng) => hitCueSteps(action, rng));
}

/** Play cue plans other clients send. Registered once at ready. */
export function registerAttackCueSocket(): void {
    onSystemSocket((message) => {
        if (isAttackCueMessage(message)) playCuePlan(message.plan);
    });
}
