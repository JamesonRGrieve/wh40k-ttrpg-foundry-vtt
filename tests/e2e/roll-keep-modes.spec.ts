import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Advantage / Disadvantage / Emphasis d100 tests (homebrew `roll-keep-modes`) in a
 * real Foundry world: core's `kl` / `kh` and the system's `ke` (keep extreme)
 * modifier must parse and resolve, each keeping exactly one of two d100s — the
 * lower, the higher, and the one furthest from 50 respectively. The unit tests
 * cannot prove the `ke` registration reaches Foundry's dice parser; this does.
 */

interface ResolvedKeepRoll {
    formula: string;
    total: number;
    dice: Array<{ result: number; active: boolean }>;
}

test('keep-mode d100 formulas resolve to one of two dice in live Foundry', async ({ page }) => {
    await joinOrSkip(page);

    const resolved = await page.evaluate(async (): Promise<ResolvedKeepRoll[]> => {
        interface ResolvedRoll {
            total: number;
            dice: Array<{ results: Array<{ result: number; active?: boolean }> }>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry Roll global, no repo types in page.evaluate
        const win = globalThis as unknown as { Roll: new (formula: string) => { evaluate: () => Promise<ResolvedRoll> } };
        const RollCls = win.Roll;
        const out: ResolvedKeepRoll[] = [];
        for (const formula of ['2d100kl', '2d100kh', '2d100ke']) {
            const roll = await new RollCls(formula).evaluate();
            const results = roll.dice[0]?.results ?? [];
            out.push({ formula, total: roll.total, dice: results.map((r) => ({ result: r.result, active: r.active === true })) });
        }
        return out;
    });

    for (const { formula, total, dice } of resolved) {
        expect(dice, `${formula} rolls two d100`).toHaveLength(2);
        const kept = dice.filter((d) => d.active);
        expect(kept, `${formula} keeps exactly one die`).toHaveLength(1);
        expect(total, `${formula} totals the kept die`).toBe(kept[0]?.result);
        const values = dice.map((d) => d.result);
        const expectedKept =
            formula === '2d100kl'
                ? Math.min(...values)
                : formula === '2d100kh'
                ? Math.max(...values)
                : values.reduce((best, v) => (Math.abs(v - 50) > Math.abs(best - 50) ? v : best), values[0] ?? 0);
        expect(total, `${formula} keeps the right die (${values.join(', ')})`).toBe(expectedKept);
    }
});
