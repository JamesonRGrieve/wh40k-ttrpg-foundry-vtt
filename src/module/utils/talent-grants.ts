/**
 * Talent Grants System - Wrapper for Unified Grants Processor
 *
 * Backward compatibility layer for talent grant processing.
 * Now uses the unified GrantsProcessor for all grant operations.
 */

import { GrantsProcessor, GRANT_MODE } from './grants-processor.ts';
import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';

/**
 * Process grants from a newly added talent.
 * Automatically creates granted items and applies skill training.
 *
 * @param {WH40KItem} talent - The talent item that was added
 * @param {WH40KActor} actor - The actor receiving the talent
 * @param {number} [depth=0] - Current recursion depth (prevents infinite loops)
 * @returns {Promise<void>}
 */
export async function processTalentGrants(talent: WH40KItemDocument, actor: WH40KBaseActorDocument, depth = 0): Promise<void> {
    if (!talent || talent.type !== 'talent') return;
    if (!actor) return;

    // Check if this talent grants anything
    if (!talent.system?.hasGrants) return;

    // Use unified processor in immediate mode
    await GrantsProcessor.processGrants(talent, actor, {
        mode: GRANT_MODE.IMMEDIATE,
        depth: depth,
        maxDepth: 3,
        showNotification: depth === 0,
        sourceItem: talent,
    });
}

/**
 * Handle removal of a talent that granted other items.
 * Optionally removes granted items if user confirms.
 *
 * @param {WH40KItem} talent - The talent being removed
 * @param {WH40KActor} actor - The actor losing the talent
 * @returns {Promise<void>}
 */
export async function handleTalentRemoval(talent: WH40KItemDocument, actor: WH40KBaseActorDocument): Promise<void> {
    // Forward to unified handler
    const { handleGrantRemoval } = await import('./grants-processor.ts');
    await handleGrantRemoval(talent, actor);
}
