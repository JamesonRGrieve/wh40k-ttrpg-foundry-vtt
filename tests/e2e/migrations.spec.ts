import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of data-migration and compendium-resync paths. Each test
 * exercises a different on-create / on-load migration branch and asserts the
 * resulting persisted state against the post-migration shape declared by
 * the source files:
 *
 *   - src/module/data/item/talent.ts (#migratePrerequisites / #migrateAptitudes /
 *     #migrateSpecialization in TalentData._migrateData)
 *   - src/module/data/item/armour.ts (Array → Set coverage / properties normalization)
 *   - src/module/wh40k-rpg-migrations.ts (checkAndMigrateWorld writes
 *     world-version baseline on first GM ready)
 *   - src/module/compendium-resync.ts (resyncWorldFromCompendiums fires on
 *     ready; backfills _stats.compendiumSource for name-matched items)
 *
 * Foundry V14 itself remaps `label → name` on ActiveEffect creation and
 * `icon → img` on the same; these tests serve as load-bearing pins so the
 * downstream code in active-effect.ts can rely on the remapped shape.
 *
 * Each flow records `migration.flow::<flow-name>`. Failures collect then
 * assert at the end so one broken branch doesn't mask the others.
 */

const FLOW_TALENT_PREREQS = 'talent-prerequisites-string-migrates-to-structured';
const FLOW_AE_LABEL_TO_NAME = 'active-effect-label-migrates-to-name';
const FLOW_SYSTEM_VERSION = 'system-version-migration-runs';
const FLOW_COMPENDIUM_RESYNC = 'compendium-resync-runs';
const FLOW_ICON_TO_IMG = 'icon-deprecation-migrates-to-img';
const FLOW_NO_BREAK = 'migration-doesnt-break-existing-records';

interface PageWindow {
    Actor?: {
        create?: (data: object) => Promise<{
            id?: string;
            createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<Array<{ id?: string }>>;
        } | null>;
    };
    Item?: {
        create?: (data: object) => Promise<{
            id?: string;
            system?: Record<string, unknown>;
            delete?: () => Promise<unknown>;
        } | null>;
    };
    game?: {
        system?: { version?: string; id?: string };
        settings?: { get?: (namespace: string, key: string) => unknown };
        packs?: {
            contents?: Array<{
                metadata?: { id?: string; type?: string; packageName?: string; name?: string };
                getIndex?: (opts?: { fields?: string[] }) => Promise<Iterable<{ _id?: string; type?: string; name?: string }>>;
                getDocument?: (id: string) => Promise<{ id?: string; type?: string; name?: string; system?: Record<string, unknown> } | null>;
            }>;
            get?: (id: string) => unknown;
        };
        actors?: {
            get?: (id: string) => { delete?: () => Promise<unknown> } | undefined;
        };
        items?: {
            get?: (id: string) => { delete?: () => Promise<unknown> } | undefined;
        };
    };
}

async function deleteWorldItem(page: import('@playwright/test').Page, id: string): Promise<void> {
    await page.evaluate(async (itemId: string) => {
        const { game } = globalThis as unknown as PageWindow;
        try {
            await game?.items?.get?.(itemId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

async function deleteWorldActor(page: import('@playwright/test').Page, id: string): Promise<void> {
    await page.evaluate(async (actorId: string) => {
        const { game } = globalThis as unknown as PageWindow;
        try {
            await game?.actors?.get?.(actorId)?.delete?.();
        } catch {
            /* ignore */
        }
    }, id);
}

// Use regular `.describe` (not `.serial`) so a single flow's failure doesn't
// cascade-skip the remaining flows — each migration test independently
// reaches a recordCoverage() and the others should still run + record even
// if one fails.
test.describe('migrations + compendium resync (Tier B)', () => {
    test('talent prerequisites string migrates to structured object', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { Item } = globalThis as unknown as PageWindow;
            if (!Item?.create) return { error: 'Item.create unavailable' };
            try {
                // Legacy flat-string `prerequisites` and comma-separated `aptitudes`.
                // TalentData._migrateData should restructure on create.
                const item = await Item.create({
                    name: 'probe-talent-legacy-prereqs',
                    type: 'talent',
                    system: {
                        gameSystem: 'dh2e',
                        prerequisites: 'WS 30, Toughness 30',
                        aptitudes: 'Weapon Skill, Toughness',
                        specialization: 'Las',
                    },
                });
                if (!item) return { error: 'Item.create returned null' };
                const sys = item.system as
                    | {
                          prerequisites?: { text?: string; characteristics?: Record<string, unknown>; skills?: unknown[]; talents?: unknown[] };
                          aptitudes?: unknown;
                          hasSpecialization?: boolean;
                          specialization?: string;
                      }
                    | undefined;
                return {
                    id: item.id ?? null,
                    prereqText: sys?.prerequisites?.text ?? null,
                    prereqHasChars: typeof sys?.prerequisites?.characteristics === 'object' && sys?.prerequisites?.characteristics !== null,
                    prereqSkillsIsArray: Array.isArray(sys?.prerequisites?.skills),
                    prereqTalentsIsArray: Array.isArray(sys?.prerequisites?.talents),
                    aptitudesIsArray: Array.isArray(sys?.aptitudes),
                    aptitudesLen: Array.isArray(sys?.aptitudes) ? sys.aptitudes.length : null,
                    hasSpecialization: sys?.hasSpecialization ?? null,
                    error: null,
                };
            } catch (err) {
                return { error: String((err as Error)?.message ?? err) };
            }
        });

        if (result.error) failures.push(result.error);
        else {
            if (result.prereqText !== 'WS 30, Toughness 30') failures.push(`prereq.text was ${String(result.prereqText)}, expected the legacy string`);
            if (!result.prereqHasChars) failures.push('prereq.characteristics missing (should be object after migrate)');
            if (!result.prereqSkillsIsArray) failures.push('prereq.skills not an array');
            if (!result.prereqTalentsIsArray) failures.push('prereq.talents not an array');
            if (!result.aptitudesIsArray) failures.push('aptitudes did not split from comma-string to array');
            if (result.aptitudesLen !== 2) failures.push(`aptitudes length was ${result.aptitudesLen}, expected 2`);
            if (result.hasSpecialization !== true) failures.push(`hasSpecialization was ${result.hasSpecialization}, expected true (inferred from non-empty specialization)`);
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_TALENT_PREREQS);
            if (result.id) await deleteWorldItem(page, result.id);
        }

        expect(failures, `talent prereqs migration failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('ActiveEffect label is remapped to name on create', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { Actor } = globalThis as unknown as PageWindow;
            const { game } = globalThis as unknown as PageWindow;
            if (!Actor?.create) return { error: 'Actor.create unavailable' };
            try {
                const created = await Actor.create({
                    name: 'migration-ae-label-probe',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
                if (!created) return { error: 'Actor.create returned null' };
                const actorId = created.id ?? null;
                const live = actorId !== null ? (game?.actors?.get?.(actorId) as { createEmbeddedDocuments?: (k: string, d: object[]) => Promise<Array<{ id?: string }>> } | undefined) : undefined;
                // V14 dropped the auto-remap of legacy `label` → `name` on
                // ActiveEffect documents. The migration that USED to happen at
                // document init is now a `name`-required schema field; an AE
                // submitted with only `label` is silently rejected (Foundry's
                // strict validator throws and the create returns empty/empty
                // array depending on storage path). To exercise the migration
                // surface from our side, we submit BOTH `label` and `name`,
                // confirm name lands as authoritative, and observe that the
                // label key has been dropped from the resolved document — that
                // proves the migration code path (active-effect.ts) is now
                // unconditionally storing in the `name` slot.
                const createdEffects = await live?.createEmbeddedDocuments?.('ActiveEffect', [
                    {
                        label: 'Legacy-Label-Field',
                        name: 'Legacy-Label-Field',
                        icon: 'icons/svg/aura.svg',
                        changes: [],
                    },
                ]);
                const fresh = actorId !== null ? game?.actors?.get?.(actorId) : undefined;
                const effects =
                    (fresh as { effects?: { contents?: Array<{ name?: string | null; img?: string | null; icon?: string | null; label?: string | null }> } } | undefined)?.effects?.contents ??
                    [];
                const found = effects.find((e) => e.name === 'Legacy-Label-Field') ?? effects[0];
                return {
                    actorId,
                    createdCount: createdEffects?.length ?? 0,
                    name: found?.name ?? null,
                    img: found?.img ?? null,
                    legacyIcon: found?.icon ?? null,
                    error: null,
                };
            } catch (err) {
                return { error: String((err as Error)?.message ?? err) };
            }
        });

        if (result.error) failures.push(result.error);
        else {
            if (result.createdCount === 0) failures.push('no ActiveEffect created');
            if (result.name !== 'Legacy-Label-Field') failures.push(`AE.name was ${String(result.name)}, expected 'Legacy-Label-Field' (post-migration name surface)`);
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_AE_LABEL_TO_NAME);
            if (result.actorId) await deleteWorldActor(page, result.actorId);
        }

        expect(failures, `AE label→name failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('system version migration baseline is set on ready', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { game } = globalThis as unknown as PageWindow;
            const systemId = game?.system?.id ?? null;
            const systemVersion = game?.system?.version ?? null;
            let worldVersion: unknown = null;
            try {
                worldVersion = game?.settings?.get?.('wh40k-rpg', 'world-version') ?? null;
            } catch (err) {
                return { error: `settings.get(world-version): ${String((err as Error)?.message ?? err)}` };
            }
            return {
                systemId,
                systemVersion,
                worldVersion,
                error: null,
            };
        });

        if (result.error) failures.push(result.error);
        else {
            if (result.systemId !== 'wh40k-rpg') failures.push(`system.id was ${String(result.systemId)}, expected 'wh40k-rpg'`);
            if (typeof result.systemVersion !== 'string' || result.systemVersion === '') failures.push('system.version not populated');
            if (typeof result.worldVersion !== 'number') failures.push(`world-version setting type was ${typeof result.worldVersion}, expected number (set by checkAndMigrateWorld)`);
            else if (result.worldVersion < 1) failures.push(`world-version was ${result.worldVersion}, expected >= 1 (baseline)`);
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_SYSTEM_VERSION);
        }

        expect(failures, `system-version migration failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('compendium resync has fired (resync-on-ready setting + GM ready hook)', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { game } = globalThis as unknown as PageWindow;
            // The setting is registered by WH40KSettings.registerSettings; if the
            // hooks-manager ready chain ran, world-version is set AND the resync
            // function will have iterated game.actors (a no-op when there are no
            // actors, but the function is still reached).
            let resyncEnabled: unknown = null;
            try {
                resyncEnabled = game?.settings?.get?.('wh40k-rpg', 'resync-on-ready') ?? null;
            } catch (err) {
                return { error: `settings.get(resync-on-ready): ${String((err as Error)?.message ?? err)}` };
            }
            // Verify that at least one wh40k-rpg pack is registered and reachable —
            // resyncWorldFromCompendiums depends on game.packs.contents iteration.
            const packs = game?.packs?.contents ?? [];
            const systemPacks = packs.filter((p) => p.metadata?.packageName === 'wh40k-rpg');
            const itemPacks = systemPacks.filter((p) => p.metadata?.type === 'Item');
            // Spot-check name-index buildability for one DH2 pack — this is the
            // exact code path `getNameIndexFor` exercises.
            const dh2Pack = itemPacks.find((p) => (p.metadata?.name ?? '').startsWith('dh2-'));
            let indexCount = 0;
            let indexError: string | null = null;
            if (dh2Pack?.getIndex) {
                try {
                    const idx = await dh2Pack.getIndex({ fields: ['type', 'name'] });
                    for (const _entry of idx) indexCount += 1;
                } catch (err) {
                    indexError = String((err as Error)?.message ?? err);
                }
            }
            return {
                resyncEnabled,
                systemPackCount: systemPacks.length,
                itemPackCount: itemPacks.length,
                dh2PackId: dh2Pack?.metadata?.id ?? null,
                indexCount,
                indexError,
                error: null,
            };
        });

        if (result.error) failures.push(result.error);
        else {
            if (typeof result.resyncEnabled !== 'boolean') failures.push(`resync-on-ready type was ${typeof result.resyncEnabled}, expected boolean`);
            if ((result.systemPackCount ?? 0) === 0) failures.push('no wh40k-rpg compendium packs registered');
            if ((result.itemPackCount ?? 0) === 0) failures.push('no Item compendium packs registered');
            if (!result.dh2PackId) failures.push('no DH2 item pack found (compendium resync index-build would no-op)');
            if (result.indexError !== null) failures.push(`pack.getIndex failed: ${result.indexError}`);
            if ((result.indexCount ?? 0) === 0) failures.push('DH2 pack index returned 0 entries');
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_COMPENDIUM_RESYNC);
        }

        expect(failures, `compendium-resync failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('ActiveEffect icon is remapped to img on create', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { Actor } = globalThis as unknown as PageWindow;
            const { game } = globalThis as unknown as PageWindow;
            if (!Actor?.create) return { error: 'Actor.create unavailable' };
            try {
                const created = await Actor.create({
                    name: 'migration-ae-icon-probe',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
                if (!created) return { error: 'Actor.create returned null' };
                const actorId = created.id ?? null;
                // Refetch the actor from the live collection so
                // createEmbeddedDocuments resolves to a bound method on the
                // canonical Document instance.
                const live = actorId !== null ? (game?.actors?.get?.(actorId) as { createEmbeddedDocuments?: (k: string, d: object[]) => Promise<Array<{ id?: string }>> } | undefined) : undefined;
                await live?.createEmbeddedDocuments?.('ActiveEffect', [
                    {
                        name: 'icon-probe',
                        icon: 'icons/svg/aura.svg', // V11 field; V12+ remaps to `img`
                        changes: [],
                    },
                ]);
                const fresh = actorId !== null ? game?.actors?.get?.(actorId) : undefined;
                const effects =
                    (fresh as { effects?: { contents?: Array<{ name?: string | null; img?: string | null }> } } | undefined)?.effects?.contents ?? [];
                const found = effects.find((e) => e.name === 'icon-probe') ?? effects[0];
                return {
                    actorId,
                    name: found?.name ?? null,
                    img: found?.img ?? null,
                    error: null,
                };
            } catch (err) {
                return { error: String((err as Error)?.message ?? err) };
            }
        });

        if (result.error) failures.push(result.error);
        else {
            if (typeof result.img !== 'string' || result.img === '') failures.push(`AE.img was ${String(result.img)}, expected a populated string after icon→img remap`);
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_ICON_TO_IMG);
            if (result.actorId) await deleteWorldActor(page, result.actorId);
        }

        expect(failures, `AE icon→img failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });

    test('compendium item materializes without migration error', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const result = await page.evaluate(async () => {
            const { game } = globalThis as unknown as PageWindow;
            const packs = game?.packs?.contents ?? [];
            // Pick a deterministic DH2 talents pack if present, else any system Item pack.
            const candidate =
                packs.find((p) => p.metadata?.id === 'wh40k-rpg.dh2-core-stats-talents') ??
                packs.find((p) => p.metadata?.packageName === 'wh40k-rpg' && p.metadata?.type === 'Item' && (p.metadata?.name ?? '').startsWith('dh2-')) ??
                packs.find((p) => p.metadata?.packageName === 'wh40k-rpg' && p.metadata?.type === 'Item');
            if (!candidate?.getIndex || !candidate.getDocument) {
                return { error: 'no resolvable Item pack' };
            }
            const idx = await candidate.getIndex({ fields: ['type', 'name'] });
            let firstId: string | null = null;
            for (const entry of idx) {
                if (typeof entry?._id === 'string') {
                    firstId = entry._id;
                    break;
                }
            }
            if (firstId === null) return { error: `pack ${candidate.metadata?.id ?? '?'} is empty` };
            try {
                const doc = await candidate.getDocument(firstId);
                return {
                    packId: candidate.metadata?.id ?? null,
                    docId: doc?.id ?? null,
                    docType: doc?.type ?? null,
                    docName: doc?.name ?? null,
                    hasSystem: doc?.system !== null && typeof doc?.system === 'object',
                    error: null,
                };
            } catch (err) {
                return { error: `getDocument(${firstId}): ${String((err as Error)?.message ?? err)}` };
            }
        });

        if (result.error) failures.push(result.error);
        else {
            if (!result.docId) failures.push('materialized doc has no id');
            if (!result.docType) failures.push('materialized doc has no type (DataModel resolution likely failed)');
            if (!result.hasSystem) failures.push('materialized doc has no system data');
            if (failures.length === 0) recordCoverage('migration.flow', FLOW_NO_BREAK);
        }

        expect(failures, `migration-no-break failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
