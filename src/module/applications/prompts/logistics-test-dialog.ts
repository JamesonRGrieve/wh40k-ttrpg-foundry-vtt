/**
 * @file LogisticsTestDialog — OW Squad Logistics Test dialog (#154).
 *
 * The player / GM picks the Table 6-2 axis values (troop count, time
 * in front, front activity, war condition), toggles the standard-kit
 * bonus, picks craftsmanship, then clicks Roll. The dialog calls
 * `resolveLogisticsTest(...)` against a 1d100, emits the chat card, and
 * closes.
 *
 * Pure UI shell over `src/module/rules/ow-logistics.ts` — the dialog
 * holds no rules logic of its own beyond marshalling the actor's
 * persisted Logistics state (`logisticsRating`, `munitorum`,
 * `situational`) into the engine context.
 *
 * OW-gated: opened only from the OW Logistics panel. The other six
 * game systems neither see nor invoke this dialog.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import {
    OW_DEFAULT_LOGISTICS_RATING,
    type Craftsmanship,
    type FrontActive,
    type LogisticsContext,
    type LogisticsTestResult,
    type TimeInFront,
    type TroopCount,
    type WarCondition,
    computeLogisticsTarget,
    resolveLogisticsTest,
} from '../../rules/ow-logistics.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface LogisticsActorSlot {
    readonly logisticsRating: number;
    readonly munitorum: boolean;
    readonly situational: number;
}

interface OptionRow<T extends string> {
    readonly id: T;
    readonly labelKey: string;
    readonly selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface LogisticsContextRow extends Record<string, unknown> {
    readonly baseRating: number;
    readonly troopCountOptions: ReadonlyArray<OptionRow<TroopCount>>;
    readonly timeInFrontOptions: ReadonlyArray<OptionRow<TimeInFront>>;
    readonly frontActiveOptions: ReadonlyArray<OptionRow<FrontActive>>;
    readonly warConditionOptions: ReadonlyArray<OptionRow<WarCondition>>;
    readonly craftsmanshipOptions: ReadonlyArray<OptionRow<Craftsmanship>>;
    readonly standardKit: boolean;
    readonly computedTarget: number;
}

const TROOP_COUNT_LABELS: Record<TroopCount, string> = {
    squad: 'WH40K.OW.Logistics.TroopCount.Squad',
    platoon: 'WH40K.OW.Logistics.TroopCount.Platoon',
    company: 'WH40K.OW.Logistics.TroopCount.Company',
    regiment: 'WH40K.OW.Logistics.TroopCount.Regiment',
};

const TIME_IN_FRONT_LABELS: Record<TimeInFront, string> = {
    days: 'WH40K.OW.Logistics.TimeInFront.Days',
    weeks: 'WH40K.OW.Logistics.TimeInFront.Weeks',
    months: 'WH40K.OW.Logistics.TimeInFront.Months',
    years: 'WH40K.OW.Logistics.TimeInFront.Years',
};

const FRONT_ACTIVE_LABELS: Record<FrontActive, string> = {
    lull: 'WH40K.OW.Logistics.FrontActive.Lull',
    active: 'WH40K.OW.Logistics.FrontActive.Active',
    major: 'WH40K.OW.Logistics.FrontActive.Major',
};

const WAR_CONDITION_LABELS: Record<WarCondition, string> = {
    standard: 'WH40K.OW.Logistics.WarCondition.Standard',
    hostile: 'WH40K.OW.Logistics.WarCondition.Hostile',
    desperate: 'WH40K.OW.Logistics.WarCondition.Desperate',
};

const CRAFTSMANSHIP_LABELS: Record<Craftsmanship, string> = {
    poor: 'WH40K.OW.Logistics.Craftsmanship.Poor',
    common: 'WH40K.OW.Logistics.Craftsmanship.Common',
    good: 'WH40K.OW.Logistics.Craftsmanship.Good',
    best: 'WH40K.OW.Logistics.Craftsmanship.Best',
};

const TROOP_COUNT_IDS: ReadonlyArray<TroopCount> = ['squad', 'platoon', 'company', 'regiment'];
const TIME_IN_FRONT_IDS: ReadonlyArray<TimeInFront> = ['days', 'weeks', 'months', 'years'];
const FRONT_ACTIVE_IDS: ReadonlyArray<FrontActive> = ['lull', 'active', 'major'];
const WAR_CONDITION_IDS: ReadonlyArray<WarCondition> = ['standard', 'hostile', 'desperate'];
const CRAFTSMANSHIP_IDS: ReadonlyArray<Craftsmanship> = ['poor', 'common', 'good', 'best'];

type Axis = 'troopCount' | 'timeInFront' | 'frontActive' | 'warCondition' | 'craftsmanship';

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class LogisticsTestDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare baseRating: number;
    declare munitorum: boolean;
    declare situational: number;
    declare troopCount: TroopCount;
    declare timeInFront: TimeInFront;
    declare frontActive: FrontActive;
    declare warCondition: WarCondition;
    declare craftsmanship: Craftsmanship;
    declare standardKit: boolean;
    /** Owning actor — null in story/probe contexts. */
    declare actor: WH40KBaseActor | null;

    constructor(
        options: ApplicationV2Config.DefaultOptions & {
            actor?: WH40KBaseActor | null;
            baseRating?: number;
            munitorum?: boolean;
            situational?: number;
            troopCount?: TroopCount;
            timeInFront?: TimeInFront;
            frontActive?: FrontActive;
            warCondition?: WarCondition;
            craftsmanship?: Craftsmanship;
            standardKit?: boolean;
        } = {},
    ) {
        super(options);
        this.actor = options.actor ?? null;
        const seed = readLogisticsSlot(this.actor);
        this.baseRating = options.baseRating ?? seed?.logisticsRating ?? OW_DEFAULT_LOGISTICS_RATING;
        this.munitorum = options.munitorum ?? seed?.munitorum ?? false;
        this.situational = Math.trunc(options.situational ?? seed?.situational ?? 0);
        this.troopCount = options.troopCount ?? 'company';
        this.timeInFront = options.timeInFront ?? 'weeks';
        this.frontActive = options.frontActive ?? 'active';
        this.warCondition = options.warCondition ?? 'standard';
        this.craftsmanship = options.craftsmanship ?? 'common';
        this.standardKit = options.standardKit === true;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'logistics-test-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            owSetAxis: LogisticsTestDialog.#onSetAxis,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            owToggleStandardKit: LogisticsTestDialog.#onToggleStandardKit,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            owRollLogistics: LogisticsTestDialog.#onRoll,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            owCancelLogistics: LogisticsTestDialog.#onCancel,
        },
        position: { width: 540 },
        window: {
            title: 'WH40K.OW.Logistics.Test.Title',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/logistics-test-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<LogisticsContextRow> {
        const baseCtx = (await super._prepareContext(options)) as LogisticsContextRow;
        const ctx = this.#buildContext();
        const { target } = computeLogisticsTarget(ctx);
        return {
            ...baseCtx,
            baseRating: this.baseRating,
            troopCountOptions: TROOP_COUNT_IDS.map((id) => ({
                id,
                labelKey: TROOP_COUNT_LABELS[id],
                selected: id === this.troopCount,
            })),
            timeInFrontOptions: TIME_IN_FRONT_IDS.map((id) => ({
                id,
                labelKey: TIME_IN_FRONT_LABELS[id],
                selected: id === this.timeInFront,
            })),
            frontActiveOptions: FRONT_ACTIVE_IDS.map((id) => ({
                id,
                labelKey: FRONT_ACTIVE_LABELS[id],
                selected: id === this.frontActive,
            })),
            warConditionOptions: WAR_CONDITION_IDS.map((id) => ({
                id,
                labelKey: WAR_CONDITION_LABELS[id],
                selected: id === this.warCondition,
            })),
            craftsmanshipOptions: CRAFTSMANSHIP_IDS.map((id) => ({
                id,
                labelKey: CRAFTSMANSHIP_LABELS[id],
                selected: id === this.craftsmanship,
            })),
            standardKit: this.standardKit,
            computedTarget: target,
        };
    }

    #buildContext(): LogisticsContext {
        return {
            rating: this.baseRating,
            munitorum: this.munitorum,
            situational: this.situational,
            troopCount: this.troopCount,
            timeInFront: this.timeInFront,
            frontActive: this.frontActive,
            warCondition: this.warCondition,
            standardKit: this.standardKit,
            craftsmanship: this.craftsmanship,
        };
    }

    static async #onSetAxis(this: LogisticsTestDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const axis = target.dataset['axis'];
        const value = target.dataset['value'];
        if (typeof axis !== 'string' || typeof value !== 'string') return;
        if (!isAxis(axis)) return;
        if (axis === 'troopCount') {
            if (isTroopCount(value)) this.troopCount = value;
        } else if (axis === 'timeInFront') {
            if (isTimeInFront(value)) this.timeInFront = value;
        } else if (axis === 'frontActive') {
            if (isFrontActive(value)) this.frontActive = value;
        } else if (axis === 'warCondition') {
            if (isWarCondition(value)) this.warCondition = value;
        } else if (isCraftsmanship(value)) {
            // axis === 'craftsmanship'
            this.craftsmanship = value;
        }
        await this.render();
    }

    static async #onToggleStandardKit(this: LogisticsTestDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        this.standardKit = !this.standardKit;
        await this.render();
    }

    static async #onRoll(this: LogisticsTestDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const ctx = this.#buildContext();
        const roll = new Roll('1d100');
        await roll.evaluate();
        // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.total is typed loosely on Foundry's surface; the 1d100 evaluator yields a finite integer
        const rollTotal = Math.trunc(Number(roll.total ?? 0));
        const result: LogisticsTestResult = resolveLogisticsTest(ctx, rollTotal);

        const templateData = {
            gameSystem: 'ow',
            success: result.success,
            roll: rollTotal,
            target: result.target,
            degreesOfSuccess: result.degreesOfSuccess,
            degreesOfFailure: result.degreesOfFailure,
            breakdown: result.breakdown,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ow-logistics-chat.hbs', templateData);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onCancel(this: LogisticsTestDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /**
     * Convenience opener — instantiate against an actor's persisted
     * Logistics slot and render. Matches the `ColonyGrowthDialog.show()`
     * shape so sheets can wire it from a single static method.
     */
    static show(actor: WH40KBaseActor): LogisticsTestDialog {
        const dialog = new LogisticsTestDialog({ actor });
        void dialog.render({ force: true });
        return dialog;
    }
}

function isAxis(value: string): value is Axis {
    return value === 'troopCount' || value === 'timeInFront' || value === 'frontActive' || value === 'warCondition' || value === 'craftsmanship';
}

function isTroopCount(value: string): value is TroopCount {
    return value === 'squad' || value === 'platoon' || value === 'company' || value === 'regiment';
}

function isTimeInFront(value: string): value is TimeInFront {
    return value === 'days' || value === 'weeks' || value === 'months' || value === 'years';
}

function isFrontActive(value: string): value is FrontActive {
    return value === 'lull' || value === 'active' || value === 'major';
}

function isWarCondition(value: string): value is WarCondition {
    return value === 'standard' || value === 'hostile' || value === 'desperate';
}

function isCraftsmanship(value: string): value is Craftsmanship {
    return value === 'poor' || value === 'common' || value === 'good' || value === 'best';
}

/**
 * Read the persisted Logistics scalars off an actor's system data.
 * Returns `undefined` when the actor is null (story / probe context).
 * The DataModel schema guarantees the fields are numbers / booleans
 * when present, so no defensive coercion is required here.
 */
function readLogisticsSlot(actor: WH40KBaseActor | null): LogisticsActorSlot | undefined {
    if (actor === null) return undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: OW Logistics scalars are per-system actor schema fields not exposed on the abstract WH40KBaseActor system surface
    const sys = actor.system as { logisticsRating?: number; munitorum?: boolean; situational?: number };
    if (typeof sys.logisticsRating !== 'number') return undefined;
    return {
        logisticsRating: sys.logisticsRating,
        munitorum: sys.munitorum === true,
        situational: typeof sys.situational === 'number' ? sys.situational : 0,
    };
}

/** Convenience opener for sheets / chat-card buttons. */
export function openLogisticsTestDialog(
    opts: {
        actor?: WH40KBaseActor | null;
        baseRating?: number;
        munitorum?: boolean;
        situational?: number;
        troopCount?: TroopCount;
        timeInFront?: TimeInFront;
        frontActive?: FrontActive;
        warCondition?: WarCondition;
        craftsmanship?: Craftsmanship;
        standardKit?: boolean;
    } = {},
): void {
    const dialog = new LogisticsTestDialog(opts);
    void dialog.render({ force: true });
}
