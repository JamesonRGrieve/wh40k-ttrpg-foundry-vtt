/**
 * @file DragDropAPIMixin - Core drag-drop API functionality
 * Provides base drag-drop handling for ApplicationV2 sheets
 * Based on dnd5e's DragDropApplicationMixin pattern
 *
 * This is the API layer - for visual feedback, see drag-drop-visual-mixin.mjs
 */

import type { ApplicationV2Ctor } from './application-types.ts';
import type { DragDropMixinAPI } from './sheet-mixin-types.js';

/**
 * Mixin that adds drag-drop handling to ApplicationV2 sheets.
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed.
 * @returns {any}
 * @mixin
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript mixin requirement
type DragDropMixed<T extends abstract new (...args: any[]) => unknown> = T & (new (...args: any[]) => DragDropMixinAPI);

export default function DragDropMixin<T extends ApplicationV2Ctor>(Base: T): DragDropMixed<T> {
    return class DragDropApplication extends Base implements DragDropMixinAPI {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript mixin requirement
        constructor(...args: any[]) {
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> & { dragDrop?: object[] } = {
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: drop-event payload is framework-supplied untyped data
        _allowedDropBehaviors(event: DragEvent, data: Record<string, unknown>): Set<string> {
            if (data.uuid === undefined || data.uuid === null || data.uuid === '') return new Set(['copy', 'link']);
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: drop-event payload is framework-supplied untyped data
        _defaultDropBehavior(event: DragEvent, data: Record<string, unknown>): string {
            if (typeof data.uuid !== 'string') return 'copy';
            const d = foundry.utils.parseUuid(data.uuid);
            // eslint-disable-next-line no-restricted-syntax -- boundary: mixin sees `this` typed as ApplicationV2 but document is bound by sheet subclass
            const doc = (this as unknown as { document: { uuid: string } }).document;
            const t = foundry.utils.parseUuid(doc.uuid);
            const base = d.embedded.length > 0 ? 'document' : 'primary';
            const dId = d[`${base}Id`] as string;
            const tId = t[`${base}Id`] as string;
            const dType = d[`${base}Type`] as string;
            const tType = t[`${base}Type`] as string;
            return d.collection === t.collection && dId === tId && dType === tType ? 'move' : 'copy';
        }

        /* -------------------------------------------- */

        /**
         * Get the current drop behavior based on keyboard modifiers.
         * @param {DragEvent} event  The drop event.
         * @returns {string}         The drop behavior.
         * @protected
         */
        _dropBehavior(event: DragEvent): string {
            // eslint-disable-next-line @typescript-eslint/no-deprecated, no-restricted-syntax -- boundary: Foundry V14 TextEditor.getDragEventData returns untyped record; new namespace not yet on shipped types
            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event) as Record<string, unknown>;
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
            const prototype = Object.getPrototypeOf(DragDropApplication.prototype) as {
                _onDragStart?: (this: DragDropApplication, event: DragEvent) => Promise<void>;
            };
            await prototype._onDragStart?.call(this, event);
            // eslint-disable-next-line no-restricted-syntax -- boundary: mixin sees `this` typed as ApplicationV2 but document is bound by sheet subclass
            const doc = (this as unknown as { document: { isOwner: boolean; collection?: { locked?: boolean } } }).document;
            if (!doc.isOwner || doc.collection?.locked === true) {
                dataTransfer.effectAllowed = 'copyLink';
            }
        }
    };
}
