import NPCBaseData from '../bases/npc-base.ts';

/**
 * Imperium Maledictum (Cubicle 7) NPC data model.
 *
 * IM statblocks diverge from the FFG NPC shape: alongside the shared
 * characteristics / wounds / armour (IM's flat `armour` scalar and Str/Tgh/Wil
 * characteristic abbreviations are folded onto the base shape by the NPC import
 * migrations), an IM statblock also prints Resolve, Critical Wounds, an Encounter
 * rating (familiars), a Speed descriptor, Species/Faction, a flat skill-target
 * map, inline Traits and Attacks, and a Possessions line. None of these exist on
 * the base `NPCData` schema, so this model adds them via a `defineSchema` override
 * — otherwise Foundry's strict cleaning drops them as unknown fields.
 */
export default class IMNPCData extends NPCBaseData {
    static gameSystem = 'im';

    /** IM printed Species descriptor (e.g. "Mutant (Heretic)"). */
    declare species: string;
    /** IM Speed descriptor ("Normal" / "Fast" / "Slow"). */
    declare speed: string;
    /** IM Resolve pool (spent to resist Fear / power Boons). */
    declare resolve: { value: number; max: number };
    /** IM Critical Wounds accumulated. */
    declare criticalWounds: { value: number; max: number };
    /** IM Familiar Encounter rating (null on non-familiar NPCs). */
    declare encounter: number | null;
    /** IM "Possessions:" line, verbatim prose. */
    declare possessions: string;
    /** IM skill-target map, `{ skillKey: target }` (specialised keys are camelCase). */
    declare skills: Record<string, number>;
    /** IM inline Traits, each a named rules blurb. */
    declare traits: { name: string; description: string }[];
    /** IM inline Attacks, each a printed weapon/attack stat line. */
    declare attacks: { name: string; skill: string; damage: string; range: string; traits: string }[];

    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const { NumberField, SchemaField, StringField, ArrayField, ObjectField, HTMLField } = foundry.data.fields;
        const pool = (): foundry.data.fields.SchemaField.Any =>
            new SchemaField({
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            });
        return {
            ...super.defineSchema(),
            // === IMPERIUM MALEDICTUM STATBLOCK FIELDS ===
            species: new StringField({ required: false, initial: '', blank: true }),
            speed: new StringField({ required: false, initial: 'Normal', blank: true }),
            resolve: pool(),
            criticalWounds: pool(),
            encounter: new NumberField({ required: false, nullable: true, initial: null, integer: true }),
            possessions: new StringField({ required: false, initial: '', blank: true }),
            skills: new ObjectField({ required: false, initial: {} }),
            traits: new ArrayField(
                new SchemaField({
                    name: new StringField({ required: true, initial: '', blank: true }),
                    description: new HTMLField({ required: false, initial: '', blank: true }),
                }),
                { required: false, initial: [] },
            ),
            attacks: new ArrayField(
                new SchemaField({
                    name: new StringField({ required: true, initial: '', blank: true }),
                    skill: new StringField({ required: false, initial: '', blank: true }),
                    damage: new StringField({ required: false, initial: '', blank: true }),
                    range: new StringField({ required: false, initial: '', blank: true }),
                    traits: new StringField({ required: false, initial: '', blank: true }),
                }),
                { required: false, initial: [] },
            ),
        };
    }
}
