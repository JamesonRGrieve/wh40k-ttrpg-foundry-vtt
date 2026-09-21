/**
 * Foundry runtime glue for token-image generation (#576, #577).
 *
 * The pure decision / prompt / parse logic lives in `token-image-gen.ts`; this
 * module supplies the real side-effect deps (DialogV2 confirm, fetch, FilePicker
 * upload, actor.update, notifications) and is called from BOTH the `createActor`
 * hook (mode-gated, #576) and the actor sheet's Generate-portrait button (on
 * demand, #577). It lives outside `hooks-manager.ts` so the actor sheet can reuse
 * it without an import cycle.
 */

import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { generateActorImage, type GenerationRequest, type OpenAIImagesResponse, type ParsedImage, type TokenImageGenDeps } from './token-image-gen.ts';

/** The narrow slice of an Actor the generator reads/writes. */
export interface TokenImageActor {
    id?: string | null;
    name?: string | null;
    img?: string | null;
    type?: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: an actor's description is opaque Foundry data; parsed defensively by the pure token-image-gen module
    system?: { description?: unknown } | null;
    update: (data: object) => Promise<void>;
}

/**
 * Build the Foundry side-effect deps for {@link generateActorImage}. Every
 * framework-API touch (DialogV2, fetch, FilePicker upload, actor.update,
 * notifications) is isolated here.
 */
export function buildTokenImageDeps(actor: TokenImageActor): TokenImageGenDeps {
    return {
        confirm: async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.api.DialogV2.confirm is Foundry's untyped dialog API
            const DialogV2 = foundry.applications.api.DialogV2 as unknown as { confirm: (opts: object) => Promise<boolean> };
            return DialogV2.confirm({
                window: { title: game.i18n.localize('WH40K.TokenImageGen.Confirm.Title') },
                content: `<p>${game.i18n.format('WH40K.TokenImageGen.Confirm.Content', { name })}</p>`,
            });
        },
        postJson: async (req: GenerationRequest) => {
            const res = await fetch(req.url, req.init);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // eslint-disable-next-line no-restricted-syntax -- boundary: Response.json() is typed unknown (ts-reset); the OpenAI-images shape is validated in parseImageResponse
            return (await res.json()) as OpenAIImagesResponse;
        },
        saveImage: async (image: ParsedImage) => {
            if (image.url !== undefined) return image.url; // a hosted URL is hotlinked, nothing to store
            const bytes = Uint8Array.from(atob(image.b64 ?? ''), (c) => c.charCodeAt(0));
            const filename = `${actor.id ?? String(Date.now())}.png`;
            const file = new File([bytes], filename, { type: 'image/png' });
            // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.ux.FilePicker is the V14 file-picker class; its static createDirectory/upload are untyped
            const FP = CONFIG.ux.FilePicker as unknown as {
                createDirectory: (source: string, target: string, options?: object) => Promise<void>;
                upload: (source: string, path: string, file: File, body?: object, options?: { notify?: boolean }) => Promise<{ path?: string }>;
            };
            const dir = `worlds/${game.world.id}/wh40k-generated`;
            try {
                await FP.createDirectory('data', dir);
            } catch {
                // directory already exists — expected on the second and later generations
            }
            const result = await FP.upload('data', dir, file, {}, { notify: false });
            return result.path ?? `${dir}/${filename}`;
        },
        applyImage: async (src) => {
            await actor.update({ img: src, prototypeToken: { texture: { src } } });
        },
        notify: (level, key, data) => {
            const msg = game.i18n.format(`WH40K.TokenImageGen.${key}`, data ?? {});
            if (level === 'info') ui.notifications.info(msg);
            else if (level === 'warn') ui.notifications.warn(msg);
            else ui.notifications.error(msg);
        },
    };
}

/**
 * `createActor`-hook entry (#576): mode-gated. A no-op when the token-image-gen
 * mode is `never`. Fire-and-forget — {@link generateActorImage} never throws.
 */
export function runTokenImageGeneration(actor: TokenImageActor): void {
    const config = WH40KSettings.getTokenImageGenConfig();
    if (config.mode === 'never') return;
    void generateActorImage(actor, config, buildTokenImageDeps(actor));
}

/**
 * Sheet-button entry (#577): generate on demand regardless of the mode setting —
 * the click is itself the explicit request — using the configured endpoint. When
 * no endpoint is configured, {@link generateActorImage} surfaces the `NoEndpoint`
 * notification and no-ops.
 */
export async function generateActorImageOnDemand(actor: TokenImageActor): Promise<void> {
    const config = { ...WH40KSettings.getTokenImageGenConfig(), mode: 'always' as const };
    await generateActorImage(actor, config, buildTokenImageDeps(actor));
}
