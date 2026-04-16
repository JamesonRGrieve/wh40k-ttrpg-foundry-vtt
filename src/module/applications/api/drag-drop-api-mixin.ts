/**
 * @file DragDropAPIMixin - Core drag-drop API functionality
 * Provides base drag-drop handling for ApplicationV2 sheets
 * Based on dnd5e's DragDropApplicationMixin pattern
 *
 * This is the API layer - for visual feedback, see drag-drop-visual-mixin.mjs
 */

/**
 * Mixin that adds drag-drop handling to ApplicationV2 sheets.
 * @param {typeof ApplicationV2} Base  The base class being mixed.
 * @returns {typeof DragDropApplication}
 * @mixin
 */
export default function DragDropMixin<T extends new (...args: any[]) => any>(Base: T) {
    return class DragDropApplication extends Base {
        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            // @ts-expect-error - extended property
            dragDrop: [
                { dragSelector: '[data-item-id] .item-row', dropSelector: null },
                { dragSelector: '[data-effect-id] .item-row', dropSelector: null },
            ],
        };

        /* -------------------------------------------- */
        /*  Drag & Drop                                 */
        /* -------------------------------------------- */

        /**
         * Determine the allowed drop behaviors for a given drop event.
         * @param {DragEvent} event  The drop event.
         * @param {object} data      The parsed drag data.
         * @returns {Set<string>}    The allowed drop behaviors.
         * @protected
         */
        _allowedDropBehaviors(event: DragEvent, data: Record<string, unknown>): Set<string> {
            if (!data?.uuid) return new Set(['copy', 'link']);
            return new Set(['copy', 'move', 'link']);
        }

        /* -------------------------------------------- */

        /**
         * Determine the default drop behavior for a given drop event.
         * @param {DragEvent} event  The drop event.
         * @param {object} data      The parsed drag data.
         * @returns {string}         The default drop behavior.
         * @protected
         */
        _defaultDropBehavior(event: DragEvent, data: Record<string, unknown>): string {
            if (!data?.uuid) return 'copy';
            // @ts-expect-error - argument type
            const d = foundry.utils.parseUuid(data.uuid);
            const t = foundry.utils.parseUuid(this.document.uuid);
            const base = d.embedded?.length ? 'document' : 'primary';
            return d.collection === t.collection && d[`${base}Id`] === t[`${base}Id`] && d[`${base}Type`] === t[`${base}Type`] ? 'move' : 'copy';
        }

        /* -------------------------------------------- */

        /**
         * Get the current drop behavior based on keyboard modifiers.
         * @param {DragEvent} event  The drop event.
         * @returns {string}         The drop behavior.
         * @protected
         */
        _dropBehavior(event: DragEvent): string {
            const data = TextEditor.getDragEventData(event);
            // @ts-expect-error - type mismatch
            const allowed = this._allowedDropBehaviors(event, data);
            if (event.shiftKey && allowed.has('copy')) return 'copy';
            if (event.altKey && allowed.has('link')) return 'link';
            if (event.ctrlKey && allowed.has('none')) return 'none';
            // @ts-expect-error - type mismatch
            const defaultBehavior = this._defaultDropBehavior(event, data);
            return allowed.has(defaultBehavior) ? defaultBehavior : allowed.first();
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onDragStart(event: DragEvent): Promise<void> {
            const dataTransfer = event.dataTransfer;
            await super._onDragStart(event);
            if (!this.document.isOwner || this.document.collection?.locked) {
                dataTransfer.effectAllowed = 'copyLink';
            }
        }
    };
}
