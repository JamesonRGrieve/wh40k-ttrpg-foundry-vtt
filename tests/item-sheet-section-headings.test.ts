/**
 * Guard (#695): item-sheet sections are titled by the shared panel partials, never by
 * a bare `<h2>`/`<h3>`. A bare heading takes Foundry's large default heading style —
 * the gear Overview tab showed Classification, Physical Properties, Storage and
 * Economic that way, the defect #686 fixed on Description tabs. Section titles come
 * from `item/partial/` (item-detail-section.hbs and friends), so this scans every
 * other item template and fails on any `<h2`/`<h3` outside a Handlebars comment.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const ITEM_TEMPLATES = 'src/templates/item';
/** The shared partials that own section headings. */
const SHARED_PARTIALS = 'partial/';

const HBS_COMMENT = /\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}/gu;
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
const SECTION_HEADING = /<h[23][\s>]/giu;

/** `line:snippet` for each bare section heading in a template's source, comments excluded. */
function bareSectionHeadings(source: string): string[] {
    // Blank comments out character-for-character so line numbers survive.
    const blank = (match: string): string => match.replace(/[^\n]/gu, ' ');
    const code = source.replace(HBS_COMMENT, blank).replace(HTML_COMMENT, blank);
    const hits: string[] = [];
    code.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(SECTION_HEADING)) {
            hits.push(`${String(index + 1)}:${line.slice(match.index).trim().slice(0, 40)}`);
        }
    });
    return hits;
}

/** Item templates outside the shared partials, relative to the item template root. */
function itemSheetTemplates(): string[] {
    return readdirSync(join(ROOT, ITEM_TEMPLATES), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.hbs') && !name.startsWith(SHARED_PARTIALS))
        .sort();
}

describe('item sheets title sections with the shared panel (#695)', () => {
    it('the detector flags a bare heading and ignores one inside a comment', () => {
        expect(bareSectionHeadings('<div>\n  <h3 class="tw-text-sm">Storage</h3>\n</div>')).toEqual(['2:<h3 class="tw-text-sm">Storage</h3>']);
        expect(bareSectionHeadings('<H2>Economic</H2>')).toHaveLength(1);
        expect(bareSectionHeadings('{{!-- an old <h3> header --}}\n<!-- <h2>x</h2> -->\n{{! <h3> }}')).toEqual([]);
        expect(bareSectionHeadings('<h4>sub-heading</h4><header>bar</header>')).toEqual([]);
    });

    it('scans the item sheet templates', () => {
        const templates = itemSheetTemplates();
        expect(templates).toContain('item-gear-sheet.hbs');
        expect(templates.length).toBeGreaterThan(20);
    });

    it('no item sheet template outside item/partial/ has a bare <h2> or <h3>', () => {
        const offenders = itemSheetTemplates().flatMap((name) =>
            bareSectionHeadings(readFileSync(join(ROOT, ITEM_TEMPLATES, name), 'utf8')).map((hit) => `${name}:${hit}`),
        );
        expect(offenders).toEqual([]);
    });
});
