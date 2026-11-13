import { registerCustomEnrichers } from './enrichers.ts';
import { HandlebarManager } from './handlebars/handlebars-manager.ts';
import { registerBundledTemplates } from './handlebars/template-sources.ts';
import { HooksManager } from './hooks-manager.ts';

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
HooksManager.registerHooks();
HandlebarManager.registerHelpers();
// Every template, from the source the bundle carries, before init (#708).
registerBundledTemplates();
registerCustomEnrichers();
