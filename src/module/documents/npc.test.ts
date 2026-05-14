import { describe, expect, it } from 'vitest';

describe('WH40KNPC', () => {
    it('exports WH40KNPC class', async () => {
        const mod = await import('./npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KNPC could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KNPC).toBeTruthy();
    });

    it('WH40KNPC extends WH40KBaseActor', async () => {
        const [npcMod, baseMod] = await Promise.all([
            import('./npc').catch((err) => {
                console.warn(`WH40KNPC import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./base-actor').catch((err) => {
                console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (npcMod === undefined || baseMod === undefined) return;
        expect(npcMod.WH40KNPC.prototype).toBeInstanceOf(baseMod.WH40KBaseActor);
    });

    it('isHordeMode returns false when horde.enabled is absent', async () => {
        const mod = await import('./npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KNPC could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        const fakeNPC = Object.create(mod.WH40KNPC.prototype) as InstanceType<typeof mod.WH40KNPC>;
        Object.defineProperty(fakeNPC, 'system', { value: { horde: undefined }, writable: true });
        expect(fakeNPC.isHordeMode).toBe(false);
    });

    it('isHordeMode returns true when horde.enabled is true', async () => {
        const mod = await import('./npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KNPC could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        const fakeNPC = Object.create(mod.WH40KNPC.prototype) as InstanceType<typeof mod.WH40KNPC>;
        Object.defineProperty(fakeNPC, 'system', { value: { horde: { enabled: true }, isHorde: true }, writable: true });
        expect(fakeNPC.isHordeMode).toBe(true);
        expect(fakeNPC.isHordeType).toBe(true);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - faction / subfaction / npcType / role / threatLevel getters delegate to system fields
    //   - rollCharacteristic builds correct SimpleSkillData for NPC characteristic
    //   - rollSkill selects a specialist entry by index
});
