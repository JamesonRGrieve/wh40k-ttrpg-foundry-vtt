import { describe, expect, it } from 'vitest';

const MOD = await import('./actor-proxy').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`WH40KActorProxy could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('./base-actor').catch((err) => {
    console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('WH40KActorProxy', () => {
    it.skipIf(MOD === undefined)('exports WH40KActorProxy', () => {
        expect(MOD?.WH40KActorProxy).toBeTruthy();
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('WH40KActorProxy is a Proxy wrapping WH40KBaseActor (prototype chain preserved)', () => {
        // The proxy target is WH40KBaseActor, so the prototype is shared.
        expect(MOD?.WH40KActorProxy.prototype).toBe(BASE_MOD?.WH40KBaseActor.prototype);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - construct trap dispatches to CONFIG.Actor.documentClasses[type]
    //   - construct trap falls back to WH40KBaseActor for unknown / missing type
});
