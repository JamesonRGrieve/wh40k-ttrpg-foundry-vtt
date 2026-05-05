import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { initializeStoryHandlebars } from './template-support';
import { listIcons } from '../src/module/icons/icon.ts';

initializeStoryHandlebars();

// A small inline template that exercises the {{icon}} helper. We don't ship
// this as a runtime partial — it lives only in the story.
const sampleSrc = `
<div class="wh40k-rpg" data-wh40k-system="{{system}}" style="padding:1rem; background:#1a1a1a; color:#d8c690; font-family:sans-serif;">
    <h3 style="margin:0 0 0.5rem 0;">{{system}} — icon helper</h3>
    <div style="display:flex; gap:1rem; align-items:center; font-size:24px;">
        <span class="dh2e:tw-text-bronze rt:tw-text-amber-500 im:tw-text-emerald-400">
            {{iconSvg "fa:dice-d20" class="tw-w-8 tw-h-8" label="Roll d20"}}
        </span>
        <span class="dh2e:tw-text-gold rt:tw-text-amber-200 im:tw-text-emerald-200">
            {{iconSvg "fa:cog" class="tw-w-6 tw-h-6"}}
        </span>
        <span style="color:#9ad;">
            {{iconSvg "lucide:dice-5" size=32}}
        </span>
        <span style="color:#cea;">
            {{iconSvg "lucide:settings" size="1.5em"}}
        </span>
    </div>
    <p style="opacity:0.7; font-size:12px; margin-top:0.75rem;">
        Each glyph is inline SVG with <code>currentColor</code> — colour is themed
        from the surrounding CSS (per-system Tailwind variants for the FA pair).
    </p>
</div>
`;

const sampleTemplate = Handlebars.compile(sampleSrc);

const meta: Meta<{ system: string }> = {
    title: 'Foundation/Icons',
    argTypes: {
        system: {
            control: { type: 'select' },
            options: ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'],
        },
    },
    args: {
        system: 'dh2e',
    },
};

export default meta;

type Story = StoryObj<{ system: string }>;

export const Default: Story = {
    name: 'Helper sample (FA + Lucide, themed)',
    render: (args) => sampleTemplate({ system: args.system }),
};

export const PerSystemMatrix: Story = {
    name: 'Per-system matrix',
    render: () => {
        const systems = ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'];
        return systems.map((s) => sampleTemplate({ system: s })).join('');
    },
};

export const Catalogue: Story = {
    name: 'Bundled icon catalogue',
    render: () => {
        const tiles = listIcons()
            .map(
                (key) => `
                <figure style="display:flex; flex-direction:column; align-items:center; gap:0.25rem; margin:0; padding:0.75rem; background:#222; border:1px solid #444;">
                    <span style="color:#d8c690; font-size:32px; line-height:1;">
                        ${Handlebars.helpers.iconSvg(key, { hash: { size: 32 } })}
                    </span>
                    <figcaption style="font-family:monospace; font-size:11px; color:#aaa;">${key}</figcaption>
                </figure>
            `,
            )
            .join('');
        return `<div class="wh40k-rpg" data-wh40k-system="dh2e" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:0.5rem; padding:1rem; background:#111;">${tiles}</div>`;
    },
};
