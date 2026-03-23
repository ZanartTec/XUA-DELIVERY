# Xuá Delivery — Research & Risk Analysis

> Gerado automaticamente a partir da análise completa do código-fonte e documentação.

---

## 1. Ambiguidades Resolvidas

### 1.1 Estado do Pedido: Fluxo Intermediário (CREATED → ACCEPTED)

**Ambiguidade:** A documentação (seção 3.4) descreve 9 passos com estados intermediários (`PAYMENT_PENDING`, `CONFIRMED`, `SENT_TO_DISTRIBUTOR`) entre `CREATED` e `ACCEPTED_BY_DISTRIBUTOR`. O código atual pula direto de `CREATED` para `ACCEPTED_BY_DISTRIBUTOR`.

**Resolução:** O `createOrder()` atual combina: criação + reserva de capacidade em uma transação. Os estados intermediários documentados representam o fluxo completo com gateway de pagamento integrado. Como o gateway ainda não foi implementado, o fluxo atual é um shortcut válido para MVP inicial. **Ação necessária:** implementar `PaymentService` + adaptar state machine para incluir os estados intermediários quando o gateway for integrado.

### 1.2 Role `operator` vs `driver`

**Ambiguidade:** A documentação usa `operator` como perfil JWT do motorista, mas o middleware referencia `driver` em `ROLE_ROUTES`. O seed cria o motorista com `role: "driver"`.

**Resolução:** O sistema usa `driver` como role efetivo. A documentação referencia `operator` como nome conceitual. O middleware, seed, e rotas API usam `driver`. **Sem ação — código está correto.**

### 1.3 Recharts nos KPIs

**Ambiguidade:** KPI pages (`/distributor/kpis` e `/ops/kpis`) existem com implementação real, mas contêm texto "Integração Recharts (placeholder)". O pacote `recharts` não está nas dependências.

**Resolução:** As páginas fazem fetch dos dados via `KpiService` mas os gráficos são placeholders. **Ação: instalar `recharts` e implementar `LineChart`/`BarChart` componentes reais.**

### 1.4 OTP no Dispatch

**Ambiguidade:** Documentação diz "OTP gerado ao despachar". O método `dispatch()` no `order-service.ts` NÃO chama `otpService.generate()`.

**Resolução:** O `OtpService` existe e funciona, mas não é invocado automaticamente no dispatch. **Ação: integrar chamada a `otpService.generate()` dentro de `dispatch()` após commit, antes do Socket.io emit.**

---

## 2. Riscos Identificados

### 2.1 Segurança — Críticos

| # | Risco | Severidade | Detalhe |
|---|---|---|---|
| R-01 | **JWT blacklist não implementada** | 🔴 Alta | `logout/route.ts` apenas limpa cookie. Token permanece válido até expiração (24h). Redis existe mas não é usado para blacklist. Atacante com token roubado tem 24h de acesso. |
| R-02 | **Trigger de proteção ausente** | 🔴 Alta | Documentação descreve `trg_09_trn_orders_status_regression` mas NÃO existe na migration SQL. Sem proteção em nível de banco contra regressão de estado. A state machine no código é a única proteção. |
| R-03 | **Rate limiting ausente** | 🟡 Média | Documentação (Semana 4) planeja rate limiting. Nenhuma implementação encontrada. Login e API de pedidos sem proteção contra brute-force. |

### 2.2 Funcionalidade — Críticos

| # | Risco | Severidade | Detalhe |
|---|---|---|---|
| R-04 | **Gateway de pagamento não integrado** | 🔴 Alta | Sem `PaymentService`, sem `IPaymentGateway`. Webhook route existe mas não há initiation de cobrança. Pedidos criados sem pagamento real. |
| R-05 | **Web Push / NotificationService ausente** | 🟡 Média | Tabela `ConsumerPushToken` existe no schema mas nenhum service, hook ou endpoint gerencia push tokens. Não há notificações push. |
| R-06 | **Socket.io client-side ausente** | 🟡 Média | `socket.io-client` não instalado. Nenhum hook `useSocket`. Frontend não recebe atualizações em tempo real. Server emite eventos para salas, mas ninguém escuta no browser. |
| R-07 | **PWA/Offline não implementado** | 🟡 Média | Sem Service Worker, sem Workbox, sem IndexedDB queue, sem `manifest.json`. `OfflineBanner` detecta offline mas a fila de sync não existe. Motorista não opera offline. |

### 2.3 Performance

| # | Risco | Severidade | Detalhe |
|---|---|---|---|
| R-08 | **Seed cria apenas 7 dias de capacidade** | 🟢 Baixa | Documentação pede 30 dias. Seed gera apenas 7. Checkout limitado à semana seguinte. |
| R-09 | **Sem cache Redis para catálogo** | 🟢 Baixa | Documentação menciona "cache catálogo 5min". Sem implementação de cache layer. Cada request ao catálogo consulta o banco. |

### 2.4 Escalabilidade

| # | Risco | Severidade | Detalhe |
|---|---|---|---|
| R-10 | **Single process Socket.io** | 🟢 Baixa | Socket.io no mesmo processo Next.js. Adequado para MVP. Se escalar para múltiplas instâncias, precisa de Redis adapter para Socket.io. |
| R-11 | **Sem testes automatizados** | 🟡 Média | Vitest/Supertest não instalados. Zero test files. Nenhum CI/CD. Risco de regressão em qualquer mudança. |

---

## 3. Dependências Faltantes (package.json)

| Pacote | Tipo | Uso Documentado | Status |
|---|---|---|---|
| `@tanstack/react-query` | dep | Server state, cache, revalidation | ❌ Ausente |
| `react-hook-form` | dep | Form handling + validação | ❌ Ausente |
| `@hookform/resolvers` | dep | Zod integration com RHF | ❌ Ausente |
| `recharts` | dep | KPI dashboards (gráficos) | ❌ Ausente |
| `socket.io-client` | dep | Frontend real-time | ❌ Ausente |
| `lucide-react` | dep | Ícones (shadcn pattern) | ❌ Ausente |
| `web-push` | dep | Web Push notifications | ❌ Ausente |
| `idb` | dep | IndexedDB (offline motorista) | ❌ Ausente |
| `workbox-precaching` | dep | Service Worker | ❌ Ausente |
| `workbox-strategies` | dep | SW cache strategies | ❌ Ausente |
| `pino` | dep | Structured logging | ❌ Ausente |
| `vitest` | devDep | Unit/integration testing | ❌ Ausente |
| `supertest` | devDep | API testing | ❌ Ausente |
| `@radix-ui/react-dialog` | dep | Dialogs (shadcn) | ❌ Ausente |
| `@radix-ui/react-select` | dep | Selects (shadcn) | ❌ Ausente |
| `@radix-ui/react-tabs` | dep | Tabs (shadcn) | ❌ Ausente |

---

## 4. Código Legado / Dead Code

| Item | Local | Detalhe |
|---|---|---|
| Estados DRAFT e PICKING | `prisma/schema.prisma` (enum) + `status-pill.tsx` | Definidos no enum e no componente visual, mas **nunca usados** em nenhum service, route ou transição. Status-pill faz mapping mas nenhum pedido chega nesses estados. |
| `deposit_amount_cents` no seed | `prisma/seed.ts` | Campo `deposit_amount_cents: 1000` no pedido seed mas o campo parece redundante com `deposit_cents`. |
| `consumer-repository.ts` | `src/repositories/` | Provavelmente subutilizado — precisa verificar se profile edit usa ou se os routes fazem Prisma direto. |

---

## 5. Inconsistências Documentação ↔ Código

| # | Documentação diz | Código faz | Impacto |
|---|---|---|---|
| I-01 | Fluxo: CREATED → PAYMENT_PENDING → CONFIRMED → SENT_TO_DISTRIBUTOR → ACCEPTED | State machine pula direto CREATED → ACCEPTED | Médio — fluxo simplificado, aceitável pré-gateway |
| I-02 | "OTP gerado ao despachar" | `dispatch()` não gera OTP | Alto — motorista não recebe OTP para validar |
| I-03 | "JWT blacklist Redis no logout" | Logout apenas limpa cookie | Alto — token válido por 24h após logout |
| I-04 | "Webhook HMAC verificação" | payments/webhook verifica HMAC ✅ | OK |
| I-05 | "Trigger proteção banco" | Migration SQL não contém trigger | Médio — state machine app-level é única proteção |
| I-06 | "TanStack Query para server state" | Não instalado, não usado | Médio — pages provavelmente usam fetch direto |
| I-07 | "React Hook Form + Zod nos forms" | RHF não instalado | Médio — forms funcionam mas sem validação client-side |
| I-08 | "Recharts nos KPIs" | Placeholder text, lib não instalada | Baixo — dados prontos, falta renderização |
| I-09 | "Socket.io client-side real-time" | socket.io-client não instalado | Alto — zero real-time no frontend |
| I-10 | "PWA Workbox + IndexedDB offline" | Nenhuma implementação | Médio — motorista não opera offline |
| I-11 | "Seed 30 dias capacidade" | Seed gera 7 dias | Baixo — fácil de corrigir |
| I-12 | "RBAC: operator para motorista" | Código usa "driver" | Baixo — código está correto, doc desatualizada |
| I-13 | "`services/api/client.ts` fetch wrapper" | Não existe | Médio — frontend faz fetch manual |

---

## 6. Decisões Arquiteturais Validadas

As seguintes decisões estão implementadas corretamente conforme documentação:

1. ✅ **Services layer** — toda lógica de negócio em `src/services/`
2. ✅ **Repositories pattern** — Prisma queries isoladas em `src/repositories/`
3. ✅ **Audit atômico** — `auditRepository.emit()` na mesma transação
4. ✅ **Socket.io pós-commit** — emissão após transação commitada
5. ✅ **Anti-overbooking** — `SELECT FOR UPDATE` via `capacityService.reserve()`
6. ✅ **OTP HMAC** — hash seguro, max 5 tentativas, TTL 90min
7. ✅ **Webhook idempotente** — duplicate key ignorado
8. ✅ **RBAC middleware** — proteção de rotas pages + API
9. ✅ **Zustand stores** — auth + cart com persist
10. ✅ **Zod schemas** — validação server-side em todas as routes
11. ✅ **Deposit Regra A** — release quando DELIVERED + collected ≥ 1
12. ✅ **Cron jobs** — subscriptions 06h + OTP cleanup 15min
13. ✅ **Security audit** — 22 vulnerabilidades encontradas e corrigidas
