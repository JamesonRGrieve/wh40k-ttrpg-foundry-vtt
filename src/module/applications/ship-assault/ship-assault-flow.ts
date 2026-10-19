/**
 * The contract every RT ship assault action (ramming, boarding, Hit and Run)
 * implements so one dialog shell can drive them all, plus the Foundry-side
 * helpers they share: reading the dialog form, rolling dice, localizing, and
 * listing the ships an action can be aimed at.
 *
 * A flow runs in two steps. `roll` reads the GM's inputs, rolls the tests and
 * resolves them through the pure rules module; the dialog then shows the
 * preview card plus any choice the rules leave to the winner (how to spend
 * boarding degrees, which critical hit to inflict). `apply` reads those
 * choices, rolls any damage dice, writes the damage onto the ships and returns
 * the final chat card.
 */

import type { WH40KVoidcraft } from '../../documents/voidcraft.ts';
import type { DegreesMethod } from '../../rolls/roll-helpers.ts';
import type { ShipAssaultShip } from '../../rules/ship-assault.ts';
import type { Localize } from './ship-assault-card.ts';

/** Identifier of each assault flow; doubles as the sheet's `data-assault` value. */
type ShipAssaultFlowId = 'board' | 'boarding-round' | 'hit-and-run' | 'ram' | 'fire';

/** Which voidcraft-sheet tab surfaces the action (the Weapons tab fires each weapon from its row). */
export type ShipAssaultTab = 'manoeuvre' | 'extended' | 'weapons';

/** One option of a select field. */
interface AssaultFieldOption {
    value: string;
    label: string;
}

/** A generic dialog field the shell renders without a per-flow template. */
export interface AssaultField {
    name: string;
    kind: 'number' | 'text' | 'checkbox' | 'select' | 'radio';
    /** Already-localized label. */
    label: string;
    value: string | number | boolean;
    options?: AssaultFieldOption[];
    min?: number;
    max?: number;
}

/** A titled group of fields (one per side of an opposed test, etc.). */
export interface AssaultFieldGroup {
    legend: string;
    fields: AssaultField[];
}

/** A chat card ready to render: its template and its context. */
export interface AssaultCard {
    template: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate takes an open Handlebars context bag
    data: Record<string, unknown>;
}

/**
 * The surface of a voidcraft actor the assault flows read and write. The
 * `WH40KVoidcraft` document satisfies it structurally; naming only what the
 * flows touch keeps them testable without a Foundry runtime.
 */
export interface AssaultShipActor {
    readonly name: string;
    readonly isOwner: boolean;
    readonly assaultProfile: ShipAssaultShip;
    readonly system: { readonly gameSystem: string; readonly crew: { readonly crewRating: number } };
    readonly crew: { readonly morale: { readonly value: number } };
    applyHullDamage: WH40KVoidcraft['applyHullDamage'];
    applyCrewMoraleDamage: WH40KVoidcraft['applyCrewMoraleDamage'];
    rollShipCriticalHit: WH40KVoidcraft['rollShipCriticalHit'];
    takeCrippledCriticalHit: WH40KVoidcraft['takeCrippledCriticalHit'];
    readonly hullIntegrity: { readonly value: number; readonly max: number };
    /** Void shields currently raised (not overloaded). */
    readonly activeVoidShields: number;
    overloadVoidShields: WH40KVoidcraft['overloadVoidShields'];
}

/** The two ships an action is between. The attacker is the sheet's ship. */
export interface ShipAssaultContext {
    attacker: AssaultShipActor;
    defender: AssaultShipActor;
    localize: Localize;
    /** The language `localize` reads, which picks a count's plural form (#663). */
    lang: string;
    /** How the action's tests count degrees: the attacker's line, or the `degreesMode` world override. */
    degreesMethod: DegreesMethod;
}

/** Typed read access to the dialog's form values. */
export interface AssaultFormValues {
    number: (name: string, fallback: number) => number;
    text: (name: string, fallback: string) => string;
    checked: (name: string) => boolean;
}

/** A resolved step plus the dice it rolled (attached to the chat message). */
interface AssaultStep<R> {
    resolution: R;
    rolls: Roll[];
}

/** One RT ship assault action. */
export interface ShipAssaultFlow<R> {
    readonly id: ShipAssaultFlowId;
    readonly tab: ShipAssaultTab;
    readonly labelKey: string;
    readonly hintKey: string;
    /** The dialog's window title; the assault dialog's own title when omitted. */
    readonly windowTitleKey?: string;
    readonly icon: string;
    /** Input fields shown before rolling. */
    inputGroups: (ctx: ShipAssaultContext) => AssaultFieldGroup[];
    /** Roll and resolve the action's tests. */
    roll: (ctx: ShipAssaultContext, form: AssaultFormValues) => Promise<AssaultStep<R>>;
    /** The card shown in the dialog once the tests are rolled, before damage is applied. */
    previewCard: (ctx: ShipAssaultContext, resolution: R) => AssaultCard;
    /** Choices the rules leave to the winner, shown after rolling. Empty when there are none. */
    choiceGroups: (ctx: ShipAssaultContext, resolution: R) => AssaultFieldGroup[];
    /** Apply the outcome to the ships and build the final chat card. */
    apply: (ctx: ShipAssaultContext, resolution: R, form: AssaultFormValues) => Promise<{ card: AssaultCard; rolls: Roll[] }>;
}

/**
 * One run of a flow against a pair of ships. The resolution type stays inside
 * the closure, so the dialog shell can hold any flow's session uniformly.
 */
export interface ShipAssaultSession {
    readonly resolved: boolean;
    inputGroups: () => AssaultFieldGroup[];
    roll: (form: AssaultFormValues) => Promise<void>;
    previewCard: () => AssaultCard | null;
    choiceGroups: () => AssaultFieldGroup[];
    /** Apply and return the final card plus every die rolled across both steps. */
    apply: (form: AssaultFormValues) => Promise<{ card: AssaultCard; rolls: Roll[] } | null>;
    reset: () => void;
}

/** Sheet-facing description of a flow plus its session factory. */
export interface ShipAssaultEntry {
    readonly id: ShipAssaultFlowId;
    readonly tab: ShipAssaultTab;
    readonly labelKey: string;
    readonly hintKey: string;
    readonly windowTitleKey: string;
    readonly icon: string;
    start: (ctx: ShipAssaultContext) => ShipAssaultSession;
}

/** The dialog window title of an assault action that names none of its own. */
const DEFAULT_WINDOW_TITLE_KEY = 'WH40K.Voidcraft.Assault.DialogTitle';

/** Wrap a flow into a registry entry whose sessions keep their resolution typed. */
export function defineShipAssault<R>(flow: ShipAssaultFlow<R>): ShipAssaultEntry {
    return {
        id: flow.id,
        tab: flow.tab,
        labelKey: flow.labelKey,
        hintKey: flow.hintKey,
        windowTitleKey: flow.windowTitleKey ?? DEFAULT_WINDOW_TITLE_KEY,
        icon: flow.icon,
        start: (ctx) => {
            let step: AssaultStep<R> | null = null;
            return {
                get resolved(): boolean {
                    return step !== null;
                },
                inputGroups: () => flow.inputGroups(ctx),
                roll: async (form) => {
                    step = await flow.roll(ctx, form);
                },
                previewCard: () => (step === null ? null : flow.previewCard(ctx, step.resolution)),
                choiceGroups: () => (step === null ? [] : flow.choiceGroups(ctx, step.resolution)),
                apply: async (form) => {
                    if (step === null) return null;
                    const applied = await flow.apply(ctx, step.resolution, form);
                    return { card: applied.card, rolls: [...step.rolls, ...applied.rolls] };
                },
                reset: () => {
                    step = null;
                },
            };
        },
    };
}

/**
 * A flow could not proceed with the GM's inputs (e.g. no ram damage die for
 * the hull type). Its message is a localized, player-facing explanation the
 * dialog shows as a warning.
 */
export class ShipAssaultInputError extends Error {
    override readonly name = 'ShipAssaultInputError';
}

/** Localize through Foundry's i18n. */
export const foundryLocalize: Localize = (key, data) => {
    if (data === undefined) return game.i18n.localize(key);
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(data)) params[name] = String(value);
    return game.i18n.format(key, params);
};

/** Evaluate a dice formula with Foundry's Roll. */
export async function rollFormula(formula: string): Promise<Roll> {
    return new Roll(formula).evaluate();
}

/** The integer total of an evaluated roll. */
export function rollTotal(roll: Roll): number {
    return Math.trunc(Number(roll.total ?? 0));
}
