# XUA Delivery — Relatório de Correções de Segurança v1

> Todas as 22 vulnerabilidades identificadas na Auditoria de Segurança v1 foram corrigidas.
> `tsc --noEmit` → **0 erros** após todas as alterações.

---

## Checklist — Correções por Prioridade

### 🔴 P0 — Crítico (5/5 ✅)

| ID | Problema | Correção | Arquivo(s) |
|----|----------|----------|------------|
| SEC-01 | Socket.io aceita role/userId do cliente | JWT `verifyToken()` no handshake; salas montadas pelo payload | `server.ts` |
| SEC-02 | APIs sem RBAC no middleware | `API_ROLE_ROUTES` map com verificação per-role; JSON 401/403 | `middleware.ts` |
| SEC-03 | JWT_SECRET / OTP_SECRET hardcoded | Fail-fast `throw new Error("FATAL: ...")` se env var ausente | `src/lib/auth.ts`, `src/services/otp-service.ts`, `middleware.ts` |
| SEC-04 | Webhook sem assinatura HMAC | HMAC-SHA256 + `timingSafeEqual`; `PAYMENT_WEBHOOK_SECRET` env | `app/api/payments/webhook/route.ts` |
| SEC-05 | IDOR em rotas de pedido | Ownership check (`consumer_id`, `distributor_id`, `driver_id`) | `consumers/[id]/addresses`, `orders/route`, `orders/[id]/route`, `rating`, `bottle-exchange`, `empty-not-collected` |
| SEC-06 | DB credentials hardcoded | Fail-fast se `DATABASE_URL` ausente | `src/lib/db.ts` |

### 🟠 P1 — Alto (7/7 ✅)

| ID | Problema | Correção | Arquivo(s) |
|----|----------|----------|------------|
| SEC-07 | `returning("*")` vaza `password_hash` | `returning([...SAFE_COLUMNS])` sem `password_hash` | `src/repositories/consumer-repository.ts` |
| SEC-08 | SQL wildcard injection em scope=support | Sanitização `replace(/[%_\\]/g, "")` + mínimo 3 chars | `app/api/orders/route.ts` |
| SEC-09 | Audit events com eventType errado | `BOTTLE_EXCHANGE_RECORDED`, `EMPTY_NOT_COLLECTED`, `DAILY_RECONCILIATION_CLOSED`, `PAYMENT_CAPTURED` | `bottle-exchange`, `empty-not-collected`, `reconciliations`, `webhook` |
| SEC-12 | scope=distributor sem role check | `role !== "distributor_admin"` → 403 | `app/api/orders/route.ts` |
| ARCH-02 | Nomes de tabelas inconsistentes | `TABLES.*` constantes centralizadas; todos os route handlers migrados | `src/lib/tables.ts` + **14 arquivos** |
| FUNC-01 | OTP race condition | `findActiveForUpdate()` com `SELECT FOR UPDATE` dentro de transação | `src/services/otp-service.ts`, `src/repositories/otp-repository.ts` |
| ARCH-05 | Sem error handler global | `withErrorHandling()` HOF com mapeamento erro→HTTP status | `src/lib/api-handler.ts` |

### 🟡 P2 — Médio (10/10 ✅)

| ID | Problema | Correção | Arquivo(s) |
|----|----------|----------|------------|
| ARCH-03 | Sem state machine para OrderStatus | `VALID_TRANSITIONS` map + `assertTransition()` em todos os métodos | `src/services/order-service.ts` |
| ARCH-04 | `createOrder` sem reserva de capacidade | `capacityService.reserve()` dentro da transação do pedido | `src/services/order-service.ts` |
| PERF-01 | KPI N+1 com JS join | CTE SQL única com `LEFT JOIN` e `EXTRACT(EPOCH)` | `src/services/kpi-service.ts` |
| PERF-02 | Subscription cron sem batch | Paginação com `LIMIT 50 OFFSET` | `src/services/subscription-cron.ts` |
| PERF-03 | capacityService cria transação interna | Aceita `externalTrx?` opcional | `src/services/capacity-service.ts` |
| SEC-10 | Cookie maxAge 7d vs JWT 24h | `maxAge: 60 * 60 * 24` (24h) | `auth/register`, `auth/login` |
| SEC-11 | Role `driver` ausente no auth store | Adicionado ao union type | `src/store/auth.ts` |
| FUNC-02 | Date overflow (31 jan → 3 mar) | `nextMonthSameDay()` com `Math.min(day, lastDay)` | `src/services/subscription-cron.ts` |
| FUNC-03 | `distributorId: ""` no createOrder | Lookup `zone.distributor_id` via endereço do consumidor | `app/api/orders/route.ts` |
| FUNC-04 | Phone opcional no register | `phone: z.string().min(8)` sem `.optional()` | `src/schemas/auth.ts` |

---

## Arquivos Modificados (20 arquivos)

### Novos
1. `src/lib/tables.ts` — Constantes de tabelas
2. `src/lib/api-handler.ts` — Error handler global

### Alterados
3. `src/lib/auth.ts`
4. `src/lib/db.ts`
5. `server.ts`
6. `middleware.ts`
7. `src/services/otp-service.ts`
8. `src/services/order-service.ts`
9. `src/services/capacity-service.ts`
10. `src/services/kpi-service.ts`
11. `src/services/subscription-cron.ts`
12. `src/repositories/consumer-repository.ts`
13. `src/repositories/otp-repository.ts`
14. `app/api/payments/webhook/route.ts`
15. `app/api/orders/route.ts`
16. `app/api/orders/[id]/route.ts`
17. `app/api/orders/[id]/rating/route.ts`
18. `app/api/orders/[id]/bottle-exchange/route.ts`
19. `app/api/orders/[id]/empty-not-collected/route.ts`
20. `app/api/consumers/[id]/addresses/route.ts`
21. `app/api/reconciliations/route.ts`
22. `app/api/subscriptions/route.ts`
23. `app/api/driver/deliveries/route.ts`
24. `app/api/auth/register/route.ts`
25. `app/api/auth/login/route.ts`
26. `src/store/auth.ts`
27. `src/schemas/auth.ts`

---

## Testes Recomendados

### Segurança (P0)
- [ ] Socket.io: conexão SEM token → desconecta
- [ ] Socket.io: token válido → entra na sala correta
- [ ] API sem cookie → 401 JSON
- [ ] API com role inválida → 403 JSON
- [ ] Webhook sem header `x-webhook-signature` → 401
- [ ] Webhook com assinatura inválida → 401
- [ ] GET `/api/orders/[id]` com consumer_id diferente → 403
- [ ] POST `/api/orders/[id]/rating` com outro consumidor → 403
- [ ] POST `/api/orders/[id]/bottle-exchange` com outro motorista → 403
- [ ] GET `/api/orders?scope=distributor` com role consumer → 403
- [ ] GET `/api/orders?scope=support` com role consumer → 403
- [ ] GET `/api/orders?scope=support&q=ab` (< 3 chars) → 400

### Funcional (P1/P2)
- [ ] Criar pedido → capacidade reservada atomicamente
- [ ] Criar pedido com slot cheio → 409
- [ ] Transição `CREATED → DELIVERED` direto → erro `INVALID_TRANSITION`
- [ ] Transição `CANCELLED → ACCEPTED` → erro `INVALID_TRANSITION`
- [ ] OTP: 2 validações simultâneas → apenas 1 sucede (sem race condition)
- [ ] OTP: 5 tentativas → status `locked`
- [ ] Registro sem telefone → 400 (campo obrigatório)
- [ ] Cookie maxAge = 24h (verificar via dev tools)
- [ ] Subscription cron: dia 31/jan → próx = 28/fev (não 3/mar)
- [ ] Audit events: verificar eventType correto em cada operação

### Performance
- [ ] KPI slaAcceptance → executa 1 query SQL (não N+1)
- [ ] Subscription cron com 200 assinaturas → processa em lotes de 50

---

## Variáveis de Ambiente Necessárias

```env
JWT_SECRET=<chave-secreta-256-bits-minimo>
OTP_SECRET=<chave-secreta-hmac>
DATABASE_URL=postgresql://user:pass@host:5432/xua_delivery
PAYMENT_WEBHOOK_SECRET=<chave-fornecida-pelo-gateway>
```

---

## Melhorias Futuras Sugeridas

1. **Rate limiting** — Implementar rate limit por IP/userId nas APIs críticas (login, OTP, webhook)
2. **CSRF** — Token CSRF para formulários (double-submit cookie pattern)
3. **Helmet headers** — Adicionar `Content-Security-Policy`, `X-Frame-Options` no Next.js config
4. **Audit log imutável** — Migrar audit_events para tabela append-only com trigger que impede UPDATE/DELETE
5. **Rotação de segredos** — Suportar múltiplos JWT_SECRET para rolling rotation sem downtime
6. **Monitoramento** — Alertas para: 5+ OTPs locked/hora, webhooks com assinatura inválida, transições inválidas
7. **Testes E2E** — Playwright para fluxos críticos (checkout, entrega, OTP)
8. **RBAC granular** — Migrar de role-based para permission-based (tabela de permissões)
9. **Criptografia em repouso** — Encrypt PII (email, phone) at-rest no PostgreSQL
10. **Dependency audit** — `npm audit` automatizado no CI/CD
