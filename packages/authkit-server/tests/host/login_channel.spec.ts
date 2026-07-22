import { test } from '@japa/runner';
import { __setMailLoaderForTests, sendMagicLinkEmail } from '../../src/host/default_mailer.js';
import { renderTransactionalEmail } from '../../src/host/email_templates.js';
import { magicChannelProp, normalizeLoginChannel } from '../../src/host/login_channel.js';

// ---------------------------------------------------------------------------
// Helpers puros: normalização do body + mapeamento para a prop de render
// ---------------------------------------------------------------------------

test.group('login channel — helpers puros', () => {
  test('normalizeLoginChannel aceita só "code" e "link"', ({ assert }) => {
    assert.equal(normalizeLoginChannel('code'), 'code');
    assert.equal(normalizeLoginChannel('link'), 'link');
  });

  test('normalizeLoginChannel: ausente/ inválido → undefined (= both)', ({ assert }) => {
    assert.isUndefined(normalizeLoginChannel(undefined));
    assert.isUndefined(normalizeLoginChannel(null));
    assert.isUndefined(normalizeLoginChannel(''));
    assert.isUndefined(normalizeLoginChannel('passkey'));
    assert.isUndefined(normalizeLoginChannel('BOTH'));
    assert.isUndefined(normalizeLoginChannel(42));
  });

  test('magicChannelProp: ausente → "both"; senão espelha o canal', ({ assert }) => {
    assert.equal(magicChannelProp(undefined), 'both');
    assert.equal(magicChannelProp('code'), 'code');
    assert.equal(magicChannelProp('link'), 'link');
  });
});

// ---------------------------------------------------------------------------
// Template: e-mail "só código" (sem ctaUrl) não tem botão nem fallback de link
// ---------------------------------------------------------------------------

test.group('login channel — template só-código (sem CTA)', () => {
  test('sem ctaUrl: sem botão, sem link de fallback, mas com o código', ({ assert }) => {
    const out = renderTransactionalEmail({
      brand: { appName: 'Acme' },
      subject: 'Seu código',
      heading: 'Entrar',
      intro: 'Use o código.',
      code: '135790',
      codeLabel: 'Digite este código:',
    });
    // Código em destaque.
    assert.include(out.html, '135790');
    assert.include(out.html, 'monospace');
    assert.include(out.text, '135790');
    // Nada de CTA: sem <a href de botão e sem o bloco de link de fallback.
    assert.notInclude(out.html, '<a href=');
    assert.notInclude(out.html, 'word-break:break-all');
  });
});

// ---------------------------------------------------------------------------
// sendMagicLinkEmail: o e-mail bate com o canal escolhido
// ---------------------------------------------------------------------------

const MAGIC_URL = 'https://host/auth/interaction/i1/magic?token=deadbeef';
const CODE = '135790';

/** Stub de @adonisjs/mail que captura a última mensagem. */
function captureMail(sent: any[]) {
  return {
    send: async (cb: any) => {
      const message: any = {
        from() {
          return this;
        },
        to(v: any) {
          this._to = v;
          return this;
        },
        subject(v: any) {
          this._subject = v;
          return this;
        },
        html(v: any) {
          this._html = v;
          return this;
        },
        text(v: any) {
          this._text = v;
          return this;
        },
      };
      cb(message);
      sent.push(message);
    },
  };
}

function fakeCtx() {
  return { logger: { info() {}, error() {} } } as any;
}

test.group('login channel — sendMagicLinkEmail bate com a escolha', (group) => {
  group.each.teardown(() => __setMailLoaderForTests(undefined));

  test('channel=code → só o código (sem o link no corpo)', async ({ assert }) => {
    const sent: any[] = [];
    __setMailLoaderForTests(() => Promise.resolve(captureMail(sent)));

    await sendMagicLinkEmail(fakeCtx(), {
      email: 'u@x.com',
      magicUrl: MAGIC_URL,
      code: CODE,
      channel: 'code',
    });

    assert.lengthOf(sent, 1);
    const { _html, _text, _subject } = sent[0];
    assert.equal(_subject, 'Your login code');
    assert.include(_html, CODE);
    assert.include(_text, CODE);
    // O link NÃO aparece no e-mail "só código".
    assert.notInclude(_html, MAGIC_URL);
    assert.notInclude(_text, MAGIC_URL);
  });

  test('channel=link → só o link (sem o código no corpo)', async ({ assert }) => {
    const sent: any[] = [];
    __setMailLoaderForTests(() => Promise.resolve(captureMail(sent)));

    await sendMagicLinkEmail(fakeCtx(), {
      email: 'u@x.com',
      magicUrl: MAGIC_URL,
      code: CODE,
      channel: 'link',
    });

    assert.lengthOf(sent, 1);
    const { _html, _text, _subject } = sent[0];
    assert.equal(_subject, 'Your login link');
    assert.include(_html, MAGIC_URL);
    // O código NÃO aparece no e-mail "só link".
    assert.notInclude(_html, CODE);
    assert.notInclude(_text, CODE);
    assert.notInclude(_html, 'letter-spacing:6px');
  });

  test('channel ausente → ambos (link E código) — back-compat', async ({ assert }) => {
    const sent: any[] = [];
    __setMailLoaderForTests(() => Promise.resolve(captureMail(sent)));

    await sendMagicLinkEmail(fakeCtx(), {
      email: 'u@x.com',
      magicUrl: MAGIC_URL,
      code: CODE,
    });

    assert.lengthOf(sent, 1);
    const { _html, _subject } = sent[0];
    assert.equal(_subject, 'Your login link');
    assert.include(_html, MAGIC_URL);
    assert.include(_html, CODE);
  });

  test('channel=code sem código emitido (OTP off) → cai no e-mail de link', async ({ assert }) => {
    const sent: any[] = [];
    __setMailLoaderForTests(() => Promise.resolve(captureMail(sent)));

    await sendMagicLinkEmail(fakeCtx(), {
      email: 'u@x.com',
      magicUrl: MAGIC_URL,
      channel: 'code',
    });

    assert.lengthOf(sent, 1);
    const { _html, _subject } = sent[0];
    // Sem código pra mostrar, degrada pro e-mail de link.
    assert.equal(_subject, 'Your login link');
    assert.include(_html, MAGIC_URL);
  });
});
