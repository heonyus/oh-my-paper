export {}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface ProvidedEnv extends Env {
      readonly TEST_MIGRATIONS: readonly D1Migration[]
    }
  }
}
