/**
 * Shared story support for the ship sheets' Hull Types field (#657): the
 * choices the sheets hand it, and the play assertions both sheets' stories run.
 */
import { expect } from 'storybook/test';
import enLang from '../src/lang/en.json';
import { WH40K } from '../src/module/config.ts';

/** A langpack group: nested groups and strings. */
interface LangNode {
    readonly [key: string]: LangNode | string | undefined;
}

const LANG: LangNode = enLang;

/** A langpack key's English text, or the key when the langpack lacks it. */
function english(key: string): string {
    let node: LangNode | string | undefined = LANG;
    for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
    return typeof node === 'string' ? node : key;
}

/** The hull-type choices `shipHullTypeChoices()` builds: the "All" sentinel, then every WH40K.hullTypes id. */
export function storyHullTypeChoices(): Record<string, string> {
    return {
        all: english('WH40K.HullType.All'),
        ...Object.fromEntries(Object.entries(WH40K.hullTypes).map(([id, { label }]) => [id, english(label)])),
    };
}

/** The field is a multi-checkbox named system.hullType, offering every choice, with `checked` selected. */
export async function expectHullTypeCheckboxes(root: HTMLElement, checked: readonly string[]): Promise<void> {
    const field = root.querySelector('[data-field="hull-types"]');
    const group = field?.querySelector('multi-checkbox');
    await expect(field?.querySelector('select')).toBeFalsy();
    await expect(group?.getAttribute('name')).toBe('system.hullType');
    const options = Array.from(group?.querySelectorAll('option') ?? []);
    await expect(options.map((option) => option.value)).toEqual(Object.keys(storyHullTypeChoices()));
    await expect(options.filter((option) => option.selected).map((option) => option.value)).toEqual([...checked]);
}
