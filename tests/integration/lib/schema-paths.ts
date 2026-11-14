/**
 * Layout-path helpers shared by the schema-sheet Tier A suites (#731–#736).
 */
import { schemaNodeAt, type SchemaNode } from '../../../src/module/applications/item/schema-sheet-layout';
import { readRepoFile } from '../../lib/repo-file';

/**
 * The node a layout path names: through `[]` array elements, and for a map path
 * (`map{keySource}`) the map field itself.
 */
export function nodeAtLayoutPath(schema: SchemaNode, path: string): SchemaNode | undefined {
    const brace = path.indexOf('{');
    if (brace > 0) return schemaNodeAt(schema, path.slice(0, brace));
    const marker = path.indexOf('[]');
    if (marker < 0) return schemaNodeAt(schema, path);
    const element = schemaNodeAt(schema, path.slice(0, marker))?.element;
    const sub = path.slice(marker + 3);
    return sub === '' || element === undefined ? element : schemaNodeAt(element, sub);
}

/** Whether one of a sheet's system templates renders the shared schema sections. */
export function rendersSchemaSections(parts: Readonly<Record<string, { template: string }>>): boolean {
    return Object.values(parts)
        .map((part) => part.template)
        .filter((path) => path.startsWith('systems/wh40k-rpg/'))
        .map((path) => readRepoFile(path.replace('systems/wh40k-rpg/', 'src/')))
        .some((source) => source.includes('templates/item/partial/schema-sections.hbs') || source.includes('templates/item/item-schema-sheet.hbs'));
}
