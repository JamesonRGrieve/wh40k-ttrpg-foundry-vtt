// Node --require shim: patches os.hostname() to return the host the
// pulled .foundry-release/license.json was signed against. The license
// signature binds to {host: this.service.id, ...} and ServerSettings sets
// service.id = os.hostname(); on a contributor's box those won't match.
//
// Without this shim, Foundry redirects to /license and refuses to auto-launch
// the test world. With it, license verification passes and the e2e suite can
// land in /game.
//
// Override the hostname with FOUNDRY_LICENSE_HOSTNAME; defaults to the value
// embedded in the pulled license.json. The shim is invoked from
// scripts/run-e2e.sh — never load it elsewhere.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

let target = process.env.FOUNDRY_LICENSE_HOSTNAME;
if (!target) {
    try {
        const licensePath = path.resolve(__dirname, '..', '.foundry-release', 'license.json');
        const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
        target = data.host;
    } catch {
        // fall through — no shim, no Foundry boot
    }
}

if (target) {
    const original = os.hostname.bind(os);
    os.hostname = () => target;
    if (process.env.FOUNDRY_DEBUG_SHIM) {
        // eslint-disable-next-line no-console
        console.error(`[foundry-hostname-shim] os.hostname() → '${target}' (was '${original()}')`);
    }
}
