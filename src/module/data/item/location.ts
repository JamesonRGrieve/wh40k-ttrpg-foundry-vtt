import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Sample-character entry shape (a named archetype that hails from this place).
 */
export interface LocationSampleCharacter {
    name: string;
    description: string;
}

/**
 * Data model for Location items.
 *
 * A structured, queryable place in the setting — sector, system, planet, moon,
 * settlement, site, etc. Locations form a hierarchy via {@link parent} (a
 * Foundry UUID of the containing location) and carry queryable metadata
 * (controlling faction, population, coordinates) alongside per-line lore.
 *
 * Description and source provenance come from {@link DescriptionTemplate} as
 * per-line variant containers (see src/packs/CLAUDE.md "Variantized Fields"),
 * so location lore stays homologation-friendly.
 *
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class LocationData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare parent: string;
    declare locationType: string;
    declare region: string;
    declare sector: string;
    declare coordinates: string;
    declare controllingFaction: string;
    declare population: string;
    declare tags: string[];
    declare homeWorldRules: string[];
    declare specialRules: string;
    declare sampleCharacters: LocationSampleCharacter[];

    /**
     * The canonical set of location-type slugs, ordered from largest to
     * smallest spatial scale. Content-agnostic enum of place kinds (not
     * content data) — used to populate the sheet's type selector.
     * @type {string[]}
     */
    static get locationTypes(): string[] {
        return [
            'sector',
            'subsector',
            'system',
            'star',
            'planet',
            'moon',
            'continent',
            'region',
            'settlement',
            'district',
            'site',
            'structure',
            'vessel',
            'station',
            'realm',
            'other',
        ];
    }

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // UUID of the containing location (hierarchy edge). Empty when this
            // is a top-level place. Resolved at render time via uuidNameCache.
            parent: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Spatial scale / kind of place.
            locationType: new fields.StringField({
                required: true,
                blank: true,
                initial: 'planet',
                choices: LocationData.locationTypes,
            }),

            // Coarse placement metadata (free-string, queryable).
            region: new fields.StringField({ required: false, blank: true, initial: '' }),
            sector: new fields.StringField({ required: false, blank: true, initial: '' }),
            coordinates: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Who holds this place.
            controllingFaction: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Population descriptor (free string — "12 billion", "Sparse", …).
            population: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Free-form categorization tags.
            tags: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), {
                required: false,
                initial: [],
            }),

            // DH2 home-world creation rules (one line each), as authored in the
            // legacy location content. Retained verbatim.
            homeWorldRules: new fields.ArrayField(new fields.StringField({ required: true, blank: true }), {
                required: false,
                initial: [],
            }),

            // Narrative special-rules prose for the place.
            specialRules: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Sample archetypes hailing from this place.
            sampleCharacters: new fields.ArrayField(
                new fields.SchemaField({
                    name: new fields.StringField({ required: true, blank: true, initial: '' }),
                    description: new fields.StringField({ required: true, blank: true, initial: '' }),
                }),
                { required: false, initial: [] },
            ),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate legacy location data.
     *
     * The original location content carried a `gameSystems` array (e.g.
     * `["dh2"]`) which is no longer part of the schema — coverage is derived
     * from variant containers and pack membership (see src/packs/CLAUDE.md
     * "Homologation Model"). Drop it so strict V14 validation does not choke.
     *
     * @param {object} source  The raw source data.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData receives raw Foundry document data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        if ('gameSystems' in source) {
            delete source['gameSystems'];
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Localized label for this location's type.
     * @type {string}
     */
    get locationTypeLabel(): string {
        const key = `WH40K.Location.Type.${this.locationType.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.locationType.capitalize();
    }

    /**
     * Icon class keyed off the location type, with a safe fallback.
     * @type {string}
     */
    get locationTypeIcon(): string {
        const icons: Record<string, string | undefined> = {
            sector: 'fa-galaxy',
            subsector: 'fa-galaxy',
            system: 'fa-sun',
            star: 'fa-sun',
            planet: 'fa-globe',
            moon: 'fa-moon',
            continent: 'fa-earth-americas',
            region: 'fa-map',
            settlement: 'fa-city',
            district: 'fa-building',
            site: 'fa-location-dot',
            structure: 'fa-landmark',
            vessel: 'fa-rocket',
            station: 'fa-satellite-dish',
            realm: 'fa-hat-wizard',
            other: 'fa-location-pin',
        };
        return icons[this.locationType] ?? 'fa-location-pin';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props: string[] = [this.locationTypeLabel];
        if (this.controllingFaction) props.push(this.controllingFaction);
        if (this.sector) props.push(this.sector);
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return [{ label: this.locationTypeLabel, icon: `fa-solid ${this.locationTypeIcon}` }];
    }
}
