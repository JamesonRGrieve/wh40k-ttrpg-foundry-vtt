import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import type { WeaponQualityMechanics } from './weapon-quality-mechanics.ts';

/**
 * Data model for Weapon Quality items (reference items for weapon qualities).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class WeaponQualityData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare hasLevel: boolean;
    declare level: number | null;
    declare effect: string;
    declare notes: string;
    declare mechanics: WeaponQualityMechanics;
    declare mechanicsRef: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TS can't verify the mixin constraint without casting
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Does this quality have a level/rating?
            hasLevel: new fields.BooleanField({ required: true, initial: false }),
            level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // Canonical-mechanics reference (#303). On a per-system stub doc this
            // holds the UUID of the Rogue Trader weaponQuality doc that owns the
            // shared RAW payload; the boot index follows it so the FFG family's
            // identical values live in one place. Blank on the canonical doc itself
            // (which carries its own `mechanics`).
            mechanicsRef: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Structured mechanical payload (#303). Empty/sentinel by default; a
            // quality only populates the keys its rule consumes.
            mechanics: new fields.SchemaField({
                type: new fields.StringField({ required: false, blank: true, initial: '' }),
                aimBonus: new fields.NumberField({ required: false, nullable: true, initial: null }),
                parryBonus: new fields.NumberField({ required: false, nullable: true, initial: null }),
                enemyParryPenalty: new fields.NumberField({ required: false, nullable: true, initial: null }),
                parryPenalty: new fields.NumberField({ required: false, nullable: true, initial: null }),
                attackBonus: new fields.NumberField({ required: false, nullable: true, initial: null }),
                rfThreshold: new fields.NumberField({ required: false, nullable: true, initial: null }),
                razorSharpDoubleOnDoS: new fields.NumberField({ required: false, nullable: true, initial: null }),
                haywireRadiusPerLevel: new fields.NumberField({ required: false, nullable: true, initial: null }),
                maximalPenetrationBonus: new fields.NumberField({ required: false, nullable: true, initial: null }),
                shockingAppliesFatigue: new fields.NumberField({ required: false, nullable: true, initial: null }),
                cannotParry: new fields.BooleanField({ required: false, initial: false }),
                cannotBeParried: new fields.BooleanField({ required: false, initial: false }),
                requiresPsyker: new fields.BooleanField({ required: false, initial: false }),
                requiresEldar: new fields.BooleanField({ required: false, initial: false }),
                bonusVsDaemons: new fields.BooleanField({ required: false, initial: false }),
                ignoresNonWardedArmor: new fields.BooleanField({ required: false, initial: false }),
                cancelsAim: new fields.BooleanField({ required: false, initial: false }),
                provenFloor: new fields.BooleanField({ required: false, initial: false }),
                bonusHitOnTwoDoS: new fields.BooleanField({ required: false, initial: false }),
                doublesAdditionalHits: new fields.BooleanField({ required: false, initial: false }),
                reliable: new fields.BooleanField({ required: false, initial: false }),
                unreliable: new fields.BooleanField({ required: false, initial: false }),
                ignoresDaemonResistance: new fields.BooleanField({ required: false, initial: false }),
                powerFieldDestroysOnParry: new fields.BooleanField({ required: false, initial: false }),
                overheats: new fields.BooleanField({ required: false, initial: false }),
                recharge: new fields.BooleanField({ required: false, initial: false }),
                triggersRecharge: new fields.BooleanField({ required: false, initial: false }),
                primitiveCap: new fields.BooleanField({ required: false, initial: false }),
                cripplingPenaltyPerActionVariable: new fields.BooleanField({ required: false, initial: false }),
                gravitonAddsArmourAsDamage: new fields.BooleanField({ required: false, initial: false }),
                allowsIndirectFire: new fields.BooleanField({ required: false, initial: false }),
                indirectPenaltyVariable: new fields.BooleanField({ required: false, initial: false }),
                shockingHalfDoFStun: new fields.BooleanField({ required: false, initial: false }),
                corrosiveArmourDice: new fields.StringField({ required: false, blank: true, initial: '' }),
                maximalDamageDice: new fields.StringField({ required: false, blank: true, initial: '' }),
                toxicAdditionalDamageDice: new fields.StringField({ required: false, blank: true, initial: '' }),
                sprayAvoidanceCharacteristic: new fields.StringField({ required: false, blank: true, initial: '' }),
                hitEffect: new fields.SchemaField({
                    requiresSave: new fields.StringField({ required: false, blank: true, initial: '' }),
                    failEffect: new fields.StringField({ required: false, blank: true, initial: '' }),
                    stunRoundsVariable: new fields.BooleanField({ required: false, initial: false }),
                    stunRounds: new fields.NumberField({ required: false, nullable: true, initial: null }),
                    saveTargetPenaltyPerLevel: new fields.NumberField({ required: false, nullable: true, initial: null }),
                }),
                template: new fields.SchemaField({
                    shape: new fields.StringField({ required: false, blank: true, initial: '' }),
                    radiusVariable: new fields.BooleanField({ required: false, initial: false }),
                }),
                rangeBands: new fields.SchemaField({
                    pointBlank: new fields.NumberField({ required: false, nullable: true, initial: null }),
                    shortRange: new fields.NumberField({ required: false, nullable: true, initial: null }),
                    standardRange: new fields.NumberField({ required: false, nullable: true, initial: null }),
                    longRange: new fields.NumberField({ required: false, nullable: true, initial: null }),
                    extremeRange: new fields.NumberField({ required: false, nullable: true, initial: null }),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName(): string {
        const parentItem = this.parent as { name?: string } | undefined;
        let name = parentItem?.name ?? '';
        if (this.hasLevel && this.level !== null) {
            name += ` (${this.level})`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props: string[] = [];
        if (this.hasLevel && this.level !== null) {
            props.push(`Level: ${this.level}`);
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
            level: this.hasLevel ? this.level : '-',
        };
    }
}
