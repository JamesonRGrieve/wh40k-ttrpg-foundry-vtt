/**
 * @file Skill test-variant index (#440).
 *
 * Test variants (Awareness → Visual / Auditory / Olfactory) are authored on the
 * skill compendium documents (`system.variants`, see `data/item/skill.ts`). The
 * roll dialog used to read them off an *owned skill Item* on the actor — but a
 * character's skills live in `system.skills`, a SchemaField generated from
 * `SKILL_DEFINITIONS`, not as embedded Items. Unless an origin/background grant
 * happened to place an Awareness Item on the actor, the lookup found nothing and
 * the sense-channel selector never rendered even with the toggle on and the
 * content correctly authored.
 *
 * So variants are indexed from the packs at `ready`, exactly like the
 * weapon-quality payload index, and looked up by the actor's skill key.
 *
 * Keys are normalised to lowercase alphanumerics so every spelling of the same
 * skill collides: the actor's camelCase key (`sleightOfHand`), the pack doc's
 * display name (`Sleight of Hand`), and the kebab identifier Foundry derives in
 * `Item#_preCreate` (`sleight-of-hand`) all reduce to `sleightofhand`. The pack
 * docs carry no `identifier` of their own, so the display name is the real key.
 */

import type { SkillVariant } from './skill-variants.ts';

/** Pack-name suffix shared by every system's skills pack (`dh2-core-items-skills`, `rt-…`, …). */
const SKILL_PACK_SUFFIX = '-core-items-skills';

/** Minimal shape of a skill pack document we read. */
interface SkillPackDoc {
    name?: string | undefined;
    system?: { identifier?: string | undefined; variants?: SkillVariant[] | undefined } | undefined;
}

/** Minimal shape of the Foundry pack collection this module walks. */
interface SkillPackLike {
    metadata?: { name?: string | undefined } | undefined;
    getDocuments?: (() => Promise<SkillPackDoc[]>) | undefined;
}
interface PackGameLike {
    packs?: { filter?: (predicate: (pack: SkillPackLike) => boolean) => SkillPackLike[] } | undefined;
}

let variantsBySystem: Map<string, Map<string, SkillVariant[]>> | null = null;
let variantsFlat: Map<string, SkillVariant[]> | null = null;

/**
 * Reduce any spelling of a skill's name/key to a single comparison key:
 * lowercase, alphanumerics only. `Sleight of Hand` / `sleightOfHand` /
 * `sleight-of-hand` → `sleightofhand`.
 */
export function normalizeSkillKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `dh2-core-items-skills` → `dh2`. */
function systemIdFromPackName(name: string): string {
    return name.slice(0, -SKILL_PACK_SUFFIX.length);
}

/**
 * Build the per-system variant index from every `*-core-items-skills` compendium.
 * Call once on `ready`; idempotent (rebuilds the cache).
 *
 * Only skills that actually declare variants are indexed — the vast majority
 * declare none, and an empty array is indistinguishable from "not found" to
 * callers, so storing them would just grow the map.
 */
export async function buildSkillVariantIndex(): Promise<void> {
    const bySystem = new Map<string, Map<string, SkillVariant[]>>();
    const flat = new Map<string, SkillVariant[]>();
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const packs = packGame?.packs?.filter?.((pack) => pack.metadata?.name?.endsWith(SKILL_PACK_SUFFIX) === true) ?? [];

    const sources: Array<{ systemId: string; getDocuments: () => Promise<SkillPackDoc[]> }> = [];
    for (const pack of packs) {
        const name = pack.metadata?.name;
        if (name === undefined || pack.getDocuments === undefined) continue;
        // Bind to the owning pack — `getDocuments` reads `this.documentClass`
        // internally, so a detached reference would run with the wrong `this`.
        sources.push({ systemId: systemIdFromPackName(name), getDocuments: pack.getDocuments.bind(pack) });
    }
    const perPack = await Promise.all(sources.map(async (source) => ({ systemId: source.systemId, packDocs: await source.getDocuments() })));

    for (const { systemId, packDocs } of perPack) {
        for (const doc of packDocs) {
            const variants = doc.system?.variants;
            if (!Array.isArray(variants) || variants.length === 0) continue;
            // Index under both the display name and any authored identifier; both
            // normalise to the same key today, but an authored identifier that
            // diverges from the name should still resolve.
            const keys = [doc.name, doc.system?.identifier].filter((k): k is string => typeof k === 'string' && k.trim() !== '').map(normalizeSkillKey);
            let systemMap = bySystem.get(systemId);
            if (systemMap === undefined) {
                systemMap = new Map<string, SkillVariant[]>();
                bySystem.set(systemId, systemMap);
            }
            for (const key of keys) {
                systemMap.set(key, variants);
                if (!flat.has(key)) flat.set(key, variants);
            }
        }
    }

    variantsBySystem = bySystem;
    variantsFlat = flat;
}

/**
 * Look up a skill's declared test variants by the actor's skill key
 * (case/separator-insensitive), optionally scoped to a game system. Falls back to
 * the cross-system entry when no system is given or that system authors none.
 * Returns `[]` when the skill declares no variants or the index is not built.
 */
export function getSkillVariantsForKey(skillKey: string, systemId?: string): SkillVariant[] {
    const key = normalizeSkillKey(skillKey);
    if (key === '') return [];
    if (systemId !== undefined) {
        const scoped = variantsBySystem?.get(systemId)?.get(key);
        if (scoped !== undefined) return scoped;
    }
    return variantsFlat?.get(key) ?? [];
}

/** Seed the index directly (unit tests / stories — no Foundry pack available there). */
export function setSkillVariantsForTesting(entries: Record<string, SkillVariant[]>, systemId?: string): void {
    const flat = new Map(Object.entries(entries).map(([name, variants]) => [normalizeSkillKey(name), variants]));
    variantsFlat = flat;
    variantsBySystem = systemId === undefined ? null : new Map([[systemId, flat]]);
}
