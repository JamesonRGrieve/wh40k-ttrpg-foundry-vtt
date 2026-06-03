/**
 * Regression guard (#250): the attack flow surfaces the current target and a way
 * to pick one (Foundry-native game.user.targets), so the attacker can choose the
 * defender (feeding effective-damage + auto-range).
 *
 * Source-scan: the unified roll dialog needs the Foundry runtime to instantiate;
 * the contract is that it exposes the target to the template and the weapon panel
 * renders a target indicator + a Select Target button wired to the selectTarget
 * action (which reads game.user.targets and sets rollData.targetActor).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialog = readFileSync(resolve(__dirname, '../src/module/applications/prompts/unified-roll-dialog.ts'), 'utf8');
const panel = readFileSync(resolve(__dirname, '../src/templates/prompt/unified/panels/weapon-panel.hbs'), 'utf8');

describe('attack target selection (#250)', () => {
    it('the dialog exposes the current target to the template', () => {
        expect(dialog).toContain('targetName:');
        expect(dialog).toContain('hasTarget:');
    });

    it('the selectTarget action reads game.user.targets and sets the target actor', () => {
        expect(dialog).toContain('game.user.targets');
        expect(dialog).toContain('rd.targetActor = targetToken.actor');
    });

    it('the weapon panel shows a target indicator with a Select Target button', () => {
        // Indicator: target name when present, a "pick a target" hint otherwise.
        expect(panel).toContain('{{#if hasTarget}}');
        expect(panel).toContain('{{targetName}}');
        expect(panel).toContain('{{localize "WH40K.Roll.NoTargetSelected"}}');
        // The Select Target affordance is wired to the selectTarget action.
        expect(panel).toContain('data-action="selectTarget"');
        expect(panel).toContain('{{localize "WH40K.Roll.SelectTarget"}}');
    });
});
