// ============================================================
// Shared type definitions
// ============================================================

/** Hub secrets, optional because a given .dev.vars may not define them. */
interface HubSecrets {
  /** Shared secret sent to the Vercel renderer as `x-kino-token` */
  KINO_TOKEN?: string;
  /** Bearer token for /api/admin/kindle* (the admin page asks for it once) */
  ADMIN_TOKEN?: string;
}

/**
 * Worker environment: the generated bindings (incl. the KINO_URL var from
 * wrangler.jsonc) with the hub secrets typed as optional whether or not
 * `wrangler types` saw them in .dev.vars.
 */
export type AppEnv = Omit<Env, keyof HubSecrets> & HubSecrets;
