/**
 * The heap every `tsc` run gets. The program outgrows node's default heap: tsc
 * then aborts with "JavaScript heap out of memory" (exit 134), which broke the
 * system build (a half-emitted dist/module) and CI's `pnpm typecheck`. Every tsc
 * invocation — gulp's compile, the typecheck scripts (via scripts/tsc.mjs) and the
 * strict/test-typecheck coverage ratchets — takes its environment from here, so
 * the limit is set once.
 */
const TSC_HEAP_MB = 12288;

/** `env` with NODE_OPTIONS extended to give tsc {@link TSC_HEAP_MB} of heap. */
function tscEnv(env = process.env) {
    return { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --max-old-space-size=${TSC_HEAP_MB}`.trim() };
}

module.exports = { TSC_HEAP_MB, tscEnv };
