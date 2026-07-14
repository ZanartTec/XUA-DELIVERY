# Runbook — Migração para Redis separado (Cache × Queue) em produção

> **Escopo:** procedimento operacional para migrar o BullMQ da instância Redis
> compartilhada (`xua-redis`) para a instância dedicada (`xua-queue-redis`) no
> Render, sem downtime e sem perda de jobs.
>
> **Pré-requisitos (já entregues):**
> - Fase 1 (arquitetura): decisão de separação e política de memória por finalidade.
> - Fase 2 (backend): código resolve `CACHE_REDIS_URL` / `QUEUE_REDIS_URL` com
>   fallback para `REDIS_URL` (`apps/api/src/infra/redis/config.ts`); worker sem
>   uso de cache; `/readiness` com `checks.cache_redis` e status `"degraded"`.
> - Fase 3 (infra, este runbook): `render.yaml` com `xua-queue-redis`
>   (plan starter, `maxmemoryPolicy: noeviction`) e envs novas em `xua-api`
>   e `xua-worker`; `docker-compose.yml` local com `redis-cache` (6379) e
>   `redis-queue` (6380).

---

## 1. Visão geral da estratégia

Migração em **duas releases**, com janela de convivência:

| Etapa | Estado das envs | Onde o BullMQ roda |
|---|---|---|
| Hoje (pré-migração) | só `REDIS_URL` | `xua-redis` (compartilhado) |
| Release A (esta) | `REDIS_URL` + `CACHE_REDIS_URL` + `QUEUE_REDIS_URL` | `xua-queue-redis` (novo) |
| Release B (futura) | remove `REDIS_URL` | `xua-queue-redis` |

O fallback `REDIS_URL` fica ativo durante toda a Release A: se qualquer env
dedicada faltar, o processo sobe apontando para a instância antiga em vez de
falhar. Isso torna a migração reversível por simples remoção das envs novas.

## 2. Ordem de execução (Release A)

1. **Blueprint sync** — merge do `render.yaml` atualizado. O Render cria a
   instância `xua-queue-redis` (plan starter) e injeta `CACHE_REDIS_URL` /
   `QUEUE_REDIS_URL` via `fromService` em `xua-api` e `xua-worker`.
   - Conferir no dashboard que `xua-queue-redis` está com
     **maxmemory-policy = noeviction**. Se o campo `maxmemoryPolicy` do
     blueprint não tiver sido aplicado, configurar manualmente no dashboard
     **antes** de qualquer deploy dos serviços.
   - Conferir que `xua-redis` ficou com **volatile-lru** (cache puro).
2. **Escolher a mitigação de jobs delayed** (seção 3) e executá-la.
3. **Deploy** de `xua-api` e `xua-worker` (o blueprint sync já dispara;
   se necessário, redeploy manual na ordem worker → api).
4. **Validação** (seção 5).
5. **Release B (futura, separada):** remover `REDIS_URL` do `render.yaml`
   (api e worker) somente após validar em produção `fallback=false` nos logs
   de boot para as duas finalidades. Opcional: limpar chaves órfãs (seção 4).

## 3. Risco principal: jobs delayed vivos na instância antiga

No momento do switch, a instância antiga (`xua-redis`) pode conter jobs
**delayed** ainda não vencidos:

- `expire-payment-{orderId}` (fila `payments`) — delay ≈ `PAYMENT_EXPIRATION_MINUTES` (15 min).
- `expire-subscription-{id}` (fila `subscription-expiration`) — delay similar.

Após o deploy, o worker novo só escuta `xua-queue-redis`; jobs delayed na
instância antiga **nunca seriam processados**. Duas opções, escolha uma:

### Opção 1 (recomendada pelo arquiteto): janela de convivência com worker temporário

Manter um worker apontando para a URL antiga até o backlog esvaziar (~15–30 min):

1. Antes do deploy, criar um serviço worker temporário no Render (clone de
   `xua-worker`) — ou usar um processo local seguro com acesso à instância —
   com `QUEUE_REDIS_URL` apontando para a **connection string da `xua-redis`**
   (a antiga) e `DATABASE_URL` de produção.
2. Fazer o deploy normal (worker novo → fila nova).
3. O worker temporário drena os delayed remanescentes da instância antiga.
   Os processors são **idempotentes** — se um job for processado duas vezes
   (cenário improvável aqui, pois cada instância tem seu próprio conjunto de
   jobs), não há efeito colateral.
4. Monitorar até `delayed=0` e `waiting=0` nas filas da instância antiga
   (via `redis-cli` — seção 4 — ou logs do worker temporário ocioso).
5. Encerrar e deletar o worker temporário. Janela típica: 15–30 min.

### Opção 2: aceitar o pior caso + varredura manual

Aceitar que jobs delayed da instância antiga se perdem. Pior caso concreto:
pedido em `PENDING_PAYMENT` sem expiração automática (ficaria pendente para
sempre) e assinatura sem expiração do ciclo.

Mitigação pós-deploy — varredura manual única:

1. Listar pedidos `PENDING_PAYMENT` com `created_at` anterior ao deploy e mais
   antigos que `PAYMENT_EXPIRATION_MINUTES`.
2. Para cada um, disparar a expiração pelo caminho oficial (endpoint interno
   de jobs com `INTERNAL_SECRET`, ou enfileirar `expire-payment-{orderId}`
   na fila nova com delay 0 — o processor é idempotente: se o pagamento foi
   aprovado nesse meio-tempo, o job é no-op).
3. Repetir o raciocínio para assinaturas com expiração pendente. O cron de
   segurança de assinaturas (3x/dia) já cobre parte desse caso.

Escolha a Opção 2 apenas se o volume de pedidos no horário do deploy for baixo
(ex.: madrugada) e houver alguém disponível para a varredura.

### Job Schedulers (repeatable jobs)

**Nenhuma ação necessária.** Os schedulers recorrentes (`upsertJobScheduler`)
são recriados na instância nova no **primeiro boot do worker** — o upsert é
idempotente por design. As definições órfãs na instância antiga são inertes
(nenhum worker as escuta) e entram na limpeza da seção 4.

## 4. Limpeza da instância antiga (pós-validação, Release B)

A instância antiga (`xua-redis`) **continua servindo** cache, blacklist de JWT
e rate-limit — **NUNCA execute `FLUSHALL` / `FLUSHDB` nela**.

As chaves órfãs de fila seguem o prefixo `xua:production:queue:*`
(`QUEUE_PREFIX`, default `<REDIS_KEY_PREFIX>:queue`). Limpeza pontual com
`SCAN` + `UNLINK` (nunca `KEYS` em produção):

```bash
# Conectado na instância ANTIGA (xua-redis). Dry-run primeiro:
redis-cli -u "$OLD_REDIS_URL" --scan --pattern 'xua:production:queue:*' | head -50

# Remoção em lote (não bloqueante):
redis-cli -u "$OLD_REDIS_URL" --scan --pattern 'xua:production:queue:*' \
  | xargs -r -n 100 redis-cli -u "$OLD_REDIS_URL" unlink
```

Executar somente após: (a) logs confirmarem `fallback=false`, (b) filas novas
processando normalmente por pelo menos um ciclo completo de jobs recorrentes,
(c) janela de convivência encerrada.

## 5. Validação do switch (observabilidade)

### Logs de boot (Fase 2)

Cada processo loga, uma vez por finalidade, qual env var resolveu a URL:

```
[Redis:cache] URL resolvida via CACHE_REDIS_URL  { purpose: "cache", envVar: "CACHE_REDIS_URL", fallback: false, host: "<host>:<port>" }
[Redis:queue] URL resolvida via QUEUE_REDIS_URL  { purpose: "queue", envVar: "QUEUE_REDIS_URL", fallback: false, host: "<host>:<port>" }
```

Checklist pós-deploy:

- [ ] `xua-api`: `[Redis:cache]` com `fallback: false` e host da `xua-redis`.
- [ ] `xua-api`: `[Redis:queue]` com `fallback: false` e host da `xua-queue-redis`.
- [ ] `xua-worker`: `[Redis:queue]` com `fallback: false` e host da `xua-queue-redis`.
- [ ] `xua-worker`: **sem** log `[Redis:cache]` (worker não usa cache desde a Fase 2).
- [ ] Nenhum log com `fallback: true` — se aparecer, a env dedicada não foi
      injetada; verificar o blueprint sync antes de prosseguir.

### `/readiness` (contrato novo da Fase 2)

- `checks.database` ok + `checks.cache_redis` ok → `"ready"` (HTTP 200).
- `checks.cache_redis` falhando → `"degraded"` (HTTP **200** — cache é
  best-effort; não derruba o serviço do balanceador).
- `checks.database` falhando → HTTP **503**.

Durante a migração, `"degraded"` indica problema na instância de **cache**
(`xua-redis`), não na fila. Saúde da fila se valida pelos logs do worker e
pelo processamento de jobs (ex.: webhook de pagamento de teste).

### Verificações funcionais mínimas

- [ ] Criar pedido de teste → job `expire-payment-*` aparece como delayed na
      instância **nova** (`redis-cli -u "$QUEUE_REDIS_URL" --scan --pattern 'xua:production:queue:payments:*'`).
- [ ] Jobs recorrentes (otp-cleanup etc.) executando no horário — schedulers
      recriados no boot do worker.
- [ ] Webhook de pagamento processado fim a fim (fila `payment-webhooks`).
- [ ] Cache de produtos/banners populando na instância antiga (agora cache puro).

## 6. Rollback

Enquanto `REDIS_URL` existir (toda a Release A):

1. Remover `CACHE_REDIS_URL` e `QUEUE_REDIS_URL` de `xua-api` e `xua-worker`
   (dashboard ou revert do blueprint) e redeploy — o fallback devolve tudo
   para `xua-redis`.
2. Atenção ao espelho do risco da seção 3: jobs delayed criados na instância
   **nova** durante a tentativa ficam órfãos — aplicar a mesma mitigação
   (worker temporário apontando para `xua-queue-redis`, ou varredura manual).
3. Não deletar `xua-queue-redis` até decidir nova tentativa (evita recriação
   de instância e mudança de connection string).

## 7. Ambiente local (referência)

`docker-compose.yml` sobe as duas instâncias:

| Serviço | Porta host | Política | Persistência |
|---|---|---|---|
| `redis-cache` | 6379 | `volatile-lru`, 128 MB | não |
| `redis-queue` | 6380 | `noeviction`, 256 MB | AOF (`appendonly yes`) |

`.env` local (ver `apps/api/.env.example`):

```env
CACHE_REDIS_URL=redis://localhost:6379
QUEUE_REDIS_URL=redis://localhost:6380
# REDIS_URL segue aceito como fallback para setups antigos
```
