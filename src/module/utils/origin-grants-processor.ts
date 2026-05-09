/**
 * Origin Grants Processor - Wrapper for Unified Grants Processor
 *
 * Uses the unified GrantsProcessor for origin path grant operations.
 */

import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';
import { GrantsProcessor, GRANT_MODE, type GrantResult } from './grants-processor.ts';

export type OriginGrantResult = GrantResult;

export class OriginGrantsProcessor {
    /**
     * Process all grants from an origin path item.
     * This includes base grants AND grants from selected choices.
     *
     * @param {Item} originItem - The origin path item
     * @param {Actor} actor - The character actor
     * @returns {Promise<{
     *   characteristics: Object,
     *   itemsToCreate: Array,
     *   woundsBonus: number,
     *   fateBonus: number,
     *   corruptionBonus: number,
     *   insanityBonus: number
     * }>}
     */
    static async processOriginGrants(originItem: WH40KItemDocument, actor: WH40KBaseActorDocument): Promise<OriginGrantResult> {
        // Use unified processor in batch mode
        return GrantsProcessor.processGrants(originItem, actor, {
            mode: GRANT_MODE.BATCH,
            showNotification: false,
        });
    }
}
