/**
 * @file The evasion window between an attack that hits and its damage (#414).
 *
 * An attack that hits a target opens a window: the attack card shows it as
 * pending, the target's owners (and the GM, who plays NPCs and stands in for
 * absent players) get a whispered prompt with Dodge / Parry / Take the hit, and
 * the damage waits. The defender's evasion test is resolved against THAT attack
 * (`rules/evasion.ts`); its card carries the outcome as a flag, and the client
 * that posted the attack — the only one holding its ActionData — applies it:
 * the negated hits are dropped, the attack card re-renders, and damage proceeds
 * on what is left.
 *
 * No socket plumbing: the prompt is a whispered ChatMessage and the outcome rides
 * on the evasion card, both delivered to every client by Foundry itself.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { actionBudgetForActor } from '../rules/action-economy.ts';
import { resolveActionLimit } from '../rules/condition-mechanics.ts';
import { activeConditionMechanics, type ConditionBearer } from '../rules/condition-registry.ts';
import type { EvasionGate, EvasionNegationPart, EvasionSkill } from '../rules/evasion.ts';
import { readGrappleState } from '../rules/grapple.ts';
import { canWeaponParry } from '../rules/weapon-quality-effects.ts';
import type { I18nKey } from '../types/i18n-keys';

/** The flag key a whispered evasion prompt carries its attack under. */
export const EVASION_PROMPT_FLAG = 'evasionPrompt';
/** The flag key an evasion card carries its outcome under. */
export const EVASION_OUTCOME_FLAG = 'evasionOutcome';
/** The prompt card. */
export const EVASION_PROMPT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/evasion-prompt-chat.hbs';
/** The card for a defender who takes the hit. */
export const EVASION_DECLINED_TEMPLATE = 'systems/wh40k-rpg/templates/chat/evasion-declined-chat.hbs';

/** Everything the defender's client needs to resolve an evasion against the attack — carried on the prompt. */
export interface EvasionPromptContext {
    /** The attack's ActionData id. */
    readonly attackId: string;
    /** The attacker — the opponent a Counter Attack strikes back at (#603); '' when unknown. */
    readonly attackerUuid: string;
    readonly attackerName: string;
    readonly weaponName: string;
    readonly defenderUuid: string;
    readonly defenderName: string;
    /** The declared action (`Full Auto Burst`, `Swift Attack`, …). */
    readonly action: string;
    /** Hits the attack landed on the defender. */
    readonly hitsLanded: number;
    readonly isMeleeAttack: boolean;
    readonly storm: boolean;
    readonly twinLinked: boolean;
    /** The attacking weapon cannot be Parried (Flexible). */
    readonly attackerPreventsParry: boolean;
    /** The penalty the attacking weapon imposes on a Parry (Fast); 0 when none. */
    readonly parryPenalty: number;
}

/** What the defender's evasion did to the attack — carried on the evasion card. */
export interface EvasionOutcome {
    readonly attackId: string;
    readonly defenderName: string;
    /** The skill tested, or null when the defender took the hit. */
    readonly skill: EvasionSkill | null;
    readonly success: boolean;
    readonly hitsLanded: number;
    readonly negated: number;
    readonly remaining: number;
    readonly parts: readonly EvasionNegationPart[];
}

/** One hoverable row of the negation, as the attack card renders it. */
interface EvasionCardRow {
    label: string;
    value: number;
    /** JSON payload for the shared wh40k-tooltip "modifier" type. */
    tooltipData: string;
}

/** The attack's evasion window as its card shows it. */
export interface AttackEvasion {
    status: 'pending' | 'blocked' | 'resolved' | 'forced';
    defenderName: string;
    hitsLanded: number;
    /** The localized line the card shows for this state. */
    summary: string;
    /** The resolved outcome; null until the defender answers. */
    outcome: EvasionOutcome | null;
    /** The negation's parts as hoverable rows (resolved only). */
    rows: EvasionCardRow[];
    /** Every hit was evaded: the card offers no Roll Damage. */
    fullyEvaded: boolean;
}

/* -------------------------------------------- */
/*  Flag payloads                               */
/* -------------------------------------------- */

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * The evasion prompt a message carries, or null.
 * @param {unknown} flag  `message.flags['wh40k-rpg'].evasionPrompt`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage flags are an untyped JSON bag
export function readEvasionPrompt(flag: unknown): EvasionPromptContext | null {
    if (!isRecord(flag)) return null;
    const {
        attackId,
        attackerUuid,
        attackerName,
        weaponName,
        defenderUuid,
        defenderName,
        action,
        hitsLanded,
        isMeleeAttack,
        storm,
        twinLinked,
        attackerPreventsParry,
        parryPenalty,
    } = flag;
    if (typeof attackId !== 'string' || typeof defenderUuid !== 'string' || typeof hitsLanded !== 'number' || typeof action !== 'string') return null;
    return {
        attackId,
        attackerUuid: typeof attackerUuid === 'string' ? attackerUuid : '',
        attackerName: typeof attackerName === 'string' ? attackerName : '',
        weaponName: typeof weaponName === 'string' ? weaponName : '',
        defenderUuid,
        defenderName: typeof defenderName === 'string' ? defenderName : '',
        action,
        hitsLanded,
        isMeleeAttack: isMeleeAttack === true,
        storm: storm === true,
        twinLinked: twinLinked === true,
        attackerPreventsParry: attackerPreventsParry === true,
        parryPenalty: typeof parryPenalty === 'number' ? parryPenalty : 0,
    };
}

const PART_KEYS: ReadonlySet<string> = new Set(['hit', 'degrees', 'storm', 'cap']);

/**
 * The evasion outcome a message carries, or null.
 * @param {unknown} flag  `message.flags['wh40k-rpg'].evasionOutcome`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage flags are an untyped JSON bag
export function readEvasionOutcome(flag: unknown): EvasionOutcome | null {
    if (!isRecord(flag)) return null;
    const { attackId, defenderName, skill, success, hitsLanded, negated, remaining, parts } = flag;
    if (typeof attackId !== 'string' || typeof negated !== 'number' || typeof remaining !== 'number' || typeof hitsLanded !== 'number') return null;
    const readParts: EvasionNegationPart[] = [];
    if (Array.isArray(parts)) {
        for (const part of parts) {
            if (isRecord(part) && typeof part['key'] === 'string' && PART_KEYS.has(part['key']) && typeof part['value'] === 'number') {
                readParts.push({ key: part['key'] as EvasionNegationPart['key'], value: part['value'] });
            }
        }
    }
    return {
        attackId,
        defenderName: typeof defenderName === 'string' ? defenderName : '',
        skill: skill === 'dodge' || skill === 'parry' ? skill : null,
        success: success === true,
        hitsLanded,
        negated,
        remaining,
        parts: readParts,
    };
}

/**
 * The outcome already posted for an attack, or null while it is unanswered — read
 * off the chat log, which every client holds.
 * @param {string} attackId  The attack's ActionData id.
 */
export function findEvasionOutcome(attackId: string): EvasionOutcome | null {
    for (const message of game.messages) {
        const outcome = readEvasionOutcome(message.getFlag(SYSTEM_ID, EVASION_OUTCOME_FLAG));
        if (outcome?.attackId === attackId) return outcome;
    }
    return null;
}

/**
 * Close a rendered prompt once its attack is answered: its controls disable and it
 * says so, so nobody spends a second Reaction on the same attack.
 * @param {HTMLElement} root  The prompt's element (or one containing it).
 * @param {string} attackId  The answered attack.
 * @param {string} statusText  The localized "already answered" line.
 */
export function closeEvasionPrompt(root: HTMLElement, attackId: string, statusText: string): void {
    const prompts = root.matches('[data-evasion-prompt]') ? [root] : Array.from(root.querySelectorAll<HTMLElement>('[data-evasion-prompt]'));
    for (const prompt of prompts) {
        if (prompt.dataset['evasionPrompt'] !== attackId) continue;
        for (const button of prompt.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
        const status = prompt.querySelector<HTMLElement>('[data-evasion-status]');
        if (status !== null) {
            status.textContent = statusText;
            status.hidden = false;
        }
    }
}

/* -------------------------------------------- */
/*  The defender's state                        */
/* -------------------------------------------- */

/** An actor as the evasion gate reads it. */
export interface EvasionActor extends ConditionBearer {
    readonly id?: string | null;
    readonly flags?: object;
}

/**
 * What the actor's state allows an evasion: its Reaction budget (null out of
 * combat), the action limit its conditions impose, and whether it is in a grapple.
 */
export function evasionGateFor(actor: EvasionActor): EvasionGate {
    const budget = actor.id === undefined || actor.id === null ? null : actionBudgetForActor(actor.id);
    return {
        reactionRemaining: budget === null ? null : budget.reactionRemaining,
        actionLimit: budget?.actionLimit ?? resolveActionLimit(activeConditionMechanics(actor)).limit,
        inGrapple: readGrappleState(actor.flags, SYSTEM_ID) !== 'none',
    };
}

/** A held item as {@link defenderWeaponsCanParry} reads it. */
export interface HeldItem {
    readonly isMelee?: boolean;
    readonly equipped?: boolean;
}

/**
 * Whether each melee weapon the defender holds can parry (Unwieldy cannot); empty
 * when it holds none and would parry bare-handed.
 * @param {Iterable<HeldItem>} items  The defender's owned items.
 */
export function defenderWeaponsCanParry(items: Iterable<HeldItem>): boolean[] {
    const out: boolean[] = [];
    for (const item of items) {
        if (item.isMelee !== true || item.equipped !== true) continue;
        // eslint-disable-next-line no-restricted-syntax -- boundary: an owned Foundry Item read through the duck-typed QualityItem canWeaponParry accepts
        out.push(canWeaponParry(item as Parameters<typeof canWeaponParry>[0]));
    }
    return out;
}

/* -------------------------------------------- */
/*  Card text                                   */
/* -------------------------------------------- */

const SKILL_LABEL: Readonly<Record<EvasionSkill, I18nKey>> = {
    dodge: 'WH40K.Combat.AttemptDodge',
    parry: 'WH40K.Combat.AttemptParry',
};

const PART_LABEL: Readonly<Record<EvasionNegationPart['key'], I18nKey>> = {
    hit: 'WH40K.Evasion.Part.Hit',
    degrees: 'WH40K.Evasion.Part.Degrees',
    storm: 'WH40K.Evasion.Part.Storm',
    cap: 'WH40K.Evasion.Part.Cap',
};

const PART_SOURCE: Readonly<Record<EvasionNegationPart['key'], I18nKey>> = {
    hit: 'WH40K.Evasion.Source.Hit',
    degrees: 'WH40K.Evasion.Source.Degrees',
    storm: 'WH40K.Evasion.Source.Storm',
    cap: 'WH40K.Evasion.Source.Cap',
};

/** The one-line statement of what an evasion did. */
export function evasionOutcomeSummary(outcome: EvasionOutcome): string {
    if (outcome.skill === null) return t('WH40K.Evasion.Summary.Declined', { defender: outcome.defenderName });
    const skill = t(SKILL_LABEL[outcome.skill]);
    if (!outcome.success) return t('WH40K.Evasion.Summary.Failed', { defender: outcome.defenderName, skill });
    if (outcome.remaining === 0) return t('WH40K.Evasion.Summary.Evaded', { defender: outcome.defenderName, skill });
    return t('WH40K.Evasion.Summary.Negated', { defender: outcome.defenderName, skill, negated: outcome.negated, landed: outcome.hitsLanded });
}

/** The attack card's evasion block once the defender has answered. */
export function resolvedAttackEvasion(outcome: EvasionOutcome): AttackEvasion {
    const rows = outcome.parts.map((part) => {
        const label = t(PART_LABEL[part.key]);
        return { label, value: part.value, tooltipData: JSON.stringify({ title: label, sources: [{ name: t(PART_SOURCE[part.key]), value: part.value }] }) };
    });
    return {
        status: 'resolved',
        defenderName: outcome.defenderName,
        hitsLanded: outcome.hitsLanded,
        summary: evasionOutcomeSummary(outcome),
        outcome,
        rows,
        fullyEvaded: outcome.remaining === 0,
    };
}

/** The attack card's evasion block while the window is open, or closed by the defender's state. */
export function openAttackEvasion(defenderName: string, hitsLanded: number, blockReason: I18nKey | null): AttackEvasion {
    const summary =
        blockReason === null
            ? t('WH40K.Evasion.Summary.Pending', { defender: defenderName })
            : t('WH40K.Evasion.Summary.Blocked', { defender: defenderName, reason: t(blockReason) });
    return { status: blockReason === null ? 'pending' : 'blocked', defenderName, hitsLanded, summary, outcome: null, rows: [], fullyEvaded: false };
}

/** The attack card's evasion block after the GM rolled damage over a pending window. */
export function forcedAttackEvasion(evasion: AttackEvasion): AttackEvasion {
    return { ...evasion, status: 'forced', summary: t('WH40K.Evasion.Summary.Forced', { defender: evasion.defenderName }) };
}

/* -------------------------------------------- */
/*  Who answers                                 */
/* -------------------------------------------- */

/** A user as the recipient check reads it. */
export interface EvasionUser {
    readonly id: string | null;
    readonly isGM: boolean;
}

/**
 * Who may answer for the defender: its owners and every GM — nobody else.
 * @param {Iterable<U>} users  The world's users.
 * @param {(user: U) => boolean} owns  Whether a user owns the defender.
 * @returns {string[]}  The recipients' user ids.
 */
export function evasionRecipients<U extends EvasionUser>(users: Iterable<U>, owns: (user: U) => boolean): string[] {
    const ids: string[] = [];
    for (const user of users) {
        if (user.id !== null && (user.isGM || owns(user))) ids.push(user.id);
    }
    return ids;
}
