/**
 * @file The Region behaviour that gives tokens inside an area a condition (#758).
 *
 * Foundry's own Apply Active Effect behaviour needs ActiveEffect documents to copy; the
 * system's conditions are catalogue entries resolved per line (Path C), so this behaviour
 * takes the condition's status id instead. A token gains the condition when it enters the
 * area (or is inside when the area is placed) and loses it when it leaves or the area is
 * removed. Only conditions this behaviour applied are removed: each carries the
 * behaviour's uuid as its origin, so a condition the actor already had stays.
 */
import { createConditionEffect } from '../rules/active-effects.ts';
import { APPLY_CONDITION_BEHAVIOR } from '../rules/area-region.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

/** The actor of the token a Region token event names, or null. */
function eventActor(event: RegionDocument.RegionEvent): WH40KBaseActorDocument | null {
    const data = event.data as { token?: { actor?: WH40KBaseActorDocument | null } | null };
    return data.token?.actor ?? null;
}

/** The ids of the effects on an actor that a behaviour (by its uuid) applied. */
function effectsFrom(actor: WH40KBaseActorDocument, origin: string): string[] {
    return actor.effects.filter((effect) => effect.origin === origin).map((effect) => effect.id);
}

/** The fields of an apply-condition behaviour. */
type ApplyConditionSchema = { condition: foundry.data.fields.StringField<{ required: true; blank: true; initial: '' }> };

export class ApplyConditionRegionBehavior extends foundry.data.regionBehaviors.RegionBehaviorType<ApplyConditionSchema> {
    static override LOCALIZATION_PREFIXES = ['WH40K.Area.ApplyConditionBehavior'];

    static override defineSchema(): ApplyConditionSchema {
        return { condition: new foundry.data.fields.StringField({ required: true, blank: true, initial: '' }) };
    }

    /** Give the entering token's actor the condition, once. */
    async applyTo(event: RegionDocument.RegionEvent): Promise<void> {
        const origin = this.behavior?.uuid ?? null;
        const actor = eventActor(event);
        if (!event.user.isSelf || this.condition === '' || origin === null || actor === null) return;
        if (effectsFrom(actor, origin).length > 0) return;
        await createConditionEffect(actor, this.condition, { origin });
    }

    /** Take the condition this behaviour gave back from the leaving token's actor. */
    async removeFrom(event: RegionDocument.RegionEvent): Promise<void> {
        const origin = this.behavior?.uuid ?? null;
        const actor = eventActor(event);
        if (!event.user.isSelf || origin === null || actor === null) return;
        const ids = effectsFrom(actor, origin);
        if (ids.length > 0) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    }

    static override events = {
        [CONST.REGION_EVENTS.TOKEN_ENTER]: async function (this: ApplyConditionRegionBehavior, event: RegionDocument.RegionEvent): Promise<void> {
            return this.applyTo(event);
        },
        [CONST.REGION_EVENTS.TOKEN_EXIT]: async function (this: ApplyConditionRegionBehavior, event: RegionDocument.RegionEvent): Promise<void> {
            return this.removeFrom(event);
        },
    };
}

/** Register the apply-condition behaviour type (init). Kept here so modules that only place areas never load a Foundry class. */
export function registerAreaRegionBehavior(): void {
    CONFIG.RegionBehavior.dataModels[APPLY_CONDITION_BEHAVIOR] = ApplyConditionRegionBehavior;
    const labels: Record<string, string> = { ...CONFIG.RegionBehavior.typeLabels };
    labels[APPLY_CONDITION_BEHAVIOR] = 'WH40K.Area.ApplyConditionBehavior.Label';
    CONFIG.RegionBehavior.typeLabels = labels;
    CONFIG.RegionBehavior.typeIcons[APPLY_CONDITION_BEHAVIOR] = 'fa-solid fa-eye-slash';
}
