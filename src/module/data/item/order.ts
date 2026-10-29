import {
    SHIP_EFFECT_EXPIRIES,
    SHIP_EFFECT_KINDS,
    SHIP_EFFECT_TARGETS,
    SHIP_TEST_STATS,
    type ShipEffectData,
    type ShipTestStat,
} from '../../rules/ship-action-effects.ts';
import { migrateLegacyOrderTest, ORDER_ACTION_TYPES, type OrderActionType } from '../../rules/ship-actions.ts';
import { SHIP_ACTION_EFFECTS, type ShipActionEffect } from '../../rules/ship-crew-morale.ts';
import type { RammingProfile } from '../../rules/ship-ramming.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import { formatTestLabel, skillLabel } from '../shared/skill-definitions.ts';

/**
 * Data model for Order items (ship orders/commands).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class OrderData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare description: { value: string; chat: string; summary: string };
    declare category: string;
    declare actionType: OrderActionType;
    declare test: { skill: string; characteristic: string; modifier: number; shipStat: ShipTestStat | '' };
    declare requirements: string;
    declare effect: string;
    declare failure: string;
    declare notes: string;

    /**
     * How long the action runs, as printed ("1d5 Turns"). Optional; per-line
     * content authors it as a `{ <line>: … }` container (#186).
     */
    declare duration: string;

    /** The printed action-type line ("Manoeuvre Action", "Basic Order\nHalf Action"). Optional (#186). */
    declare typeAndAction: string;

    /**
     * Optional content-agnostic effect identifier (issue #189). An order
     * tagged `replenishMorale` refills the ship's Morale between combats.
     * Empty string ⇒ no built-in effect. Hold Fast! / Triage are NOT routed
     * here: RAW they need a test and reduce one pool by 1 + DoS (see
     * `WH40KVoidcraft.reducePriorTurnDamage`).
     */
    declare shipActionEffect: ShipActionEffect | '';

    /**
     * Optional ramming content (RT core, #188), authored on the
     * Ramming Speed order: the damage die per attacking hull type and the
     * die the rammer takes back on impact. Empty on every other order.
     */
    declare ramming: RammingProfile;

    /**
     * Optional automated effect of an RT ship action (#186, #189), authored on
     * the order: Hold Fast! reduces last turn's Morale damage, Lock on Target
     * adds BS to one Weapon Component, and so on. `kind: ''` on every other order.
     */
    declare shipEffect: ShipEffectData;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends `any`; the as-unknown chain satisfies DataField.Any brand without runtime effect
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Order category
            category: new fields.StringField({
                required: true,
                initial: 'combat',
                choices: ['combat', 'maneuver', 'command', 'support', 'special'],
            }),

            // Action type
            actionType: new fields.StringField({
                required: true,
                initial: 'extended-action',
                choices: [...ORDER_ACTION_TYPES],
            }),

            // Printed duration and action-type line (#186). Optional.
            duration: new fields.StringField({ required: false, initial: '', blank: true }),
            typeAndAction: new fields.StringField({ required: false, initial: '', blank: true }),

            // Required test. `shipStat` (optional, #186) names the ship stat a
            // Combined Skill Test adds to the skill (RT core).
            test: new fields.SchemaField({
                skill: new fields.StringField({ required: true, initial: 'command' }),
                characteristic: new fields.StringField({ required: false, blank: true }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                shipStat: new fields.StringField({ required: false, initial: '', blank: true, choices: ['', ...SHIP_TEST_STATS] }),
            }),

            // RT ship-action effect (#186, #189). Compendium opt-in; `kind: ''`
            // leaves the action a rules card. Magnitude is
            // `base + step × ⌊extra degrees ÷ per⌋` (see rules/ship-action-effects.ts).
            shipEffect: new fields.SchemaField(
                {
                    kind: new fields.StringField({ required: false, initial: '', blank: true, choices: ['', ...SHIP_EFFECT_KINDS] }),
                    targets: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: [...SHIP_EFFECT_TARGETS] })),
                    base: new fields.NumberField({ required: false, initial: 0, integer: true }),
                    step: new fields.NumberField({ required: false, initial: 0, integer: true }),
                    per: new fields.NumberField({ required: false, initial: 1, integer: true, min: 1 }),
                    rounds: new fields.NumberField({ required: false, initial: 0, integer: true, min: 0 }),
                    expiry: new fields.StringField({ required: false, initial: '', blank: true, choices: ['', ...SHIP_EFFECT_EXPIRIES] }),
                },
                { required: false },
            ),

            // Requirements
            requirements: new fields.HTMLField({ required: false, blank: true }),

            // Effect on success
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Failure consequences
            failure: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // RT Crew/Morale economy hook (issue #189). Compendium opt-in.
            shipActionEffect: new fields.StringField({
                required: false,
                initial: '',
                blank: true,
                choices: ['', ...SHIP_ACTION_EFFECTS],
            }),

            // RT ramming content (#188). Compendium opt-in on Ramming Speed.
            ramming: new fields.SchemaField(
                {
                    damage: new fields.ArrayField(
                        new fields.SchemaField({
                            hullType: new fields.StringField({ required: true, blank: false }),
                            formula: new fields.StringField({ required: true, blank: false }),
                        }),
                    ),
                    reboundDamage: new fields.StringField({ required: false, initial: '', blank: true }),
                },
                { required: false },
            ),
        };
    }

    /**
     * Fold the flat `skill` / `modifier` the order content carries into the
     * schema's `test` block, which the cleaner would otherwise strip (#186).
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData receives untyped Foundry source data; Record<string,unknown> is the documented DataModel pattern
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        migrateLegacyOrderTest(source);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the category label.
     * @type {string}
     */
    get categoryLabel(): string {
        return game.i18n.localize(`WH40K.OrderCategory.${this.category.capitalize()}`);
    }

    /**
     * Pill descriptor consumed by item-list-row.hbs for the category badge.
     */
    get pill(): { bgClass: string; textClass: string; icon: string; label: string } {
        const map: Record<string, { bgClass: string; textClass: string; icon: string }> = {
            combat: { bgClass: 'tw-bg-[rgba(239,68,68,0.2)]', textClass: 'tw-text-[#ef4444]', icon: 'fa-crosshairs' },
            maneuver: { bgClass: 'tw-bg-[rgba(59,130,246,0.2)]', textClass: 'tw-text-[#3b82f6]', icon: 'fa-route' },
            command: { bgClass: 'tw-bg-[rgba(245,158,11,0.2)]', textClass: 'tw-text-[#f59e0b]', icon: 'fa-bullhorn' },
            support: { bgClass: 'tw-bg-[rgba(34,197,94,0.2)]', textClass: 'tw-text-[#22c55e]', icon: 'fa-hands-helping' },
            special: { bgClass: 'tw-bg-[rgba(139,92,246,0.2)]', textClass: 'tw-text-[#8b5cf6]', icon: 'fa-star' },
        };
        const fallback = { bgClass: 'tw-bg-[rgba(0,0,0,0.1)]', textClass: 'tw-text-[color:var(--wh40k-text-muted)]', icon: 'fa-ship' };
        return { ...(map[this.category] ?? fallback), label: this.categoryLabel };
    }

    /**
     * Get the action type label.
     * @type {string}
     */
    get actionTypeLabel(): string {
        return game.i18n.localize(
            `WH40K.ActionType.${this.actionType
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Get the test description.
     * @type {string}
     */
    get testLabel(): string {
        // The skill's display label, not its key: the Ship Orders panel showed "TEST command" (#648).
        return formatTestLabel(skillLabel(this.test.skill), this.test.modifier);
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [this.categoryLabel, this.actionTypeLabel, game.i18n.format('WH40K.Chat.TestProperty', { test: this.testLabel })];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            category: this.categoryLabel,
            action: this.actionTypeLabel,
            test: this.testLabel,
        };
    }
}
