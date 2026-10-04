import { describe, expect, it } from 'vitest';

/**
 * Source-level regressions for the impure writer hub. The full
 * `createConditionEffect` / tick flow needs `ui.notifications` and a live actor
 * graph that aren't available outside Foundry; the pure halves are tested in
 * `condition-registry.test.ts` / `condition-tick.test.ts`.
 */
describe('active-effects condition writers', () => {
    it('holds no condition table: conditions come from the condition documents', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const registry = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/condition-registry.ts'), 'utf8');
        // The old hard-coded registry: a module-scope table keyed by condition name.
        expect(registry).not.toMatch(/const CONDITION_REGISTRY/);
        for (const name of ["'Burning'", "'Inspired'", "'Blessed'", "'Manacled'", "'Stunned'", "'Prone'"]) expect(registry).not.toContain(name);
    });

    it('ticks conditions through ONE data-driven processor, not per-condition handlers', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        expect(source).toContain('export async function processConditionTicks');
        for (const handler of ['handleBleeding', 'handleOnFire', 'handleBloodLoss']) expect(source).not.toContain(`function ${handler}`);
    });

    it('createEffect writes `img` and `statuses` (V14 has no `icon` field; a status needs `statuses`)', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        expect(source).toContain("img: effectData.img ?? 'icons/svg/aura.svg'");
        expect(source).toContain('statuses: effectData.statuses ?? []');
    });

    it('applyCriticalDamageConditions wires the armour decision trees + physical side effects', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        // `negates` gate short-circuits the whole row when the location is armoured.
        expect(source).toContain("gate === 'negates' && locationArmoured");
        // `worsensIfUnarmoured` gate withholds the harsher conditions when armoured.
        expect(source).toContain("gate === 'worsensIfUnarmoured' && locationArmoured");
        // The physical side-effect appliers.
        expect(source).toContain('record.riders.helmetTornOff');
        expect(source).toContain('record.riders.weaponDestroyed');
        expect(source).toContain('record.riders.dropsHeldItem');
        expect(source).toContain('record.riders.detonatesMunitions');
        // Per-location armour resolution + the finders.
        expect(source).toContain('function findEquippedArmourAt');
        expect(source).toContain('function findEquippedWeapon');
        expect(source).toContain('function detonateCarriedMunitions');
        // Destroyed weapon is marked broken (reversible), dropped weapon just unequipped.
        expect(source).toContain("'system.state.broken': true");
        expect(source).toContain("'system.state.equipped': false");
    });

    it('detonateCarriedMunitions expends the detonated munitions (zeroes carried quantity)', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        // The detonated munition is consumed — its carried quantity is zeroed.
        expect(source).toContain("'system.quantity': 0");
        expect(source).toContain('consumed');
    });
});
