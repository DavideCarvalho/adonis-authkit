import { fileURLToPath } from 'node:url';
import { test } from '@japa/runner';
import { Edge } from 'edge.js';
import { DEFAULT_MESSAGES, translate } from '../../src/host/i18n.js';
import {
  InteractionSessionLostException,
  isInteractionSessionLost,
  recoverLostInteraction,
} from '../../src/host/interaction_recovery.js';
import { createInteractionActions } from '../../src/provider/interaction_actions.js';

// ---------------------------------------------------------------------------
// Recuperação graciosa da sessão de interaction OIDC perdida (SessionNotFound).
// ---------------------------------------------------------------------------

/**
 * Reproduz o shape do erro do `oidc-provider`: a base `OIDCProviderError` seta
 * `this.name = this.constructor.name`, então `SessionNotFound` carrega
 * `name === 'SessionNotFound'` e `error === 'invalid_request'`.
 */
class SessionNotFound extends Error {
  error = 'invalid_request';
  status = 400;
  constructor(message = 'interaction session not found') {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Outro `invalid_request` LEGÍTIMO — NÃO deve ser tratado como sessão perdida. */
class InvalidRequest extends Error {
  error = 'invalid_request';
  status = 400;
  constructor(message = 'request is invalid') {
    super(message);
    this.name = this.constructor.name;
  }
}

const rawCtx = { request: { request: {} }, response: { response: {} } } as any;

/** ctx fake com container + response instrumentados para a fase de recuperação. */
function recoveryCtx(cfg: Record<string, unknown>) {
  const rendered: Array<{ view: string; props: Record<string, unknown> }> = [];
  let redirectedTo: string | undefined;
  let statusSet: number | undefined;
  const ctx = {
    containerResolver: { make: async () => ({ config: cfg }) },
    response: {
      status(code: number) {
        statusSet = code;
        return this;
      },
      redirect(url: string) {
        redirectedTo = url;
        return 'REDIRECTED';
      },
    },
  } as any;
  return {
    ctx,
    get rendered() {
      return rendered;
    },
    get redirectedTo() {
      return redirectedTo;
    },
    get statusSet() {
      return statusSet;
    },
    renderFn: (_c: any, view: string, props: Record<string, unknown>) => {
      rendered.push({ view, props });
      return 'RENDERED';
    },
  };
}

test.group('interaction recovery — discriminador', () => {
  test('SessionNotFound é reconhecido pelo nome da classe', ({ assert }) => {
    assert.isTrue(isInteractionSessionLost(new SessionNotFound()));
  });

  test('OUTRO invalid_request NÃO é tratado como sessão perdida', ({ assert }) => {
    // Prova de que o discriminador não usa match de mensagem/`error`: mesmo
    // `error: 'invalid_request'`, um InvalidRequest comum não recupera.
    assert.isFalse(isInteractionSessionLost(new InvalidRequest()));
  });

  test('erros arbitrários e não-objetos não recuperam', ({ assert }) => {
    assert.isFalse(isInteractionSessionLost(new Error('boom')));
    assert.isFalse(isInteractionSessionLost(null));
    assert.isFalse(isInteractionSessionLost('SessionNotFound'));
  });
});

test.group('interaction recovery — details() converte SessionNotFound', () => {
  test('details() lança InteractionSessionLostException quando a sessão sumiu', async ({
    assert,
  }) => {
    const provider = {
      async interactionDetails() {
        throw new SessionNotFound();
      },
    } as any;
    const actions = createInteractionActions(provider, {});
    await assert.rejects(() => actions.details(rawCtx), /expirou|não foi encontrada/);
    try {
      await actions.details(rawCtx);
      assert.fail('esperava lançar');
    } catch (err) {
      assert.instanceOf(err, InteractionSessionLostException);
    }
  });

  test('consent() também converte SessionNotFound (mesmo choke point)', async ({ assert }) => {
    const provider = {
      async interactionDetails() {
        throw new SessionNotFound();
      },
    } as any;
    const actions = createInteractionActions(provider, {});
    try {
      await actions.consent(rawCtx);
      assert.fail('esperava lançar');
    } catch (err) {
      assert.instanceOf(err, InteractionSessionLostException);
    }
  });

  test('MUTAÇÃO: outro erro de interactionDetails propaga cru (não vira recovery)', async ({
    assert,
  }) => {
    const provider = {
      async interactionDetails() {
        throw new InvalidRequest('audience mismatch');
      },
    } as any;
    const actions = createInteractionActions(provider, {});
    try {
      await actions.details(rawCtx);
      assert.fail('esperava lançar');
    } catch (err) {
      assert.notInstanceOf(err, InteractionSessionLostException);
      assert.instanceOf(err, InvalidRequest);
    }
  });
});

test.group('interaction recovery — estratégias', () => {
  test("mode 'screen' (default) renderiza a view session-expired com loginUrl", async ({
    assert,
  }) => {
    const h = recoveryCtx({ interactionRecovery: { mode: 'screen' }, render: undefined });
    (h.ctx.containerResolver.make as any) = async () => ({
      config: { interactionRecovery: { mode: 'screen' }, render: h.renderFn },
    });
    const r = await recoverLostInteraction(h.ctx);
    assert.equal(r, 'RENDERED');
    assert.lengthOf(h.rendered, 1);
    assert.equal(h.rendered[0].view, 'session-expired');
    assert.property(h.rendered[0].props, 'loginUrl');
    assert.equal(h.statusSet, 400);
    // MUTAÇÃO: screen NÃO redireciona.
    assert.isUndefined(h.redirectedTo);
  });

  test("mode 'redirect' responde 302 para o redirectTo configurado", async ({ assert }) => {
    const h = recoveryCtx({});
    (h.ctx.containerResolver.make as any) = async () => ({
      config: {
        interactionRecovery: { mode: 'redirect', redirectTo: '/entrar' },
        render: h.renderFn,
      },
    });
    const r = await recoverLostInteraction(h.ctx);
    assert.equal(r, 'REDIRECTED');
    assert.equal(h.redirectedTo, '/entrar');
    // MUTAÇÃO: redirect NÃO renderiza a tela.
    assert.lengthOf(h.rendered, 0);
  });

  test('handle() da exceção executa a recuperação (integração details→handle)', async ({
    assert,
  }) => {
    const h = recoveryCtx({});
    (h.ctx.containerResolver.make as any) = async () => ({
      config: { interactionRecovery: { mode: 'screen' }, render: h.renderFn },
    });
    const exc = new InteractionSessionLostException();
    const r = await exc.handle(exc, h.ctx);
    assert.equal(r, 'RENDERED');
    assert.equal(h.rendered[0].view, 'session-expired');
  });
});

/**
 * Os testes acima usam um `renderFn` FAKE (só registra `{ view, props }`) —
 * nenhum deles exercita o Edge renderer de verdade, então uma quebra dentro
 * de `session-expired.edge` (ex.: `@include` de partial inexistente, prop mal
 * referenciada) passaria despercebida pela suíte. Este grupo monta um `Edge`
 * real (mesmo disco `authkit` que o provider monta em produção — ver
 * `render_default.spec.ts`/`edge_views.spec.ts` para o mesmo padrão) e
 * renderiza a view de verdade.
 */
function makeEdge() {
  const dir = fileURLToPath(new URL('../../src/host/views/', import.meta.url));
  const edge = new Edge();
  edge.mount('authkit', dir);
  edge.global('t', (key: string, params?: Record<string, string | number>) =>
    translate({ ...DEFAULT_MESSAGES }, key, params),
  );
  return edge;
}

test.group('interaction recovery — render Edge real de session-expired.edge', () => {
  test('renderiza HTML válido com a mensagem de sessão expirada + link de login, sem lançar', async ({
    assert,
  }) => {
    const edge = makeEdge();

    const html = await edge.render('authkit::session-expired', {
      loginUrl: '/account/login',
      brand: undefined,
    });

    assert.isString(html);
    assert.include(html, '<!doctype html>');
    // MUTAÇÃO: `lang` fixo em `pt-br`, igual às demais views built-in — nunca
    // `en` por falta de um `locale` que o renderer jamais compartilha.
    assert.include(html, '<html lang="pt-br">');
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'session_expired.title'));
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'session_expired.body'));
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'session_expired.login_link'));
    assert.include(html, 'href="/account/login"');
  });

  test('cai no fallback `/account/login` quando `loginUrl` não é passado', async ({ assert }) => {
    const edge = makeEdge();

    const html = await edge.render('authkit::session-expired', {});

    assert.include(html, 'href="/account/login"');
  });
});
