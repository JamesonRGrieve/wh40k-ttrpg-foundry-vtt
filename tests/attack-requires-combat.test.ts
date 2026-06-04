/**
 * Regression guard (#251): weapon attacks are gated on an active combat.
 *
 * The unit behaviour of the predicate lives in combat-state.test.ts; this guards
 * the wiring — the shared attack funnel (`performWeaponAttack`) checks the gate
 * and bails with a localized warning, and the setting defaults to on.
 */

import { describe, expect, it } from 'vitest';
import { WH40KSettings } from '../src/module/wh40k-rpg-settings.ts';
import { readRepoFile } from './lib/repo-file.ts';

describe('require-combat-to-attack setting (#251)', () => {
    it('defaults to enabled', () => {
        expect(WH40KSettings.isCombatRequiredToAttack()).toBe(true);
    });
});

describe('performWeaponAttack gates on active combat (#251)', () => {
    const src = readRepoFile('src/module/actions/targeted-action-manager.ts');

    function performWeaponAttackBody(): string {
        const start = src.indexOf('performWeaponAttack(');
        expect(start, 'performWeaponAttack present').toBeGreaterThan(-1);
        // The method body ends at the next method ("performPsychicCast").
        const end = src.indexOf('performPsychicCast(', start);
        return src.slice(start, end === -1 ? undefined : end);
    }

    it('checks the setting and the active-combat predicate before rolling', () => {
        const body = performWeaponAttackBody();
        expect(body).toContain('WH40KSettings.isCombatRequiredToAttack()');
        expect(body).toContain('isActorInActiveCombat(');
    });

    it('warns with a localized message and returns when not in combat', () => {
        const body = performWeaponAttackBody();
        expect(body).toContain("t('WH40K.Combat.NoActiveCombatAttack')");
        // The gate must early-return before prepareUnifiedRoll opens the dialog.
        const guardIdx = body.indexOf('isActorInActiveCombat(');
        const rollIdx = body.indexOf('prepareUnifiedRoll(');
        expect(guardIdx).toBeGreaterThan(-1);
        expect(rollIdx).toBeGreaterThan(guardIdx);
    });
});
