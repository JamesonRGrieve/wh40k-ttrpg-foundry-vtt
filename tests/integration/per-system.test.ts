import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor, GAME_SYSTEM_IDS } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

// Resolve the boot once at collection time. `bootFoundryOnce()` is cached and
// idempotent, so this top-level await drives the one-shot boot and lets every
// case below gate on `BOOTED` via `it.skipIf(...)` instead of an in-test
// `if (!result.booted) return;` early-return. The discriminated `BootResult`
// is narrowed to its `runtime` here at module scope (where a conditional is
// not inside a test context), so the `it` callbacks deref nothing optional.
const bootResult = await bootFoundryOnce();
const RUNTIME: FoundryRuntime | undefined = bootResult.booted ? bootResult.runtime : undefined;
const BOOTED = RUNTIME !== undefined;

describe.skipIf(!ok)('per-system homologation (Tier A)', () => {
    for (const gameSystem of GAME_SYSTEM_IDS) {
        it.skipIf(!BOOTED)(`creates a character actor with gameSystem='${gameSystem}'`, async () => {
            const actor = await createActor(RUNTIME as FoundryRuntime, {
                type: 'character',
                name: `${gameSystem} Actor`,
                system: { gameSystem },
            });
            expect(actor).toBeDefined();
        });
    }
});
