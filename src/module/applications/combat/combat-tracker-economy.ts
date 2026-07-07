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

import { actionBudgetForActor } from '../../rules/action-economy.ts';

const TRACKER_ECONOMY_TEMPLATE = 'systems/wh40k-rpg/templates/combat/tracker-action-economy.hbs';
const INJECTED_CLASS = 'wh40k-tracker-economy';
const ACTIONS_SPENT_FLAG = 'actionsSpentThisTurn';

/* eslint-disable no-restricted-syntax -- boundary: Foundry CombatTracker / Combatant / hook payloads are loosely-typed framework surfaces; reads are structural and guarded */

/** Minimal Combatant shape the tracker injection reads. */
interface TrackerCombatant {
    id?: string | null;
    actorId?: string | null;
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
async function onRenderCombatTracker(_app: unknown, html: HTMLElement | JQuery): Promise<void> {
    try {
        const root = resolveRoot(html);
        if (root === null) return;
        const rows = Array.from(root.querySelectorAll<HTMLElement>('.combatant[data-combatant-id]'));
        for (const row of rows) {
            if (row.querySelector(`.${INJECTED_CLASS}`) !== null) continue;
            const combatant = combatantForRow(row);
            const actorId = combatant?.actorId ?? null;
            if (actorId === null) continue;
            const budget = actionBudgetForActor(actorId);
            if (budget === null) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential: each row renders its own small partial; row count is the (small) combatant count
            const readout = await foundry.applications.handlebars.renderTemplate(TRACKER_ECONOMY_TEMPLATE, { budget });
            const anchor = row.querySelector('.token-name') ?? row.querySelector('.combatant-controls') ?? row;
            anchor.insertAdjacentHTML('beforeend', readout);
        }
    } catch (err) {
        console.error('WH40K | combat tracker economy (render) — ignoring', err);
    }
}

/** True when the update payload touched the action-economy flag. */
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
    combatant: { actorId?: string | null; actor?: { sheet?: { rendered?: boolean; render?: (force: boolean) => unknown } | null } | null },
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
/* eslint-enable no-restricted-syntax */

/** Register the combat-tracker action-economy surfacing hooks (#264). */
export function registerCombatTrackerEconomy(): void {
    // Foundry's Hooks.on overloads in fvtt-types are tightly typed per hook name;
    // cast to a permissive shim so these handlers' narrowed param shapes compile
    // (mirrors HooksManager's `hooksOn` boundary).
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax -- framework boundary: Hooks.on is deprecated in V14 and its payload typing varies by hook name */
    // biome-ignore lint/suspicious/noExplicitAny: framework boundary — Foundry hook payloads are heterogeneous by hook name
    const hooksOn = Hooks.on.bind(Hooks) as (event: string, fn: (...args: any[]) => unknown) => number;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax */
    hooksOn('renderCombatTracker', (_app, html: HTMLElement | JQuery) => {
        void onRenderCombatTracker(_app, html);
    });
    hooksOn('updateCombatant', onUpdateCombatant);
}
