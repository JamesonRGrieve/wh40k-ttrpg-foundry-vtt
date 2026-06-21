import { LEAD_STATUS_CHOICES, isTerminalLeadStatus, leadStatusIcon, leadStatusLabelKey } from '../../config/lead-status.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Investigation Lead items.
 *
 * Per dh/core/core.md §"INVESTIGATION" (Leads framework), a lead has a type
 * (witness/document/location/other), a source clue that produced it, and a
 * state that resolves through pursued → dead-end / active. Pure data shape —
 * no automation; resolution mechanics live on the actor / GM workflow.
 *
 * The lead-status vocabulary (choices + label/icon maps) is shared with
 * {@link ../item/journal-entry.ts JournalEntryItemData} via
 * {@link ../../config/lead-status.ts}.
 *
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class LeadData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare state: string;
    declare sourceClue: string;
    declare leadType: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Investigation state — see the shared lead-status registry
            // (active → pursued → resolved | dead-end).
            state: new fields.StringField({
                required: true,
                initial: 'active',
                choices: [...LEAD_STATUS_CHOICES],
            }),

            // Source clue — free text identifying which clue / scene
            // produced this lead. May be a wiki-style reference or just a
            // narrative description. Kept as a simple string for portability.
            sourceClue: new fields.StringField({ required: false, blank: true, initial: '' }),

            // Lead taxonomy — witness, document, location, or other.
            leadType: new fields.StringField({
                required: true,
                initial: 'other',
                choices: ['witness', 'document', 'location', 'other'],
            }),

            // GM notes for tracking follow-ups.
            notes: new fields.StringField({ required: false, blank: true, initial: '' }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Localized label for the lead's current state.
     */
    get stateLabel(): string {
        const key = leadStatusLabelKey(this.state);
        return game.i18n.has(key) ? game.i18n.localize(key) : this.state;
    }

    /**
     * Font Awesome icon class for the lead's current state.
     */
    get stateIcon(): string {
        return leadStatusIcon(this.state);
    }

    /**
     * Localized label for the lead's type.
     */
    get leadTypeLabel(): string {
        const map: Record<string, string> = {
            witness: 'WH40K.Lead.Type.Witness',
            document: 'WH40K.Lead.Type.Document',
            location: 'WH40K.Lead.Type.Location',
            other: 'WH40K.Lead.Type.Other',
        };
        const key = map[this.leadType] ?? 'WH40K.Lead.Type.Other';
        return game.i18n.has(key) ? game.i18n.localize(key) : this.leadType;
    }

    /**
     * Font Awesome icon class for the lead's type.
     */
    get leadTypeIcon(): string {
        const icons: Record<string, string> = {
            witness: 'fa-user',
            document: 'fa-file-lines',
            location: 'fa-map-location-dot',
            other: 'fa-circle-question',
        };
        return icons[this.leadType] ?? 'fa-circle-question';
    }

    /**
     * Is this lead in a terminal (closed) state — `resolved` or `dead-end`?
     * Driven by the shared registry's `terminal` flag, not a hard-coded id.
     */
    get isResolved(): boolean {
        return isTerminalLeadStatus(this.state);
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [this.leadTypeLabel, this.stateLabel];
        if (this.sourceClue) {
            const labelKey = 'WH40K.Lead.SourceClue.Label';
            const label = game.i18n.has(labelKey) ? game.i18n.localize(labelKey) : 'Source';
            props.push(`${label}: ${this.sourceClue}`);
        }
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            state: this.stateLabel,
            leadType: this.leadTypeLabel,
        };
    }
}
