/**
 * @file LogisticsTestDialog — OW Squad Logistics Test dialog (#154, #192).
 *
 * The player / GM picks the requested item's Availability and the Table 6-2
 * front conditions (troops deployed, time spent in front, front active, war
 * conditions), toggles the standard-kit bonus, picks craftsmanship, then
 * rolls. An item Table 6-2 rates "Automatic" for the deployed troops is
 * obtained with no roll; a "GM's Discretion" cell cannot be rolled.
 *
 * Pure UI shell over `src/module/rules/ow-logistics.ts` — the dialog holds no
 * rules logic beyond marshalling the actor's persisted Logistics state
 * (`logisticsRating`, `munitorum`, `situational`) into the engine context.
 *
 * OW-gated: opened only from the OW Logistics panel. The other game systems
 * neither see nor invoke this dialog.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { t } from '../../i18n/t.ts';
import { type AvailabilityKey, normaliseAvailability, normaliseCraftsmanship } from '../../rules/acquisition-ladder.ts';
import {
    type Craftsmanship,
    computeLogisticsTarget,
    FRONT_TIME_KEYS,
    type FrontActive,
    type LogisticsContext,
    type LogisticsFront,
    type LogisticsTarget,
    logisticsStandingFrom,
    resolveLogisticsTest,
    type StoredLogisticsStanding,
    type TimeInFront,
    TROOP_COUNT_KEYS,
    type TroopCount,
    WAR_CONDITION_KEYS,
    type WarCondition,
} from '../../rules/ow-logistics.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { type LogisticsRow, logisticsOptions, logisticsRows } from './logistics-test-rows.ts';

const { ApplicationV2 } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface LogisticsContextRow extends Record<string, unknown> {
    readonly baseRating: number;
    readonly standardKit: boolean;
    /** `test` | `automatic` | `discretion` — what the request resolves to. */
    readonly outcome: LogisticsTarget['kind'];
    readonly computedTarget: number | null;
    /** The target's derivation, one row per component (#701); empty unless the request is a test. */
    readonly breakdownRows: readonly LogisticsRow[];
    readonly rawSum: number | null;
    readonly clamped: boolean;
}

/** The chat card's render context. */
export type LogisticsChatContext = {
    readonly gameSystem: 'ow';
    readonly automatic: boolean;
    readonly success: boolean;
    readonly roll: number | null;
    readonly target: number | null;
    readonly degreesOfSuccess: number;
    readonly degreesOfFailure: number;
    readonly rows: readonly LogisticsRow[];
    /** The components' sum before the clamp at 0, and whether the clamp fired (#701). */
    readonly rawSum: number | null;
    readonly clamped: boolean;
};

type Axis = 'availability' | 'troopCount' | 'timeInFront' | 'frontActive' | 'warCondition' | 'craftsmanship';

const AXES: readonly Axis[] = ['availability', 'troopCount', 'timeInFront', 'frontActive', 'warCondition', 'craftsmanship'];

/** The axes that are the squad's persisted battlefront rather than part of one request. */
const FRONT_AXES = ['troopCount', 'timeInFront', 'frontActive', 'warCondition'] as const satisfies readonly (keyof LogisticsFront)[];

function oneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class LogisticsTestDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare baseRating: number;
    declare munitorum: boolean;
    declare situational: number;
    declare availability: AvailabilityKey;
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
            availability?: AvailabilityKey;
            craftsmanship?: Craftsmanship;
            troopCount?: TroopCount;
            timeInFront?: TimeInFront;
            frontActive?: FrontActive;
            warCondition?: WarCondition;
            standardKit?: boolean;
        } = {},
    ) {
        super(options);
        this.actor = options.actor ?? null;
        // The squad's standing — rating, Munitorum, situational and the persisted battlefront (#496).
        const standing = logisticsStandingFrom(readStoredStanding(this.actor));
        this.baseRating = options.baseRating ?? standing.rating;
        this.munitorum = options.munitorum ?? standing.munitorum;
        this.situational = Math.trunc(options.situational ?? standing.situational);
        this.availability = options.availability ?? 'common';
        this.craftsmanship = options.craftsmanship ?? 'common';
        this.troopCount = options.troopCount ?? standing.front.troopCount;
        this.timeInFront = options.timeInFront ?? standing.front.timeInFront;
        this.frontActive = options.frontActive ?? standing.front.frontActive;
        this.warCondition = options.warCondition ?? standing.front.warCondition;
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
        position: { width: 600 },
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
        const resolved = computeLogisticsTarget(ctx);
        return {
            ...baseCtx,
            ...logisticsOptions(ctx),
            baseRating: this.baseRating,
            standardKit: this.standardKit,
            outcome: resolved.kind,
            computedTarget: resolved.kind === 'test' ? resolved.target : null,
            breakdownRows: resolved.kind === 'test' ? logisticsRows(ctx, resolved.breakdown, t) : [],
            rawSum: resolved.kind === 'test' ? resolved.rawSum : null,
            clamped: resolved.kind === 'test' && resolved.clamped,
        };
    }

    #buildContext(): LogisticsContext {
        return {
            rating: this.baseRating,
            munitorum: this.munitorum,
            situational: this.situational,
            availability: this.availability,
            troopCount: this.troopCount,
            timeInFront: this.timeInFront,
            frontActive: this.frontActive,
            warCondition: this.warCondition,
            standardKit: this.standardKit,
            craftsmanship: this.craftsmanship,
        };
    }

    #setAxis(axis: Axis, value: string): void {
        if (axis === 'availability') {
            const key = normaliseAvailability(value);
            if (key !== null) this.availability = key;
        } else if (axis === 'troopCount') {
            if (oneOf(TROOP_COUNT_KEYS, value)) this.troopCount = value;
        } else if (axis === 'timeInFront') {
            if (oneOf(FRONT_TIME_KEYS, value)) this.timeInFront = value;
        } else if (axis === 'frontActive') {
            if (oneOf(FRONT_TIME_KEYS, value)) this.frontActive = value;
        } else if (axis === 'warCondition') {
            if (oneOf(WAR_CONDITION_KEYS, value)) this.warCondition = value;
        } else {
            const key = normaliseCraftsmanship(value);
            if (key !== null) this.craftsmanship = key;
        }
    }

    static async #onSetAxis(this: LogisticsTestDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const axis = target.dataset['axis'];
        const value = target.dataset['value'];
        if (axis === undefined || value === undefined || !oneOf(AXES, axis)) return;
        this.#setAxis(axis, value);
        // The front is the squad's standing state: save it so the armoury prices against the same front (#496).
        if (this.actor !== null && oneOf(FRONT_AXES, axis)) {
            await this.actor.update({ [`system.logisticsFront.${axis}`]: this[axis] });
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
        const resolved = computeLogisticsTarget(ctx);
        // A GM's-discretion cell is never rolled: the button is disabled, and this guards a stale click.
        if (resolved.kind === 'discretion') return;

        let templateData: LogisticsChatContext;
        if (resolved.kind === 'automatic') {
            templateData = {
                gameSystem: 'ow',
                automatic: true,
                success: true,
                roll: null,
                target: null,
                degreesOfSuccess: 0,
                degreesOfFailure: 0,
                rows: [],
                rawSum: null,
                clamped: false,
            };
        } else {
            const roll = new Roll('1d100');
            await roll.evaluate();
            // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.total is typed loosely on Foundry's surface; the 1d100 evaluator yields a finite integer
            const rollTotal = Math.trunc(Number(roll.total ?? 0));
            const result = resolveLogisticsTest(resolved, rollTotal);
            templateData = {
                gameSystem: 'ow',
                automatic: false,
                success: result.success,
                roll: rollTotal,
                target: result.target,
                degreesOfSuccess: result.degreesOfSuccess,
                degreesOfFailure: result.degreesOfFailure,
                rows: logisticsRows(ctx, result.breakdown, t),
                rawSum: resolved.rawSum,
                clamped: resolved.clamped,
            };
        }

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

    /** Convenience opener — instantiate against an actor's persisted Logistics slot and render. */
    static show(actor: WH40KBaseActor): LogisticsTestDialog {
        const dialog = new LogisticsTestDialog({ actor });
        void dialog.render({ force: true });
        return dialog;
    }
}

/**
 * The persisted Logistics standing on an actor's system data; empty when the
 * actor is null (story / probe context), which defaults every field.
 */
function readStoredStanding(actor: WH40KBaseActor | null): StoredLogisticsStanding {
    if (actor === null) return {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: OW Logistics standing is a per-system actor schema slice not exposed on the abstract WH40KBaseActor system surface
    return actor.system as StoredLogisticsStanding;
}
