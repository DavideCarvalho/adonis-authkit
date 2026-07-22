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

/**
 * ctx fake com container + response instrumentados para a fase de recuperação.
 *
 * O `response` replica o contrato mínimo do http-server que a recuperação usa:
 * `status()`, `redirect()`, `send()` e o getter `hasLazyBody` (que vira `true`
 * assim que um body é escrito). Isso permite ASSERTAR que o modo `screen`
 * ESCREVE o body na resposta — não só o retorna —, que é o cerne do bugfix:
 * no caminho de exception handler o valor retornado de `handle()` é descartado,
 * então sem o `send()` o corpo nunca sai (400 vazio).
 */
function recoveryCtx(cfg: Record<string, unknown>) {
  const rendered: Array<{ view: string; props: Record<string, unknown> }> = [];
  let redirectedTo: string | undefined;
  let statusSet: number | undefined;
  let sentBody: unknown;
  let sendCalls = 0;
  let hasLazyBody = false;
  const ctx = {
    containerResolver: { make: async () => ({ config: cfg }) },
    response: {
      get hasLazyBody() {
        return hasLazyBody;
      },
      status(code: number) {
        statusSet = code;
        return this;
      },
      send(body: unknown) {
        sentBody = body;
        sendCalls += 1;
        hasLazyBody = true;
        return this;
      },
      redirect(url: string) {
        redirectedTo = url;
        hasLazyBody = true;
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
    get sentBody() {
      return sentBody;
    },
    get sendCalls() {
      return sendCalls;
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
    // MUTAÇÃO (o BUG): o modo screen precisa ESCREVER o body na resposta, não só
    // retorná-lo. No exception path o retorno de `handle()` é descartado; sem o
    // `response.send(body)` o corpo nunca sai → 400 vazio. Removê-lo deixa este
    // assert vermelho (sentBody === undefined).
    assert.equal(h.sentBody, 'RENDERED');
    assert.equal(h.sendCalls, 1);
    // MUTAÇÃO: screen NÃO redireciona.
    assert.isUndefined(h.redirectedTo);
  });

  test('mode screen NÃO faz double-write se o renderer já escreveu (guard hasLazyBody)', async ({
    assert,
  }) => {
    // Um renderer que escreve ele mesmo (seta lazy body) e devolve o próprio
    // response NÃO deve provocar um segundo `send` — o guard `!hasLazyBody`
    // (+ `body !== ctx.response`) do contrato canWriteResponseBody cobre isso.
    const h = recoveryCtx({});
    (h.ctx.containerResolver.make as any) = async () => ({
      config: {
        interactionRecovery: { mode: 'screen' },
        render: (c: any) => {
          c.response.send('WRITTEN-BY-RENDERER');
          return c.response;
        },
      },
    });
    await recoverLostInteraction(h.ctx);
    assert.equal(h.sentBody, 'WRITTEN-BY-RENDERER');
    // Exatamente 1 send (o do renderer); a recuperação não duplica.
    assert.equal(h.sendCalls, 1);
  });

  test('mode screen escreve o body dos DOIS renderers (Edge e Inertia retornam valor)', async ({
    assert,
  }) => {
    // Tanto o Edge (`view.render`) quanto o Inertia (`inertia.render`) RETORNAM
    // o payload em vez de escrever; a recuperação faz o `send` para ambos. Aqui
    // parametrizamos o valor retornado por dois sentinelas distintos e provamos
    // que qualquer que seja o renderer, o body chega à resposta via `send`.
    for (const payload of ['EDGE-HTML', { component: 'inertia/session-expired' }]) {
      const h = recoveryCtx({});
      (h.ctx.containerResolver.make as any) = async () => ({
        config: {
          interactionRecovery: { mode: 'screen' },
          render: async () => payload,
        },
      });
      const r = await recoverLostInteraction(h.ctx);
      assert.deepEqual(r, payload);
      assert.deepEqual(h.sentBody, payload);
      assert.equal(h.sendCalls, 1);
      assert.equal(h.statusSet, 400);
    }
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
    // O `handle()` da exceção precisa deixar o body ESCRITO na resposta (o
    // retorno é descartado pelo exception handler do AdonisJS).
    assert.equal(h.sentBody, 'RENDERED');
    assert.equal(h.sendCalls, 1);
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
