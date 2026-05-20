import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Drives every public Item roll method end-to-end. For each method we:
 *   1. Create a `dh2-character` parent actor (has characteristics).
 *   2. Embed the right item type with the minimum schema needed to make
 *      the roll path take its happy branch (not fall back to sendToChat).
 *   3. Invoke `item.<method>()` from the page and assert a ChatMessage was
 *      produced (game.messages.size delta).
 *
 * Talent/navigator/order/ritual roll paths are system-agnostic at the
 * item-document layer, so a single sweep covers them — no per-system loop.
 *
 * Failures accumulate so one broken method doesn't mask another.
 */

interface ItemRollSpec {
    method: 'rollTalent' | 'rollNavigatorPower' | 'rollOrder' | 'rollRitual';
    itemType: string;
    itemSystem: Record<string, unknown>;
}

const ITEM_ROLL_SPECS: ReadonlyArray<ItemRollSpec> = [
    {
        method: 'rollTalent',
        itemType: 'talent',
        // rollTalent bails out to sendToChat unless rollConfig.characteristic
        // is populated. Use weaponSkill — every wh40k character schema has it.
        itemSystem: { rollConfig: { characteristic: 'weaponSkill', modifier: 0, description: 'e2e probe' } },
    },
    {
        method: 'rollNavigatorPower',
        itemType: 'navigatorPower',
        itemSystem: {},
    },
    {
        method: 'rollOrder',
        itemType: 'order',
        itemSystem: {},
    },
    {
        method: 'rollRitual',
        itemType: 'ritual',
        itemSystem: {},
    },
];

interface ItemRollProbe {
    method: string;
    chatDelta: number;
    returned: 'truthy' | 'falsy' | 'threw';
    pageErrors: string[];
    error: string | null;
}

async function probeItemRoll(page: import('@playwright/test').Page, actorId: string, spec: ItemRollSpec): Promise<ItemRollProbe> {
    const errors: string[] = [];
    const listener = (err: Error) => errors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ actorId, itemType, itemSystem, method }) => {
                const g = globalThis as unknown as {
                    game?: {
                        actors?: { get?: (id: string) => unknown };
                        messages?: { size?: number };
                    };
                };
                const actor = g.game?.actors?.get?.(actorId) as
                    | {
                          createEmbeddedDocuments?: (
                              kind: string,
                              data: object[],
                          ) => Promise<Array<{ id?: string; delete?: () => Promise<unknown> } | undefined>>;
                          items?: { get?: (id: string) => unknown };
                      }
                    | undefined;
                if (!actor?.createEmbeddedDocuments) {
                    return { chatDelta: 0, returned: 'falsy' as const, error: 'actor or createEmbeddedDocuments unavailable' };
                }
                const created = await actor.createEmbeddedDocuments('Item', [{ name: `probe-${itemType}`, type: itemType, system: itemSystem }]);
                const item = created?.[0];
                if (!item) {
                    return { chatDelta: 0, returned: 'falsy' as const, error: 'createEmbeddedDocuments returned no item' };
                }
                const before = g.game?.messages?.size ?? 0;
                const fn = item[method];
                if (typeof fn !== 'function') {
                    await item.delete?.();
                    return { chatDelta: 0, returned: 'falsy' as const, error: `item.${method} is not a function` };
                }
                let returnedKind: 'truthy' | 'falsy' | 'threw' = 'falsy';
                let error: string | null = null;
                try {
                    const ret = await fn.call(item);
                    returnedKind = ret ? 'truthy' : 'falsy';
                } catch (err) {
                    returnedKind = 'threw';
                    error = String((err as Error)?.message ?? err);
                }
                const after = g.game?.messages?.size ?? 0;
                await item.delete?.();
                return { chatDelta: after - before, returned: returnedKind, error };
            },
            { actorId, itemType: spec.itemType, itemSystem: spec.itemSystem, method: spec.method },
        );
        return {
            method: spec.method,
            chatDelta: result.chatDelta,
            returned: result.returned,
            pageErrors: errors,
            error: result.error,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('item roll methods (Tier B)', () => {
    test('every public item roll method posts a chat message', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        // Create parent actor (dh2-character has characteristics).
        const actorId = await page.evaluate(async () => {
            const { Actor } = globalThis as unknown as {
                Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
            };
            if (!Actor?.create) return null;
            const actor = await Actor.create({
                name: 'e2e-item-rolls-parent',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e' },
            });
            return actor?.id ?? null;
        });
        expect(actorId, 'failed to create parent actor for item-roll probes').not.toBeNull();
        if (actorId === null) return;

        const failures: string[] = [];
        try {
            for (const spec of ITEM_ROLL_SPECS) {
                const probe = await probeItemRoll(page, actorId, spec).catch((err: unknown) => ({
                    method: spec.method,
                    chatDelta: 0,
                    returned: 'threw' as const,
                    pageErrors: [String((err as Error)?.message ?? err)],
                    error: String((err as Error)?.message ?? err),
                }));

                if (probe.returned === 'threw') {
                    failures.push(`${spec.method}: threw — ${probe.error ?? 'unknown'}`);
                    continue;
                }
                if (probe.returned !== 'truthy') {
                    failures.push(`${spec.method}: returned falsy (expected ChatMessage); error=${probe.error ?? 'none'}`);
                    continue;
                }
                if (probe.chatDelta < 1) {
                    failures.push(`${spec.method}: no ChatMessage created (delta=${probe.chatDelta})`);
                    continue;
                }
                if (probe.pageErrors.length > 0) {
                    failures.push(`${spec.method}: page error — ${probe.pageErrors[0]}`);
                    continue;
                }
                recordCoverage('item.roll-method', spec.method);
            }
        } finally {
            // Clean up parent actor + any leftover chat messages from probes.
            await page.evaluate(async (actorId: string) => {
                const g = globalThis as unknown as {
                    game?: {
                        actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined };
                    };
                };
                const a = g.game?.actors?.get?.(actorId);
                await a?.delete?.();
            }, actorId);
        }

        expect(failures, `${failures.length}/${ITEM_ROLL_SPECS.length} item roll methods failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
