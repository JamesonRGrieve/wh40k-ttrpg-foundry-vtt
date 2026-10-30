import { type StructuredPrerequisites, toStructuredPrerequisites } from '../../rules/prerequisites.ts';
import { psychicPowerXpCost } from '../../rules/xp-costs.ts';
import { formatSigned } from '../../utils/format.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import ActivationTemplate from '../shared/activation-template.ts';
import { type AttackCueData, attackCueField } from '../shared/attack-cue-field.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import { prerequisitesField } from '../shared/prerequisites-field.ts';
import {
    normalisePsychicDiscipline,
    psychicDisciplineDisplay,
    type PsychicDisciplineOption,
    psychicDisciplineOptions,
    tidyPsychicDiscipline,
} from './psychic-discipline.ts';

/**
 * Data model for Psychic Power items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 * @mixes DamageTemplate
 */
export default class PsychicPowerData extends ItemDataModel.mixin(DescriptionTemplate, ActivationTemplate, DamageTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare discipline: string;
    declare prCost: number;
    /** The printed XP cost, or null when not authored (#642). */
    declare cost: number | null;
    /** The printed prerequisite and its structured gates (#673). */
    declare prerequisites: StructuredPrerequisites;
    declare focusPower: { characteristic: string; modifier: number; threshold: number; opposed: boolean; opposedCharacteristic: string; skill: string };
    declare effect: string;
    declare overbleed: string;
    declare isAttack: boolean;
    declare narrativeEffect: boolean;
    declare phenomenaModifier: number;
    declare sustained: boolean;
    declare range: string;
    declare rangePerPR: number;
    declare notes: string;
    declare requires: string[];
    /** Content-authored attack cue (#594). */
    declare cue: AttackCueData;

    // Getters from ActivationTemplate
    declare activationLabel: string;

    /** The item types the power's sheet accepts as nested entries: its Attack Specials (#697). */
    static get containerTypes(): string[] {
        return ['attackSpecial'];
    }

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TS can't verify the mixin constraint without casting
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // The discipline as the book prints it (content#35): content, so no fixed
            // choices. `disciplineTree` derives the tree the rules key on.
            discipline: new fields.StringField({ required: true, blank: true, initial: 'telepathy' }),

            // Psy Rating cost
            prCost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),

            // XP cost the book prints ("Value: 300 xp", DH2), #642.
            // Null when not authored: the advancement charge and the XP-spend
            // calculation then fall back to the PR heuristic (`psychicPowerCost`).
            cost: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0, integer: true }),

            // The printed Prerequisite line and the gates the Advancement Dialog checks (#673).
            prerequisites: prerequisitesField(),

            // Focus Power Test
            focusPower: new fields.SchemaField({
                characteristic: new fields.StringField({
                    required: true,
                    initial: 'willpower',
                }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                threshold: new fields.NumberField({ required: false, initial: null }),
                opposed: new fields.BooleanField({ required: true, initial: false }),
                opposedCharacteristic: new fields.StringField({ required: false, blank: true }),
                // A skill key when the book prints a skill focus test (Psyniscience,
                // Awareness); when set it is rolled instead of `characteristic`.
                skill: new fields.StringField({ required: false, blank: true, initial: '' }),
            }),

            // Power effect (enhanced description)
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Overbleed effect (pushing the power)
            overbleed: new fields.HTMLField({ required: false, blank: true }),

            // Is this an attack power?
            isAttack: new fields.BooleanField({ required: true, initial: false }),

            // The book prints no mechanical effect (divination, contact, detection,
            // information): the power is resolved by the GM from its text alone.
            narrativeEffect: new fields.BooleanField({ required: true, initial: false }),

            // Phenomena modifiers
            phenomenaModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),

            // Sustained power
            sustained: new fields.BooleanField({ required: true, initial: false }),

            // Range scaling with PR
            // The authored range ("20 metres x Psy Rating", "Self"), resolved to metres
            // at cast time by rules/psychic-range.ts parsePsychicRange.
            range: new fields.StringField({ required: false, blank: true, initial: '' }),

            rangePerPR: new fields.NumberField({ required: false, initial: null }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // Tree-path prerequisites: UUIDs of psychic-power items that must
            // be owned before this power can be purchased. Empty array means
            // no power-tree dependency (still gated on prCost vs PR).
            requires: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] }),

            // Attack cue (#594): how the power's manifestation looks and sounds on the
            // canvas. Content, authored in the compendium `_source`.
            cue: attackCueField(),
        };
    }

    /* -------------------------------------------- */
    /*  Migration                                   */
    /* -------------------------------------------- */

    /** @inheritdoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent _migrateData signature
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        // The printed discipline is kept as printed (content#35), only tidied: an import
        // could carry a heading split over lines ("Divination\n(Emperor's Tarot)").
        if (typeof source['discipline'] === 'string') {
            source['discipline'] = tidyPsychicDiscipline(source['discipline']);
        }
        // Runs after the line containers are flattened (super), so a per-line XP map
        // has already collapsed to the active line's number. A stray acquisition-
        // currency record (`{throneGelt, …}`, carried by some pack documents) is not
        // an XP cost and loads as "not authored" (#642).
        if ('cost' in source) source['cost'] = psychicPowerXpCost(source['cost']);
        // Pack documents carried a flat prerequisites string before the field existed (#673).
        if ('prerequisites' in source) source['prerequisites'] = toStructuredPrerequisites(source['prerequisites']);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the discipline label.
     * @type {string}
     */
    get disciplineLabel(): string {
        const display = psychicDisciplineDisplay(this.discipline);
        return 'labelKey' in display ? game.i18n.localize(display.labelKey) : display.label;
    }

    /** The rules tree of the printed discipline: `malefic`, `sanctic`, …, or `minor` when it names none. */
    get disciplineTree(): string {
        return normalisePsychicDiscipline(this.discipline);
    }

    /** The sheet's discipline select options, labelled through the langpack (#659). */
    get disciplineOptions(): PsychicDisciplineOption[] {
        return psychicDisciplineOptions(this.discipline);
    }

    /**
     * Pill style descriptor consumed by item-list-row.hbs to render the
     * discipline badge.
     */
    get pill(): { bgClass: string; textClass: string; icon: string; label: string } {
        const map: Record<string, { bgClass: string; textClass: string }> = {
            telepathy: { bgClass: 'tw-bg-[rgba(139,92,246,0.2)]', textClass: 'tw-text-[#8b5cf6]' },
            telekinesis: { bgClass: 'tw-bg-[rgba(6,182,212,0.2)]', textClass: 'tw-text-[#06b6d4]' },
            divination: { bgClass: 'tw-bg-[rgba(245,158,11,0.2)]', textClass: 'tw-text-[#f59e0b]' },
            pyromancy: { bgClass: 'tw-bg-[rgba(239,68,68,0.2)]', textClass: 'tw-text-[#ef4444]' },
            biomancy: { bgClass: 'tw-bg-[rgba(34,197,94,0.2)]', textClass: 'tw-text-[#22c55e]' },
            daemonology: { bgClass: 'tw-bg-[rgba(220,38,38,0.2)]', textClass: 'tw-text-[#dc2626]' },
            malefic: { bgClass: 'tw-bg-[rgba(124,45,18,0.2)]', textClass: 'tw-text-[#7c2d12]' },
            sanctic: { bgClass: 'tw-bg-[rgba(234,179,8,0.2)]', textClass: 'tw-text-[#eab308]' },
        };
        const fallback = { bgClass: 'tw-bg-[rgba(0,0,0,0.1)]', textClass: 'tw-text-[color:var(--wh40k-text-muted)]' };
        return { ...(map[this.disciplineTree] ?? fallback), icon: 'fa-brain', label: this.disciplineLabel };
    }

    /**
     * Get the focus power characteristic label.
     * @type {string}
     */
    get focusCharacteristicLabel(): string {
        return game.i18n.localize(`WH40K.Characteristic.${this.focusPower.characteristic.capitalize()}`);
    }

    /**
     * Get the focus test description.
     * @type {string}
     */
    get focusTestLabel(): string {
        let label = this.focusCharacteristicLabel;
        if (this.focusPower.modifier !== 0) {
            label += ` ${formatSigned(this.focusPower.modifier)}`;
        }
        if (this.focusPower.opposed) {
            const oppChar = this.focusPower.opposedCharacteristic || 'willpower';
            label += ` (Opposed by ${game.i18n.localize(`WH40K.Characteristic.${oppChar.capitalize()}`)})`;
        }
        return label;
    }

    /**
     * Is this power dangerous (causes phenomena)?
     * @type {boolean}
     */
    get causesPhenomena(): boolean {
        return true; // All psychic powers can cause phenomena
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            this.disciplineLabel,
            `PR Cost: ${this.prCost}`,
            `Focus: ${this.focusTestLabel}`,
            ...ItemDataModel.inheritedChatProperties(this, ActivationTemplate),
        ];

        if (this.isAttack) {
            props.push(...ItemDataModel.inheritedChatProperties(this, DamageTemplate));
        }

        if (this.sustained) {
            props.push(game.i18n.localize('WH40K.PsychicPower.Sustained'));
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            discipline: this.disciplineLabel,
            prCost: this.prCost,
            focus: this.focusTestLabel,
            action: this.activationLabel,
        };
    }
}
