/**
 * WH40K-specific Foundry type augmentations.
 *
 * These declarations are intentionally separate from `foundry-v14-overrides.d.ts`.
 * That file is reserved for V14 deltas against the upstream `fvtt-types` package.
 * This file holds project-local narrowing built on top of the configured document
 * classes and system types.
 */

declare global {
    namespace foundry.applications.sheets {
        class ActorSheetV2 extends foundry.applications.api.ApplicationV2 {
            document: WH40KBaseActorDocument;
            actor: WH40KBaseActorDocument;
        }

        class ItemSheetV2 extends foundry.applications.api.ApplicationV2 {
            document: WH40KItemDocument;
            item: WH40KItemDocument;
        }
    }
}

export {};
