/**
 * @file DragDropAPIMixin - Core drag-drop API functionality
 * Provides base drag-drop handling for ApplicationV2 sheets
 * Based on dnd5e's DragDropApplicationMixin pattern
 *
 * This is the API layer - for visual feedback, see drag-drop-visual-mixin.mjs
 */

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import type { DragDropMixinAPI } from './sheet-mixin-types.js';

/**
 * Mixin that adds drag-drop handling to ApplicationV2 sheets.
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed.
 * @returns {any}
 * @mixin
 */
export default function DragDropMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class DragDropApplication extends Base implements DragDropMixinAPI {
        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
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
         * @param {Record<string, unknown>} data      The parsed drag data.
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
         * @param {Record<string, unknown>} data      The parsed drag data.
         * @returns {string}         The default drop behavior.
         * @protected
         */
        _defaultDropBehavior(event: DragEvent, data: Record<string, unknown>): string {
            if (!data?.uuid || typeof data.uuid !== 'string') return 'copy';
            const d = foundry.utils.parseUuid(data.uuid);
            const doc = (this as any).document;
            const t = foundry.utils.parseUuid(doc.uuid);
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
            const allowed = this._allowedDropBehaviors(event, data);
            if (event.shiftKey && allowed.has('copy')) return 'copy';
            if (event.altKey && allowed.has('link')) return 'link';
            if (event.ctrlKey && allowed.has('none')) return 'none';
            const defaultBehavior = this._defaultDropBehavior(event, data);
            return allowed.has(defaultBehavior) ? defaultBehavior : allowed.values().next().value ?? 'copy';
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onDragStart(event: DragEvent): Promise<void> {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer) return;
            await super._onDragStart(event);
            const doc = (this as any).document;
            if (!doc.isOwner || doc.collection?.locked) {
                dataTransfer.effectAllowed = 'copyLink';
            }
        }
    };
}
