# Keystore v2 — Managed Key Rotation

**Data:** 2026-06-08
**Status:** Draft (aguardando review)
**Escopo:** `@dudousxd/adonis-authkit-server` — gestão das chaves de assinatura JWKS no modo `managed`.

---

## 1. Contexto e estado atual

O AuthKit assina tokens OIDC (ID token, access token JWT) com uma chave privada publicada (parte pública) no endpoint JWKS. Hoje o modo `managed` funciona assim:

- `jwks: 'auto'` resolve env-aware (`define_config.ts:950`): se `AUTHKIT_JWKS` existe → keyset inline em memória; senão → `{ source:'managed', algorithm:'RS256', store:'tmp/authkit_jwks.json' }`.
- `src/keys/keystore.ts`: funções **puras sobre `path: string`, fs síncrono**. `ensureKeystore` (boot), `rotateKeystore`/`planRotation`/`readKeystore`/`signingKeyAgeDays` (comando `authkit:keys:rotate`).
- O keystore persiste o **JWKS privado em JSON plaintext** (mode `0o600`). `toPublicJwks` deriva a parte pública.
- O provider consome `jwks` **na construção** (`build_provider.ts:168`); não há swap ao vivo. TTLs de sessão/token usam holders mutáveis lidos por request; **JWKS não**.

### Problemas que motivam o v2
1. **Storage cravado em arquivo plaintext.** Não dá pra usar bucket nem um secrets vault; a privada fica legível no disco/backup.
2. **Sem encryption at-rest** para backends "burros" (file/bucket).
3. **Rotação é manual e exige restart** — o próprio comando termina com *"Reinicie o processo"*. Janela de exposição da chave depende de alguém lembrar de rodar o comando.
4. **Fallback silencioso** de `jwks:'auto'` para disco (sem aviso de que a privada foi para o arquivo).

### Precedentes do repo a reusar (não inventar)
- **Encryption:** `appKeyEncrypter` em `lucid_account_store.ts` — import lazy de `@adonisjs/core/services/encryption`, encripta TOTP em repouso com APP_KEY, default ON, `false` desliga.
- **Peer opt-in lazy:** `avatar_storage.ts loadDrive()` / `rate_limit.ts` / `default_mailer.ts` — import por specifier-em-variável, fail-safe.
- **Runtime settings + admin console:** `otp_lockout`, `password_expiration`, `session_policy`, `token_ttl` — políticas em DB, configuráveis ao vivo pelo dashboard.
- **Holder mutável p/ runtime:** `sessionTtlHolder`/`tokenTtlHolder` em `oidc_service.ts` — config mudada sem restart.
- **Scheduler:** **NÃO existe** infra periódica na lib hoje (nenhum `setInterval`/`@adonisjs/scheduler`). A fatia D adiciona um housekeeping mínimo próprio da lib.

---

## 2. Por que rotacionar (racional que guia o design)

- **Segurança / raio de explosão:** a privada forja token válido para qualquer usuário. Rotação bound no tempo em que uma chave vazada é útil e em quantos tokens cada chave assinou.
- **Padrão OIDC:** o `kid` no header e o JWKS-como-conjunto existem *para* rotação. IdPs sérios (Google, MS, Auth0, Okta) rotacionam; FAPI/NIST exigem.
- **Resposta a incidente + cripto-agilidade:** `--retire` mata tokens antigos na hora; rotação migra algoritmo sem downtime.
- **Mecanismo (janela de sobreposição):** assina com UMA chave corrente; publica as públicas de TODAS; ao rotacionar mantém as antigas publicadas por um grace period (≥ TTL máx do token) e depois dropa. O `keep`/grace do código **já implementa isso corretamente** — falta ser automático e sem restart.

---

## 3. Objetivos / Não-objetivos

**Objetivos**
1. Storage do keystore **pluggável** via providers de cofre: file (default), drive/bucket, e secrets vaults de verdade (HashiCorp, AWS, GCP, Azure), + contrato para custom.
2. **Encryption at-rest** via APP_KEY, backend-aware (default ON p/ file/drive, OFF p/ vault real). _(0.x: sem migração de legado.)_
3. **Boot warning** no fallback `auto→disco`; idade da chave no `doctor`.
4. **Rotação agendada** age-based, housekeeping próprio da lib.
5. **Hot-reload**: a chave nova passa a assinar **sem restart** (inclusive na rotação manual).
6. **Dashboard**: painel de status + config de política + ações manuais (rotacionar/aposentar).

**Não-objetivos (por ora)**
- Chaves dentro de HSM/KMS com operação de assinatura remota (a abstração deixa porta aberta; aqui o vault **armazena** o keystore, a assinatura continua local via `jose`).
- Keysets por-tenant.
- Comportamento de cache de JWKS no cliente (responsabilidade do consumidor; é padrão).

---

## 4. Arquitetura por fatia

### Fatia A — Boot warning + idade no doctor (trivial, independente)
- No resolver do `define_config`, quando `config.jwks === 'auto'` **e** sem `AUTHKIT_JWKS`: resolver o logger do app (lazy, como o provider já faz) e emitir **um** `warn`:
  > `AuthKit: jwks 'auto' caiu no fallback de disco (<path>) — a chave privada de assinatura está persistida em arquivo. Para produção, defina AUTHKIT_JWKS (secret manager) ou configure jwks.store explicitamente.`
- `doctor`: novo check reportando a idade da chave corrente (`signingKeyAgeDays`); `warn` se > `maxAgeDays` da política (ou > 180d default quando rotação desligada).

### Fatia B — Providers de cofre (`KeystoreVault`) + encryption (FUNDAÇÃO)

**Ponto de extensão — a interface do cofre.** Novo módulo `src/keys/keystore_vault.ts`:

```ts
export interface KeystoreVault {
  /** Lê o blob persistido (possivelmente encriptado). null se ausente. */
  read(): Promise<string | null>
  /** Persiste o blob. */
  write(blob: string): Promise<void>
  /**
   * Token barato de detecção de mudança (kid corrente / versão / etag / mtime)
   * usado pelo poll de reload (Fatia C) sem ler o blob inteiro. Opcional:
   * sem ele, o poll cai para um read completo.
   */
  head?(): Promise<string | null>
}
```

**Providers** (cada um lazy-importa seu SDK; se `driver` selecionado mas SDK/package ausente → **erro alto no boot**, pois chave é crítica — diferente do avatar que degrada em silêncio):

| driver | backend | onde mora | deps (peer, lazy) | encrypt default |
|--------|---------|-----------|-------------------|-----------------|
| `file` | disco local (mode 0600) | **core** (`authkit-server`) | nenhuma | **ON** |
| `drive` | disk+key do `@adonisjs/drive` (S3/GCS/local) | **core** | `@adonisjs/drive` | **ON** |
| `hashicorp-vault` | KV v2 | package separado | `node-vault` | OFF (ligável) |
| `aws-secrets-manager` | Secret value | package separado | `@aws-sdk/client-secrets-manager` | OFF (ligável) |
| `gcp-secret-manager` | Secret version | package separado | `@google-cloud/secret-manager` | OFF (ligável) |
| `azure-key-vault` | Secret | package separado | `@azure/keyvault-secrets` | OFF (ligável) |
| _custom_ | qualquer | app do usuário | — | conforme `encrypt` |

**Packaging (decisão confirmada): cofres em packages separados.** O **core** (`authkit-server`) exporta a interface `KeystoreVault` + o codec/manager + os providers `file` (zero-dep, é o default) e `drive` (`@adonisjs/drive` já é peer estabelecido do repo, é o "bucket"). Os 4 cofres de verdade saem em packages dedicados, cada um puxando só o seu SDK:
- `@dudousxd/adonis-authkit-vault-hashicorp`
- `@dudousxd/adonis-authkit-vault-aws`
- `@dudousxd/adonis-authkit-vault-gcp`
- `@dudousxd/adonis-authkit-vault-azure`

Resolução do `driver` string → provider: o core mantém um registry com import lazy por specifier-em-variável (`@dudousxd/adonis-authkit-vault-aws` etc.); package não instalado + driver selecionado → erro alto nomeando o package a instalar. Assim o core não carrega 4 SDKs de cloud, e cada cofre versiona/publica independente.

> **Por que vaults reais default OFF:** eles já encriptam at-rest + fazem access control. Encriptar por cima (envelope) é **opcional** para defense-in-depth (o app guarda a chave, o vault guarda o ciphertext → nem o admin do vault lê), mas o default evita blobs opacos que o vault não introspecta. File/drive são blobs burros → encryption ON é o que protege a privada.

**Camada de encryption — codec com envelope.** Novo módulo `src/keys/keystore_codec.ts`:

```ts
export interface KeystoreCodec {
  encode(store: PersistedKeystore): Promise<string>   // serializa (+ encripta)
  decode(blob: string): Promise<PersistedKeystore>    // (decripta +) parseia
}
```

- **Envelope versionado:** `{ v: 2, enc: 'aes' | 'none', data: string }`.
- `PlaintextCodec` → `enc:'none'`, `data` = JSON do keystore.
- `EncryptedCodec(encrypter)` → `enc:'aes'`, `data` = `encrypter.encrypt(JSON)` (padrão `appKeyEncrypter`, lazy `@adonisjs/core/services/encryption`).
- **0.x — sem migração de legado:** não há keystore antigo para ler. `decode` aceita **só** o envelope `{v:2}`; qualquer outro formato → erro. (Um `tmp/authkit_jwks.json` plaintext pré-existente é efêmero: apagar uma vez → regenera encriptado.)

**Serviço que compõe tudo — `KeystoreManager`** (`src/keys/keystore_manager.ts`):
- Recebe `{ vault: KeystoreVault, codec: KeystoreCodec, alg }`.
- Métodos **async**: `ensure()`, `read()`, `rotate(keep, retire)`, `plan()`, `head()`.
- As helpers **puras** (`planRotation`, `signingKeyAgeDays`, `generateSigningJwk`, `toPublicJwks`) permanecem puras em `keystore.ts`; só os wrappers de I/O migram para o manager (que orquestra vault+codec). O fs síncrono direto sai.

**Evolução do config (`JwksConfig` managed):**
```ts
store?:
  | string                                                  // atalho p/ { driver:'file', path }
  | { driver: 'file'; path: string }
  | { driver: 'drive'; disk?: string; key: string }
  | { driver: 'hashicorp-vault'; endpoint: string; path: string; token?: string /* | auth */ }
  | { driver: 'aws-secrets-manager'; secretId: string; region?: string }
  | { driver: 'gcp-secret-manager'; name: string }
  | { driver: 'azure-key-vault'; vaultUrl: string; secretName: string }
  | KeystoreVault                                           // instância custom
encrypt?: boolean    // default backend-aware (ON file/drive, OFF vault real)
```
Back-compat: `store: 'tmp/x.json'` → `{ driver:'file', path:'tmp/x.json' }`. O fallback de `'auto'` continua escrevendo arquivo, **agora encriptado por default**.

**Custom vault (escape hatch):** aceitar uma instância implementando `KeystoreVault` direto no `store`. Doc mostra o contrato de 2–3 métodos com um exemplo (ex.: wrapper de um vault interno da empresa).

**Erros (chave é crítica — nada de silêncio):**
- Decrypt falhou em blob **não-legado** → `throw` no boot com mensagem clara (*"keystore encriptado não pôde ser decriptado — APP_KEY mudou? Restaure a APP_KEY anterior ou regenere com `authkit:keys:rotate --force-new`."*). **Nunca** regenerar em silêncio (mudaria o kid e invalidaria todos os tokens vivos).
- Read do vault/drive falhou no boot → `throw` nomeando driver+chave.

### Fatia C — Hot-reload (aplicar a chave nova ao vivo)

`OidcService` passa a ter o provider **swappável**:
- Extrair a construção (`buildProvider` + `wireProviderEvents` + `registerTokenExchange` + koa-mount) para um `#buildAndWire(config): { provider, callback }`.
- `reloadKeys(): Promise<void>` — relê o keystore via `KeystoreManager`, materializa `jwks` fresco, **constrói um provider NOVO** com o jwks novo (resto do config igual, holders passados por referência), e troca `this.#current = { provider, callback }` **atomicamente**. O route handler público delega via `this.#current.callback` (uma indireção) → requests em voo terminam no provider antigo, novos pegam o novo. O antigo é coletado (listeners vão junto).
- Se o rebuild falhar → **mantém o provider antigo servindo** (loga error), não derruba o serviço.

**Gatilho do reload (cross-process / multi-instância — decisão chave):**
- A rotação **agendada** (Fatia D) roda **dentro do processo que serve** → chama `oidcService.reloadKeys()` direto.
- O **comando ace** e **outras instâncias** rodam em processos separados → precisam de sinal. Solução v1: **poll do keystore** (housekeeping da lib, ex. a cada 60s) lê o `head()` do vault (kid/versão/etag — barato); se mudou desde o último load → `reloadKeys()`. Funciona p/ file e vault; o **bucket/vault compartilhado** é o que torna isso coerente entre máquinas (arquivo local por-instância não compartilharia). Sem pub/sub, sem infra extra.

### Fatia D — Rotação agendada + política + dashboard

**Runtime setting `key_rotation`** (nova entrada em `SETTING_KEYS`), shape:
```ts
{ enabled: boolean; maxAgeDays: number; keep: number }   // alg vem do jwksConfig
```
`resolveEffectiveKeyRotation(settings)` com defaults `{ enabled:false, maxAgeDays:90, keep:2 }` — **default OFF** (auto-rotação é mudança de comportamento; o dashboard liga).

**Housekeeping próprio da lib** (consistente com "housekeeping vem da lib, não do app"; como não há scheduler, adicionamos um mínimo):
- `KeyRotationScheduler` iniciado no hook `start()` do provider — **só no processo que serve**, **só** quando há keystore managed+store. Um `setInterval` (cadência configurável, ex. horária) cujo callback **com todos os imports resolvidos no topo do módulo (preferência: sem import dinâmico no callback)** faz:
  1. lê `key_rotation` efetivo; disabled → noop.
  2. lê `head` do keystore; computa `signingKeyAgeDays`.
  3. se idade ≥ `maxAgeDays` → adquire o **lock single-flight via `@adonisjs/lock`** → `rotate(keep)` → `oidcService.reloadKeys()` → audit `keys.rotated` (reason: `scheduled`) → solta o lock.
  - **Fail-safe:** qualquer erro vira `warn`, nunca derruba o processo.
- O mesmo loop hospeda o **poll de reload** da Fatia C (instâncias não-líder pegam a mudança).

**Lock single-flight — `@adonisjs/lock`** (peer opt-in, lazy, como limiter/drive):
- `lock.use(<store>).createLock('authkit:keys:rotate', ttlMs)` + `acquireImmediately()` (tenta uma vez sem esperar → boolean). Se `false` → outra instância já está rotacionando → pula (pega a chave nova depois via poll). `release()` no `finally`. É literalmente o padrão "só uma instância do job agendado roda por vez" da doc do `@adonisjs/lock`.
- Store (`database` via Lucid — tabela `locks` própria do package — ou `redis`) é escolhido/configurado pelo **host**; a lib só consome o service.
- **Degradação graciosa:** se `@adonisjs/lock` não estiver instalado, a lib assume **single-instance** e rotaciona sem lock (correto para 1 réplica). O doctor/doc avisa: *para auto-rotação multi-instância, instale e configure `@adonisjs/lock` com store compartilhado.* (A rotação manual via comando/dashboard não precisa de lock — é ato único deliberado.)

**Dashboard** (admin console, ao lado das outras settings):
- **Painel de status** (read-only): kid corrente, idade da chave, nº de chaves no set, lista de kids, última rotação (do audit `keys.rotated`), ETA da próxima (`maxAgeDays − idade`, se enabled).
- **Form de política:** toggle `enabled`, `maxAgeDays`, `keep` → grava `key_rotation`.
- **Ações:** "Rotacionar agora" → rotate+reload in-process (com confirm); "Aposentar antigas" (`retire`) → idem com confirm extra.
- **Endpoints admin** (guardados pela auth admin existente): `GET /admin/keys` (status), `POST /admin/keys/rotate` (`{retire?}`), `PUT /admin/settings/key_rotation`.

---

## 5. Fluxo de dados (rotação ponta-a-ponta)
1. Gatilho: scheduler **ou** "Rotacionar agora" no dashboard **ou** comando ace decide rotacionar.
2. `KeystoreManager.rotate` → gera kid novo, escreve o envelope (encriptado) no vault (file/bucket/secrets-manager).
3. In-process: `oidcService.reloadKeys()` reconstrói o provider com o jwks novo → o kid novo assina **imediatamente**; kids antigos seguem publicados (grace).
4. Outras instâncias: poll detecta mudança no `head` → `reloadKeys()`.
5. Clientes: próximo fetch do JWKS vê a nova pública; tokens com kid antigo validam até o grace dropar.
6. Audit `keys.rotated` registrado.

---

## 6. Tratamento de erros (resumo)
- **Boot:** decrypt fail (não-legado) → throw alto; read do vault fail → throw alto; fallback auto→disco → warn.
- **Rotação runtime (scheduler):** fail-safe (warn, sem crash); ação do dashboard mostra o erro na UI.
- **Reload:** rebuild falhou → mantém o provider antigo servindo (error logado), não derruba.
- **Lock:** instância não-líder pula a rotação e só recarrega via poll.

---

## 7. Testes
- **B:** round-trip do codec (plaintext + encriptado); formato irreconhecível dá throw; `FileVault` e `DriveVault` (drive fakeado como nos testes de avatar); vaults reais com SDK fakeado/injetado; decrypt-failure dá throw; atalho `store: string` resolve p/ FileVault.
- **C:** `reloadKeys` troca o provider, kid novo assina, kid antigo ainda no JWKS público; segurança de request em voo (indireção do callback); rebuild falho mantém o provider antigo.
- **D:** defaults/validação do resolver; scheduler dispara no limiar de idade (clock + keystore injetados); lock single-flight (dois schedulers, um rotaciona); poll detecta mudança de kid → reload; authz + ações dos endpoints admin; render do painel de status.

---

## 8. Decisões-chave
1. **Encryption default ON** para file/drive, **OFF** para vault real (ligável p/ envelope). _(0.x: sem migração de legado.)_ _(Alt: tudo OFF — menos seguro, mais simples.)_
2. **Decrypt fail / mudança de APP_KEY → throw alto, nunca auto-regenerar** (regenerar invalidaria todos os tokens vivos). Recuperação: restaurar APP_KEY ou `--force-new` explícito.
3. **Multi-instância:** vault/bucket compartilhado + **poll de reload por instância** + **lock single-flight via `@adonisjs/lock`** (peer opt-in, store db/redis do host) para o scheduler; sem o package → assume single-instance e rotaciona sem lock. _(Confirmado — `@adonisjs/lock.acquireImmediately()`.)_
4. **Scheduler é housekeeping da lib** (setInterval mínimo, callback com imports estáticos), **default OFF**, opt-in via dashboard. _(Alt: depender do scheduler do host + comando ace — contraria a preferência housekeeping-na-lib.)_
5. **Cofres em packages separados** ✅ (confirmado). Core exporta a interface + `file` + `drive`; `hashicorp/aws/gcp/azure` em `@dudousxd/adonis-authkit-vault-*` dedicados, resolvidos por registry lazy; erro alto se driver selecionado mas package ausente. _(Trade-off aceito: mais overhead de publish, em troca de isolamento de deps.)_
6. **Política default:** `maxAgeDays 90, keep 2, enabled false`.
7. **Cofres no v1:** os 4 grandes (HashiCorp, AWS, GCP, Azure) ✅ (confirmado).

---

## 9. Fatias de implementação (sequência)
**A** (warn + doctor) → **B** (vaults + encryption) → **C** (hot-reload) → **D** (scheduler + política + dashboard).
Cada uma entrega de forma independente; **B** destrava C/D; **C** é pré-requisito para o valor real de **D**. Cada fatia terá seu próprio plano de implementação.
