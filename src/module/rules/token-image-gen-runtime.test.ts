import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTokenImageDeps } from './token-image-gen-runtime.ts';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('buildTokenImageDeps', () => {
    it('applyImage writes img + prototype-token texture onto the actor', async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const deps = buildTokenImageDeps({ update });
        await deps.applyImage('worlds/w/wh40k-generated/a.png');
        expect(update).toHaveBeenCalledWith({
            img: 'worlds/w/wh40k-generated/a.png',
            prototypeToken: { texture: { src: 'worlds/w/wh40k-generated/a.png' } },
        });
    });

    it('saveImage hotlinks a URL payload without uploading', async () => {
        const deps = buildTokenImageDeps({ update: vi.fn() });
        expect(await deps.saveImage({ url: 'http://host/img.png' })).toBe('http://host/img.png');
    });

    it('notify routes info / warn / error to the matching ui.notifications channel', () => {
        const info = vi.fn();
        const warn = vi.fn();
        const error = vi.fn();
        vi.stubGlobal('game', { i18n: { format: (key: string) => key } });
        vi.stubGlobal('ui', { notifications: { info, warn, error } });
        const deps = buildTokenImageDeps({ update: vi.fn() });
        deps.notify('info', 'Generating', { name: 'X' });
        deps.notify('warn', 'NoEndpoint');
        deps.notify('error', 'Failed', { name: 'X', error: 'boom' });
        expect(info).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(1);
    });
});
