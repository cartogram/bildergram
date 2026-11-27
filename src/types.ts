// ============================================================
// Shared type definitions
// ============================================================

/** Hub secrets, optional because a given .dev.vars may not define them. */
interface HubSecrets {
  /** Shared secret sent to the Vercel screen renderer as `x-renderer-token` */
  RENDERER_TOKEN?: string;
  /** Bearer token for /api/admin/* (the admin page asks for it once) */
  ADMIN_TOKEN?: string;
  /** Each iPhone's bearer token for POST /api/fitness (src/routes/fitness.ts) */
  FITNESS_TOKEN_MATT?: string;
  FITNESS_TOKEN_FIONA?: string;
  /** Bearer token for Fondfolio's orders-this-month endpoint (FONDFOLIO_URL); without it the card shows a dash. */
  FONDFOLIO_TOKEN?: string;
  FONDFOLIO_URL?: string;
}

/**
 * Worker environment: the generated bindings (incl. the RENDERER_URL var from
 * wrangler.jsonc) with the hub secrets typed as optional whether or not
 * `wrangler types` saw them in .dev.vars.
 */
export type AppEnv = Omit<Env, keyof HubSecrets> & HubSecrets;
