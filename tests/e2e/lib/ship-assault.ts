import type { Page } from '@playwright/test';

/**
 * Drive one Rogue Trader ship assault flow (#188 — ramming, boarding, Hit and
 * Run) end to end inside the live Foundry page and post the chat card it
 * produces. The flow module is dynamic-imported from the deployed system, so
 * the spec exercises the same rules, view builders, langpack and template as
 * the voidcraft sheet's Ship Assault Actions panel.
 *
 * Dice are made deterministic by swapping the global `Roll` for a queued stub
 * for the duration of the run (restored afterwards, even on failure). The two
 * ships are structural stand-ins for `WH40KVoidcraft` that record every damage
 * call, so a spec can assert the RAW damage the flow applied.
 */

/** The stats of one ship an assault action reads (mirrors `ShipAssaultShip`). */
export interface AssaultShipProfile {
    name: string;
    hullType: string;
    manoeuvrability: number;
    armour: number;
    turretRating: number;
    crewPopulation: number;
    hullIntegrity: number;
    morale: number;
}

/** One side of the action: its stat profile and its crew rating (the default skill target). */
export interface AssaultShipSpec {
    profile: AssaultShipProfile;
    crewRating: number;
}

/** One queued die result: the roll total and, for a pool, its individual dice. */
export interface QueuedDie {
    total: number;
    dice?: number[];
}

/** A langpack key resolved in-page (formatted with `data` when given). */
export interface LabelRequest {
    key: string;
    data?: Record<string, string | number>;
}

export interface ShipAssaultScenario {
    /** Module under `module/applications/ship-assault/`, without extension. */
    flowModule: 'boarding-flow' | 'hit-and-run-flow' | 'ramming-flow';
    /** The exported `ShipAssaultEntry` to run. */
    flowExport: 'BOARDING_ROUND_FLOW' | 'HIT_AND_RUN_FLOW' | 'RAMMING_FLOW';
    attacker: AssaultShipSpec;
    defender: AssaultShipSpec;
    /** Every die the flow rolls across both steps, in order. */
    rolls: QueuedDie[];
    /** Dialog form values for both the roll and the apply step. */
    form: Record<string, number | string | boolean>;
    /** Labels the spec looks for in the rendered card, resolved through the live langpack. */
    labels: Record<string, LabelRequest>;
}

/** The damage calls one ship received. */
export interface ShipDamageLog {
    hull: number[];
    crewMorale: Array<[number, number]>;
    criticals: Array<number | null>;
}

export interface ShipAssaultOutcome {
    html: string;
    messageId: string | null;
    error: string | null;
    labels: Record<string, string>;
    /** Formula of every `Roll` the flow constructed, in order. */
    formulas: string[];
    /** Queued dice the flow never consumed. */
    unusedRolls: number;
    attacker: ShipDamageLog;
    defender: ShipDamageLog;
}

/**
 * Run the scenario's flow (roll, then apply), render its final card and post
 * it as a ChatMessage.
 * @param {Page} page  The spec's joined page.
 * @param {ShipAssaultScenario} scenario  The flow, ships, dice and form values.
 * @returns {Promise<ShipAssaultOutcome>}
 */
export async function postShipAssaultCard(page: Page, scenario: ShipAssaultScenario): Promise<ShipAssaultOutcome> {
    return page.evaluate(async (s: ShipAssaultScenario): Promise<ShipAssaultOutcome> => {
        type Localize = (key: string, data?: Readonly<Record<string, string | number>>) => string;
        interface FormValues {
            number: (name: string, fallback: number) => number;
            text: (name: string, fallback: string) => string;
            checked: (name: string) => boolean;
        }
        interface AssaultCard {
            template: string;
            data: object;
        }
        interface Session {
            roll: (form: FormValues) => Promise<void>;
            apply: (form: FormValues) => Promise<{ card: AssaultCard } | null>;
        }
        interface FlowModule {
            start: (ctx: { attacker: object; defender: object; localize: Localize }) => Session;
        }
        interface FoundryGlobal {
            foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, c: object) => Promise<string> } } };
            ChatMessage?: { create: (data: object) => Promise<{ id: string } | null> };
            game?: { user?: { id?: string } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals (`foundry`, `ChatMessage`, `game`) untyped at the realm boundary
        const fg = globalThis as unknown as FoundryGlobal;

        const labels: Record<string, string> = {};
        const formulas: string[] = [];
        const attackerLog: ShipDamageLog = { hull: [], crewMorale: [], criticals: [] };
        const defenderLog: ShipDamageLog = { hull: [], crewMorale: [], criticals: [] };

        const queue = [...s.rolls];
        class QueuedRoll {
            readonly formula: string;
            total = 0;
            dice: Array<{ results: Array<{ result: number }> }> = [];
            constructor(formula: string) {
                this.formula = formula;
            }
            async evaluate(): Promise<this> {
                formulas.push(this.formula);
                const next = queue.shift();
                if (next === undefined) throw new Error(`no queued die for ${this.formula}`);
                this.total = next.total;
                this.dice = [{ results: (next.dice ?? [next.total]).map((result) => ({ result })) }];
                return Promise.resolve(this);
            }
        }

        const ship = (spec: AssaultShipSpec, log: ShipDamageLog): object => ({
            name: spec.profile.name,
            isOwner: true,
            assaultProfile: spec.profile,
            system: { gameSystem: 'rt', crew: { crewRating: spec.crewRating } },
            crew: { morale: { value: spec.profile.morale } },
            applyHullDamage: async (amount: number) => {
                log.hull.push(amount);
                return Promise.resolve({ hullLoss: amount, crewLoss: amount, moraleLoss: amount });
            },
            applyCrewMoraleDamage: async (crew: number, morale: number) => {
                log.crewMorale.push([crew, morale]);
                return Promise.resolve({ crewLoss: crew, moraleLoss: morale });
            },
            rollShipCriticalHit: async (rolled?: number) => {
                log.criticals.push(rolled ?? null);
                return Promise.resolve();
            },
        });
        const form: FormValues = {
            number: (name, fallback) => {
                const value = s.form[name];
                return typeof value === 'number' ? value : fallback;
            },
            text: (name, fallback) => {
                const value = s.form[name];
                return typeof value === 'string' ? value : fallback;
            },
            checked: (name) => s.form[name] === true,
        };

        const run = async (): Promise<Pick<ShipAssaultOutcome, 'html' | 'messageId' | 'unusedRolls'>> => {
            const renderTemplateFn = fg.foundry?.applications?.handlebars?.renderTemplate;
            if (renderTemplateFn === undefined) throw new Error('renderTemplate unavailable');
            const base = `${'/systems/wh40k-rpg'}/module/applications/ship-assault`;
            // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM dynamic import of a flow module has no static type
            const flowMod = (await import(`${base}/${s.flowModule}.js`)) as Record<string, FlowModule | undefined>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM dynamic import of the flow framework has no static type
            const frameworkMod = (await import(`${base}/ship-assault-flow.js`)) as { foundryLocalize: Localize };
            const flow = flowMod[s.flowExport];
            if (flow === undefined) throw new Error(`${s.flowModule} does not export ${s.flowExport}`);
            const localize = frameworkMod.foundryLocalize;
            for (const [name, label] of Object.entries(s.labels)) labels[name] = localize(label.key, label.data);

            const rollDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Roll');
            Object.defineProperty(globalThis, 'Roll', { value: QueuedRoll, configurable: true, writable: true });
            try {
                const session = flow.start({ attacker: ship(s.attacker, attackerLog), defender: ship(s.defender, defenderLog), localize });
                await session.roll(form);
                const applied = await session.apply(form);
                if (applied === null) throw new Error('flow apply returned no card');
                const unusedRolls = queue.length;
                const html = await renderTemplateFn(applied.card.template, applied.card.data);
                const msg = await fg.ChatMessage?.create({ user: fg.game?.user?.id, content: html });
                return { html, messageId: msg?.id ?? null, unusedRolls };
            } finally {
                if (rollDescriptor === undefined) Reflect.deleteProperty(globalThis, 'Roll');
                else Object.defineProperty(globalThis, 'Roll', rollDescriptor);
            }
        };

        let ran: Pick<ShipAssaultOutcome, 'html' | 'messageId' | 'unusedRolls' | 'error'>;
        try {
            ran = { ...(await run()), error: null };
        } catch (err) {
            ran = { html: '', messageId: null, unusedRolls: queue.length, error: err instanceof Error ? err.message : String(err) };
        }
        return { ...ran, labels, formulas, attacker: attackerLog, defender: defenderLog };
    }, scenario);
}

/**
 * Delete a chat message posted by {@link postShipAssaultCard} so it does not
 * leak into the next serial test's chat log.
 * @param {Page} page  The spec's page.
 * @param {string | null} id  The message id, or null when nothing was posted.
 * @returns {Promise<void>}
 */
export async function deleteChatMessage(page: Page, id: string | null): Promise<void> {
    await page.evaluate(async (messageId: string | null) => {
        if (messageId === null) return;
        interface CleanupGlobal {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.delete returns Promise<this> with no shipped types
            game?: { messages?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
        const fg = globalThis as unknown as CleanupGlobal;
        try {
            await fg.game?.messages?.get?.(messageId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

/** Count the ship-assault damage sections in a rendered card. */
export function countDamageSections(html: string): number {
    return html.split('data-wh40k-hook="ship-assault-damage"').length - 1;
}
