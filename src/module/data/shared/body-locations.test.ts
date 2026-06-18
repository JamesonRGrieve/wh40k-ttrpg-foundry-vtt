/**
 * Unit tests for the shared body-location helper.
 *
 * `BODY_LOCATIONS` is a pure const (the canonical six hit locations);
 * `bodyLocationsSchema` defers all `foundry.data.fields` access until called,
 * so the module imports cleanly without a Foundry runtime. We assert the
 * canonical contract of the const here; the SchemaField construction itself is
 * exercised by the Tier B e2e suite where `foundry` is present.
 */
import { describe, expect, it } from 'vitest';
import { BODY_LOCATIONS, bodyLocationsSchema } from './body-locations.ts';

describe('BODY_LOCATIONS', () => {
    it('lists the six canonical hit locations in order', () => {
        expect(BODY_LOCATIONS).toEqual(['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
    });

    it('has no duplicate locations', () => {
        expect(new Set(BODY_LOCATIONS).size).toBe(BODY_LOCATIONS.length);
    });

    it('covers exactly the head, torso, both arms and both legs', () => {
        expect(new Set(BODY_LOCATIONS)).toEqual(new Set(['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']));
    });
});

describe('bodyLocationsSchema', () => {
    it('is exported as a function (schema construction deferred to call time)', () => {
        expect(typeof bodyLocationsSchema).toBe('function');
    });
});
