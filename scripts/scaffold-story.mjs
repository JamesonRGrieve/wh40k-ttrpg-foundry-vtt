#!/usr/bin/env node
/**
 * Generate a `*.stories.ts` skeleton for a sheet/dialog/prompt.
 *
 *   node scripts/scaffold-story.mjs src/module/applications/dialogs/confirmation-dialog.ts
 *
 * Writes alongside the source:
 *   src/module/applications/dialogs/confirmation-dialog.stories.ts
 *
 * The skeleton imports the renderSheet helper, mounts the component with a
 * default mock, and includes a play stub. Agents fill in mock specifics and
 * play assertions.
 *
 * Refuses to overwrite an existing file.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, basename, relative, dirname } from 'node:path';

const target = process.argv[2];
if (!target) {
    console.error('Usage: scaffold-story.mjs <path-to-sheet-or-dialog.ts>');
    process.exit(2);
}

const abs = resolve(process.cwd(), target);
if (!existsSync(abs)) {
    console.error(`[scaffold-story] source not found: ${abs}`);
    process.exit(1);
}
if (!abs.endsWith('.ts') || abs.endsWith('.test.ts') || abs.endsWith('.stories.ts')) {
    console.error('[scaffold-story] target must be a non-test, non-story .ts file');
    process.exit(2);
}

const out = abs.replace(/\.ts$/, '.stories.ts');
if (existsSync(out)) {
    console.error(`[scaffold-story] already exists: ${out}`);
    process.exit(1);
}

const base = basename(abs, '.ts'); // e.g. confirmation-dialog
const className = base
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(''); // e.g. ConfirmationDialog
const title = base
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' '); // e.g. Confirmation Dialog
const isDialog = /-(dialog|prompt)$/.test(base);
const kind = isDialog ? 'dialog' : 'sheet';

// Determine the storybook section path from the file location relative to
// src/module/applications/. Stories under `applications/dialogs/` go under
// "Dialogs", `applications/actor/` under "Actor", etc.
const fromApps = relative(resolve(process.cwd(), 'src/module/applications'), abs);
const sectionParts = dirname(fromApps).split('/').filter((p) => p && p !== '.');
const storySection = sectionParts.length > 0
    ? sectionParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('/')
    : 'Misc';

// Stories render Handlebars templates with mock context — they do not
// instantiate the sheet/dialog class itself (Foundry's ApplicationV2 lifecycle
// expects a populated `game` global that Storybook does not provide). Tell the
// scaffold which .hbs template the ${kind} renders by replacing the
// __TEMPLATE_IMPORT__ marker below.
const tpl = `import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderSheet } from '../../../../stories/test-helpers';
// TODO: replace this import with the actual .hbs template ${className} renders.
import templateSrc from '../../../../src/templates/__TEMPLATE_IMPORT__.hbs?raw';

interface Args {
    /** Mock data passed to the template. Override per story to vary the rendered state. */
    mockContext?: Record<string, unknown>;
}

const meta = {
    title: '${storySection}/${className}',
    render: (args) => renderSheet(templateSrc, args.mockContext ?? {}),
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    args: {
        mockContext: {
            // TODO: fill in realistic context for ${className}.
        },
    },
};

// TODO: add an interactive story that exercises the primary user flow.
// Pattern:
//   import { clickAction, submitForm } from '../../../../stories/test-helpers';
//   import { expect, within } from 'storybook/test';
//
//   export const SubmitFlow: Story = {
//       args: { mockContext: { ... } },
//       play: async ({ canvasElement }) => {
//           clickAction(canvasElement, 'submit');
//           expect(within(canvasElement).queryByText('…')).not.toBeNull();
//       },
//   };
`;

writeFileSync(out, tpl, 'utf8');
console.log(`[scaffold-story] wrote ${out}`);
