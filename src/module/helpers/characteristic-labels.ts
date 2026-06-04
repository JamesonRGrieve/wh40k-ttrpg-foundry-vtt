/**
 * @file Canonical characteristic / combat / resource label resolution (#286).
 *
 * The display labels and abbreviations for characteristics live in
 * `CONFIG.wh40k.characteristics` (langpack-backed), and the combat-bonus /
 * resource-pool labels in `CONFIG.wh40k.combatBonuses` / `CONFIG.wh40k.resources`.
 * These helpers are the one place that resolves a key to its localized label, so
 * talent sheets, talent editors, the threat calculator, NPC-template sheets, and
 * homeworld dialogs no longer each carry their own inline English map.
 *
 * Fallbacks reproduce the historical inline-map behaviour for unknown keys so the
 * swap is behaviour-preserving.
 */

/** Capitalize the first letter (historical fallback for unknown combat/resource keys). */
function capitalize(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Full localized characteristic label (e.g. `weaponSkill` → "Weapon Skill"). */
export function characteristicLabel(key: string): string {
    const config = CONFIG.wh40k.characteristics[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types this `| undefined`, tsconfig.test.json (the ESLint parser project) does not
    return config !== undefined ? game.i18n.localize(config.label) : key;
}

/** Characteristic abbreviation (e.g. `weaponSkill` → "WS"). */
export function characteristicAbbrev(key: string): string {
    const config = CONFIG.wh40k.characteristics[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch (see characteristicLabel)
    return config !== undefined ? config.abbreviation : key.substring(0, 3).toUpperCase();
}

/** Localized combat-bonus label (e.g. `attack` → "Attack Bonus"). */
export function combatLabel(key: string): string {
    const config = CONFIG.wh40k.combatBonuses[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch (see characteristicLabel)
    return config !== undefined ? game.i18n.localize(config.label) : capitalize(key);
}

/** Localized derived-resource label (e.g. `fate` → "Fate Points"). */
export function resourceLabel(key: string): string {
    const config = CONFIG.wh40k.resources[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch (see characteristicLabel)
    return config !== undefined ? game.i18n.localize(config.label) : capitalize(key);
}

/* -------------------------------------------- */
/*  Homeworld reference-card formatting (#286)  */
/* -------------------------------------------- */

/**
 * Format a characteristic-modifier list for a homeworld reference card — each key
 * resolved to its localized characteristic label, positives prefixed `+`, negatives
 * `−` (U+2212). Shared by the Within / Without homeworld info dialogs so they no
 * longer each carry their own (divergent) formatter. Lives here rather than in a
 * homeworld-only module so it stays reachable while those dialogs await UI wiring.
 */
export function formatCharacteristicMods(positive: readonly string[], negative: readonly string[]): string {
    const pos = positive.map((c) => `+${characteristicLabel(c)}`);
    const neg = negative.map((c) => `−${characteristicLabel(c)}`);
    return [...pos, ...neg].join(', ');
}

/** Format a starting-wounds expression `flat + <dice>d<faces>` (e.g. `"8 + 1d10"`). */
export function formatWounds(flat: number, dice: number, faces: number): string {
    return `${flat} + ${dice}d${faces}`;
}
