/**
 * Character Creation exports
 *
 * This module provides the full Origin Path character creation experience:
 * - OriginPathBuilder: Main builder UI for selecting 6 origin path steps
 * - OriginPathChoiceDialog: Modal dialog for making choices when an origin has options
 * - OriginRollDialog: Dialog for rolling starting stats (wounds, fate) interactively
 */

export { default as OriginPathBuilder } from './origin-path-builder.ts';
export { default as OriginPathChoiceDialog } from './origin-path-choice-dialog.ts';
export { default as OriginRollDialog } from './origin-roll-dialog.ts';

// Per-system builder variants — stamp the gameSystem id so callers can
// dispatch to the right builder based on an actor's concrete type.
export {
    DH2OriginPathBuilder,
    DH1OriginPathBuilder,
    RTOriginPathBuilder,
    BCOriginPathBuilder,
    OWOriginPathBuilder,
    DWOriginPathBuilder,
    getBuilderForActorType,
} from './system-origin-builders.ts';
