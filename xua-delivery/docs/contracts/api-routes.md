# Xuá Delivery — API Contracts

> Todas as rotas são Next.js Route Handlers em `app/api/`. Validação via Zod.

---

## 1. Rotas Implementadas (✅)

### AUTH

#### `POST /api/auth/register`
```
Input (Zod: registerSchema):
  { name: string, email: string, password: string(min 8), phone?: string }
Output 201:
  { id: string, name: string, email: string }
Errors: 400 (validação), 409 (email duplicado)
Cookie: Set-Cookie xua-token (httpOnly, 24h)
```

#### `POST /api/auth/login`
```
Input (Zod: loginSchema):
  { email: string, password: string }
Output 200:
  { token: string(JWT), user: { id, name, email, role } }
Errors: 400, 401 (credenciais inválidas)
Cookie: Set-Cookie xua-token (httpOnly, 24h)
```

#### `POST /api/auth/logout`
```
Input: (nenhum — cookie presente)
Output 200: { ok: true }
Side-effect: Cookie xua-token removido (maxAge=0)
⚠️ NOTA: NÃO invalida token no Redis (gap R-01)
```

---

### ORDERS

#### `GET /api/orders`
```
Auth: consumer | distributor_admin | support | ops
Query: ?status=DELIVERED&page=1&limit=20
Output 200:
  { orders: Order[], total: number, page: number }
Scoping:
  - consumer: apenas seus pedidos
  - distributor_admin: apenas pedidos do seu distribuidor
  - support/ops: todos
```

#### `POST /api/orders`
```
Auth: consumer
Input (Zod: createOrderSchema):
  {
    address_id: string(uuid),
    distributor_id: string(uuid),
    zone_id: string(uuid),
    delivery_date: string(YYYY-MM-DD),
    delivery_window: "MORNING" | "AFTERNOON",
    items: [{ product_id, product_name, unit_price_cents, quantity }]
  }
Output 201: Order (completo)
Errors: 400 (validação), 409 (slot esgotado)
Side-effects:
  - capacityService.reserve() (SELECT FOR UPDATE)
  - auditRepository.emit(ORDER_CREATED)
```

#### `GET /api/orders/[id]`
```
Auth: consumer (dono) | distributor_admin | driver | support | ops
Output 200: Order + items + audit_events
Errors: 404, 403 (IDOR protection)
```

#### `PATCH /api/orders/[id]`
```
Auth: varia por ação
Input: { action: string, ...payload }
Actions:
  "accept"            → distributor_admin → ACCEPTED_BY_DISTRIBUTOR
  "reject"            → distributor_admin → { reason, details? }
  "complete_checklist" → distributor_admin → READY_FOR_DISPATCH
  "dispatch"          → distributor_admin → OUT_FOR_DELIVERY
  "deliver"           → driver → DELIVERED
  "cancel"            → consumer|ops → { reason }
  "verify_otp"        → driver → { otp_code: string(6) }
  "otp_override"      → ops|support → { reason }
Output 200: Order (atualizado)
Errors: 400, 403, 404, 422 (INVALID_TRANSITION), 423 (OTP_LOCKED)
Side-effects: audit + Socket.io (pós-commit)
```

#### `POST /api/orders/[id]/rating`
```
Auth: consumer (dono do pedido)
Input (Zod: ratingSchema):
  { rating: number(1-5), comment?: string }
Output 200: { ok: true }
Prerequisite: status === DELIVERED
```

#### `POST /api/orders/[id]/bottle-exchange`
```
Auth: driver (motorista do pedido)
Input (Zod: bottleExchangeSchema):
  { returned_empty_qty: number, bottle_condition: "ok"|"damaged"|"dirty" }
Output 200: { ok: true }
Side-effects: audit(BOTTLE_EXCHANGE_RECORDED)
```

#### `POST /api/orders/[id]/empty-not-collected`
```
Auth: driver (motorista do pedido)
Input (Zod: nonCollectionSchema):
  { reason: string(select), notes?: string }
Output 200: { ok: true }
Side-effects: audit(EMPTY_NOT_COLLECTED)
```

---

### PAYMENTS

#### `POST /api/payments/webhook`
```
Auth: HMAC-SHA256 signature header
Input: { provider: string, event_ref: string, event_type: string, payload: object }
Output 200: { received: true }
Idempotency: UNIQUE(provider, event_ref) — duplicatas ignoradas
```

---

### SUBSCRIPTIONS

#### `GET /api/subscriptions`
```
Auth: consumer
Output 200: { subscriptions: Subscription[] }
Scoping: apenas do consumer autenticado
```

#### `POST /api/subscriptions`
```
Auth: consumer
Input:
  { product_id, quantity, delivery_window, address_id, distributor_id, zone_id }
Output 201: Subscription
```

---

### RECONCILIATIONS

#### `GET /api/reconciliations`
```
Auth: distributor_admin
Output 200: { reconciliations: Reconciliation[] }
```

#### `POST /api/reconciliations`
```
Auth: distributor_admin
Input (Zod: reconciliationSchema):
  { zone_id, filled_out_qty, empties_returned_qty, justification?: string }
Output 201: Reconciliation
Validation: justification obrigatória se delta > 0
```

---

### DRIVER

#### `GET /api/driver/deliveries`
```
Auth: driver
Query: ?date=YYYY-MM-DD (default: hoje)
Output 200: { deliveries: Order[] }
Scoping: apenas do motorista autenticado
```

---

### CONSUMERS

#### `GET /api/consumers/[id]/addresses`
```
Auth: consumer (dono)
Output 200: { addresses: Address[] }
```

#### `POST /api/consumers/[id]/addresses`
```
Auth: consumer (dono)
Input:
  { label, street, number, complement?, neighborhood, city, state, zip_code, zone_id?, is_default? }
Output 201: Address
Side-effect: CEP lookup via ViaCEP integration
```

---

### ZONES

#### `GET /api/zones/[id]/capacity`
```
Auth: consumer | ops
Query: ?date=YYYY-MM-DD (retorna 7 dias a partir da data)
Output 200: { slots: DeliveryCapacity[] }
```

---

## 2. Rotas Faltantes (❌)

| Rota | Método | Perfil | Descrição Documentada | Prioridade |
|---|---|---|---|---|
| `/api/orders/[id]/reschedule` | PATCH | ops/support | Reagendar entrega (nova data + janela) | 🔴 Alta |
| `/api/consumers/[id]` | PATCH | consumer | Editar perfil (nome, email, telefone) | 🟡 Média |
| `/api/subscriptions/[id]` | PATCH | consumer | Pausar / retomar / cancelar assinatura | 🔴 Alta |
| `/api/zones` | GET/POST | ops | CRUD de zonas (listar, criar) | 🟡 Média |
| `/api/zones/[id]` | PATCH/DELETE | ops | Editar/desativar zona | 🟡 Média |
| `/api/zones/[id]/coverage` | POST/DELETE | ops | Gerenciar cobertura (bairros/CEPs) | 🟡 Média |
| `/api/audit/export` | GET | ops | Exportar audit_events em CSV | 🟡 Média |
| `/api/notifications/subscribe` | POST | consumer | Registrar Web Push token | 🟡 Média |

---

## 3. Schemas Zod Implementados

| Schema | Local | Campos |
|---|---|---|
| `loginSchema` | `src/schemas/auth.ts` | email, password |
| `registerSchema` | `src/schemas/auth.ts` | name, email, password, phone? |
| `createOrderSchema` | `src/schemas/order.ts` | address_id, distributor_id, zone_id, delivery_date, delivery_window, items[] |
| `ratingSchema` | `src/schemas/order.ts` | rating (1-5), comment? |
| `bottleExchangeSchema` | `src/schemas/order.ts` | returned_empty_qty, bottle_condition |
| `nonCollectionSchema` | `src/schemas/order.ts` | reason, notes? |
| `rejectOrderSchema` | `src/schemas/order.ts` | reason, details? |
| `reconciliationSchema` | `src/schemas/order.ts` | zone_id, filled_out_qty, empties_returned_qty, justification? |

### Schemas Faltantes

| Schema | Uso | Prioridade |
|---|---|---|
| `rescheduleSchema` | Reagendamento (date + window) | 🔴 Alta |
| `subscriptionUpdateSchema` | Pause/resume/cancel | 🔴 Alta |
| `profileUpdateSchema` | Editar perfil | 🟡 Média |
| `zoneSchema` | CRUD zonas | 🟡 Média |
| `capacityConfigSchema` | Configurar capacidade | 🟡 Média |
| `auditExportSchema` | Filtros CSV (período, tipo, distribuidor) | 🟡 Média |

---

## 4. Socket.io Events (Server → Client)

| Evento | Sala | Payload | Status |
|---|---|---|---|
| `order_status_changed` | `consumer:{id}` | `{ orderId, status }` | ✅ Server emite, ❌ Client não escuta |
| `new_order` | `distributor:{id}` | `{ orderId, ... }` | ⚠️ Não encontrado no código (referenciado na doc) |
| `sla_warning` | `distributor:{id}` | `{ orderId, secondsRemaining }` | ❌ Não implementado |
