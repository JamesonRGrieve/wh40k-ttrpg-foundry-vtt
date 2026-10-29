/**
 * Damage Control (#678): a vehicle with this trait lets its commander (or its
 * driver, when it has no commander) re-roll the 1d5 of a Righteous Fury
 * critical once, and the second result stands even when it is worse.
 *
 * The damage card offers each Righteous Fury roll on such a vehicle a re-roll
 * button. Pressing it rolls the die again, reads the new value on the vehicle's
 * chart for the struck location, and posts it. A Righteous Fury chart row is an
 * effect for the table to apply, not tracked state, so the new card supersedes
 * the first roll. Each roll is re-rolled once: the card records the spent rolls.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { messageSystemFlag } from '../rolls/evasion-flow.ts';
import { cardLocaliser, damageControlCardRows, parseDamageControlRequest } from '../rolls/vehicle-card-rows.ts';
import { lookupVehicleCritical } from '../rolls/vehicle-critical-tables.ts';
import { readVehicleDurability, type VehicleFuryResult } from '../rolls/vehicle-strike.ts';
import { righteousFuryChartValue } from '../rules/vehicle-damage.ts';

const ROWS_TEMPLATE = 'systems/wh40k-rpg/templates/chat/partial/vehicle-damage-rows.hbs';

/** The flag a damage card keeps its spent Damage Control re-rolls in (`<hit>.<fury>` keys). */
const SPENT_FLAG = 'damageControlSpent';

/** The re-rolls a card has already spent (read off its `flags`). */
export function spentKeys(message: object): string[] {
    const stored = messageSystemFlag(message, SPENT_FLAG);
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : [];
}

/** Record a spent re-roll on the card (only its owner — the GM, or whoever posted it — may write it). */
async function recordSpent(message: ChatMessage, keys: string[]): Promise<void> {
    if (!message.isOwner) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage#setFlag is typed to the "core" scope only
    await (message as unknown as { setFlag: (scope: string, key: string, value: string[]) => Promise<unknown> }).setFlag(SYSTEM_ID, SPENT_FLAG, keys);
}

/** Disable the re-roll buttons a rendered card has already spent. */
export function disableSpentDamageControl(html: HTMLElement, message: object): void {
    const spent = spentKeys(message);
    if (spent.length === 0) return;
    html.querySelectorAll<HTMLButtonElement>('.roll-control__damage-control').forEach((button) => {
        const request = parseDamageControlRequest(button.dataset['damageControl']);
        if (request !== null && spent.includes(request.key)) button.disabled = true;
    });
}

/** Re-roll the Righteous Fury roll a damage card's Damage Control button names, and post the new chart row. */
export async function damageControlReroll(button: HTMLButtonElement, message: ChatMessage | undefined): Promise<void> {
    const request = parseDamageControlRequest(button.dataset['damageControl']);
    if (request === null) return;
    const spent = message === undefined ? [] : spentKeys(message);
    if (spent.includes(request.key)) {
        ui.notifications.warn(t('WH40K.Vehicle.Damage.DamageControlUsed'));
        return;
    }
    // Disabled before anything is awaited, so a double click cannot re-roll twice.
    button.disabled = true;
    const vehicle = await fromUuid(request.vehicleUuid);
    const durability = vehicle instanceof Actor ? readVehicleDurability(vehicle.system) : null;
    if (!(vehicle instanceof Actor) || durability === null) {
        ui.notifications.warn(t('WH40K.Vehicle.Damage.DamageControlGone'));
        return;
    }
    const roll = new Roll(request.die, {});
    await roll.evaluate();
    const rolled = roll.total ?? 0;
    const effects = durability.traitEffects;
    const value = righteousFuryChartValue(rolled, effects.critDamageMultiplier, effects.critExcludesRighteousFury);
    const fury: VehicleFuryResult = {
        die: request.die,
        dieSource: effects.righteousFuryCritDie === '' ? '' : effects.sources.righteousFuryCritDie,
        rolled,
        value,
        unaffectedBy: effects.critDamageMultiplier !== null && effects.critExcludesRighteousFury ? effects.sources.critDamageMultiplier.join(', ') : '',
        critical: await lookupVehicleCritical(request.line, request.location, value),
    };
    const content = await foundry.applications.handlebars.renderTemplate(ROWS_TEMPLATE, { rows: damageControlCardRows(request, fury, cardLocaliser()) });
    // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid resolves the base Actor class; ChatMessage.getSpeaker is typed to the system's configured Actor document
    const speaker = ChatMessage.getSpeaker({ actor: vehicle as unknown as NonNullable<NonNullable<Parameters<typeof ChatMessage.getSpeaker>[0]>['actor']> });
    await ChatMessage.create({ content, flavor: t('WH40K.Vehicle.Damage.DamageControlTitle'), speaker, rolls: [roll] });
    if (message !== undefined) await recordSpent(message, [...spent, request.key]);
}
