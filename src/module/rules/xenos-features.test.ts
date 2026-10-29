import { describe, expect, it } from 'vitest';
import { RIGHT_STUFF } from './xenos-features';

/**
 * Contract test for the Ace role constant (#100). The talent test hooks that
 * used to live beside it are data on their compendium documents now
 * (`rules/test-substitution.ts`).
 */

describe('Ace role — Right Stuff (#100)', () => {
    it('applies to Operate and Survival skills only', () => {
        expect([...RIGHT_STUFF.applicableSkills]).toEqual(['operate', 'survival']);
    });
});
