/**
 * Per-system origin-path builder subclasses.
 *
 * The generic OriginPathBuilder is already parameterized on `gameSystem` —
 * each per-system subclass just stamps the correct id so callers (per-type
 * action handlers, create-actor dialog) can invoke the right builder without
 * threading a gameSystem string through the call site.
 *
 * If a system ever needs genuinely divergent step logic (e.g. OW's comrade
 * creation that DH2 has no analog for), that logic lands on the relevant
 * per-system subclass here, overriding _prepareSteps or _submitStep.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import OriginPathBuilder from './origin-path-builder.ts';

function make(gameSystem: string, className: string) {
    const cls = class extends (OriginPathBuilder as any) {
        constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
            super(actor, { ...options, gameSystem });
        }
    };
    Object.defineProperty(cls, 'name', { value: className });
    return cls;
}

export const DH2OriginPathBuilder = make('dh2e', 'DH2OriginPathBuilder');
export const DH1OriginPathBuilder = make('dh1e', 'DH1OriginPathBuilder');
export const RTOriginPathBuilder = make('rt', 'RTOriginPathBuilder');
export const BCOriginPathBuilder = make('bc', 'BCOriginPathBuilder');
export const OWOriginPathBuilder = make('ow', 'OWOriginPathBuilder');
export const DWOriginPathBuilder = make('dw', 'DWOriginPathBuilder');

/** Map an actor type id (e.g. 'dh2-character') to the right per-system builder. */
export function getBuilderForActorType(type: string): unknown {
    if (type.startsWith('dh2-')) return DH2OriginPathBuilder;
    if (type.startsWith('dh1-')) return DH1OriginPathBuilder;
    if (type.startsWith('rt-')) return RTOriginPathBuilder;
    if (type.startsWith('bc-')) return BCOriginPathBuilder;
    if (type.startsWith('ow-')) return OWOriginPathBuilder;
    if (type.startsWith('dw-')) return DWOriginPathBuilder;
    return DH2OriginPathBuilder;
}
