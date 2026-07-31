/**
 * Per-scene Warp weakness (#137, beyond.md L4605).
 *
 * A GM marks a scene as Warp-weak when the veil is thin there. The riders it
 * carries — a bonus to Focus Power, a more severe Phenomena ladder, and extra
 * trigger conditions — are computed by `composePhenomenaModifier` in
 * `phenomena-modifier.ts`; this module owns only WHERE the flag lives and how it
 * is read, so no rule has to know the flag path.
 *
 * The flag is stored on the Scene document rather than in world settings because
 * the rule is explicitly per-scene: moving the party to a different location must
 * change it, and two scenes can differ.
 */

import { SYSTEM_ID } from '../constants.ts';

/** Scene flag key under the system's flag namespace. */
export const WARP_WEAKNESS_FLAG = 'warpWeakness';

/** Minimal Scene read-surface, structurally satisfied by a Foundry Scene document. */
export interface WarpWeaknessScene {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#getFlag is typed as returning unknown; the value is narrowed on the next line by an explicit `=== true` check
    getFlag: (scope: string, key: string) => unknown;
}

/**
 * Whether `scene` is marked Warp-weak. Anything other than an explicit `true`
 * reads as false, so a scene that has never been touched — or one whose flag was
 * written by hand as a string — does not silently enable the riders.
 */
export function isWarpWeak(scene: WarpWeaknessScene | null | undefined): boolean {
    if (scene === null || scene === undefined) return false;
    return scene.getFlag(SYSTEM_ID, WARP_WEAKNESS_FLAG) === true;
}

/** Name the Scene Config checkbox posts under, so the flag round-trips on submit. */
export const WARP_WEAKNESS_INPUT_NAME = `flags.${SYSTEM_ID}.${WARP_WEAKNESS_FLAG}`;

/**
 * Build the Scene Config form-group for the Warp-weakness toggle.
 *
 * Returned as a detached element rather than an HTML string so the caller inserts
 * a real node — the repo forbids interpolating into markup-parsing sinks, and the
 * label text comes from the langpack, which must never be concatenated into HTML.
 *
 * Foundry's SceneConfig submits any `flags.<scope>.<key>` input straight onto the
 * document, so no submit handler is needed; the checkbox name IS the wiring.
 */
export function buildWarpWeaknessField(doc: Document, labels: { label: string; hint: string }, checked: boolean): HTMLElement {
    const group = doc.createElement('div');
    group.className = 'form-group';

    const label = doc.createElement('label');
    label.textContent = labels.label;

    const fields = doc.createElement('div');
    fields.className = 'form-fields';

    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.name = WARP_WEAKNESS_INPUT_NAME;
    input.checked = checked;
    fields.appendChild(input);

    const hint = doc.createElement('p');
    hint.className = 'hint';
    hint.textContent = labels.hint;

    group.append(label, fields, hint);
    return group;
}
