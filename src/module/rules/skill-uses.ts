/**
 * Skill-use flow engine (#432).
 *
 * Generalizes the combat roll builder into a per-skill flow: when a player rolls
 * a skill, the engine offers that skill's applicable RAW "uses" (a plain test
 * plus any Special Uses). Each use declares whether it needs a target, its RAW
 * difficulty modifier, and how it resolves — so the roll dialog can render a use
 * picker and dispatch to a target-directed, auto-resolving flow (First Aid heals
 * a target the same way an attack damages one).
 *
 * This module is the **content-agnostic engine**: types, the per-skill use
 * registry, and pure resolution math. The mechanical *values* it exposes for
 * Medicae are sourced from the existing `healing.ts` `MEDICAE_ACTIONS` registry
 * rather than re-authored here. New skills declare their uses by adding a
 * registry entry; the dialog and dispatch code read this engine and never
 * hardcode a skill's uses inline.
 *
 * Foundry-free (no `foundry.*` / DataModel at module load) so it is directly
 * unit-testable, mirroring `rules/weapon-modes.ts` and `aptitude-derivation.ts`.
 */

import { type DamageTier, getDamageTier, MEDICAE_ACTIONS, type MedicaeActionKind } from './healing.ts';
import { DAY_SECONDS } from './world-time.ts';

/** How a use resolves once the roll lands. `general` is a plain pass/fail test. */
export type SkillUseKind =
    | 'general'
    | 'firstAid'
    | 'extendedCare'
    | 'surgery'
    | 'diagnose'
    | 'extractBullet'
    | 'interrogate'
    | 'detect'
    | 'social'
    | 'socialBuff'
    | 'inspire'
    | 'terrify'
    | 'warCry'
    | 'blather';

/** One selectable use offered when rolling a skill. */
export interface SkillUseDef {
    /** Stable id (used as the picker button value + i18n leaf). */
    readonly id: SkillUseKind;
    /** Localization key for the button label (namespaced under `WH40K.SkillUse.*`). */
    readonly labelKey: string;
    /** Whether the use prompts for a target token before rolling (like a combat attack). */
    readonly needsTarget: boolean;
    /** d100 test-target modifier applied to the roll (RAW difficulty for the use). */
    readonly difficultyMod: number;
    /** Resolution family — drives what the dialog does with the result. */
    readonly kind: SkillUseKind;
    /**
     * Characteristic key the target resists with when this use is opposed (e.g.
     * `'willpower'` for Interrogation). Absent for unopposed uses.
     */
    readonly opposedChar?: string;
    /**
     * Skill key the target resists with when this use is opposed by a *skill*
     * rather than a characteristic (e.g. `'scrutiny'` for Deceive). Takes
     * precedence over `opposedChar` in the opposed resolution. Absent otherwise.
     */
    readonly opposedSkill?: string;
    /**
     * Direction this social use pushes the target's disposition on success:
     * `+1` warmer (Charm), `-1` colder (Intimidate), `0`/absent for uses that
     * resolve a contest without a lasting disposition shift (Command, Deceive).
     */
    readonly dispositionDir?: -1 | 0 | 1;
    /**
     * Maximum disposition bands this use may shift in one resolution (RAW cap —
     * e.g. Wrangling shifts at most 3 levels, #446). Absent = uncapped.
     */
    readonly dispositionCap?: number;
    /**
     * RAW per-target time gate (#458): after this use resolves against a target it
     * cannot be used on them again until the gate reopens — e.g. First Aid is "once
     * every 24 hours" per patient (DH2 p109). `key` is the gate stamped on the target
     * actor. `windowSeconds` is the FIXED window; omit it when the window is rolled at
     * resolution (Interrogation's 1d5-day lockout), in which case the flow computes
     * the expiry itself. Absent = no cooldown.
     */
    readonly timeGate?: { readonly key: string; readonly windowSeconds?: number };
}

/** The universal "just roll the skill" use every skill offers. */
const GENERAL_SKILL_USE: SkillUseDef = {
    id: 'general',
    labelKey: 'WH40K.SkillUse.General',
    needsTarget: false,
    difficultyMod: 0,
    kind: 'general',
};

/** i18n leaf per Medicae action kind (labels live in the langpack, per Direction #6). */
const MEDICAE_LABEL_KEY: Record<MedicaeActionKind, string> = {
    firstAid: 'WH40K.SkillUse.Medicae.FirstAid',
    extendedCare: 'WH40K.SkillUse.Medicae.ExtendedCare',
    surgery: 'WH40K.SkillUse.Medicae.Surgery',
    diagnose: 'WH40K.SkillUse.Medicae.Diagnose',
    extractBullet: 'WH40K.SkillUse.Medicae.ExtractBullet',
};

/** Medicae kinds that act on a target (heal / operate) vs. informational. */
const MEDICAE_TARGETED: ReadonlySet<MedicaeActionKind> = new Set<MedicaeActionKind>(['firstAid', 'extendedCare', 'surgery', 'extractBullet']);

/**
 * RAW per-target cooldowns on Medicae uses (#458): "A given individual can only be
 * treated with first aid once every 24 hours, and only so long as he is not also
 * undergoing extended care." (DH2 Core p109). Extended Care runs on the same 24-hour
 * cycle and is the state that blocks First Aid.
 */
const MEDICAE_TIME_GATES: Partial<Record<MedicaeActionKind, { key: string; windowSeconds: number }>> = {
    firstAid: { key: 'firstAid', windowSeconds: DAY_SECONDS },
    extendedCare: { key: 'extendedCare', windowSeconds: DAY_SECONDS },
};

/** Build Medicae's use list from the shared `MEDICAE_ACTIONS` content registry. */
function medicaeUses(): SkillUseDef[] {
    return (Object.keys(MEDICAE_ACTIONS) as MedicaeActionKind[]).map((kind) => {
        const gate = MEDICAE_TIME_GATES[kind];
        return {
            id: kind,
            labelKey: MEDICAE_LABEL_KEY[kind],
            needsTarget: MEDICAE_TARGETED.has(kind),
            difficultyMod: MEDICAE_ACTIONS[kind].difficulty,
            kind,
            ...(gate !== undefined ? { timeGate: gate } : {}),
        };
    });
}

/**
 * Per-skill Special-Use builders, keyed by the actor's camelCase skill key.
 * A skill absent from this map has only the general test (no picker shown).
 * Builders are lazy so the list reflects any runtime edits to the source
 * content registries.
 */
/** Interrogation's target-directed use — opposed by the subject's Willpower (#435). */
const INTERROGATE_USE: SkillUseDef = {
    id: 'interrogate',
    labelKey: 'WH40K.SkillUse.Interrogation.Interrogate',
    needsTarget: true,
    difficultyMod: 0,
    kind: 'interrogate',
    opposedChar: 'WP',
    // RAW (#458): a 2+ DoF session locks the subject out for 1d5 days — a rolled
    // window, so the flow stamps the expiry itself (no fixed `windowSeconds`).
    timeGate: { key: 'interrogate' },
};

/** An opposed detection use — the actor's roll is opposed by the target's `opposedChar` (#434). */
function detectionUse(labelLeaf: string, opposedChar: string): SkillUseDef {
    return { id: 'detect', labelKey: `WH40K.SkillUse.Detection.${labelLeaf}`, needsTarget: true, difficultyMod: 0, kind: 'detect', opposedChar };
}

/**
 * A target-directed social-influence use (#433) — an opposed test that, on
 * success, may shift the target NPC's disposition (`dispositionDir`). Opposition
 * is by the target's Willpower (`opposedChar`) unless `opposedSkill` is given
 * (Deceive is opposed by the target's Scrutiny). `dispositionDir` of 0 resolves
 * the contest without a lasting disposition shift.
 */
function socialUse(labelLeaf: string, opts: { opposedChar?: string; opposedSkill?: string; dispositionDir: -1 | 0 | 1; dispositionCap?: number }): SkillUseDef {
    return {
        id: 'social',
        labelKey: `WH40K.SkillUse.Social.${labelLeaf}`,
        needsTarget: true,
        difficultyMod: 0,
        kind: 'social',
        dispositionDir: opts.dispositionDir,
        ...(opts.opposedChar !== undefined ? { opposedChar: opts.opposedChar } : {}),
        ...(opts.opposedSkill !== undefined ? { opposedSkill: opts.opposedSkill } : {}),
        ...(opts.dispositionCap !== undefined ? { dispositionCap: opts.dispositionCap } : {}),
    };
}

/**
 * A social buff/debuff sub-use (#447) — applies a temporary effect to a target
 * actor: an ally buff (Inspire/Terrify) or an enemy debuff (War Cry/Blather).
 * `id` is the specific effect (unique per skill so the picker buttons are distinct);
 * `kind` is `socialBuff` so the dispatch routes them together. Blather is opposed.
 */
function buffUse(buff: 'inspire' | 'terrify' | 'warCry' | 'blather', opts: { opposedChar?: string } = {}): SkillUseDef {
    const leaf = buff.charAt(0).toUpperCase() + buff.slice(1);
    return {
        id: buff,
        labelKey: `WH40K.SkillUse.Buff.${leaf}`,
        needsTarget: true,
        difficultyMod: 0,
        kind: 'socialBuff',
        ...(opts.opposedChar !== undefined ? { opposedChar: opts.opposedChar } : {}),
    };
}

const SKILL_USE_BUILDERS: Record<string, () => SkillUseDef[]> = {
    medicae: () => [GENERAL_SKILL_USE, ...medicaeUses()],
    interrogation: () => [GENERAL_SKILL_USE, INTERROGATE_USE],
    // Opposed detection (#434): a hider vs an observer's Perception, a scanner vs the
    // hider's Agility, Scrutiny vs the mark's Fellowship (Deceive), a thief vs Perception.
    stealth: () => [GENERAL_SKILL_USE, detectionUse('Stealth', 'Per')],
    awareness: () => [GENERAL_SKILL_USE, detectionUse('Awareness', 'Ag')],
    scrutiny: () => [GENERAL_SKILL_USE, detectionUse('Scrutiny', 'Fel')],
    sleightOfHand: () => [GENERAL_SKILL_USE, detectionUse('SleightOfHand', 'Per')],
    // Opposed detection/deception (#452, extends #434): the remaining hide/find/tail
    // skills, each opposed by the observer's Perception (or the quarry's Agility for
    // Tracking). Deceive's lie contest is the social use (#433), not repeated here.
    concealment: () => [GENERAL_SKILL_USE, detectionUse('Concealment', 'Per')],
    silentMove: () => [GENERAL_SKILL_USE, detectionUse('SilentMove', 'Per')],
    shadowing: () => [GENERAL_SKILL_USE, detectionUse('Shadowing', 'Per')],
    tracking: () => [GENERAL_SKILL_USE, detectionUse('Tracking', 'Ag')],
    disguise: () => [GENERAL_SKILL_USE, detectionUse('Disguise', 'Per')],
    // Social influence (#433): opposed vs the target's Willpower (Charm/Command/
    // Intimidate) or Scrutiny (Deceive); Charm warms and Intimidate cools disposition.
    // Social buff/debuff sub-uses (#447): Inspire/Terrify buff allies, War Cry debuffs
    // an enemy's defence, Blather (opposed vs WP) holds a target in inaction.
    charm: () => [GENERAL_SKILL_USE, socialUse('Charm', { opposedChar: 'WP', dispositionDir: 1 }), buffUse('inspire')],
    command: () => [GENERAL_SKILL_USE, socialUse('Command', { opposedChar: 'WP', dispositionDir: 0 }), buffUse('inspire'), buffUse('terrify')],
    intimidate: () => [GENERAL_SKILL_USE, socialUse('Intimidate', { opposedChar: 'WP', dispositionDir: -1 }), buffUse('warCry')],
    deceive: () => [GENERAL_SKILL_USE, socialUse('Deceive', { opposedSkill: 'scrutiny', dispositionDir: 0 })],
    blather: () => [GENERAL_SKILL_USE, buffUse('blather', { opposedChar: 'WP' })],
    // Animal/audience disposition (#446): Wrangling calms/trains a beast and Performer
    // sways a crowd — the #433 disposition engine, unopposed (a plain test vs the GM's
    // difficulty), warming the target up to the RAW cap of 3 bands.
    wrangling: () => [GENERAL_SKILL_USE, socialUse('Wrangle', { dispositionDir: 1, dispositionCap: 3 })],
    performer: () => [GENERAL_SKILL_USE, socialUse('Perform', { dispositionDir: 1, dispositionCap: 3 })],
};

/** The uses a skill offers, general test first. Unknown skills get the general test only. */
export function getSkillUses(skillKey: string): SkillUseDef[] {
    const builder = SKILL_USE_BUILDERS[skillKey];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig.strict.json) types this record access as possibly-undefined; the ESLint parser config has the flag off and sees the guard as redundant
    return builder !== undefined ? builder() : [GENERAL_SKILL_USE];
}

/** Whether a skill offers more than the plain test (i.e. the picker is worth showing). */
export function hasSkillUses(skillKey: string): boolean {
    return getSkillUses(skillKey).length > 1;
}

/** Look up a single use def by skill + id, or null when unknown. */
export function getSkillUse(skillKey: string, useId: string): SkillUseDef | null {
    return getSkillUses(skillKey).find((u) => u.id === useId) ?? null;
}

/** Target vitals the First-Aid resolver reads (subset of a creature's wounds block). */
export interface FirstAidTargetVitals {
    readonly woundsValue: number;
    readonly woundsMax: number;
    /** Critical-damage severity currently on the target (`system.wounds.critical`). */
    readonly criticalDamage: number;
    /** The medic-relevant Toughness bonus of the PATIENT (RAW Extended Care restores TB wounds). */
    readonly toughnessBonus: number;
}

/** Outcome of a resolved Medicae target action, ready to apply to the patient. */
export interface FirstAidOutcome {
    readonly success: boolean;
    /** Wounds to restore (clamped so value never exceeds max). */
    readonly woundsRestored: number;
    /** Critical-injury severity tiers removed (Surgery). */
    readonly criticalResolved: number;
    /** Whether ongoing Blood Loss is closed (First Aid). */
    readonly bloodLossStopped: boolean;
}

/**
 * Resolve a Medicae target action against a patient's vitals (RAW, per the
 * `MEDICAE_ACTIONS` descriptions). Pure: the caller applies the returned deltas.
 *
 * - **First Aid** — on success, close Blood Loss and restore 1 wound.
 * - **Extended Care** — on success, restore Toughness-bonus wounds.
 * - **Surgery** — on success, remove one Critical-injury severity tier.
 * - **Extract Embedded Object** — on success, no wound gain (removal only); failure
 *   is handled by the caller (RAW deals 1d5 Impact) and is out of this pure result.
 *
 * `degrees` is degrees of success (≥ 0). A failure (degrees < 1) yields an
 * all-zero, `success:false` outcome. `woundsRestored` is pre-clamped to the
 * missing-wounds headroom so applying it can't overheal.
 */
export function resolveFirstAid(kind: SkillUseKind, vitals: FirstAidTargetVitals, degrees: number): FirstAidOutcome {
    const success = degrees >= 1;
    const empty: FirstAidOutcome = { success: false, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false };
    if (!success) return empty;

    const headroom = Math.max(0, vitals.woundsMax - vitals.woundsValue);
    const clampWounds = (n: number): number => Math.max(0, Math.min(n, headroom));

    if (kind === 'firstAid') {
        return { success: true, woundsRestored: clampWounds(1), criticalResolved: 0, bloodLossStopped: true };
    }
    if (kind === 'extendedCare') {
        return { success: true, woundsRestored: clampWounds(Math.max(0, vitals.toughnessBonus)), criticalResolved: 0, bloodLossStopped: false };
    }
    if (kind === 'surgery') {
        return { success: true, woundsRestored: 0, criticalResolved: vitals.criticalDamage > 0 ? 1 : 0, bloodLossStopped: false };
    }
    // diagnose / extractBullet / general: informational or non-healing on success.
    return { success: true, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false };
}

/** Outcome of a resolved Interrogation (#435), ready to apply to the subject. */
export interface InterrogationOutcome {
    readonly success: boolean;
    /** Information tier extracted (0 = nothing; higher = more/clearer), scaled by degrees of success. */
    readonly infoTier: number;
    /** Fatigue levels inflicted on the subject — the session is taxing whether or not it succeeds (RAW). */
    readonly fatigue: number;
}

/**
 * Resolve an Interrogation against the opposed result (`degrees` = the
 * interrogator's degrees of success after the opposed Willpower test). Pure:
 * the caller applies the fatigue and surfaces the info tier. A failed session
 * still fatigues the subject.
 */
export function resolveInterrogation(degrees: number): InterrogationOutcome {
    if (degrees < 1) return { success: false, infoTier: 0, fatigue: 1 };
    return { success: true, infoTier: Math.max(1, Math.floor(degrees)), fatigue: 1 };
}

/** Outcome of a resolved social-influence use (#433), ready to apply to the target NPC. */
export interface SocialInfluenceOutcome {
    readonly success: boolean;
    /**
     * Signed disposition band shift to apply to the target on success (0 when the
     * use has no lasting disposition effect or the test failed). One band at 1
     * degree of success, +1 further band per two additional degrees.
     */
    readonly dispositionDelta: number;
}

/**
 * Resolve a social-influence use against the opposed result. `degrees` is the
 * actor's degrees of success after the opposed test; `success` is whether the
 * actor won the contest. Pure: the caller writes the disposition shift.
 *
 * A win with a directional use (Charm/Intimidate) shifts disposition one band in
 * that direction, gaining a further band per two extra degrees. A directionless
 * use (Command/Deceive) resolves the contest with no disposition change.
 */
export function resolveSocialInfluence(def: SkillUseDef, degrees: number, success: boolean): SocialInfluenceOutcome {
    const dir = def.dispositionDir ?? 0;
    if (!success || dir === 0) return { success, dispositionDelta: 0 };
    const bands = 1 + Math.floor(Math.max(0, degrees - 1) / 2);
    const capped = def.dispositionCap !== undefined ? Math.min(bands, def.dispositionCap) : bands;
    return { success, dispositionDelta: dir * capped };
}

/** Rounds a Blather (#447) holds its target inactive: 1 + degrees of victory on a win, else 0. */
export function blatherRounds(success: boolean, margin: number): number {
    return success ? 1 + Math.max(0, margin) : 0;
}

/* -------------------------------------------------------------------------- */
/*  Degrees-of-success readout (#437 knowledge; extended by #438 / #436)        */
/* -------------------------------------------------------------------------- */

/** Skill families whose roll surfaces a degrees-of-success interpretation on the card. */
export type ReadoutFamily = 'knowledge' | 'physical' | 'objectInteraction';

/** A resolved DoS readout: a magnitude tier and the langpack key describing it. */
export interface DosReadout {
    readonly tier: number;
    readonly labelKey: string;
}

/** Knowledge/investigation: degrees of success gate how much is recalled/learned. */
function knowledgeReadout(degrees: number, success: boolean): DosReadout {
    if (!success) return { tier: 0, labelKey: 'WH40K.SkillUse.Readout.Knowledge.Nothing' };
    const tier = Math.max(1, Math.floor(degrees));
    const level = tier >= 4 ? 'Comprehensive' : tier >= 2 ? 'Detailed' : 'Basic';
    return { tier, labelKey: `WH40K.SkillUse.Readout.Knowledge.${level}` };
}

/** Physical feats (Athletics/Acrobatics): degrees of success scale the distance/height cleared. */
function physicalReadout(degrees: number, success: boolean): DosReadout {
    if (!success) return { tier: 0, labelKey: 'WH40K.SkillUse.Readout.Physical.Fail' };
    return { tier: Math.max(1, Math.floor(degrees)), labelKey: 'WH40K.SkillUse.Readout.Physical.Success' };
}

/** Security/Tech-Use object interaction: degrees of success reduce the time taken / improve completeness. */
function objectInteractionReadout(degrees: number, success: boolean): DosReadout {
    if (!success) return { tier: 0, labelKey: 'WH40K.SkillUse.Readout.Object.Fail' };
    return { tier: Math.max(1, Math.floor(degrees)), labelKey: 'WH40K.SkillUse.Readout.Object.Success' };
}

const READOUT_RESOLVERS: Record<ReadoutFamily, (degrees: number, success: boolean) => DosReadout> = {
    knowledge: knowledgeReadout,
    physical: physicalReadout,
    objectInteraction: objectInteractionReadout,
};

/** Resolve the DoS readout for a family from the (opposed-adjusted) degrees + success. Pure. */
export function resolveDosReadout(family: ReadoutFamily, degrees: number, success: boolean): DosReadout {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess types this record access as possibly-undefined; the ESLint parser has the flag off
    return (READOUT_RESOLVERS[family] ?? knowledgeReadout)(degrees, success);
}

/** Skills whose normal roll gains a DoS readout (no picker), keyed by camelCase skill key. */
const SKILL_READOUT: Record<string, ReadoutFamily> = {
    inquiry: 'knowledge',
    commonLore: 'knowledge',
    scholasticLore: 'knowledge',
    forbiddenLore: 'knowledge',
    logic: 'knowledge',
    psyniscience: 'knowledge',
    athletics: 'physical',
    acrobatics: 'physical',
    security: 'objectInteraction',
    techUse: 'objectInteraction',
};

/** The readout family for a skill, or null when the skill has none. */
export function getSkillReadout(skillKey: string): ReadoutFamily | null {
    return SKILL_READOUT[skillKey] ?? null;
}

/** Minimal patient surface the outcome applier reads and writes (a thin actor adapter). */
export interface FirstAidPatient {
    readonly woundsValue: number;
    readonly woundsMax: number;
    readonly criticalDamage: number;
    /** Persist the new vitals (only the changed fields are passed). */
    update: (patch: { woundsValue?: number; criticalDamage?: number }) => Promise<void>;
}

/**
 * Apply a resolved {@link FirstAidOutcome} to a patient — restore wounds (clamped
 * to max) and reduce critical severity (floored at 0). Pure over the injected
 * adapter, so it is unit-testable without Foundry and reused by `MedicaeActionData`
 * (which wraps the real actor). Returns the fields it wrote (empty when nothing changed).
 */
export async function applyFirstAidOutcome(patient: FirstAidPatient, outcome: FirstAidOutcome): Promise<{ woundsValue?: number; criticalDamage?: number }> {
    const patch: { woundsValue?: number; criticalDamage?: number } = {};
    if (outcome.woundsRestored > 0) {
        patch.woundsValue = Math.min(patient.woundsMax, patient.woundsValue + outcome.woundsRestored);
    }
    if (outcome.criticalResolved > 0) {
        patch.criticalDamage = Math.max(0, patient.criticalDamage - outcome.criticalResolved);
    }
    if (patch.woundsValue !== undefined || patch.criticalDamage !== undefined) {
        await patient.update(patch);
    }
    return patch;
}

/**
 * RAW First-Aid difficulty scales with how hurt the patient is (the dialog can
 * surface this as the default difficulty when a target is chosen): treating a
 * heavily-damaged patient is harder. Content-agnostic mapping over `getDamageTier`.
 */
export function firstAidDifficultyForTier(woundsValue: number, woundsMax: number): number {
    const byTier: Record<DamageTier, number> = {
        unharmed: 0, // Ordinary (stabilising)
        lightlyDamaged: -10, // Difficult
        heavilyDamaged: -20, // Hard
    };
    return byTier[getDamageTier(woundsValue, woundsMax)];
}
