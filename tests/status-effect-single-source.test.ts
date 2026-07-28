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
    it('the registry is the only place condition definitions live', () => {
        // A condition definition is recognisable by pairing a condition name with
        // its icon in an object literal. Only the registry may contain them.
        const dialog = read('applications/prompts/effect-creation-dialog.ts');
        expect(dialog).not.toMatch(/name:\s*'Stunned'/);
        expect(dialog).not.toMatch(/name:\s*'Blinded'/);
        expect(dialog).not.toMatch(/icons\/svg\/daze\.svg/);
    });

    it('base-actor no longer hand-builds the Unconscious effect', () => {
        const baseActor = read('documents/base-actor.ts');
        // The inline copy's tell: the -60 change block written out in place.
        expect(baseActor).not.toMatch(/name:\s*'Unconscious'/);
        expect(baseActor).not.toMatch(/icons\/svg\/unconscious\.svg/);
    });

    it('no condition ActiveEffect is created outside the registry', () => {
        // Both former offenders now build their payload with `conditionEffectData`.
        expect(read('applications/prompts/effect-creation-dialog.ts')).toContain('conditionRegistry()');
        expect(read('documents/base-actor.ts')).toContain('conditionEffectData(');
    });

    it('the per-turn condition automation matches by status id, never by effect name', () => {
        // CODE lines only — the doc comment quotes the old `effect.name === …`
        // pattern to explain why it was wrong, and a naive scan reads its own
        // explanation as a violation (the same trap the #498 guard hit).
        const offenders = codeLines(read('actions/combat-action-manager.ts')).filter((line) => /effect\.name\s*===/.test(line));
        expect(offenders).toEqual([]);
        const combat = read('actions/combat-action-manager.ts');
        expect(combat).toContain("statuses.has('burning')");
        expect(combat).toContain("statuses.has('bloodloss')");
    });

    it('death is a status: the fatal crit rider maps to the `dead` id', () => {
        expect(read('rules/critical-damage.ts')).toMatch(/riders\.fatal\)\s*ids\.push\('dead'\)/);
    });

    it('the `dead` status reuses core’s id via specialStatusEffects.DEFEATED', () => {
        const hooks = read('hooks-manager.ts');
        expect(hooks).toContain('CONFIG.specialStatusEffects.DEFEATED = DEAD_STATUS_ID');
        // The id lives in `constants.ts`, not the registry: the registry's
        // module-scope condition table touches the Foundry `CONST` global, so a
        // consumer that only needs the id (the #477 pile conversion) must be
        // able to import it without loading a booted-client-only module.
        expect(read('constants.ts')).toMatch(/DEAD_STATUS_ID\s*=\s*'dead'/);
        expect(read('rules/active-effects.ts')).toContain("export { DEAD_STATUS_ID } from '../constants.ts'");
    });

    it('every condition effect carries `statuses`, so it is visible on the token', () => {
        const registry = read('rules/active-effects.ts');
        // conditionEffectData — the single payload builder — always stamps it.
        expect(registry).toMatch(/statuses:\s*\[id\]/);
    });
});
