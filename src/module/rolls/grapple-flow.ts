/**
 * @file grapple-flow — resolve one grapple option and post its card (#120).
 *
 * Each option is tested the way its line prints it (`GrappleRules` on the line's
 * game-system config):
 * - An Opposed Strength test, or a skill opposed by the other's Strength, rolls
 *   both sides through the RAW Opposed-test ladder with the Size edge. Each side's
 *   modifiers (the thrown-down bonus) are rows with their source on the card.
 * - A plain skill test (Slip Free) goes through the actor's own skill pipeline, so
 *   the roll dialog and the card show its modifiers like any other test.
 * - Ready and Use Item have no test; the card states the option.
 * A won option that changes the grapple (Break Free, Slip Free, Take Control,
 * Throw Down's thrown-down mark, Stand) carries both participants' flag writes
 * on its card for the active GM (`grapple-relay`).
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import {
    asGrappleParticipant,
    buildGrappleCard,
    GRAPPLE_ACTION_LABEL_KEYS,
    GRAPPLE_EFFECT_KEYS,
    GRAPPLE_UPDATE_FLAG,
    type GrappleCardModifier,
    type GrappleCardSideInput,
    type GrappleFlagWrite,
    type GrappleModifier,
    type GrappleOptionId,
    type GrappleOptionRule,
    type GrappleParticipant,
    type GrappleRole,
    type GrappleRules,
    grappleOptionWrites,
    grappleSideModifiers,
    grappleSideTarget,
    grappleSize,
    grappleSkill,
    grappleStrength,
    readGrappleThrownDown,
    resolveGrappleOpposed,
} from '../rules/grapple.ts';
import type { I18nKey } from '../types/i18n-keys';
import { SimpleSkillData } from './action-data.ts';
import { emitChatFromTemplate } from './roll-helpers.ts';

const GRAPPLE_CARD = 'systems/wh40k-rpg/templates/chat/grapple-opposed-chat.hbs';

/** A grapple participant actor, as far as the flow reads it. */
export interface GrappleActorDoc {
    readonly name: string;
    readonly uuid: string | null;
    readonly system: object;
    readonly flags: object;
}

/** The other role of a grapple. */
export function otherGrappleRole(role: GrappleRole): GrappleRole {
    return role === 'controller' ? 'target' : 'controller';
}

/** One side's modifier rows, localised for the card. */
function cardModifiers(modifiers: readonly GrappleModifier[]): GrappleCardModifier[] {
    return modifiers.map((modifier) => ({ label: t(modifier.labelKey as I18nKey), value: modifier.value, source: t(modifier.sourceKey as I18nKey) }));
}

/** The skill's label off the actor's skill map, else the skill key. */
function skillLabel(participant: GrappleParticipant, skill: string): string {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the actor's skill map carries a display label the participant view does not type
    const label = (participant.system.skills?.[skill] as { label?: string } | undefined)?.label;
    return label !== undefined && label !== '' ? label : skill;
}

/**
 * A grapple option tested by the actor's own skill (Slip Free: "a Challenging (+0)
 * Acrobatics test"). The roll goes through the skill pipeline; a success carries the
 * grapple flag writes the option makes on its card, and states its effect.
 */
export class GrappleSkillActionData extends SimpleSkillData {
    readonly optionId: GrappleOptionId;
    readonly writesOnSuccess: readonly GrappleFlagWrite[] | null;

    constructor(optionId: GrappleOptionId, writesOnSuccess: readonly GrappleFlagWrite[] | null) {
        super();
        this.optionId = optionId;
        this.writesOnSuccess = writesOnSuccess;
    }

    /** On a success: state the option's effect and carry its grapple writes for the GM. */
    override async descriptionText(): Promise<void> {
        await super.descriptionText();
        if (!this.rollData.success) return;
        this.addEffect(t(GRAPPLE_ACTION_LABEL_KEYS[this.optionId] as I18nKey), t(GRAPPLE_EFFECT_KEYS[this.optionId] as I18nKey));
        if (this.writesOnSuccess !== null) this.chatFlags = { ...this.chatFlags, [GRAPPLE_UPDATE_FLAG]: [...this.writesOnSuccess] };
    }
}

/** What resolving one option needs. */
export interface GrappleOptionRequest {
    option: GrappleOptionRule;
    actor: GrappleActorDoc;
    opponent: GrappleActorDoc;
    /** The acting actor's role. */
    actorRole: GrappleRole;
    rules: GrappleRules;
    gameSystem: string;
    /** Opens the actor's skill test with the given action (a skill-tested option). */
    rollSkill: (skill: string, instance: SimpleSkillData) => Promise<void>;
    /** The roll each side makes (`1d100`), injectable for tests. */
    rollD100?: () => Promise<Roll>;
}

async function d100(): Promise<Roll> {
    return new Roll('1d100').evaluate();
}

/** Resolve one grapple option and post its card. */
export async function performGrappleOption(request: GrappleOptionRequest): Promise<void> {
    const { option, actor, opponent, actorRole, rules } = request;
    const grappler = asGrappleParticipant(actor);
    const other = asGrappleParticipant(opponent);
    const thrownDown = readGrappleThrownDown(actor.flags, SYSTEM_ID) || readGrappleThrownDown(opponent.flags, SYSTEM_ID);
    const writesFor = (won: boolean): GrappleFlagWrite[] | null =>
        grappleOptionWrites(option.id, won, { uuid: grappler.uuid, role: actorRole }, other.uuid, thrownDown, rules);
    const speaker = ChatMessage.getSpeaker({ actor: actor as Actor.Implementation });
    const test = option.test;

    if (test.kind === 'declare') {
        await emitChatFromTemplate(
            GRAPPLE_CARD,
            {
                gameSystem: request.gameSystem,
                declared: true,
                actionLabelKey: GRAPPLE_ACTION_LABEL_KEYS[option.id],
                effectKey: GRAPPLE_EFFECT_KEYS[option.id],
                actorName: actor.name,
            },
            { speaker },
        );
        return;
    }

    if (test.kind === 'skill') {
        await request.rollSkill(test.skill, new GrappleSkillActionData(option.id, writesFor(true)));
        return;
    }

    const actorSide: GrappleCardSideInput = {
        name: actor.name,
        base: test.kind === 'opposed-skill' ? grappleSkill(grappler, test.skill) : grappleStrength(grappler),
        baseLabel: test.kind === 'opposed-skill' ? skillLabel(grappler, test.skill) : t('WH40K.Characteristic.Strength'),
        modifiers: cardModifiers(grappleSideModifiers(actorRole, thrownDown, rules)),
        roll: 0,
    };
    const opponentSide: GrappleCardSideInput = {
        name: opponent.name,
        base: grappleStrength(other),
        baseLabel: t('WH40K.Characteristic.Strength'),
        modifiers: cardModifiers(grappleSideModifiers(otherGrappleRole(actorRole), thrownDown, rules)),
        roll: 0,
    };
    const roll = request.rollD100 ?? d100;
    const actorRoll = await roll();
    const opponentRoll = await roll();
    actorSide.roll = Math.trunc(actorRoll.total ?? 0);
    opponentSide.roll = Math.trunc(opponentRoll.total ?? 0);
    const resolution = resolveGrappleOpposed(
        {
            actorRoll: actorSide.roll,
            actorStrength: grappleSideTarget(actorSide),
            opponentRoll: opponentSide.roll,
            opponentStrength: grappleSideTarget(opponentSide),
            actorSize: grappleSize(grappler),
            opponentSize: grappleSize(other),
            ...(test.kind === 'opposed-strength' ? { actorBonus: Math.floor(actorSide.base / 10) } : {}),
            opponentBonus: Math.floor(opponentSide.base / 10),
        },
        option.id,
    );
    const writes = writesFor(resolution.success);
    await emitChatFromTemplate(
        GRAPPLE_CARD,
        {
            gameSystem: request.gameSystem,
            ended: resolution.success && (option.id === 'break-free' || option.id === 'slip-free'),
            ...buildGrappleCard(resolution, actorSide, opponentSide),
        },
        { speaker, rolls: [actorRoll, opponentRoll], ...(writes !== null ? { flags: { [GRAPPLE_UPDATE_FLAG]: writes } } : {}) },
    );
}
