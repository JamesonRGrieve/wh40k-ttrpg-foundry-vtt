import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * A single Objective within an Endeavour.
 *
 * Per RAW Rogue Trader (Core p. 290–298), an Endeavour is decomposed into one
 * or more Objectives the Dynasty must complete to advance. Each Objective
 * carries its own AP value contributed toward the parent Endeavour's
 * `apEarned` total when marked complete.
 */
export interface EndeavourObjective {
    name: string;
    description: string;
    complete: boolean;
    ap: number;
}

/**
 * Reward granted to the Dynasty when an Endeavour reaches 100% completion.
 *
 * - `profitFactor`: integer points added to `actor.system.rogueTrader.profitFactor.current`.
 * - `narrative`: GM-facing free-form text describing items, contacts, beats.
 */
export interface EndeavourReward {
    profitFactor: number;
    narrative: string;
}

/**
 * Data model for Endeavour items (Rogue Trader).
 *
 * An Endeavour is a long-term Dynasty goal. The actor (a Rogue Trader's PC or
 * the shared Dynasty document) owns one or more Endeavour items. Each tracks
 * achievement points (AP) earned vs required and a list of Objectives whose
 * completion grants AP and ultimately the Endeavour's reward.
 */
export default class EndeavourData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare apEarned: number;
    declare apRequired: number;
    declare objectives: EndeavourObjective[];
    declare reward: EndeavourReward;

    /** @override */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            apEarned: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            apRequired: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            objectives: new fields.ArrayField(
                new fields.SchemaField({
                    name: new fields.StringField({ required: true, initial: '', blank: true }),
                    description: new fields.StringField({ required: false, initial: '', blank: true }),
                    complete: new fields.BooleanField({ required: true, initial: false }),
                    ap: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                }),
                { required: true, initial: [] },
            ),
            reward: new fields.SchemaField({
                profitFactor: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                narrative: new fields.StringField({ required: false, initial: '', blank: true }),
            }),
        };
    }

    /**
     * True when `apEarned >= apRequired` and `apRequired > 0`.
     *
     * An Endeavour with `apRequired === 0` is treated as in-prep (not yet
     * scoped) and is never considered complete — completion of zero work is a
     * data-entry mistake, not a reward trigger.
     */
    get isComplete(): boolean {
        return this.apRequired > 0 && this.apEarned >= this.apRequired;
    }

    /**
     * Percentage complete clamped to [0, 100], rounded to nearest integer.
     *
     * Returns 0 when `apRequired === 0` so progress bars in the UI render an
     * empty fill rather than divide-by-zero NaN.
     */
    get pctComplete(): number {
        if (this.apRequired <= 0) return 0;
        const raw = (this.apEarned / this.apRequired) * 100;
        return Math.max(0, Math.min(100, Math.round(raw)));
    }

    /** @override */
    get chatProperties(): string[] {
        const props: string[] = [];
        if (this.apRequired > 0) {
            props.push(`${this.apEarned}/${this.apRequired} AP`);
        }
        if (this.reward.profitFactor > 0) {
            props.push(`+${this.reward.profitFactor} PF`);
        }
        return props;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        const labels: Array<Record<string, unknown>> = [];
        if (this.apRequired > 0) {
            labels.push({ label: `${this.apEarned}/${this.apRequired} AP`, icon: 'fa-solid fa-trophy' });
        }
        if (this.reward.profitFactor > 0) {
            labels.push({ label: `+${this.reward.profitFactor} PF`, icon: 'fa-solid fa-coins' });
        }
        return labels;
    }
}
