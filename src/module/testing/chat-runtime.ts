/**
 * Shared chat-runtime stub for unit tests that exercise code which renders a
 * Handlebars card and posts it via `ChatMessage.create` (#270).
 *
 * Several rule tests (`ace-role`, `medicae-mechadendrite`) hand-rolled the same
 * `beforeEach` triad: a `game` stub with a fixed roll mode + user, a content-
 * capturing `ChatMessage.create`, and a `foundry.applications.handlebars.
 * renderTemplate` stub, plus the matching teardown. Only the *card format*
 * differs between them, so that is the single parameter (`renderTemplate`);
 * everything else is centralized here.
 *
 * Framework-agnostic by design — it saves/restores the three globals itself
 * rather than importing vitest's `vi`. Lives under `src/module/` (not
 * `stories/`) because the consuming tests are co-located in `src/module/**`,
 * which the main tsconfig compiles with `rootDir: "src"`; a `stories/`-rooted
 * helper would trip TS6059 on import. Test-only — nothing in the runtime import
 * graph references it, so it is never bundled into the shipped system.
 */

/** The payload shape `ChatMessage.create` receives — only `content` is read by callers. */
interface CreatedMessage {
    content: string;
}

/** Stand-in for Foundry's `renderTemplate(template, context)` — returns the rendered card string. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's renderTemplate takes a freeform context bag; each test narrows `context` to its own card-context interface on the next line
type RenderTemplateFn = (template: string, context: unknown) => string | Promise<string>;

/** Handle returned by {@link stubChatRuntime}: inspect captured messages and tear the stubs down. */
export interface ChatRuntimeHandle {
    /** Every payload passed to `ChatMessage.create`, in call order. */
    readonly created: CreatedMessage[];
    /** The `content` of the most recent created message, or `null` if none was posted. */
    lastContent: () => string | null;
    /** Restore the three globals to their pre-stub values. Call from `afterEach`. */
    restore: () => void;
}

/** The minimal `game` surface the chat-posting code paths read. */
interface ChatGameStub {
    user: { id: string };
    settings: { get: () => string };
}

/** The minimal `ChatMessage` surface the chat-posting code paths call. */
interface ChatMessageStub {
    create: (data: CreatedMessage) => CreatedMessage;
    getWhisperRecipients: () => never[];
    /** #422: emitChatFromTemplate resolves the speaker's actor for per-system theming. */
    getSpeakerActor: () => null;
}

/** The minimal `foundry` surface exposing the Handlebars `renderTemplate`. */
interface FoundryHandlebarsStub {
    applications: { handlebars: { renderTemplate: RenderTemplateFn } };
}

interface ChatRuntimeGlobals {
    game?: ChatGameStub | undefined;
    ChatMessage?: ChatMessageStub | undefined;
    foundry?: FoundryHandlebarsStub | undefined;
}

/** Options for {@link stubChatRuntime}. */
interface StubChatRuntimeOptions {
    /** The roll mode `game.settings.get(...)` returns. Defaults to `'roll'` (public). */
    rollMode?: string;
    /** The acting user id exposed as `game.user.id`. Defaults to `'gm-1'`. */
    userId?: string;
    /**
     * The card renderer. Receives the context the code-under-test passes to
     * `renderTemplate`; return the assertable card string. Defaults to a JSON
     * dump of the context, so a test that does not care about the format still
     * gets deterministic, inspectable content.
     */
    renderTemplate?: RenderTemplateFn;
}

/**
 * Install the chat-runtime globals (`game`, `ChatMessage`, `foundry`) and return
 * a handle that captures created messages and restores the previous globals.
 */
export function stubChatRuntime(options: StubChatRuntimeOptions = {}): ChatRuntimeHandle {
    // eslint-disable-next-line no-restricted-syntax -- boundary: install a typed chat-runtime stub surface over the real (fvtt-typed) globals; the double cast is the sanctioned globalThis-stub install site
    const g = globalThis as unknown as ChatRuntimeGlobals;
    const previous = { game: g.game, chatMessage: g.ChatMessage, foundry: g.foundry };
    const created: CreatedMessage[] = [];
    const renderTemplateFn: RenderTemplateFn = options.renderTemplate ?? ((_template, context) => JSON.stringify(context));

    g.game = {
        user: { id: options.userId ?? 'gm-1' },
        settings: { get: (): string => options.rollMode ?? 'roll' },
    };
    g.ChatMessage = {
        create: (data: CreatedMessage): CreatedMessage => {
            created.push(data);
            return data;
        },
        getWhisperRecipients: (): never[] => [],
        getSpeakerActor: (): null => null,
    };
    g.foundry = { applications: { handlebars: { renderTemplate: renderTemplateFn } } };

    return {
        created,
        lastContent: (): string | null => created.at(-1)?.content ?? null,
        restore: (): void => {
            g.game = previous.game;
            g.ChatMessage = previous.chatMessage;
            g.foundry = previous.foundry;
        },
    };
}
