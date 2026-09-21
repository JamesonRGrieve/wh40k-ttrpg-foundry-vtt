import { describe, expect, it, vi } from 'vitest';
import {
    buildGenerationRequest,
    buildImagePrompt,
    coerceTokenImageGenMode,
    generateActorImage,
    isDefaultImage,
    parseImageResponse,
    shouldGenerate,
    type TokenImageGenConfig,
    type TokenImageGenDeps,
} from './token-image-gen.ts';

describe('coerceTokenImageGenMode', () => {
    it('passes valid modes through', () => {
        for (const m of ['never', 'if-no-image', 'ask', 'always'] as const) {
            expect(coerceTokenImageGenMode(m)).toBe(m);
        }
    });
    it('defaults unrecognised / undefined values to never', () => {
        expect(coerceTokenImageGenMode('nonsense')).toBe('never');
        expect(coerceTokenImageGenMode(undefined)).toBe('never');
    });
});

describe('isDefaultImage', () => {
    it('treats empty and framework/system placeholders as default', () => {
        expect(isDefaultImage('')).toBe(true);
        expect(isDefaultImage(null)).toBe(true);
        expect(isDefaultImage(undefined)).toBe(true);
        expect(isDefaultImage('icons/svg/mystery-man.svg')).toBe(true);
        expect(isDefaultImage('systems/wh40k-rpg/icons/foo.png')).toBe(true);
        expect(isDefaultImage('systems/wh40k-rpg/packs/_vendored-ui/icons/talents/b_01.png')).toBe(true);
    });
    it('treats real pack art and https hotlinks as real', () => {
        expect(isDefaultImage('systems/wh40k-rpg/packs/images/bestiary/dh2/pdf-trooper.jpeg')).toBe(false);
        expect(isDefaultImage('https://static.wikia.nocookie.net/warhammer40k/foo.jpg')).toBe(false);
    });
});

describe('shouldGenerate', () => {
    it('never is always false; always is always true', () => {
        expect(shouldGenerate('never', false, true)).toBe(false);
        expect(shouldGenerate('always', true, false)).toBe(true);
    });
    it('if-no-image generates only when there is no real image', () => {
        expect(shouldGenerate('if-no-image', false, false)).toBe(true);
        expect(shouldGenerate('if-no-image', true, true)).toBe(false);
    });
    it('ask follows the confirmation', () => {
        expect(shouldGenerate('ask', true, true)).toBe(true);
        expect(shouldGenerate('ask', false, false)).toBe(false);
    });
});

describe('buildImagePrompt', () => {
    it('includes the actor name, a type phrase, and a stripped description', () => {
        const p = buildImagePrompt({
            name: 'Kael Edric',
            type: 'dh2-npc',
            system: { description: { dh2: { value: '<p>A grizzled PDF captain.</p>' } } },
        });
        expect(p).toContain('Kael Edric');
        expect(p).toContain('character of the 41st millennium');
        expect(p).toContain('A grizzled PDF captain.');
        expect(p).not.toContain('<p>');
        expect(p).toContain('No text, no watermark');
    });
    it('maps vehicle and ship types and tolerates a missing name/description', () => {
        expect(buildImagePrompt({ type: 'dh2-vehicle' })).toContain('military vehicle');
        expect(buildImagePrompt({ type: 'rt-starship' })).toContain('warship');
        expect(buildImagePrompt({})).toContain('actor');
    });
});

describe('buildGenerationRequest', () => {
    it('appends the images path to a bare base and sets the JSON body', () => {
        const { url, init } = buildGenerationRequest('http://bifrost.lan:8189/', 'sdxl', 'a prompt', '1024x1024');
        expect(url).toBe('http://bifrost.lan:8189/v1/images/generations');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(init.headers['Authorization']).toBeUndefined();
        expect(JSON.parse(init.body)).toEqual({ model: 'sdxl', prompt: 'a prompt', size: '1024x1024', n: 1 });
    });
    it('does not double-append when the endpoint already has the path, and adds auth when keyed', () => {
        const { url, init } = buildGenerationRequest('http://x/v1/images/generations', 'm', 'p', '512x512', 'sk-123');
        expect(url).toBe('http://x/v1/images/generations');
        expect(init.headers['Authorization']).toBe('Bearer sk-123');
    });
});

describe('parseImageResponse', () => {
    it('extracts a b64 payload', () => {
        expect(parseImageResponse({ data: [{ b64_json: 'AAAA' }] })).toEqual({ b64: 'AAAA' });
    });
    it('extracts a url payload', () => {
        expect(parseImageResponse({ data: [{ url: 'http://x/img.png' }] })).toEqual({ url: 'http://x/img.png' });
    });
    it('returns null for empty / imageless responses', () => {
        expect(parseImageResponse({})).toBeNull();
        expect(parseImageResponse({ data: [] })).toBeNull();
        expect(parseImageResponse({ data: [null] })).toBeNull();
        expect(parseImageResponse({ data: [{ b64_json: '' }] })).toBeNull();
    });
});

function makeDeps(overrides: Partial<TokenImageGenDeps> = {}): TokenImageGenDeps {
    return {
        confirm: vi.fn().mockResolvedValue(true),
        postJson: vi.fn().mockResolvedValue({ data: [{ b64_json: 'AAAA' }] }),
        saveImage: vi.fn().mockResolvedValue('worlds/w/wh40k-generated/a.png'),
        applyImage: vi.fn().mockResolvedValue(undefined),
        notify: vi.fn(),
        ...overrides,
    };
}

const CFG: TokenImageGenConfig = { mode: 'always', endpoint: 'http://ep', model: 'm', apiKey: '', size: '1024x1024' };

describe('generateActorImage', () => {
    it('skips entirely on never', async () => {
        const deps = makeDeps();
        expect(await generateActorImage({ img: '' }, { ...CFG, mode: 'never' }, deps)).toBe('skipped');
        expect(deps.postJson).not.toHaveBeenCalled();
    });

    it('if-no-image skips when the actor already has real art', async () => {
        const deps = makeDeps();
        const actor = { img: 'systems/wh40k-rpg/packs/images/bestiary/dh2/pdf-trooper.jpeg' };
        expect(await generateActorImage(actor, { ...CFG, mode: 'if-no-image' }, deps)).toBe('skipped');
        expect(deps.postJson).not.toHaveBeenCalled();
    });

    it('ask skips when the GM declines', async () => {
        const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(false) });
        expect(await generateActorImage({ img: '' }, { ...CFG, mode: 'ask' }, deps)).toBe('skipped');
        expect(deps.postJson).not.toHaveBeenCalled();
    });

    it('generates and applies on always', async () => {
        const deps = makeDeps();
        expect(await generateActorImage({ name: 'X', img: '' }, CFG, deps)).toBe('generated');
        expect(deps.postJson).toHaveBeenCalledTimes(1);
        expect(deps.saveImage).toHaveBeenCalledWith({ b64: 'AAAA' });
        expect(deps.applyImage).toHaveBeenCalledWith('worlds/w/wh40k-generated/a.png');
    });

    it('fails (not throws) with no endpoint configured', async () => {
        const deps = makeDeps();
        expect(await generateActorImage({ img: '' }, { ...CFG, endpoint: '  ' }, deps)).toBe('failed');
        expect(deps.notify).toHaveBeenCalledWith('warn', 'NoEndpoint');
        expect(deps.postJson).not.toHaveBeenCalled();
    });

    it('fails on a response with no usable image', async () => {
        const deps = makeDeps({ postJson: vi.fn().mockResolvedValue({ data: [] }) });
        expect(await generateActorImage({ img: '' }, CFG, deps)).toBe('failed');
        expect(deps.applyImage).not.toHaveBeenCalled();
    });

    it('fails (not throws) when the request rejects', async () => {
        const deps = makeDeps({
            postJson: vi.fn().mockRejectedValue(new Error('network down')),
        });
        expect(await generateActorImage({ img: '' }, CFG, deps)).toBe('failed');
        expect(deps.notify).toHaveBeenCalledWith('error', 'Failed', expect.objectContaining({ error: 'network down' }));
    });
});
