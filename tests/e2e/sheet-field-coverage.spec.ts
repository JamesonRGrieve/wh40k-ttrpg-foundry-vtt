import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Sheet field coverage (#731–#736): every stored field of every actor and item
 * type can be edited somewhere in the system.
 *
 * For each type the spec creates a document, renders its default sheet, opens
 * every tab, switches to edit mode and opens every tab again, collecting every
 * attribute value that names a `system.` path. It then walks the type's
 * DataModel schema. A stored field passes when:
 *   - an attribute on its sheet names it (or a parent / child of it), or
 *   - a template or a `src/module` file writes it as a `system.` path (an
 *     input elsewhere: a dialog, a builder step, a panel action), or
 *   - the allowlist below names it, with the reason it has no input.
 *
 * Anything else is a stored field nobody can edit, and fails the spec.
 */

/** Legacy un-prefixed types the system still registers for migration only. */
const LEGACY = ['character', 'npc', 'vehicle', 'starship', 'terracraft', 'aircraft', 'watercraft', 'voidcraft', 'rt-starship'];

/** Fields with no input by design, keyed by a type pattern. Each entry says why. */
const ALLOWED: ReadonlyArray<{ readonly types: RegExp; readonly fields: readonly string[]; readonly why: string }> = [
    { types: /-character$/, fields: ['cohesionLostThisTurn'], why: 'per-turn counter that applying Cohesion damage bumps' },
    { types: /-character$/, fields: ['regimentKit'], why: "the Only War regiment builder's chosen Standard Kit" },
    { types: /-character$/, fields: ['logisticsFront'], why: "the Logistics test dialog saves the squad's front (#496)" },
    { types: /-npc$/, fields: ['customStats.skills'], why: 'one input per trained skill; a fresh NPC has none' },
    { types: /^loot$/, fields: ['droppedAt'], why: 'stamped by the item-drop manager when the pile is made' },
    { types: /^originPath$/, fields: ['homebrew.throneGelt', 'homebrew.thrones'], why: 'Origin Path Builder state (#734)' },
    {
        types: /^npcTemplate$/,
        fields: ['baseCharacteristics.influence'],
        why: 'an NPC has no Influence; the template edits its nine characteristics only (#701)',
    },
];

interface FieldGap {
    readonly doc: string;
    readonly type: string;
    readonly sheet: string | null;
    readonly error: string | null;
    readonly missing: readonly string[];
}

interface SchemaFieldLike {
    readonly constructor: { readonly name: string };
    readonly fields?: Readonly<Record<string, SchemaFieldLike>>;
    readonly model?: { readonly schema?: SchemaFieldLike };
}

interface ProbeSheet {
    render: (options: { force: boolean }) => Promise<object>;
    close: () => Promise<object>;
    readonly rendered: boolean;
    readonly element: HTMLElement | null;
    readonly inEditMode?: boolean;
    changeTab?: (tab: string, group: string) => void;
}

interface ProbeDocument {
    readonly system: { readonly schema: SchemaFieldLike };
    readonly sheet: ProbeSheet | null;
    delete: () => Promise<object>;
}

interface ProbeGlobal {
    game: {
        system: { documentTypes: Record<string, Record<string, object>> };
        settings: { set: (scope: string, key: string, value: boolean) => Promise<object> };
    };
    Actor: { create: (data: { name: string; type: string }) => Promise<ProbeDocument | null> };
    Item: { create: (data: { name: string; type: string }) => Promise<ProbeDocument | null> };
}

/** Every `system.` path a template or a source module names. */
function namedPaths(): Set<string> {
    const root = resolve(__dirname, '../..');
    const names = new Set<string>();
    const walk = (dir: string, accept: (file: string) => boolean): void => {
        for (const entry of readdirSync(dir)) {
            const path = join(dir, entry);
            if (statSync(path).isDirectory()) walk(path, accept);
            else if (accept(entry))
                for (const match of readFileSync(path, 'utf8').matchAll(/system\.([A-Za-z0-9_.]+)/gu)) {
                    const name = match.at(1);
                    if (name !== undefined) names.add(name);
                }
        }
    };
    walk(join(root, 'src/templates'), (file) => file.endsWith('.hbs'));
    walk(join(root, 'src/module'), (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.stories.ts'));
    return names;
}

/** Whether a source names the field or one of its parents. */
function isNamed(path: string, names: ReadonlySet<string>): boolean {
    const parts = path.split('.');
    return parts.some((_part, index) => names.has(parts.slice(0, index + 1).join('.')));
}

function isAllowed(type: string, path: string): boolean {
    return ALLOWED.some((entry) => entry.types.test(type) && entry.fields.some((field) => path === field || path.startsWith(`${field}.`)));
}

test('every stored field of every document type can be edited (#731–#736)', async ({ page }) => {
    test.setTimeout(scaledMs(1_800_000));
    await joinOrSkip(page);
    const report = await page.evaluate(async (legacy: string[]): Promise<FieldGap[]> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's browser-side game, Actor and Item globals are runtime-only, no shipped types
        const g = globalThis as unknown as ProbeGlobal;
        const sleep = async (ms: number): Promise<void> =>
            new Promise((done) => {
                setTimeout(done, ms);
            });
        for (const key of ['freeform-characters', 'freeform-creation']) await g.game.settings.set('wh40k-rpg', key, true).catch(() => undefined);
        await g.game.settings.set('wh40k-rpg', 'prompt-incomplete-origin-path', false).catch(() => undefined);

        const leaves = (field: SchemaFieldLike, path: string, out: string[]): string[] => {
            const name = field.constructor.name;
            if (field.fields !== undefined && name !== 'TypeDataField') {
                for (const [key, child] of Object.entries(field.fields)) leaves(child, path === '' ? key : `${path}.${key}`, out);
            } else if (name === 'EmbeddedDataField' && field.model?.schema !== undefined) leaves(field.model.schema, path, out);
            else out.push(path);
            return out;
        };
        const attributes = (root: HTMLElement | null, into: Set<string>): void => {
            for (const el of Array.from(root?.querySelectorAll('*') ?? [])) {
                for (const attr of Array.from(el.attributes)) {
                    const value = attr.value.trim();
                    if (value.startsWith('system.')) into.add(value.slice('system.'.length));
                }
            }
        };
        const onSheet = (path: string, seen: ReadonlySet<string>): boolean =>
            [...seen].some((a) => a === path || a.startsWith(`${path}.`) || path.startsWith(`${a}.`));
        const visitTabs = async (sheet: ProbeSheet, seen: Set<string>): Promise<void> => {
            attributes(sheet.element, seen);
            const tabs = Array.from(sheet.element?.querySelectorAll<HTMLElement>('[data-tab][data-group], nav [data-tab]') ?? []);
            const opened = new Set<string>();
            for (const tab of tabs) {
                const key = `${tab.dataset['group'] ?? ''}:${tab.dataset['tab'] ?? ''}`;
                if (opened.has(key) || tab.dataset['tab'] === undefined) continue;
                opened.add(key);
                try {
                    sheet.changeTab?.(tab.dataset['tab'], tab.dataset['group'] ?? 'primary');
                } catch {
                    // An element carrying data-tab that is not a tab control.
                }
                await sleep(150);
                attributes(sheet.element, seen);
            }
        };

        const gaps: FieldGap[] = [];
        for (const doc of ['Actor', 'Item'] as const) {
            for (const type of Object.keys(g.game.system.documentTypes[doc]).filter((t) => !legacy.includes(t))) {
                const created = await g[doc].create({ name: `coverage-${type}`, type }).catch(() => null);
                if (created === null) {
                    gaps.push({ doc, type, sheet: null, error: 'create failed', missing: [] });
                    continue;
                }
                const seen = new Set<string>();
                let error: string | null = null;
                const sheet = created.sheet;
                try {
                    if (sheet === null) throw new Error('no sheet');
                    await sheet.render({ force: true });
                    const started = Date.now();
                    while (!sheet.rendered && Date.now() - started < 15_000) await sleep(100);
                    await sleep(300);
                    await visitTabs(sheet, seen);
                    const toggle = sheet.element?.querySelector<HTMLElement>('[data-action="toggleEditMode"]') ?? null;
                    if (toggle !== null && sheet.inEditMode !== true) {
                        toggle.click();
                        await sleep(800);
                        await visitTabs(sheet, seen);
                    }
                    await sheet.close();
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }
                const missing = leaves(created.system.schema, '', []).filter((path) => !onSheet(path, seen));
                gaps.push({ doc, type, sheet: sheet?.constructor.name ?? null, error, missing });
                await created.delete().catch(() => undefined);
            }
        }
        return gaps;
    }, LEGACY);

    const names = namedPaths();
    const uneditable = report
        .map((entry) => ({ ...entry, missing: entry.missing.filter((path) => !isNamed(path, names) && !isAllowed(entry.type, path)) }))
        .filter((entry) => entry.error !== null || entry.missing.length > 0)
        .map(
            (entry) =>
                `${entry.doc} ${entry.type} (${entry.sheet ?? 'no sheet'})${entry.error === null ? '' : ` error: ${entry.error}`}: ${entry.missing.join(', ')}`,
        );
    expect(report.length).toBeGreaterThan(70);
    expect(uneditable).toEqual([]);
});
