/**
 * Regression guard (#596): no sheet class may declare, as a plain class FIELD, a
 * property the per-line variant factory sets on the PROTOTYPE.
 *
 * `makeSystemVariant()` (applications/actor/game-system-sheets.ts) assigns each
 * per-line sheet's `_gameSystemId` (and `_getSkillTrainingConfig`) on the class
 * prototype. CharacterSheet declared `private readonly _gameSystemId?: GameSystemId;`
 * — under `useDefineForClassFields` (target ESNext) that defines an own `undefined`
 * property on every instance, shadowing the prototype value, so every sheet-side read
 * of the line was undefined. A `declare` field emits nothing and is the correct form.
 *
 * More generally, an optional field with no initializer and no `declare` is always
 * this bug's shape in a sheet class (it can only ever be an own `undefined`), so the
 * guard forbids it across src/module/applications.
 *
 * Source idiom: the sheet classes cannot load under happy-dom, so the TypeScript AST
 * of each file is read instead.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APPLICATIONS = resolve(__dirname, '../src/module/applications');
const FACTORY = resolve(APPLICATIONS, 'actor/game-system-sheets.ts');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.includes('.test.') && !path.includes('.stories.') ? [path] : [];
    });
}

/** Every class property declaration with no initializer and no `declare` / `static` / `abstract` modifier. */
function uninitialisedFields(file: string): Array<{ name: string; optional: boolean; where: string }> {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const found: Array<{ name: string; optional: boolean; where: string }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
            for (const member of node.members) {
                if (!ts.isPropertyDeclaration(member) || member.initializer !== undefined) continue;
                const modifiers = (ts.getModifiers(member) ?? []).map((m) => m.kind);
                if ([ts.SyntaxKind.DeclareKeyword, ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.AbstractKeyword].some((k) => modifiers.includes(k))) continue;
                const line = source.getLineAndCharacterOfPosition(member.getStart()).line + 1;
                found.push({
                    name: member.name.getText(source),
                    optional: member.questionToken !== undefined,
                    where: `${relative(APPLICATIONS, file)}:${line}`,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}

/** The property names the variant factory assigns on a sheet prototype (`proto.<name> = …`). */
function prototypeAssignedNames(): string[] {
    return Array.from(readFileSync(FACTORY, 'utf8').matchAll(/\bproto\.(\w+)\s*=/g), (m) => m.at(1) ?? '');
}

const fields = sourceFiles(APPLICATIONS).flatMap(uninitialisedFields);

describe('sheet fields never shadow prototype values (#596)', () => {
    it('reads the prototype-assigned names from the factory', () => {
        expect(prototypeAssignedNames()).toEqual(expect.arrayContaining(['_gameSystemId', '_getSkillTrainingConfig']));
    });

    it('declares no prototype-assigned name as a plain class field', () => {
        const names = new Set(prototypeAssignedNames());
        expect(fields.filter((field) => names.has(field.name)).map((field) => field.where)).toEqual([]);
    });

    it('declares no optional field without an initializer (always an own `undefined`)', () => {
        expect(fields.filter((field) => field.optional).map((field) => `${field.where} ${field.name}`)).toEqual([]);
    });
});
