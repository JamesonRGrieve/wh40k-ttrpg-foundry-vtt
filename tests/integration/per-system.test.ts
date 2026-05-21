import { describe, expect, it } from 'vitest';
import { bootFoundryOnce } from './lib/boot';
import { createActor, GAME_SYSTEM_IDS } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

describe.skipIf(!ok)('per-system homologation (Tier A)', () => {
    for (const gameSystem of GAME_SYSTEM_IDS) {
        it(`creates a character actor with gameSystem='${gameSystem}'`, async () => {
            const result = await bootFoundryOnce();
            if (!result.booted) return;
            const actor = await createActor(result.runtime, {
                type: 'character',
                name: `${gameSystem} Actor`,
                system: { gameSystem },
            });
            expect(actor).toBeDefined();
        });
    }
});
