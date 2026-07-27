/**
 * Basic/Advanced skill classification, as a dependency leaf.
 *
 * The fact lives once, in the canonical `SKILL_DEFINITIONS` catalog (#273); this
 * module only exposes it in a form `applications/` may consume:
 *
 *  - It stays out of `data/` from the caller's perspective, so a sheet or dialog
 *    reading it does not breach the 3-layer rule
 *    (`sheets-must-not-import-data-models-directly`).
 *  - It imports **only** the catalog — deliberately not `SkillKeyHelper`, whose
 *    `types/global.d.ts` import is a graph hub that loops back into
 *    `applications/` and closes 9 new cycles (`no-circular`).
 *
 * Keep this module a leaf: adding an import here can reintroduce those cycles.
 */

import { skillAdvancedMap } from '../data/shared/skill-definitions.ts';

/** Skill key → Advanced flag, derived once from the canonical catalog. */
const ADVANCED_BY_KEY: Record<string, boolean> = skillAdvancedMap();

/**
 * Whether the catalog classifies a skill as Basic.
 *
 * Returns `undefined` for an unknown key so callers can distinguish "not in the
 * catalog" from "known to be Advanced" — the caller decides the default rather
 * than silently inheriting `false`, which is precisely the bug that made every
 * NPC skill read as Advanced (#476).
 *
 * @param skillKey - Canonical skill key (e.g. `'awareness'`).
 * @returns `true` if Basic, `false` if Advanced, `undefined` if unknown.
 */
export function isBasicSkill(skillKey: string): boolean | undefined {
    const advanced = ADVANCED_BY_KEY[skillKey];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types this index access as `boolean`, while tsconfig.json has it on and requires the undefined guard.
    return advanced === undefined ? undefined : !advanced;
}
