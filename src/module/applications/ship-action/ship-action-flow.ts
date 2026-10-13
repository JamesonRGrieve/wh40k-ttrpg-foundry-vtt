/**
 * Roll an RT starship action from the voidcraft sheet and apply its authored
 * effect (#186, #189).
 *
 * The action's test is composed with full provenance (the acting character's
 * skill, the ship's Manoeuvrability / Detection for a Combined Skill Test,
 * RT Core p.212, the printed difficulty, a situational modifier). On a success
 * the order's `shipEffect` block decides what happens — never the action's
 * name:
 *
 *   • `reducePriorTurnDamage` — Hold Fast! / Triage (p.218): the ship's
 *     previous-turn Morale or Crew Population damage drops by the magnitude;
 *   • `shipModifier` — a timed ActiveEffect on the ship: a stat bonus (Aid
 *     the Machine Spirit, Flank Speed) or a Ballistic Skill modifier that the
 *     ship's weapon fire collects as a named row (Lock on Target, Come to New
 *     Heading, Evasive Manoeuvres).
 *
 * Foundry-light: the ship is a structural surface and dice come from the
 * global `Roll`, so the flow is unit-testable with the ship-assault stubs.
 */

import {
    collectShipModifierComponents,
    composeShipActionTest,
    effectTargets,
    extraDegreesOfSuccess,
    hasShipEffect,
    isModifierTarget,
    isPoolTarget,
    isShipTestStat,
    shipEffectMagnitudeComponents,
    type ShipEffectData,
    type ShipEffectView,
    type ShipModifierInput,
    type ShipModifierTarget,
} from '../../rules/ship-action-effects.ts';
import { shipActionTestLabel } from '../../rules/ship-actions.ts';
import { resolveShipTest, sumComponents, type ShipTestComponent } from '../../rules/ship-assault.ts';
import type { PriorTurnPool } from '../../rules/ship-crew-morale.ts';
import { formatSigned } from '../../utils/format.ts';
import { buildTestView, componentRow, type AssaultComponentRow, type AssaultTestView, type Localize } from '../ship-assault/ship-assault-card.ts';
import { readSituational, situationalFields } from '../ship-assault/ship-assault-fields.ts';
import { rollFormula, rollTotal, ShipAssaultInputError, type AssaultFieldGroup, type AssaultFormValues } from '../ship-assault/ship-assault-flow.ts';

/** The chat card a rolled ship action posts. */
const SHIP_ACTION_CARD_TEMPLATE = 'systems/wh40k-rpg/templates/chat/ship-action-roll-chat.hbs';

/** Langpack key of the rule citation every row hovers to. */
const CITATION_KEY = 'WH40K.Voidcraft.ShipAction.Citation';

/**
 * The surface of a voidcraft the roll reads and writes. `WH40KVoidcraft`
 * satisfies it structurally.
 */
export interface ShipActionShip {
    readonly name: string;
    readonly system: { readonly gameSystem: string; readonly crew: { readonly crewRating: number } };
    readonly manoeuvrability: number;
    readonly detection: number;
    readonly shipActionEffects: ShipEffectView[];
    readonly shipWeaponChoices: { id: string; name: string }[];
    reducePriorTurnDamage: (pool: PriorTurnPool, amount: number) => Promise<number>;
    applyShipActionModifier: (input: ShipModifierInput) => Promise<void>;
}

/** The `order` item fields the roll needs. */
export interface ShipActionOrder {
    uuid: string;
    name: string;
    img: string;
    test: { skill: string; characteristic: string; modifier: number; shipStat: string };
    shipEffect: ShipEffectData;
}

export interface ShipActionContext {
    ship: ShipActionShip;
    order: ShipActionOrder;
    localize: Localize;
    /** The active degrees-of-success method (RT: `gen1`, unless the world setting overrides it). */
    degreesMethod: 'gen1' | 'gen2';
}

/** An effect's magnitude as the card renders it: base ± each degree term = total. */
interface ShipActionMagnitudeView {
    title: string;
    baseLabel: string;
    base: number;
    rows: AssaultComponentRow[];
    total: number;
}

/**
 * The context of `ship-action-roll-chat.hbs`. A `type` alias (not an
 * interface) so it carries the implicit index signature `renderTemplate`'s
 * context parameter requires.
 */
export type ShipActionCardData = {
    actionName: string;
    img: string;
    shipName: string;
    gameSystem: string;
    test: AssaultTestView;
    magnitude: ShipActionMagnitudeView | null;
    outcome: string;
    success: boolean;
};

/** Can this action be rolled from the sheet? */
export function isRollableShipAction(order: ShipActionOrder): boolean {
    return hasShipEffect(order.shipEffect) && effectTargets(order.shipEffect).length > 0;
}

/** Localized label of one target, for the choice select and the outcome line. */
function targetLabel(localize: Localize, target: string, weaponName = ''): string {
    return localize(`WH40K.Voidcraft.ShipAction.Target.${target}`, { weapon: weaponName });
}

/** The fields shown before rolling: the character's skill, a situational modifier, and any choice. */
export function shipActionInputGroups(ctx: ShipActionContext): AssaultFieldGroup[] {
    const { ship, order, localize } = ctx;
    const testLabel = shipActionTestLabel(order.test);
    const groups: AssaultFieldGroup[] = [
        {
            legend: localize('WH40K.Voidcraft.ShipAction.ActorLegend', { ship: ship.name }),
            fields: [
                {
                    name: 'skill',
                    kind: 'number',
                    label: localize('WH40K.Voidcraft.ShipAction.Field.Skill', { skill: testLabel }),
                    value: ship.system.crew.crewRating,
                    min: 0,
                },
                ...situationalFields(ctx, 'situational'),
            ],
        },
    ];
    const targets = effectTargets(order.shipEffect);
    const choices = [];
    if (targets.length > 1) {
        choices.push({
            name: 'target',
            kind: 'select' as const,
            label: localize('WH40K.Voidcraft.ShipAction.Field.Target'),
            value: targets.at(0) ?? '',
            options: targets.map((target) => ({ value: target, label: targetLabel(localize, target) })),
        });
    }
    if (targets.includes('weaponBallisticSkill')) {
        const weapons = ship.shipWeaponChoices;
        choices.push({
            name: 'weapon',
            kind: 'select' as const,
            label: localize('WH40K.Voidcraft.ShipAction.Field.Weapon'),
            value: weapons.at(0)?.id ?? '',
            options: weapons.map((weapon) => ({ value: weapon.id, label: weapon.name })),
        });
    }
    if (choices.length > 0) groups.push({ legend: localize('WH40K.Voidcraft.ShipAction.ChoiceLegend'), fields: choices });
    return groups;
}

/** The target the character chose, falling back to the first authored one. */
function chosenTarget(order: ShipActionOrder, form: AssaultFormValues): string {
    const targets = effectTargets(order.shipEffect);
    const first = targets.at(0) ?? '';
    const picked = form.text('target', first);
    return targets.includes(picked) ? picked : first;
}

/** The Weapon Component Lock on Target aims, or an input error when the ship has none. */
function chosenWeapon(ctx: ShipActionContext, form: AssaultFormValues): { id: string; name: string } {
    const weapons = ctx.ship.shipWeaponChoices;
    const id = form.text('weapon', weapons.at(0)?.id ?? '');
    const weapon = weapons.find((candidate) => candidate.id === id) ?? weapons.at(0);
    if (weapon === undefined) throw new ShipAssaultInputError(ctx.localize('WH40K.Voidcraft.ShipAction.NoWeapons'));
    return weapon;
}

/** Build the magnitude view from its components. */
function magnitudeView(components: readonly ShipTestComponent[], source: string, localize: Localize): ShipActionMagnitudeView {
    const base = components.at(0);
    return {
        title: localize('WH40K.Voidcraft.ShipAction.MagnitudeTitle'),
        baseLabel: base === undefined ? '' : localize(base.labelKey, base.data),
        base: base?.value ?? 0,
        rows: components.slice(1).map((component) => componentRow(component, source, localize)),
        total: sumComponents(components),
    };
}

/** Apply a successful effect of `amount` to the ship and describe what happened. */
async function applyEffect(ctx: ShipActionContext, target: string, amount: number, weapon: { id: string; name: string } | null): Promise<string> {
    const { ship, order, localize } = ctx;
    if (order.shipEffect.kind === 'reducePriorTurnDamage' && isPoolTarget(target)) {
        const restored = await ship.reducePriorTurnDamage(target, amount);
        return restored > 0
            ? localize(`WH40K.Voidcraft.ShipAction.Outcome.Restored.${target}`, { amount: restored })
            : localize(`WH40K.Voidcraft.ShipAction.Outcome.NothingToRestore.${target}`);
    }
    if (!isModifierTarget(target)) return localize('WH40K.Voidcraft.ShipAction.Outcome.NoEffect');
    const modifierTarget: ShipModifierTarget = target;
    const expiry = order.shipEffect.expiry === '' ? 'turnEnd' : order.shipEffect.expiry;
    await ship.applyShipActionModifier({
        name: order.name,
        img: order.img,
        origin: order.uuid,
        target: modifierTarget,
        value: amount,
        weaponId: weapon?.id ?? '',
        rounds: order.shipEffect.rounds,
        expiry,
    });
    return localize('WH40K.Voidcraft.ShipAction.Outcome.Modifier', {
        value: formatSigned(amount),
        target: targetLabel(localize, modifierTarget, weapon?.name ?? ''),
        duration: localize(`WH40K.Voidcraft.ShipAction.Duration.${expiry}`),
    });
}

/**
 * Roll the action's test, apply its effect on a success, and build the chat
 * card. Throws {@link ShipAssaultInputError} (a localized message) when a
 * required choice is impossible — Lock on Target with no Weapon Component.
 */
export async function rollShipAction(
    ctx: ShipActionContext,
    form: AssaultFormValues,
): Promise<{ card: { template: string; data: ShipActionCardData }; rolls: Roll[] }> {
    const { ship, order, localize } = ctx;
    const target = chosenTarget(order, form);
    const weapon = target === 'weaponBallisticSkill' ? chosenWeapon(ctx, form) : null;
    const stat = order.test.shipStat;
    const derivation = composeShipActionTest({
        skillLabel: shipActionTestLabel(order.test),
        skill: form.number('skill', ship.system.crew.crewRating),
        ship: ship.name,
        difficulty: order.test.modifier,
        shipStat: isShipTestStat(stat) ? { stat, value: ship[stat], modifiers: collectShipModifierComponents(ship.shipActionEffects, { target: stat }) } : null,
        situational: readSituational(form, 'situational'),
    });

    const roll = await rollFormula('1d100');
    const result = resolveShipTest(derivation, rollTotal(roll));
    const citation = localize(CITATION_KEY);
    let magnitude: ShipActionMagnitudeView | null = null;
    let outcome = localize('WH40K.Voidcraft.ShipAction.Outcome.Failed');
    if (result.success) {
        const extra = extraDegreesOfSuccess(ctx.degreesMethod, result.roll, result.target, result.success);
        const components = shipEffectMagnitudeComponents(order.shipEffect, extra);
        magnitude = magnitudeView(components, citation, localize);
        outcome = await applyEffect(ctx, target, magnitude.total, weapon);
    }

    return {
        card: {
            template: SHIP_ACTION_CARD_TEMPLATE,
            data: {
                actionName: order.name,
                img: order.img,
                shipName: ship.name,
                gameSystem: ship.system.gameSystem,
                test: buildTestView(localize('WH40K.Voidcraft.ShipAction.TestTitle', { test: shipActionTestLabel(order.test) }), result, citation, localize),
                magnitude,
                outcome,
                success: result.success,
            },
        },
        rolls: [roll],
    };
}
