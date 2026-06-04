/**
 * Regression guard (#264): the per-turn action-economy tracker is wired into
 * boot (the reset hook), the combat HUD (budget readout + spend/reset controls),
 * and the langpack. The pure budget/tracking logic is unit-tested co-located at
 * src/module/rules/action-budget.test.ts and action-economy.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const HOOKS = readRepoFile('src/module/hooks-manager.ts');
const PANEL = readRepoFile('src/module/applications/hud/combat-quick-panel.ts');
const TEMPLATE = readRepoFile('src/templates/hud/combat-quick-panel.hbs');
const LANG = JSON.parse(readRepoFile('src/lang/en.json')) as { WH40K: { Combat: Record<string, string> } };

describe('action-economy wiring (#264)', () => {
    it('registers the per-turn reset hook at boot', () => {
        expect(HOOKS).toContain('registerActionEconomy()');
        expect(HOOKS).toContain("from './rules/action-economy.ts'");
    });

    it('surfaces the action budget + spend/reset actions on the combat HUD', () => {
        expect(PANEL).toContain("context['actionBudget'] = actorId !== null ? actionBudgetForActor(actorId) : null");
        expect(PANEL).toContain('spendAction: CombatQuickPanel.#spendAction');
        expect(PANEL).toContain('resetActions: CombatQuickPanel.#resetActions');
        expect(PANEL).toContain('spendActionForActor(actorId, kind)');
    });

    it('renders the action-economy widget in the HUD template', () => {
        expect(TEMPLATE).toContain('{{#if actionBudget}}');
        expect(TEMPLATE).toContain('data-action="spendAction"');
        expect(TEMPLATE).toContain('data-kind="full"');
        expect(TEMPLATE).toContain('data-kind="reaction"');
        expect(TEMPLATE).toContain('data-action="resetActions"');
    });

    it('provides the action-economy langpack keys', () => {
        for (const key of ['ActionEconomy', 'FullAction', 'HalfAction', 'FreeAction', 'ReactionAction', 'ResetActions']) {
            expect(LANG.WH40K.Combat[key]).toBeDefined();
        }
    });
});
