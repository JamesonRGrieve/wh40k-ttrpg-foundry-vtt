/**
 * @file ColonyGrowthDialog — GM dialog for resolving a Rogue Trader
 * 90-day Colony Growth tick (#195, Stars-of-Inequity Table 3-3).
 *
 * The GM enters the Colony's current state (Size + four affective
 * Characteristics), optional growth modifier (PF burn, Resource-harvest
 * conversion bonus, situational), and the Agricultural / Ecclesiastical
 * softener toggles, then clicks Roll. The dialog calls
 * `resolveColonyGrowth(...)` and emits a chat card showing the rolled
 * outcome, deltas, new state, and active threshold effects.
 *
 * Pure picking logic lives in `src/module/rules/rt-colony.ts`; this is
 * a thin UI shell over `resolveColonyGrowth()`.
 *
 * RT-gated: opened only from the RT Colonial Endeavour flow. The other
 * six game systems neither see nor invoke this dialog.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import {
    COLONY_AFFECTIVE_KEYS,
    COLONY_CHARACTERISTICS,
    type ColonyCharacteristicKey,
    type ColonyGrowthResult,
    type ColonyState,
    resolveColonyGrowth,
    tierForSize,
} from '../../rules/rt-colony.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

/**
 * Minimal shape of the RT colony slot we read off the actor. Defined here
 * (instead of importing the DataModel) so the dialog stays usable in
 * Storybook / Tier-B probes where no Foundry actor is constructed. The
 * declaration on `CharacterData.rogueTrader.colony` is the authoritative
 * schema; this interface is structurally compatible.
 */
interface ColonyActorSlot {
    readonly characteristics: ColonyState;
}

const { ApplicationV2 } = foundry.applications.api;

interface CharacteristicRow {
    readonly id: ColonyCharacteristicKey;
    readonly labelKey: string;
    readonly value: number;
    readonly min: number;
    readonly max: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface ColonyGrowthContext extends Record<string, unknown> {
    readonly characteristics: ReadonlyArray<CharacteristicRow>;
    readonly tierKey: string;
    readonly growthModifier: number;
    readonly agriculturalSoftener: boolean;
    readonly ecclesiasticalOrderSwap: boolean;
}

const INITIAL_STATE: ColonyState = {
    size: COLONY_CHARACTERISTICS.size.default,
    complacency: COLONY_CHARACTERISTICS.complacency.default,
    order: COLONY_CHARACTERISTICS.order.default,
    productivity: COLONY_CHARACTERISTICS.productivity.default,
    piety: COLONY_CHARACTERISTICS.piety.default,
};

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class ColonyGrowthDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare colonyState: ColonyState;
    declare growthModifier: number;
    declare agriculturalSoftener: boolean;
    declare ecclesiasticalOrderSwap: boolean;
    /** Owning actor whose `system.rogueTrader.colony` is the source of truth. Null in story / probe contexts. */
    declare actor: WH40KBaseActor | null;

    constructor(
        options: ApplicationV2Config.DefaultOptions & {
            actor?: WH40KBaseActor | null;
            colonyState?: Partial<ColonyState>;
            growthModifier?: number;
            agriculturalSoftener?: boolean;
            ecclesiasticalOrderSwap?: boolean;
        } = {},
    ) {
        super(options);
        this.actor = options.actor ?? null;
        const seedFromActor = readColonyStateFromActor(this.actor);
        const seed = { ...seedFromActor, ...(options.colonyState ?? {}) };
        this.colonyState = {
            size: seed.size ?? INITIAL_STATE.size,
            complacency: seed.complacency ?? INITIAL_STATE.complacency,
            order: seed.order ?? INITIAL_STATE.order,
            productivity: seed.productivity ?? INITIAL_STATE.productivity,
            piety: seed.piety ?? INITIAL_STATE.piety,
        };
        this.growthModifier = Math.trunc(options.growthModifier ?? 0);
        this.agriculturalSoftener = options.agriculturalSoftener === true;
        this.ecclesiasticalOrderSwap = options.ecclesiasticalOrderSwap === true;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'colony-growth-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            adjustStat: ColonyGrowthDialog.#onAdjustStat,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            adjustModifier: ColonyGrowthDialog.#onAdjustModifier,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleAgricultural: ColonyGrowthDialog.#onToggleAgricultural,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleEcclesiastical: ColonyGrowthDialog.#onToggleEcclesiastical,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollGrowth: ColonyGrowthDialog.#onRollGrowth,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: ColonyGrowthDialog.#onCancel,
        },
        position: { width: 520 },
        window: {
            title: 'WH40K.RT.Colony.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/colony-growth-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ColonyGrowthContext> {
        const baseCtx = (await super._prepareContext(options)) as ColonyGrowthContext;
        const rows: CharacteristicRow[] = [];
        const sizeSpec = COLONY_CHARACTERISTICS.size;
        rows.push({
            id: 'size',
            labelKey: sizeSpec.labelKey,
            value: this.colonyState.size,
            min: sizeSpec.min,
            max: sizeSpec.max,
        });
        for (const key of COLONY_AFFECTIVE_KEYS) {
            const spec = COLONY_CHARACTERISTICS[key];
            rows.push({
                id: key,
                labelKey: spec.labelKey,
                value: this.colonyState[key],
                min: spec.min,
                max: spec.max,
            });
        }
        return {
            ...baseCtx,
            characteristics: rows,
            tierKey: `WH40K.RT.Colony.Tier.${tierForSize(this.colonyState.size).charAt(0).toUpperCase()}${tierForSize(this.colonyState.size).slice(1)}`,
            growthModifier: this.growthModifier,
            agriculturalSoftener: this.agriculturalSoftener,
            ecclesiasticalOrderSwap: this.ecclesiasticalOrderSwap,
        };
    }

    static async #onAdjustStat(this: ColonyGrowthDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const stat = target.dataset['stat'];
        const delta = Number(target.dataset['delta'] ?? '0');
        if (typeof stat !== 'string' || !isCharacteristicKey(stat)) return;
        const spec = COLONY_CHARACTERISTICS[stat];
        const next = Math.min(spec.max, Math.max(spec.min, this.colonyState[stat] + delta));
        // Replace state immutably to keep type narrowing simple.
        this.colonyState = { ...this.colonyState, [stat]: next };
        await this.render();
    }

    static async #onAdjustModifier(this: ColonyGrowthDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const delta = Number(target.dataset['delta'] ?? '0');
        if (!Number.isFinite(delta)) return;
        this.growthModifier = Math.trunc(this.growthModifier + delta);
        await this.render();
    }

    static async #onToggleAgricultural(this: ColonyGrowthDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        this.agriculturalSoftener = !this.agriculturalSoftener;
        await this.render();
    }

    static async #onToggleEcclesiastical(this: ColonyGrowthDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        this.ecclesiasticalOrderSwap = !this.ecclesiasticalOrderSwap;
        await this.render();
    }

    static async #onRollGrowth(this: ColonyGrowthDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const result: ColonyGrowthResult = resolveColonyGrowth({
            state: this.colonyState,
            growthModifier: this.growthModifier,
            agriculturalSoftener: this.agriculturalSoftener,
            ecclesiasticalOrderSwap: this.ecclesiasticalOrderSwap,
        });

        // Persist back to the owning Rogue Trader actor when one is bound.
        // Story/probe contexts open the dialog without an actor; in that
        // mode the result is chat-only.
        if (this.actor !== null) {
            await this.actor.update({
                'system.rogueTrader.colony.characteristics.size': result.nextState.size,
                'system.rogueTrader.colony.characteristics.complacency': result.nextState.complacency,
                'system.rogueTrader.colony.characteristics.order': result.nextState.order,
                'system.rogueTrader.colony.characteristics.productivity': result.nextState.productivity,
                'system.rogueTrader.colony.characteristics.piety': result.nextState.piety,
                'system.rogueTrader.colony.lastTick.date': new Date().toISOString(),
                'system.rogueTrader.colony.lastTick.modifier': result.modifier,
                'system.rogueTrader.colony.lastTick.outcome': result.outcome,
            });
        }

        const templateData = {
            outcomeKey: `WH40K.RT.Colony.Outcome.${result.outcome.charAt(0).toUpperCase()}${result.outcome.slice(1)}`,
            growthRoll: result.growthRoll,
            growthTotal: result.growthTotal,
            modifier: result.modifier,
            stateBefore: this.colonyState,
            stateAfter: result.nextState,
            deltas: result.deltas,
            decreasedStatKey:
                result.decreasedStat === null
                    ? null
                    : `WH40K.RT.Colony.Characteristic.${result.decreasedStat.charAt(0).toUpperCase()}${result.decreasedStat.slice(1)}`,
            softenerRoll: result.softenerRoll,
            activeEffectKeys: result.activeEffects.map((id) => `WH40K.RT.Colony.Effect.${id.charAt(0).toUpperCase()}${id.slice(1)}`),
            tierBeforeKey: `WH40K.RT.Colony.Tier.${tierForSize(this.colonyState.size).charAt(0).toUpperCase()}${tierForSize(this.colonyState.size).slice(1)}`,
            tierAfterKey: `WH40K.RT.Colony.Tier.${tierForSize(result.nextState.size).charAt(0).toUpperCase()}${tierForSize(result.nextState.size).slice(1)}`,
            gameSystem: 'rt',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/colony-growth-chat.hbs', templateData);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    /**
     * Convenience opener — instantiate against an actor's persisted colony
     * state and render. Matches the `AcquisitionDialog.show()` shape so
     * sheets can wire it from a single static method.
     */
    static show(actor: WH40KBaseActor): ColonyGrowthDialog {
        const dialog = new ColonyGrowthDialog({ actor });
        void dialog.render({ force: true });
        return dialog;
    }

    static async #onCancel(this: ColonyGrowthDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

function isCharacteristicKey(value: string): value is ColonyCharacteristicKey {
    return value === 'size' || value === 'complacency' || value === 'order' || value === 'productivity' || value === 'piety';
}

/**
 * Pull the persisted colony characteristics off an actor's
 * `system.rogueTrader.colony` slot. Returns `undefined` when no actor is
 * bound; the dialog then falls back to founding defaults. Schema
 * validation by the DataModel guarantees the fields are numbers when
 * present, so no defensive coercion is required here.
 */
function readColonyStateFromActor(actor: WH40KBaseActor | null): Partial<ColonyState> | undefined {
    if (actor === null) return undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: rogueTrader.colony is a per-system actor schema field not exposed on the abstract WH40KBaseActor system surface
    const colony = (actor.system as { rogueTrader?: { colony?: ColonyActorSlot } }).rogueTrader?.colony;
    if (colony === undefined) return undefined;
    return { ...colony.characteristics };
}

/** Convenience opener for sheets / chat-card buttons. */
export function openColonyGrowthDialog(
    opts: {
        actor?: WH40KBaseActor | null;
        colonyState?: Partial<ColonyState>;
        growthModifier?: number;
        agriculturalSoftener?: boolean;
        ecclesiasticalOrderSwap?: boolean;
    } = {},
): void {
    const dialog = new ColonyGrowthDialog(opts);
    void dialog.render({ force: true });
}
