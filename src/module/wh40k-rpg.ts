import { registerCustomEnrichers } from './enrichers.ts';
import { HandlebarManager } from './handlebars/handlebars-manager.ts';
import { HooksManager } from './hooks-manager.ts';

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
HooksManager.registerHooks();
HandlebarManager.registerHelpers();
registerCustomEnrichers();
