import type { Decorator, Preview } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../stories/template-support';

// Storybook chrome CSS — REPLACEMENT for Foundry's `foundry2.css`. The chrome
// stylesheet authors `@apply` directives against a dedicated Tailwind profile
// (`tailwind.storybook.config.js`) so the deployable Storybook bundle ships
// ZERO Foundry-origin assets. The main app stylesheet still loads alongside
// it (utilities, design tokens, legacy component classes) — both pass through
// PostCSS but with isolated Tailwind configs, see `.storybook/main.ts` for
// the per-file plugin that handles the chrome compile.
import '../stories/css/foundry-chrome.css';
import '../src/css/entry.css';
initializeStoryHandlebars();

/** Story titles whose stories are chat cards ("Chat/…", "ChatCards/…", "… Chat (#152)"). */
const CHAT_TITLE = /(^|[\s/])Chat/;

/**
 * Chat cards render inside a `.chat-message`, as Foundry posts them. The cards take
 * their colour tokens from that message surface (light parchment, `chatSurface` in
 * tailwind/design-tokens.js), so a card drawn straight onto the dark story backdrop
 * showed dark-on-dark text that Foundry never shows.
 *
 * A card rendered through the sheet helpers arrives in the mock application window
 * (`.wh40k-wrapper > .window-app > .window-content`), whose dark window surface and
 * light text Foundry's chat log does not have. Its content moves into the message,
 * which keeps the wrapper's game line.
 */
const chatMessageSurface: Decorator = (storyFn, context) => {
    const story = storyFn();
    if (!CHAT_TITLE.test(context.title)) return story;
    const message = document.createElement('div');
    message.className = 'wh40k-rpg chat-message message';
    const content = document.createElement('div');
    content.className = 'message-content';
    const windowContent = story instanceof HTMLElement && story.matches('.wh40k-wrapper') ? story.querySelector(':scope > .window-app > .window-content') : null;
    if (typeof story === 'string') {
        content.insertAdjacentHTML('beforeend', story);
    } else if (windowContent !== null && story instanceof HTMLElement) {
        const line = story.dataset['wh40kSystem'];
        if (line !== undefined) message.dataset['wh40kSystem'] = line;
        content.append(...windowContent.childNodes);
    } else {
        content.append(story);
    }
    message.append(content);
    return message;
};

const preview: Preview = {
    decorators: [chatMessageSurface],
    parameters: {
        options: {
            // Docs hub order: the user guide first (the hub opens on its
            // Introduction), then everything under the developer `Dev/` root.
            storySort: {
                order: [
                    'Guide',
                    [
                        'Introduction',
                        'Installation and Updating',
                        'Creating a Character',
                        'The Character Sheet',
                        'Rolling Tests',
                        'Combat',
                        'Items and Effects',
                        'Game Settings',
                        'Other Tools',
                        'Troubleshooting',
                    ],
                    'Dev',
                    ['Docs', '*'],
                ],
            },
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
    },
};

export default preview;
