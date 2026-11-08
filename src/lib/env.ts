import { z } from "zod";

/**
 * Server-side environment contract. Secrets never leave the server boundary.
 * Required vars fail fast at startup; optional vars are validated when present.
 * Loaded from Next's .env.local automatically; tests load it via tests/setup.ts.
 */

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes"].includes(v.toLowerCase())));

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  DEMO_MODE: boolish.default(true),
  DEMO_SEED_PASSWORD: z.string().optional(),

  AI_PROVIDER: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  CHANNEL3_API_KEY: z.string().optional(),
  CHANNEL3_COUNTRY: z.string().default("US"),
  CHANNEL3_CURRENCY: z.string().default("USD"),
  CHANNEL3_LANGUAGE: z.string().default("en"),
  CHANNEL3_SEARCH_MODE: z.string().default("default"),
  CHANNEL3_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),

  PAYPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_CURRENCY: z.string().default("USD"),

  UPLOAD_DRIVER: z.enum(["local"]).default("local"),
  UPLOAD_LOCAL_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_388_608),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration. Check .env.local against .env.example. Details: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Guard that refuses production payment mode — sandbox only for this MVP. */
export function assertSandboxPayments(env: ServerEnv = getServerEnv()): void {
  if (env.PAYPAL_ENV === "production") {
    throw new Error("PAYPAL_ENV=production is not permitted in this MVP build.");
  }
}
