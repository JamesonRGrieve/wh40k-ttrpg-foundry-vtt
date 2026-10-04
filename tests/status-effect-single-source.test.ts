/**
 * Guard test (#495): ONE status-effect system.
 *
 * The bug this locks down: conditions were written by four different vectors
 * (Foundry's default `CONFIG.statusEffects`, the registry, an inline copy in
 * `base-actor`, and the effect-creation dialog's own preset list) and read by
 * two incompatible schemes (status ids vs. display names). The same condition
 * therefore meant different things depending on which surface applied it — a
 * registry `prone` never reached the roll engine, and a core-default `prone`
 * carried no `changes`.
 *
 * These assertions fail on reintroduction of any of those shapes:
 *   - a second condition-definition list anywhere in `src/`
 *   - a condition ActiveEffect created outside the registry
 *   - automation that matches a condition by NAME instead of status id
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src/module');
const read = (relative: string): string => readFileSync(resolve(SRC, relative), 'utf8');

/** Source lines with comments stripped, so a guard never trips on prose that
 *  quotes the very pattern it forbids. */
function codeLines(text: string): string[] {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*)/.test(line));
}

describe('one status-effect system (#495)', () => {
    it('no source file defines a condition: they are the condition compendium documents', () => {
        // A condition definition is recognisable by pairing a condition name with
        // its icon in an object literal. None may exist in `src/` (Direction #7).
        for (const file of ['applications/prompts/effect-creation-dialog.ts', 'rules/condition-registry.ts', 'documents/base-actor.ts']) {
            const source = read(file);
            expect(source).not.toMatch(/name:\s*'(Stunned|Blinded|Prone|Unconscious|Fatigued)'/);
            expect(source).not.toMatch(/icons\/svg\/(daze|blind|unconscious)\.svg/);
        }
        expect(read('rules/condition-registry.ts')).not.toMatch(/const CONDITION_REGISTRY/);
    });

    it('every condition ActiveEffect is built by the one catalog builder', () => {
        expect(read('applications/prompts/effect-creation-dialog.ts')).toContain('conditionEffectData(');
        expect(read('documents/base-actor.ts')).toContain('conditionEffectData(');
        expect(read('rules/active-effects.ts')).toContain('conditionEffectData(');
        // The token-HUD toggle resolves the document too, not just the status row.
        expect(read('documents/active-effect.ts')).toContain('conditionEffectData(');
    });

    it('the per-turn condition automation is data-driven: no status id or effect name is matched', () => {
        // CODE lines only — doc comments may quote the old pattern to explain it.
        const combat = codeLines(read('actions/combat-action-manager.ts'));
        expect(combat.filter((line) => /effect\.name\s*===/.test(line))).toEqual([]);
        expect(combat.filter((line) => line.includes('statuses.has('))).toEqual([]);
        expect(read('actions/combat-action-manager.ts')).toContain('processConditionTicks(');
    });

    it('CONFIG.statusEffects is mutated in place, never reassigned (V14 keeps an id lookup on it)', () => {
        const hooks = codeLines(read('hooks-manager.ts'));
        expect(hooks.filter((line) => /CONFIG\.statusEffects\s*=[^=]/.test(line))).toEqual([]);
        expect(read('hooks-manager.ts')).toContain('registerConditionStatusEffects(CONFIG.statusEffects');
    });

    it('death is a status: the fatal crit rider maps to the `dead` id', () => {
        expect(read('rules/critical-damage.ts')).toMatch(/riders\.fatal\)\s*ids\.push\('dead'\)/);
    });

    it('the `dead` status reuses core’s id via specialStatusEffects.DEFEATED', () => {
        const hooks = read('hooks-manager.ts');
        expect(hooks).toContain('CONFIG.specialStatusEffects.DEFEATED = DEAD_STATUS_ID');
        // The id lives in `constants.ts`, not the registry: a consumer that only
        // needs the id (the #477 pile conversion) must be able to import it
        // without pulling in the condition table.
        expect(read('constants.ts')).toMatch(/DEAD_STATUS_ID\s*=\s*'dead'/);
        expect(hooks).toContain("from './constants.ts'");
    });

    it('the catalog lives in a leaf module, not the writer hub', () => {
        // `rules/active-effects.ts` imports the chat/roll helpers and the actor
        // document type, so it sits inside a large import cycle. `base-actor`
        // needs only the pure payload builder; reaching for it through the hub
        // closed a depcruise `no-circular` loop.
        expect(read('rules/condition-registry.ts')).not.toContain("from './active-effects.ts'");
        expect(read('documents/base-actor.ts')).toContain("from '../rules/condition-registry.ts'");
    });

    it('every condition effect carries `statuses`, so it is visible on the token', () => {
        const registry = read('rules/condition-registry.ts');
        // conditionEffectData — the single payload builder — always stamps it,
        // and createEffect passes it through to the document.
        expect(registry).toMatch(/statuses:\s*\[condition\]/);
        expect(read('rules/active-effects.ts')).toContain('statuses: effectData.statuses ?? []');
    });
});
