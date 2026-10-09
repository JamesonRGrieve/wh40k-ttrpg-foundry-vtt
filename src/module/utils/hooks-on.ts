/**
 * Register a Foundry hook handler by name, typed by the handler itself.
 *
 * fvtt-types overloads `Hooks.on` per core hook name (and marks it deprecated in
 * the V14 typings), so system-emitted hooks and handlers with narrowed payload
 * shapes do not compile against it. This is the one boundary where that typing
 * is widened: the handler's own parameter list is the payload contract.
 */
export function hooksOn<Handler extends (...args: never[]) => void>(event: string, fn: Handler): number {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- framework boundary: Hooks.on is deprecated in the V14 typings; the runtime API is current
    return (Hooks as NamedHookRegistry<Handler>).on(event, fn);
}

/** The by-name registration surface of Foundry's `Hooks` that {@link hooksOn} uses. */
interface NamedHookRegistry<Handler> {
    on: (event: string, fn: Handler) => number;
}
