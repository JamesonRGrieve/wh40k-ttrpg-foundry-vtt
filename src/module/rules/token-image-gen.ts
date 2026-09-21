/**
 * Auto-generate an actor's image on spawn (#576) via a configured OpenAI-compatible
 * image endpoint (e.g. a Bifrost gateway / comfyui-bifrost-shim).
 *
 * All of the logic — the mode decision, the placeholder-image test, the prompt and
 * request construction, the response parse, and the async orchestration over
 * injected side-effect deps — lives here so it is fully unit-testable with no
 * Foundry globals. `hooks-manager.ts` supplies the real Foundry deps (fetch, file
 * upload, DialogV2 confirm, actor.update, notifications) at the `createActor` hook.
 *
 * Sibling of `portrait-spawn.ts` (#567): the pool picks an authored variant; this
 * generates one on demand when there is no suitable art.
 */

/** When the generator fires, relative to a compendium / world spawn. */
export type TokenImageGenMode = 'never' | 'if-no-image' | 'ask' | 'always';

/** The valid modes in menu order — the single source of truth for the coercion. */
const TOKEN_IMAGE_GEN_MODES: readonly TokenImageGenMode[] = ['never', 'if-no-image', 'ask', 'always'];

/** Coerce a stored setting string to a valid mode, defaulting to `never`. */
export function coerceTokenImageGenMode(value: string | undefined): TokenImageGenMode {
    return TOKEN_IMAGE_GEN_MODES.find((m) => m === value) ?? 'never';
}

/** Paths that count as a placeholder rather than real art: a spawn on one of these
 *  has "no image" for the `if-no-image` mode. Real art lives under
 *  `systems/wh40k-rpg/packs/images/**` or an `https://` hotlink. */
const PLACEHOLDER_IMG_PATTERNS: readonly RegExp[] = [/^icons\//, /mystery-?man/i, /^systems\/wh40k-rpg\/icons\//, /_vendored-ui\/icons\//];

/** True when `img` is empty or a framework/system placeholder rather than real art. */
export function isDefaultImage(img: string | null | undefined): boolean {
    const s = (img ?? '').trim();
    if (s === '') return true;
    return PLACEHOLDER_IMG_PATTERNS.some((re) => re.test(s));
}

/** Pure mode decision. `confirmed` is only consulted for `ask`. */
export function shouldGenerate(mode: TokenImageGenMode, hasRealImage: boolean, confirmed: boolean): boolean {
    if (mode === 'never') return false;
    if (mode === 'always') return true;
    if (mode === 'if-no-image') return !hasRealImage;
    return confirmed; // 'ask'
}

/** The narrow slice of an Actor the prompt builder reads. */
interface PromptActorLike {
    name?: string | null;
    type?: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: an actor's description is opaque Foundry data (string | { value } | per-line map); parsed defensively in extractDescription
    system?: { description?: unknown } | null;
}

/** A grimdark-40K portrait prompt derived from the actor — never fabricated beyond
 *  a neutral style frame around the actor's own name / type / description. */
export function buildImagePrompt(actor: PromptActorLike): string {
    const name = actorName(actor);
    const kind = describeType(actor.type);
    const flavour = extractDescription(actor.system?.description);
    const flavourClause = flavour !== '' ? ` ${flavour}` : '';
    return (
        `A grimdark Warhammer 40,000 character portrait of ${name}, ${kind}.${flavourClause} ` +
        'Head-and-shoulders bust, dark muted earth tones, dramatic chiaroscuro lighting, ' +
        'fine detail on the face, gritty and highly detailed, plain dark background. ' +
        'No text, no watermark.'
    );
}

function describeType(type: string | null | undefined): string {
    const t = (type ?? '').toLowerCase();
    if (t.includes('vehicle')) return 'a grimdark military vehicle';
    if (t.includes('ship') || t.includes('starship')) return 'a void-faring warship';
    if (t.includes('npc') || t.includes('character')) return 'a grim character of the 41st millennium';
    return 'a grim figure of the 41st millennium';
}

/** Longest single description value in the (possibly per-line) container, tags
 *  stripped and clamped, so the prompt stays a phrase not a wall of HTML. */
// eslint-disable-next-line no-restricted-syntax -- boundary: `desc` is an actor's opaque Foundry description; narrowed in firstDescriptionHtml
function extractDescription(desc: unknown): string {
    const text = firstDescriptionHtml(desc)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/** Pull an HTML description string out of a raw string, a `{ value }` object, or a
 *  per-line container `{ dh2: { value } }`. Returns `''` when none is present. */
// eslint-disable-next-line no-restricted-syntax -- boundary: `desc` is an actor's Foundry-typed description (string | { value } | per-line { line: { value } }); narrowed structurally below
function firstDescriptionHtml(desc: unknown): string {
    if (typeof desc === 'string') return desc;
    if (desc === null || typeof desc !== 'object') return '';
    // eslint-disable-next-line no-restricted-syntax -- boundary: narrowing the opaque description object to read optional `.value` fields
    const obj = desc as Record<string, { value?: string } | string | undefined>;
    const direct = obj['value'];
    if (typeof direct === 'string') return direct;
    for (const v of Object.values(obj)) {
        if (v !== undefined && typeof v !== 'string' && typeof v.value === 'string') return v.value;
    }
    return '';
}

/** The fully-built OpenAI images request. */
export interface GenerationRequest {
    url: string;
    init: { method: 'POST'; headers: Record<string, string>; body: string };
}

/** Build the `POST /v1/images/generations` request. The endpoint may be a bare base
 *  URL (the path is appended) or already include the images path (used as-is). The
 *  Authorization header is set only when a non-blank key is supplied. */
export function buildGenerationRequest(endpoint: string, model: string, prompt: string, size: string, apiKey?: string): GenerationRequest {
    const base = endpoint.trim().replace(/\/+$/, '');
    const url = /\/(v1\/)?images\/generations$/.test(base) ? base : `${base}/v1/images/generations`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey !== undefined && apiKey.trim() !== '') headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    const body = JSON.stringify({ model, prompt, size, n: 1 });
    return { url, init: { method: 'POST', headers, body } };
}

/** A parsed image payload: exactly one of a base64 PNG or a URL. */
export interface ParsedImage {
    b64?: string;
    url?: string;
}

/** The shape of an OpenAI-compatible `/v1/images/generations` response body. */
export interface OpenAIImagesResponse {
    data?: ReadonlyArray<{ b64_json?: string; url?: string } | null | undefined>;
}

/** Extract the first usable image from an OpenAI-shaped images response
 *  (`{ data: [{ b64_json }] }` or `{ data: [{ url }] }`), or `null` if none. */
export function parseImageResponse(response: OpenAIImagesResponse): ParsedImage | null {
    const first = Array.isArray(response.data) ? response.data[0] : undefined;
    if (first === null || first === undefined) return null;
    const b64 = first.b64_json;
    if (typeof b64 === 'string' && b64.trim() !== '') return { b64 };
    const url = first.url;
    if (typeof url === 'string' && url.trim() !== '') return { url };
    return null;
}

/** The resolved settings the orchestrator reads. */
export interface TokenImageGenConfig {
    mode: TokenImageGenMode;
    endpoint: string;
    model: string;
    apiKey: string;
    size: string;
}

/** Injected side effects — every Foundry API touch lives behind one of these, so
 *  {@link generateActorImage} is pure and testable. `notify.key` is the suffix of a
 *  `WH40K.TokenImageGen.*` langpack key. */
export interface TokenImageGenDeps {
    /** `ask` mode: confirm generation with the GM. */
    confirm: (actorName: string) => Promise<boolean>;
    /** POST the request and return the parsed JSON body (or reject). */
    postJson: (req: GenerationRequest) => Promise<OpenAIImagesResponse>;
    /** Persist the generated image and return the `src` to store on the actor. */
    saveImage: (image: ParsedImage) => Promise<string>;
    /** Write the `src` onto the actor's `img` + prototype-token texture. */
    applyImage: (src: string) => Promise<void>;
    /** Surface progress / outcome. */
    notify: (level: 'info' | 'warn' | 'error', key: string, data?: Record<string, string>) => void;
}

/** What {@link generateActorImage} did. */
type TokenImageGenOutcome = 'skipped' | 'generated' | 'failed';

/**
 * Decide, then (if generating) confirm → request → save → apply, entirely over
 * injected deps. Never throws: a bad endpoint / response is reported and returns
 * `failed`, so it can be fired from a create hook without endangering actor creation.
 */
export async function generateActorImage(
    actor: PromptActorLike & { img?: string | null },
    config: TokenImageGenConfig,
    deps: TokenImageGenDeps,
): Promise<TokenImageGenOutcome> {
    if (config.mode === 'never') return 'skipped';
    const hasRealImage = !isDefaultImage(actor.img);
    const confirmed = config.mode === 'ask' ? await deps.confirm(actorName(actor)) : true;
    if (!shouldGenerate(config.mode, hasRealImage, confirmed)) return 'skipped';
    if (config.endpoint.trim() === '') {
        deps.notify('warn', 'NoEndpoint');
        return 'failed';
    }
    const req = buildGenerationRequest(config.endpoint, config.model, buildImagePrompt(actor), config.size, config.apiKey);
    try {
        deps.notify('info', 'Generating', { name: actorName(actor) });
        const parsed = parseImageResponse(await deps.postJson(req));
        if (parsed === null) {
            deps.notify('error', 'BadResponse', { name: actorName(actor) });
            return 'failed';
        }
        const src = await deps.saveImage(parsed);
        await deps.applyImage(src);
        deps.notify('info', 'Done', { name: actorName(actor) });
        return 'generated';
    } catch (err) {
        deps.notify('error', 'Failed', { name: actorName(actor), error: errorMessage(err) });
        return 'failed';
    }
}

function actorName(actor: PromptActorLike): string {
    return typeof actor.name === 'string' && actor.name.trim() !== '' ? actor.name.trim() : 'actor';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a caught error is typed unknown; narrowed by the instanceof guard below
function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
