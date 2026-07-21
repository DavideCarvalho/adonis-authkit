import { createHash } from 'node:crypto';
import { test } from '@japa/runner';
import { base64url, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { createDpopProof, dpopJwkThumbprint, generateDpopKeyPair } from '../src/dpop.js';

test.group('DPoP (client)', () => {
  test('generateDpopKeyPair gera par ES256 com JWK pública/privada exportável', async ({
    assert,
  }) => {
    const kp = await generateDpopKeyPair();
    assert.equal(kp.publicJwk.kty, 'EC');
    assert.equal(kp.publicJwk.crv, 'P-256');
    assert.isString(kp.publicJwk.x);
    assert.isString(kp.publicJwk.y);
    // privada tem o componente 'd'; pública não.
    assert.isString(kp.privateJwk.d);
    assert.isUndefined(kp.publicJwk.d);
  });

  test('createDpopProof produz JWT que verifica com a JWK pública embutida', async ({ assert }) => {
    const kp = await generateDpopKeyPair();
    const proof = await createDpopProof({
      key: kp,
      htm: 'post',
      htu: 'https://auth.test/token',
    });

    const header = decodeProtectedHeader(proof);
    assert.equal(header.typ, 'dpop+jwt');
    assert.equal(header.alg, 'ES256');
    assert.isObject(header.jwk);

    // verifica a assinatura com a jwk pública do header
    const pub = await importJWK(header.jwk as any, 'ES256');
    const { payload } = await jwtVerify(proof, pub);

    assert.isString(payload.jti);
    assert.equal(payload.htm, 'POST'); // normalizado para uppercase
    assert.equal(payload.htu, 'https://auth.test/token');
    assert.isNumber(payload.iat);
    assert.isUndefined(payload.ath);
  });

  test('inclui ath = base64url(sha256(accessToken)) quando accessToken é dado', async ({
    assert,
  }) => {
    const kp = await generateDpopKeyPair();
    const accessToken = 'at-abc-123';
    const proof = await createDpopProof({
      key: kp,
      htm: 'GET',
      htu: 'https://api.test/me',
      accessToken,
    });
    const pub = await importJWK(kp.publicJwk, 'ES256');
    const { payload } = await jwtVerify(proof, pub);

    const expected = base64url.encode(createHash('sha256').update(accessToken, 'ascii').digest());
    assert.equal(payload.ath, expected);
  });

  test('inclui nonce quando dado', async ({ assert }) => {
    const kp = await generateDpopKeyPair();
    const proof = await createDpopProof({
      key: kp,
      htm: 'POST',
      htu: 'https://auth.test/token',
      nonce: 'srv-nonce-1',
    });
    const pub = await importJWK(kp.publicJwk, 'ES256');
    const { payload } = await jwtVerify(proof, pub);
    assert.equal(payload.nonce, 'srv-nonce-1');
  });

  test('jti é único entre provas', async ({ assert }) => {
    const kp = await generateDpopKeyPair();
    const a = await createDpopProof({ key: kp, htm: 'POST', htu: 'https://auth.test/token' });
    const b = await createDpopProof({ key: kp, htm: 'POST', htu: 'https://auth.test/token' });
    const pa = await importJWK(kp.publicJwk, 'ES256');
    const [{ payload: pyA }, { payload: pyB }] = await Promise.all([
      jwtVerify(a, pa),
      jwtVerify(b, pa),
    ]);
    assert.notEqual(pyA.jti, pyB.jti);
  });

  test('dpopJwkThumbprint produz sha256 thumbprint estável', async ({ assert }) => {
    const kp = await generateDpopKeyPair();
    const t1 = await dpopJwkThumbprint(kp);
    const t2 = await dpopJwkThumbprint(kp);
    assert.equal(t1, t2);
    assert.isString(t1);
  });
});
