/**
 * @file ReferenceListItemSheet — a {@link FreeformGatedItemSheet} that edits
 * UUID-reference lists and arrays of objects (#597).
 *
 * The mutation sheet (Gift of the Gods riders, granted traits, acquisition
 * rolls) and the special-ability sheet (the Marks a Distinction combines, a
 * Mark's granted trait) both store lists the plain form round-trip cannot edit:
 *
 *   - **Drops.** A drop on a `data-drop-zone="reference"` element (rendered by
 *     `templates/item/partial/reference-list.hbs`) stores the dropped item's
 *     UUID at the zone's `data-reference-path` — appended to a list, or as the
 *     single value — after checking it against the zone's
 *     `data-reference-accept` tokens. Any other drop takes the normal
 *     ItemSheetV2 path.
 *   - **Index-keyed form fields.** The form only carries the element fields it
 *     renders, so {@link mergeIndexedArrays} folds them back onto the stored
 *     elements before the submit is validated.
 *   - **Add / remove.** Rows are removed through the shared `removeEntry`
 *     action; sheets add their own `add…` actions on top and write through
 *     {@link updateSystemPath}, which rewrites a whole array because an
 *     `ArrayField` cannot be patched by index.
 *
 * Edit mode is inherited unchanged (BaseItemSheet toggle + the freeform gate).
 */

import type { DropData } from '../../managers/actor-journal-link.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import { getMaterializedItemSource } from '../../utils/item-variant-utils.ts';
import type BaseItemSheet from './base-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';
import {
    acceptsDroppedItem,
    appendUniqueUuid,
    buildArrayPathUpdate,
    type EffectChoice,
    type FormObject,
    type FormValueMutation,
    isFormObject,
    isFormValue,
    isReferenceMode,
    itemUuidFromDropData,
    mergeIndexedArrays,
    removeIndex,
} from './reference-list-edits.ts';

/** The item's materialized `system` source — what the form shows and what edits start from. */
function systemSource(sheet: BaseItemSheet): FormObject {
    const source = getMaterializedItemSource(sheet.item);
    if (!isFormValue(source) || !isFormObject(source)) throw new Error(`ReferenceListItemSheet: ${sheet.item.uuid} has non-JSON system source`);
    return source;
}

/**
 * Replace the value at the `system.`-prefixed `path` with `mutate(current)`,
 * writing the outermost containing array whole.
 */
export async function updateSystemPath(sheet: BaseItemSheet, path: string, mutate: FormValueMutation): Promise<void> {
    await sheet.item.update(buildArrayPathUpdate(systemSource(sheet), path, mutate));
}

/** Resolve a stored UUID to its document's display name, synchronously; the raw UUID when it no longer resolves. */
export function resolveReferenceName(uuid: string): string {
    const doc = fromUuidSync(uuid, { strict: false });
    return doc !== null && typeof doc.name === 'string' && doc.name !== '' ? doc.name : uuid;
}

/** The item's embedded Active Effects, as the effect pickers list them. */
export function embeddedEffectChoices(sheet: BaseItemSheet): EffectChoice[] {
    return sheet.item.effects.contents.map((effect) => ({ id: effect.id, name: effect.name }));
}

export default class ReferenceListItemSheet<TItem extends WH40KItemDocument = WH40KItemDocument> extends FreeformGatedItemSheet<TItem> {
    /** @override */
    static override DEFAULT_OPTIONS = {
        ...FreeformGatedItemSheet.DEFAULT_OPTIONS,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...FreeformGatedItemSheet.DEFAULT_OPTIONS.actions,
            viewReference: ReferenceListItemSheet.#viewReference,
            removeEntry: ReferenceListItemSheet.#removeEntry,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /**
     * Fold index-keyed array fields back onto the stored elements before
     * DocumentSheetV2 validates the submit (validation would otherwise fill the
     * fields the form does not render with their defaults).
     */
    _processFormData(event: SubmitEvent | null, form: HTMLFormElement, formData: FormDataExtended): FormObject {
        // The mixin chain erases DocumentSheetV2's `_processFormData` (expandObject of the form data) from the static type.
        const proto = Object.getPrototypeOf(ReferenceListItemSheet.prototype) as {
            _processFormData: (this: ReferenceListItemSheet, e: SubmitEvent | null, f: HTMLFormElement, fd: FormDataExtended) => FormObject;
        };
        const data = proto._processFormData.call(this, event, form, formData);
        const { system } = data;
        if (!isFormObject(system)) return data;
        return { ...data, system: mergeIndexedArrays(system, systemSource(this)) };
    }

    /* -------------------------------------------- */

    /**
     * A drop on a reference drop zone stores the dropped item's UUID; every
     * other drop takes the normal ItemSheetV2 path.
     */
    async _onDrop(event: DragEvent): Promise<void> {
        const zone = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-drop-zone="reference"]') : null;
        if (zone === null) {
            // The mixin chain erases ItemSheetV2's `_onDrop` from the static type, so reach it through the prototype.
            const proto = Object.getPrototypeOf(ReferenceListItemSheet.prototype) as {
                _onDrop?: (this: ReferenceListItemSheet, e: DragEvent) => Promise<void>;
            };
            await proto._onDrop?.call(this, event);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!this.inEditMode) return;

        const { referencePath, referenceAccept, referenceMode } = zone.dataset;
        if (referencePath === undefined || referenceAccept === undefined || !isReferenceMode(referenceMode)) return;
        const data: DropData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        const uuid = itemUuidFromDropData(data);
        if (uuid === null) return;
        const dropped = await fromUuid(uuid);
        if (!(dropped instanceof Item)) return;
        if (!acceptsDroppedItem(referenceAccept, dropped)) {
            ui.notifications.warn(game.i18n.format('WH40K.ItemSheet.Reference.Rejected', { name: dropped.name }));
            return;
        }
        await updateSystemPath(this, referencePath, (current) => (referenceMode === 'list' ? appendUniqueUuid(current, uuid) : uuid));
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /** Open the sheet of a referenced item. */
    static async #viewReference(this: ReferenceListItemSheet, _event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined) return;
        await this.viewItemByUuid(uuid, game.i18n.format('WH40K.ItemSheet.Reference.NotFound', { uuid }));
    }

    /**
     * Remove a list element (`data-index` set) or clear a single reference
     * (no `data-index`) at `data-path`.
     */
    static async #removeEntry(this: ReferenceListItemSheet, _event: Event, target: HTMLElement): Promise<void> {
        const { path, index } = target.dataset;
        if (path === undefined || !this.inEditMode) return;
        await updateSystemPath(this, path, (current) => (index === undefined ? '' : removeIndex(current, Number(index))));
    }
}
