/**
 * Combat-tracker action-economy surfacing (#264).
 *
 * Foundry's combat-tracker sidebar lists every combatant but shows nothing about
 * their per-turn action budget. This module injects a compact Full / Half /
 * Reaction / Free readout into each combatant row on `renderCombatTracker`, and
 * re-renders any open actor sheet whose combatant budget changed so the combat
 * tab stays live too. The tracker itself re-renders on `updateCombatant`, so the
 * sidebar readout updates live as actions are spent (the budget lives on a
 * combatant flag written by {@link ../../rules/action-economy.ts}).
 *
 * Read-only and defensive: any missing data or render error is swallowed so a
 * quirk can never break the tracker or a sheet.
 */

import { engagedFoeNames } from '../../canvas/engagement-canvas.ts';
import { actionBudgetForActor } from '../../rules/action-economy.ts';
import { hooksOn } from '../../utils/hooks-on.ts';

const TRACKER_ECONOMY_TEMPLATE = 'systems/wh40k-rpg/templates/combat/tracker-action-economy.hbs';
/**
 * Selector for the row this module injects, used to avoid injecting it twice.
 *
 * A `data-wh40k-hook` attribute rather than a class: the marker is behavioural,
 * not styling, so as a class it kept `tracker-action-economy.hbs` out of
 * tailwind-only for no benefit. Written as the full selector because it is built
 * into a template literal below — the automated class→hook migration only rewrites
 * literal `.class` selectors, so a dynamically-composed one like this would have
 * been left pointing at a class the template no longer carries, and the dedup
 * guard would have silently re-injected the row on every render.
 */
const INJECTED_SELECTOR = '[data-wh40k-hook="tracker-economy"]';
const ACTIONS_SPENT_FLAG = 'actionsSpentThisTurn';

/** Minimal Combatant shape the tracker injection reads. */
interface TrackerCombatant {
    id?: string | null;
    actorId?: string | null;
    tokenId?: string | null;
}

/** Resolve the rendered tracker root as a plain HTMLElement (V13 jQuery / V14 element). */
function resolveRoot(html: HTMLElement | JQuery | undefined): HTMLElement | null {
    if (html === undefined) return null;
    if (html instanceof HTMLElement) return html;
    const first = html[0];
    return first instanceof HTMLElement ? first : null;
}

/** Find the combatant for a tracker row's `data-combatant-id`. */
function combatantForRow(row: HTMLElement): TrackerCombatant | null {
    const id = row.dataset['combatantId'];
    if (id === undefined || id === '') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: the Foundry `game` global's combat collection, read structurally
    const combatants = (globalThis as { game?: { combat?: { combatants?: Iterable<TrackerCombatant> | null } | null } }).game?.combat?.combatants;
    if (!combatants) return null;
    for (const c of combatants) {
        if (c.id === id) return c;
    }
    return null;
}

/**
 * renderCombatTracker handler: inject the per-combatant action-economy readout
 * into each row. Idempotent — a row that already carries the readout is skipped
 * (the tracker re-renders wholesale, but this guards against double-injection if
 * the hook fires twice on the same DOM).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the renderCombatTracker hook's application argument is untyped and unused
async function onRenderCombatTracker(_app: unknown, html: HTMLElement | JQuery): Promise<void> {
    try {
        const root = resolveRoot(html);
        if (root === null) return;
        const rows = Array.from(root.querySelectorAll<HTMLElement>('.combatant[data-combatant-id]'));
        for (const row of rows) {
            if (row.querySelector(INJECTED_SELECTOR) !== null) continue;
            const combatant = combatantForRow(row);
            const actorId = combatant?.actorId ?? null;
            if (actorId === null) continue;
            // By the row's token: copies of one creature share an actor (#777).
            const budget = actionBudgetForActor(actorId, combatant?.tokenId ?? null);
            if (budget === null) continue;
            // #804: the foes this combatant's token is engaged in melee with, by name.
            const tokenId = combatant?.tokenId ?? null;
            const engagedWith = tokenId === null ? [] : engagedFoeNames(tokenId);
            // eslint-disable-next-line no-await-in-loop -- sequential: each row renders its own small partial; row count is the (small) combatant count
            const readout = await foundry.applications.handlebars.renderTemplate(TRACKER_ECONOMY_TEMPLATE, { budget, engagedWith });
            const anchor = row.querySelector('.token-name') ?? row.querySelector('.combatant-controls') ?? row;
            anchor.insertAdjacentHTML('beforeend', readout);
        }
    } catch (err) {
        console.error('WH40K | combat tracker economy (render) — ignoring', err);
    }
}

/** True when the update payload touched the action-economy flag. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the updateCombatant hook's change payload; flags are untyped
function touchedActionEconomy(changes: { flags?: { 'wh40k-rpg'?: Record<string, unknown> } } | undefined): boolean {
    const wh40kFlags = changes?.flags?.['wh40k-rpg'];
    return wh40kFlags !== undefined && ACTIONS_SPENT_FLAG in wh40kFlags;
}

/**
 * updateCombatant handler: when a combatant's action-economy flag changes,
 * re-render that actor's open sheet so its combat-tab readout stays live (the
 * tracker sidebar re-renders on its own).
 */
function onUpdateCombatant(
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Application#render return is untyped here; it is not read
    combatant: { actorId?: string | null; actor?: { sheet?: { rendered?: boolean; render?: (force: boolean) => unknown } | null } | null },
    // eslint-disable-next-line no-restricted-syntax -- boundary: the updateCombatant hook's change payload; flags are untyped
    changes: { flags?: { 'wh40k-rpg'?: Record<string, unknown> } } | undefined,
): void {
    try {
        if (!touchedActionEconomy(changes)) return;
        const sheet = combatant.actor?.sheet;
        if (sheet?.rendered === true && typeof sheet.render === 'function') sheet.render(false);
    } catch (err) {
        console.error('WH40K | combat tracker economy (updateCombatant) — ignoring', err);
    }
}

/** Register the combat-tracker action-economy surfacing hooks (#264). */
export function registerCombatTrackerEconomy(): void {
    hooksOn('renderCombatTracker', (_app, html: HTMLElement | JQuery) => {
        void onRenderCombatTracker(_app, html);
    });
    hooksOn('updateCombatant', onUpdateCombatant);
    // #804: a token moving in or out of contact changes who is engaged; redraw the tracker.
    hooksOn('updateToken', (_doc: object, changes: { x?: number; y?: number }) => {
        if (game.combat?.started === true && ('x' in changes || 'y' in changes)) ui.combat.render();
    });
}
