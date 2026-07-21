import type { HttpContext } from '@adonisjs/core/http';
import type { ResolvedRateLimitConfig } from '../define_config.js';

/**
 * Assinatura mínima de um middleware do AdonisJS. Evita acoplar o tipo concreto
 * do `@adonisjs/limiter` (que pode não estar instalado no host).
 */
export type ThrottleMiddleware = (ctx: HttpContext, next: () => Promise<void>) => Promise<void>;

/**
 * Os throttles construídos para as rotas sensíveis do host-kit.
 * - `login`: compartilhado por login/signup/forgot/reset (keyed por IP).
 * - `introspection`: introspecção de PAT (keyed por IP ou pelo bearer secret).
 */
export interface AuthThrottles {
  login: ThrottleMiddleware;
  introspection: ThrottleMiddleware;
  /**
   * Throttle por IP do grupo admin-api (R6). Anti-brute-force REAL da Bearer key:
   * diferente do `introspection` (keyed pelo próprio token, então cada key tentada
   * cai em bucket distinto), este é keyed por `ctx.request.ip()` — limita o número
   * de tentativas vindas do MESMO IP independentemente de qual key foi usada (M8).
   */
  adminIp: ThrottleMiddleware;
  /**
   * Throttle das rotas dos métodos de sudo (`/account/confirm/*`), keyed por IP
   * como o `login` — e com os MESMOS limites — mas em bucket PRÓPRIO.
   *
   * A separação é o ponto: `login` mede um anônimo tentando adivinhar
   * credenciais, `sudo` mede um usuário já autenticado reprovando a própria
   * identidade. Ver `ResolvedRateLimitConfig.sudo` para o porquê de os dois
   * orçamentos não poderem se consumir.
   */
  sudo: ThrottleMiddleware;
}

/**
 * Service do `@adonisjs/limiter` resolvido de forma preguiçosa. Tipado como `any`
 * de propósito: a lib NÃO depende do limiter em tempo de compilação (peer/opt-in).
 */
type LimiterService = any;

let limiterServicePromise: Promise<LimiterService | null> | undefined;

/**
 * Importa o service do limiter do HOST de forma preguiçosa e fail-safe.
 * Se `@adonisjs/limiter` não estiver instalado/configurado, resolve `null`
 * e o throttle vira no-op (não quebra o boot nem a request).
 */
async function loadLimiter(): Promise<LimiterService | null> {
  if (!limiterServicePromise) {
    // Indireção via variável: o `@adonisjs/limiter` é peer/opcional e pode não
    // estar instalado na lib, então o specifier não é resolvido em build-time.
    const specifier = '@adonisjs/limiter/services/main';
    limiterServicePromise = import(specifier)
      .then((mod) => (mod as any).default ?? null)
      .catch(() => null);
  }
  return limiterServicePromise;
}

/**
 * Permite reapontar/limpar o loader do limiter (usado em testes).
 * @internal
 */
export function __setLimiterLoaderForTests(
  fn: (() => Promise<LimiterService | null>) | undefined,
): void {
  if (fn) {
    limiterServicePromise = fn();
  } else {
    limiterServicePromise = undefined;
  }
}

/**
 * Constrói um middleware de throttle preguiçoso. A configuração do limiter
 * (`allowRequests().every().usingKey()`) só é resolvida na primeira request,
 * porque o service do limiter é importado de forma assíncrona. Se o limiter
 * não existir, o middleware passa adiante sem throttle (fail-safe).
 */
function buildThrottle(
  name: string,
  bucket: { points: number; duration: string },
  store: string | undefined,
  keyOf?: (ctx: HttpContext) => string | undefined,
): ThrottleMiddleware {
  let middleware: ThrottleMiddleware | undefined;

  return async (ctx, next) => {
    if (!middleware) {
      const limiter = await loadLimiter();
      if (!limiter) {
        // Limiter indisponível: degrada para no-op (sem quebrar a request).
        middleware = async (_ctx, n) => n();
      } else {
        middleware = limiter.define(name, (reqCtx: HttpContext) => {
          let b = limiter.allowRequests(bucket.points).every(bucket.duration);
          if (store) b = b.store(store);
          const key = keyOf?.(reqCtx);
          if (key) b = b.usingKey(key);
          return b;
        }) as ThrottleMiddleware;
      }
    }
    return middleware(ctx, next);
  };
}

/**
 * Cria os throttles do host-kit a partir da config resolvida.
 * Retorna `undefined` quando rate-limit está desligado (rotas montadas sem throttle).
 */
export function createAuthThrottles(config: ResolvedRateLimitConfig): AuthThrottles | undefined {
  if (!config.enabled) return undefined;

  return {
    // Login/signup/forgot/reset: keyed por IP (default do HttpLimiter).
    login: buildThrottle('authkit_login', config.login, config.store),
    // Introspecção de PAT: keyed pelo bearer secret quando presente, senão por IP.
    introspection: buildThrottle(
      'authkit_pat_introspection',
      config.introspection,
      config.store,
      (ctx) => {
        const auth = ctx.request.header('authorization');
        if (auth?.toLowerCase().startsWith('bearer ')) {
          return `bearer:${auth.slice(7).trim()}`;
        }
        return undefined;
      },
    ),
    // Admin-api por IP: anti-brute-force REAL da Bearer key (M8). Keyed por IP —
    // tentar muitas keys diferentes do mesmo IP cai no MESMO bucket, ao contrário
    // do `introspection` (bucket por token). Camada adicional, não substitui o
    // throttle de introspection nas rotas que o usam.
    adminIp: buildThrottle('authkit_admin_ip', config.adminIp, config.store, (ctx) => {
      return `admin-ip:${ctx.request.ip?.() ?? 'unknown'}`;
    }),
    // Rotas dos métodos de sudo: keyed por IP (default do HttpLimiter), igual ao
    // login. O que separa os dois é o NOME do bucket — o limiter namespaceia a
    // contagem por nome, então `authkit_login` e `authkit_sudo` nunca somam,
    // mesmo vindo do mesmo IP. Sem `usingKey` próprio de propósito: inventar uma
    // key aqui seria mudar o EIXO da contagem, e o eixo certo continua sendo o IP.
    sudo: buildThrottle('authkit_sudo', config.sudo, config.store),
  };
}
