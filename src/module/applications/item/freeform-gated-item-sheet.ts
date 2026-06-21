/**
 * @file FreeformGatedItemSheet — BaseItemSheet whose edit affordances are
 * additionally gated behind the "Freeform Character Editing" world setting.
 *
 * The "second-class" content item family (specialAbility, malignancy, mutation,
 * mentalDisorder) is authored in compendiums and resynced onto world / owned
 * items at boot. Editing a *world copy* of such an item is a convenience that
 * only makes sense when the GM has opted into freeform building — and even then
 * the persistent source lives in the compendium. So these sheets are read-only
 * by default: the edit-mode pencil and ProseMirror editors only appear when
 * {@link WH40KSettings.isFreeformCharactersEnabled} returns true, and a footnote
 * in edit mode points the user back at the compendium source.
 *
 * Everything else (context, actions, edit-mode toggle plumbing) is inherited
 * from {@link BaseItemSheet}; this subclass only narrows the two gate getters.
 *
 * See issue #221.
 */

import type { WH40KItemDocument } from '../../types/global.d.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import BaseItemSheet from './base-item-sheet.ts';

export default class FreeformGatedItemSheet<TItem extends WH40KItemDocument = WH40KItemDocument> extends BaseItemSheet<TItem> {
    /**
     * Whether the sheet should show edit controls. In addition to the base
     * gate (editable, non-compendium), the freeform world setting must be on.
     */
    override get canEdit(): boolean {
        return super.canEdit && WH40KSettings.isFreeformCharactersEnabled();
    }

    /**
     * Whether the sheet is currently in edit mode. Gated identically to
     * {@link canEdit} so the ProseMirror editors never render unless freeform
     * editing is enabled.
     */
    override get inEditMode(): boolean {
        return super.inEditMode && WH40KSettings.isFreeformCharactersEnabled();
    }
}
