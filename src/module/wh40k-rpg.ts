import { HooksManager } from './hooks-manager.ts';
import { HandlebarManager } from './handlebars/handlebars-manager.ts';
import { registerCustomEnrichers } from './enrichers.ts';

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
HooksManager.registerHooks();
HandlebarManager.registerHelpers();
registerCustomEnrichers();
