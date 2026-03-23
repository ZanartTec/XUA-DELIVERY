# 🔒 Auditoria de Segurança & Arquitetura — Xuá Delivery v3.0

> ⚠️ **Nota (Julho 2025):** Esta auditoria foi realizada antes da migração Knex.js → Prisma ORM. Todas as referências a `Knex`, `Knex.Config` e `Knex.Transaction` neste documento refletem o estado anterior do código. A base de código atual utiliza **Prisma 7.x** com transações interativas (`prisma.$transaction`).

**Auditor**: Engenheiro de Segurança Sênior / Arquiteto de Software  
**Data**: Junho 2025  
**Escopo**: Codebase completo (41 arquivos `.ts` + `.tsx`)  
**Metodologia**: OWASP Top 10, STRIDE, Clean Architecture, Next.js Best Practices  

---

## Índice

1. [Resumo Executivo](#resumo-executivo)  
2. [Pilar 1 — Segurança & Vazamento de Dados (Críticas)](#pilar-1)  
3. [Pilar 2 — Performance & Next.js](#pilar-2)  
4. [Pilar 3 — Arquitetura & Clean Code](#pilar-3)  
5. [Pilar 4 — Funcionalidade & Edge Cases](#pilar-4)  
6. [Matriz de Priorização](#matriz-de-priorizacao)  

---

<a name="resumo-executivo"></a>
## Resumo Executivo

| Severidade | Quantidade |
|-----------|-----------|
| 🔴 CRÍTICA | 5 |
| 🟠 ALTA | 7 |
| 🟡 MÉDIA | 6 |
| 🔵 BAIXA | 4 |

Foram identificadas **22 vulnerabilidades/problemas** distribuídos nos 4 pilares. As 5 vulnerabilidades críticas são showstoppers para produção e **precisam ser corrigidas antes de qualquer deploy**.

---

<a name="pilar-1"></a>
## Pilar 1 — Segurança & Vazamento de Dados

### SEC-01 🔴 CRÍTICA — Socket.io SEM autenticação JWT

**Arquivo**: `server.ts` (linhas 36-44)  
**OWASP**: A07 — Identification and Authentication Failures  

**Risco**: Qualquer cliente pode conectar via WebSocket alegando qualquer `role` e `userId` no handshake. Um atacante pode:
- Ouvir todos os eventos de qualquer consumidor/distribuidor
- Receber notificações de status de qualquer pedido
- Impersonar qualquer usuário no sistema real-time

**Código atual**:
```ts
io.on("connection", (socket) => {
  const { role, userId } = socket.handshake.auth as {
    role: string;
    userId: string;
  };
  if (role && userId) {
    socket.join(`${role}:${userId}`);
  }
});
```

**Código corrigido**:
```ts
import { verifyToken } from "./src/lib/auth";

io.on("connection", async (socket) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect(true);
      return;
    }

    const payload = await verifyToken(token);
    if (!payload?.sub || !payload?.role) {
      socket.disconnect(true);
      return;
    }

    // Dados derivados do JWT, não do cliente
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    socket.join(`${payload.role}:${payload.sub}`);
  } catch {
    socket.disconnect(true);
  }
});
```

---

### SEC-02 🔴 CRÍTICA — API Routes ISENTAS de RBAC no middleware

**Arquivo**: `middleware.ts` (linha 62)  
**OWASP**: A01 — Broken Access Control  

**Risco**: A condição `!pathname.startsWith("/api")` isenta todas as API routes da verificação de role. Qualquer usuário autenticado (consumer, driver etc.) pode chamar qualquer API — inclusive endpoints administrativos como `/api/reconciliations`, `/api/orders/[id]` com action `otp_override`, e `/api/driver/deliveries`.

**Código atual**:
```ts
if (!hasAccess && !pathname.startsWith("/api")) {
  const redirectPath = ROLE_REDIRECTS[role] || "/login";
  return NextResponse.redirect(new URL(redirectPath, request.url));
}
```

**Código corrigido**:
```ts
// Mapa de RBAC para API routes
const API_ROLE_ROUTES: Record<string, string[]> = {
  consumer: ["/api/orders", "/api/consumers", "/api/subscriptions", "/api/zones"],
  distributor_admin: ["/api/orders", "/api/reconciliations", "/api/zones"],
  operator: ["/api/driver", "/api/orders"],
  driver: ["/api/driver", "/api/orders"],
  support: ["/api/orders", "/api/ops"],
  ops: ["/api/orders", "/api/ops", "/api/reconciliations"],
};

// No lugar da condição antiga:
if (!hasAccess) {
  if (pathname.startsWith("/api")) {
    // RBAC para APIs também
    const apiRoutes = API_ROLE_ROUTES[role];
    const apiAccess = apiRoutes?.some((route) => pathname.startsWith(route));
    if (!apiAccess) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  } else {
    const redirectPath = ROLE_REDIRECTS[role] || "/login";
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }
}
```

---

### SEC-03 🔴 CRÍTICA — JWT Secret hardcoded em 2 arquivos

**Arquivos**: `src/lib/auth.ts` (linha 6), `middleware.ts` (linha 4)  
**OWASP**: A02 — Cryptographic Failures  

**Risco**: O segredo `"xua-delivery-secret-change-in-production"` é idêntico em dois arquivos e está commitado no Git. Se `JWT_SECRET` não estiver definido no env, qualquer pessoa com acesso ao repositório pode forjar JWTs válidos para qualquer role.

**Código corrigido** (ambos arquivos):
```ts
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error(
    "FATAL: JWT_SECRET não definido. Defina a variável de ambiente antes de iniciar."
  );
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
```

**Complemento**: O mesmo problema ocorre em `src/services/otp-service.ts` (linha 7) com `OTP_SECRET`:
```ts
const OTP_SECRET = process.env.OTP_SECRET || "xua-otp-secret-change-me";
```
Corrigir igualmente com fail-fast.

---

### SEC-04 🔴 CRÍTICA — Webhook de pagamento SEM verificação de assinatura

**Arquivo**: `app/api/payments/webhook/route.ts`  
**OWASP**: A08 — Software and Data Integrity Failures  

**Risco**: O endpoint aceita qualquer POST sem validar HMAC/assinatura do gateway de pagamento. Um atacante pode:
- Marcar qualquer pedido como `paid` enviando `{ event: "x", payment_id: "x", order_id: "<target>", status: "approved" }`
- Provocar refunds falsos
- Manipular o status de pagamento de qualquer pedido

**Código corrigido**:
```ts
import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("FATAL: PAYMENT_WEBHOOK_SECRET não definido");
}

export async function POST(req: NextRequest) {
  // Verificação de assinatura HMAC do gateway
  const signature = req.headers.get("x-webhook-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente" }, { status: 401 });
  }

  const rawBody = await req.text();
  const expectedSig = createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  // ... restante da lógica
}
```

---

### SEC-05 🔴 CRÍTICA — IDOR em múltiplos Route Handlers (sem verificação de ownership)

**Arquivos**: `app/api/orders/[id]/route.ts`, `app/api/orders/[id]/rating/route.ts`, `app/api/orders/[id]/bottle-exchange/route.ts`, `app/api/orders/[id]/empty-not-collected/route.ts`, `app/api/consumers/[id]/addresses/route.ts`  
**OWASP**: A01 — Broken Access Control (IDOR)  

**Risco**: Nenhum Route Handler verifica se o `orderId` (ou `consumerId` no caso de addresses) pertence ao usuário autenticado. Qualquer consumidor autenticado pode:
- Ver, aceitar, rejeitar, cancelar qualquer pedido de qualquer usuário
- Avaliar pedidos de outros consumidores
- Listar/criar endereços em contas de outros consumidores

**Exemplo — `GET /api/consumers/[id]/addresses`**:
```ts
// Atual: usa o [id] da URL sem verificar se é o usuário logado
const addresses = await db("addresses")
  .where({ consumer_id: id })  // 'id' vem da URL, NÃO do token!
```

**Código corrigido — padrão para todos os handlers**:
```ts
// Em orders/[id]/route.ts — GET
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");

  const order = await db("orders").where({ id }).first();
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  // Verificação de ownership por role
  if (role === "consumer" && order.consumer_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  if (role === "distributor_admin" && order.distributor_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  if (role === "driver" && order.driver_id !== userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  // ops/support podem ver qualquer pedido

  // ... continua
}

// Em consumers/[id]/addresses/route.ts
const userId = req.headers.get("x-user-id");
if (id !== userId) {
  return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
}
```

---

### SEC-06 🟠 ALTA — Hardcoded DB credentials

**Arquivo**: `src/lib/db.ts` (linhas 6-10)  
**OWASP**: A02 — Cryptographic Failures  

**Risco**: Credenciais `user: "xua"`, `password: "xua_secret_change_me"` commitadas no Git. Se `DATABASE_URL` não estiver definido, o sistema tenta conectar com essas credenciais.

**Código corrigido**:
```ts
const connectionConfig = process.env.DATABASE_URL;
if (!connectionConfig) {
  throw new Error(
    "FATAL: DATABASE_URL não definido. Defina a variável de ambiente."
  );
}

const config: Knex.Config = {
  client: "pg",
  connection: connectionConfig,
  pool: { min: 2, max: 10 },
};
```

---

### SEC-07 🟠 ALTA — `consumer-repository.ts` vaza `password_hash` na resposta

**Arquivo**: `src/repositories/consumer-repository.ts`  
**OWASP**: A01 — Broken Access Control  

**Risco**: `returning("*")` no `create()` e `update()` incluem `password_hash` no resultado que pode vazar para o client em respostas JSON.

**Código corrigido**:
```ts
// Substituir returning("*") por lista explícita
const SAFE_COLUMNS = ["id", "name", "email", "phone", "is_b2b", "created_at", "updated_at"];

async create(data: Partial<Consumer>, trx?: Knex.Transaction): Promise<Consumer> {
  const qb = trx ? trx("01_mst_consumers") : db("01_mst_consumers");
  const [consumer] = await qb.insert(data).returning(SAFE_COLUMNS);
  return consumer;
}
```

---

### SEC-08 🟠 ALTA — `orders/route.ts` GET com scope=support: SQL injection via LIKE

**Arquivo**: `app/api/orders/route.ts` (linhas 22-28)  
**OWASP**: A03 — Injection  

**Risco**: A busca de suporte usa `.where("consumers.phone", "like", `%${q}%`)` com string interpolation. Embora o Knex parametrize automaticamente strings no `.where()`, o padrão `%${q}%` permite **SQL wildcard injection** — um atacante pode enviar `q=%` para listar todos os pedidos/consumidores do sistema, ou usar `_` para pattern matching.

Além disso, **qualquer role** pode usar `scope=support` (não há verificação de role).

**Código corrigido**:
```ts
if (scope === "support") {
  // Verificar role
  if (role !== "support" && role !== "ops") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "")
    .replace(/[%_\\]/g, ""); // Remove wildcards SQL

  if (q.length < 3) {
    return NextResponse.json({ error: "Busca deve ter ao menos 3 caracteres" }, { status: 400 });
  }

  const orders = await db("orders")
    .join("consumers", "orders.consumer_id", "consumers.id")
    .where("consumers.phone", "like", `%${q}%`)
    .orWhere("consumers.email", "like", `%${q}%`)
    .orWhere("orders.id", q)
    .select(
      "orders.*",
      "consumers.name as consumer_name",
      "consumers.email as consumer_email",
      "consumers.phone as consumer_phone"
    )
    .orderBy("orders.created_at", "desc")
    .limit(50);
  return NextResponse.json({ orders });
}
```

---

### SEC-09 🟠 ALTA — Audit events com `eventType` incorreto (falsa evidência)

**Arquivos**: `app/api/payments/webhook/route.ts` (linha 55), `app/api/reconciliations/route.ts` (linha 87), `app/api/orders/[id]/bottle-exchange/route.ts` (linha 37), `app/api/orders/[id]/empty-not-collected/route.ts` (linha 37)  
**Impacto**: Integridade da trilha de auditoria  

**Risco**: Vários Route Handlers emitem eventos de auditoria com `eventType` errado:
- **Webhook de pagamento** emite `ORDER_CREATED` em vez de algo como `PAYMENT_STATUS_CHANGED`
- **Reconciliação** emite `ORDER_CREATED` em vez de `RECONCILIATION_COMPLETED`
- **Bottle exchange** emite `DISPATCH_CHECKLIST_COMPLETED` em vez de `BOTTLE_EXCHANGE_RECORDED`
- **Empty not collected** emite `ORDER_DISPATCHED` em vez de `EMPTY_NOT_COLLECTED`

Isso contamina o audit trail e invalida todos os KPIs calculados pelo `kpi-service.ts`.

**Correção**: Usar os `AuditEventType` corretos ou criar novos tipos.

---

### SEC-10 🟡 MÉDIA — Cookie `maxAge` inconsistente: 7 dias no cookie vs 24h no JWT

**Arquivos**: `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`  
**OWASP**: A07 — Identification and Authentication Failures  

**Risco**: Cookie tem `maxAge: 60 * 60 * 24 * 7` (7 dias) mas o JWT expira em 24h (`JWT_EXPIRATION = "24h"`). O cookie persiste 6 dias após o JWT expirar, causando requests com token expirado. Não é uma vulnerabilidade grave, mas gera UX ruim e requests desnecessários.

**Correção**: Alinhar o `maxAge` do cookie com a expiração do JWT:
```ts
maxAge: 60 * 60 * 24, // 24h — mesmo que JWT_EXPIRATION
```

---

### SEC-11 🟡 MÉDIA — `driver` ausente do role union no `auth store`

**Arquivo**: `src/store/auth.ts` (linha 5)  
**Impacto**: Inconsistência de tipos  

O store define `role: "consumer" | "distributor_admin" | "operator" | "ops" | "support"` mas `driver` é uma role válida que falta. O middleware já trata `operator` como role de motorista, mas o `driver/deliveries/route.ts` verifica `role === "driver"`.

---

### SEC-12 🟡 MÉDIA — `orders/route.ts` GET scope=distributor sem verificação de role

**Arquivo**: `app/api/orders/route.ts` (linhas 11-16)  

**Risco**: Qualquer role pode passar `scope=distributor` e o handler filtra por `distributor_id: userId`. Embora um consumer não tenha `distributor_id` vinculado a orders, a falta de verificação explícita viola o princípio de menor privilégio.

**Correção**:
```ts
if (scope === "distributor") {
  if (role !== "distributor_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  // ...
}
```

---

<a name="pilar-2"></a>
## Pilar 2 — Performance & Next.js

### PERF-01 🟠 ALTA — `kpi-service.ts` faz N+1 queries e join em memória

**Arquivo**: `src/services/kpi-service.ts` (linhas 22-53)

**Risco**: O cálculo de `slaAcceptance` busca TODOS os eventos `ORDER_RECEIVED_BY_DISTRIBUTOR` e TODOS os `ORDER_ACCEPTED_BY_DISTRIBUTOR`, depois faz um join manual em JavaScript com `for...find()`. Complexidade O(n×m). Com 10k pedidos, são 100M comparações.

**Código corrigido**:
```ts
async slaAcceptance(
  distributorId: string,
  startDate: Date,
  endDate: Date,
  slaSeconds: number = 180
): Promise<{ rate: number; total: number; withinSla: number }> {
  const result = await db.raw(`
    WITH received AS (
      SELECT order_id, occurred_at
      FROM "18_aud_audit_events"
      WHERE event_type = ?
        AND occurred_at BETWEEN ? AND ?
        AND order_id IN (SELECT id FROM "09_trn_orders" WHERE distributor_id = ?)
    ),
    accepted AS (
      SELECT order_id, occurred_at
      FROM "18_aud_audit_events"
      WHERE event_type = ?
        AND occurred_at BETWEEN ? AND ?
    )
    SELECT
      COUNT(r.order_id) AS total,
      COUNT(CASE WHEN EXTRACT(EPOCH FROM (a.occurred_at - r.occurred_at)) <= ? THEN 1 END) AS within_sla
    FROM received r
    LEFT JOIN accepted a ON r.order_id = a.order_id
  `, [
    AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
    startDate, endDate, distributorId,
    AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
    startDate, endDate,
    slaSeconds,
  ]);

  const { total, within_sla } = result.rows[0];
  return {
    rate: total > 0 ? (within_sla / total) * 100 : 0,
    total: Number(total),
    withinSla: Number(within_sla),
  };
}
```

---

### PERF-02 🟡 MÉDIA — `subscription-cron.ts` processa assinaturas sequencialmente

**Arquivo**: `src/services/subscription-cron.ts` (linhas 15-63)

**Risco**: Cada assinatura é processada sequencialmente dentro de um `for...of` com uma transação individual. Com 1000 assinaturas, são 1000 transações sequenciais que podem levar minutos e bloquear o Event Loop durante todo esse tempo.

**Código corrigido** (batch processing):
```ts
// Processar em batches de 50
const BATCH_SIZE = 50;
for (let i = 0; i < activeSubscriptions.length; i += BATCH_SIZE) {
  const batch = activeSubscriptions.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map((sub) =>
      db.transaction(async (trx) => {
        // ... mesma lógica individual
      }).catch((err) => {
        console.error(`[subscription-cron] Erro sub ${sub.id}:`, err);
      })
    )
  );
}
```

---

### PERF-03 🟡 MÉDIA — `capacity-service.ts` cria transação redundante dentro de `reserve()`

**Arquivo**: `src/services/capacity-service.ts` (linhas 28-46)

**Risco**: `reserve()` cria sua própria transação (`db.transaction`), mas deveria receber a transação do `OrderService.createOrder()` (que já está em uma transação). Isso significa que a reserva de capacidade e a criação do pedido NÃO são atômicas — se o pedido falhar após a reserva, a capacidade fica "fantasma".

**Código corrigido**:
```ts
async reserve(
  zoneId: string,
  date: string,
  window: DeliveryWindow,
  trx: Knex.Transaction // Receber transação de fora
): Promise<void> {
  const slot = await capacityRepository.findSlotForUpdate(zoneId, date, window, trx);
  if (!slot) throw new Error("SLOT_NOT_FOUND");
  if (slot.capacity_reserved >= slot.capacity_total) throw new Error("SLOT_FULL");
  await capacityRepository.reserve(slot.id, trx);
}
```

---

### PERF-04 🔵 BAIXA — Sem `matcher` no middleware (processa assets estáticos)

**Arquivo**: `middleware.ts`

**Risco**: O middleware processa até requests para `/_next`, `/favicon.ico`, imagens etc., executando JWT decode desnecessariamente.

**Código corrigido** (adicionar ao final do arquivo):
```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

<a name="pilar-3"></a>
## Pilar 3 — Arquitetura & Clean Code

### ARCH-01 🟠 ALTA — Route Handlers acessam `db` diretamente (bypass do Service Layer)

**Arquivos**: `app/api/orders/route.ts` (GET), `app/api/orders/[id]/route.ts` (GET), `app/api/orders/[id]/rating/route.ts`, `app/api/orders/[id]/bottle-exchange/route.ts`, `app/api/orders/[id]/empty-not-collected/route.ts`, `app/api/consumers/[id]/addresses/route.ts`

**Risco arquitetural**: 8 dos 14 Route Handlers importam `db` e fazem queries diretamente, bypassando a camada de Service/Repository. Isso:
- Permite que lógica de negócio "vaze" para a camada HTTP
- Impede reuso e testabilidade
- Cria inconsistências (ex: rating route valida status `DELIVERED`, mas não via service)

**Padrão correto**:
```
Route Handler → Service → Repository → DB
```

Route Handlers devem APENAS: parsear input, chamar service, formatar response. Toda query ao banco deve estar em um Repository.

---

### ARCH-02 🟠 ALTA — Nomes de tabelas inconsistentes entre Route Handlers e Repositories

**Risco**: Route Handlers usam nomes de tabela simplificados (`"orders"`, `"consumers"`, `"addresses"`, `"payments"`) enquanto Services/Repositories usam os nomes reais com prefixo numérico (`"09_trn_orders"`, `"01_mst_consumers"`).

Exemplos:
- `app/api/orders/route.ts`: `db("orders")`
- `src/services/order-service.ts`: `"09_trn_orders"`
- `app/api/auth/register/route.ts`: `db("consumers")`
- `src/repositories/consumer-repository.ts`: `"01_mst_consumers"`

Isso causará **erro em runtime** — tabelas `"orders"` e `"consumers"` **não existem** no banco. Todas são prefixadas.

**Correção**: Padronizar usando constantes centralizadas:
```ts
// src/lib/tables.ts
export const TABLES = {
  CONSUMERS: "01_mst_consumers",
  ADDRESSES: "02_mst_addresses",
  ORDERS: "09_trn_orders",
  ORDER_ITEMS: "10_trn_order_items",
  SUBSCRIPTIONS: "11_trn_subscriptions",
  PAYMENTS: "13_trn_payments",
  AUDIT_EVENTS: "18_aud_audit_events",
} as const;
```

---

### ARCH-03 🟡 MÉDIA — order-service sem State Machine (transições livres)

**Arquivo**: `src/services/order-service.ts`

**Risco**: Nenhuma operação valida o status atual antes de transicionar. `acceptOrder()` não verifica se o status é `SENT_TO_DISTRIBUTOR`; `deliverOrder()` não verifica se é `OUT_FOR_DELIVERY`. Qualquer status pode transicionar para qualquer outro.

**Código corrigido** (adicionar mapa de transições):
```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SENT_TO_DISTRIBUTOR, OrderStatus.CANCELLED],
  [OrderStatus.SENT_TO_DISTRIBUTOR]: [
    OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
    OrderStatus.REJECTED_BY_DISTRIBUTOR,
  ],
  [OrderStatus.ACCEPTED_BY_DISTRIBUTOR]: [OrderStatus.PICKING, OrderStatus.CANCELLED],
  [OrderStatus.PICKING]: [OrderStatus.READY_FOR_DISPATCH],
  [OrderStatus.READY_FOR_DISPATCH]: [OrderStatus.OUT_FOR_DELIVERY],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
  [OrderStatus.DELIVERY_FAILED]: [OrderStatus.REDELIVERY_SCHEDULED, OrderStatus.CANCELLED],
};

function assertTransition(currentStatus: string, targetStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed?.includes(targetStatus)) {
    throw new Error(
      `Transição inválida: ${currentStatus} → ${targetStatus}`
    );
  }
}

// Usar em cada método:
async acceptOrder(orderId: string, distributorUserId: string): Promise<Order> {
  const order = await db.transaction(async (trx) => {
    const current = await trx("09_trn_orders").where({ id: orderId }).first();
    if (!current) throw new Error("ORDER_NOT_FOUND");
    assertTransition(current.status, OrderStatus.ACCEPTED_BY_DISTRIBUTOR);
    // ... continua
  });
}
```

---

### ARCH-04 🟡 MÉDIA — `createOrder()` não chama `capacityService.reserve()`

**Arquivo**: `src/services/order-service.ts` (linhas 30-83)

**Risco**: O pedido é criado sem verificar/reservar capacidade no slot de entrega, invalidando todo o sistema anti-overbooking do `capacity-service.ts`.

**Correção**: Importar e chamar `capacityService.reserve(zoneId, deliveryDate, deliveryWindow, trx)` dentro da transação de `createOrder()`.

---

### ARCH-05 🔵 BAIXA — Ausência de tratamento de erro global nos Route Handlers

Nenhum Route Handler tem `try/catch`. Se um service lançar exceção (ex: `SLOT_FULL`, `OTP_LOCKED`), o Next.js retorna 500 genérico sem corpo informativo.

**Padrão recomendado** (wrapper):
```ts
// src/lib/api-handler.ts
export function withErrorHandling(
  handler: (req: NextRequest, ctx: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro interno";
      const statusMap: Record<string, number> = {
        ORDER_NOT_FOUND: 404,
        SLOT_FULL: 409,
        SLOT_NOT_FOUND: 404,
        OTP_LOCKED: 423,
        OTP_EXPIRED: 410,
        OTP_NOT_FOUND: 404,
      };
      const status = statusMap[message] || 500;
      return NextResponse.json({ error: message }, { status });
    }
  };
}
```

---

<a name="pilar-4"></a>
## Pilar 4 — Funcionalidade & Edge Cases

### FUNC-01 🟠 ALTA — `otp-service.validate()` race condition: check-then-act sem lock

**Arquivo**: `src/services/otp-service.ts` (linhas 56-97)

**Risco**: O `findActive()` (linha 64) roda FORA da transação e o `incrementAttempts()` roda DENTRO. Dois requests simultâneos com o mesmo OTP podem ambos ler `attempts=4`, ambos passarem no check `otp.attempts >= MAX_ATTEMPTS`, e ambos tentarem validar — efetivamente permitindo 6+ tentativas no OTP de 6 dígitos.

**Código corrigido**:
```ts
async validate(orderId: string, code: string, driverId: string): Promise<boolean> {
  return db.transaction(async (trx) => {
    // SELECT FOR UPDATE dentro da transação
    const otp = await trx("16_sec_order_otps")
      .where({ order_id: orderId, status: "active" })
      .forUpdate()
      .first();

    if (!otp) throw new Error("OTP_NOT_FOUND");
    if (otp.expires_at < new Date()) {
      await otpRepository.markUsed(otp.id, trx);
      throw new Error("OTP_EXPIRED");
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await otpRepository.markLocked(otp.id, trx);
      throw new Error("OTP_LOCKED");
    }

    const hash = hmacHash(code);
    const isValid = hash === otp.otp_hash;

    if (isValid) {
      await otpRepository.markUsed(otp.id, trx);
    } else {
      const updated = await otpRepository.incrementAttempts(otp.id, trx);
      if (updated.attempts >= MAX_ATTEMPTS) {
        await otpRepository.markLocked(otp.id, trx);
      }
    }

    await auditRepository.emit({
      eventType: AuditEventType.OTP_VALIDATION_ATTEMPTED,
      actor: { type: ActorType.DRIVER, id: driverId },
      orderId,
      sourceApp: SourceApp.DRIVER_WEB,
      payload: { success: isValid, attempts: otp.attempts + 1 },
    }, trx);

    return isValid;
  });
}
```

---

### FUNC-02 🟡 MÉDIA — `subscriptionCron` — cálculo de próxima data incorreto

**Arquivo**: `src/services/subscription-cron.ts` (linhas 47-50)

**Risco**: `nextDate.setMonth(nextDate.getMonth() + 1)` causa bugs em meses com dias diferentes. Exemplo: assinatura dia 31/jan → `setMonth(1)` = 3 de março (overflow). Cada mês subsequente continua deslocando.

**Código corrigido**:
```ts
const currentDate = new Date(today);
const nextDate = new Date(
  currentDate.getFullYear(),
  currentDate.getMonth() + 1,
  Math.min(
    sub.delivery_day_of_month ?? currentDate.getDate(),
    new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0).getDate()
  )
);
```

---

### FUNC-03 🟡 MÉDIA — `orders/route.ts` POST: `distributorId` e `zoneId` hardcoded como vazio

**Arquivo**: `app/api/orders/route.ts` (linhas 62-63)

```ts
distributorId: "", // resolved by zone lookup
zoneId: "",
```

O comentário diz "resolved by zone lookup" mas NÃO há lookup nenhum. O pedido é criado sem distribuidor e sem zona, impossibilitando roteamento, RBAC de distribuidor, e delivery capacity.

**Correção**: Implementar lookup real baseado no endereço do consumidor:
```ts
// Resolve zona pelo endereço
const address = await db("02_mst_addresses").where({ id: parsed.data.address_id }).first();
if (!address || !address.zone_id) {
  return NextResponse.json({ error: "Endereço sem zona de entrega" }, { status: 400 });
}

const zone = await db("04_mst_zones").where({ id: address.zone_id, is_active: true }).first();
if (!zone) {
  return NextResponse.json({ error: "Zona de entrega inativa" }, { status: 400 });
}
```

---

### FUNC-04 🔵 BAIXA — `registerSchema` aceita `phone` como opcional

**Arquivo**: `src/schemas/auth.ts` (linha 13)

```ts
phone: z.string().min(8, "Telefone inválido").optional(),
```

Mas o cadastro do consumidor no DB requer nome, email, phone, e password. Se o consumidor não enviar telefone, será `undefined`, e a busca de suporte por telefone (`like "%q%"`) nunca encontrará esse consumidor.

---

### FUNC-05 🔵 BAIXA — Rating route não verifica se o consumer é dono do pedido

**Arquivo**: `app/api/orders/[id]/rating/route.ts`

Qualquer consumidor autenticado pode avaliar qualquer pedido. Coberto pela SEC-05 (IDOR), mas do ponto de vista funcional, significa que avaliações não são confiáveis.

---

<a name="matriz-de-priorizacao"></a>
## Matriz de Priorização

| # | ID | Severidade | Esforço | Prioridade |
|---|------|-----------|---------|-----------|
| 1 | SEC-01 | 🔴 CRÍTICA | Baixo | **P0 — IMEDIATO** |
| 2 | SEC-02 | 🔴 CRÍTICA | Médio | **P0 — IMEDIATO** |
| 3 | SEC-03 | 🔴 CRÍTICA | Baixo | **P0 — IMEDIATO** |
| 4 | SEC-04 | 🔴 CRÍTICA | Médio | **P0 — IMEDIATO** |
| 5 | SEC-05 | 🔴 CRÍTICA | Alto | **P0 — IMEDIATO** |
| 6 | SEC-06 | 🟠 ALTA | Baixo | **P1 — Esta semana** |
| 7 | SEC-07 | 🟠 ALTA | Baixo | **P1 — Esta semana** |
| 8 | SEC-08 | 🟠 ALTA | Baixo | **P1 — Esta semana** |
| 9 | SEC-09 | 🟠 ALTA | Médio | **P1 — Esta semana** |
| 10 | ARCH-01 | 🟠 ALTA | Alto | **P1 — Esta semana** |
| 11 | ARCH-02 | 🟠 ALTA | Médio | **P1 — Esta semana** |
| 12 | FUNC-01 | 🟠 ALTA | Baixo | **P1 — Esta semana** |
| 13 | SEC-10 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 14 | SEC-11 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 15 | SEC-12 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 16 | PERF-01 | 🟡 MÉDIA | Médio | P2 — Próximo sprint |
| 17 | PERF-02 | 🟡 MÉDIA | Médio | P2 — Próximo sprint |
| 18 | ARCH-03 | 🟡 MÉDIA | Médio | P2 — Próximo sprint |
| 19 | ARCH-04 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 20 | PERF-03 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 21 | FUNC-02 | 🟡 MÉDIA | Baixo | P2 — Próximo sprint |
| 22 | FUNC-03 | 🟡 MÉDIA | Médio | P2 — Próximo sprint |
| 23 | PERF-04 | 🔵 BAIXA | Baixo | P3 — Backlog |
| 24 | ARCH-05 | 🔵 BAIXA | Médio | P3 — Backlog |
| 25 | FUNC-04 | 🔵 BAIXA | Baixo | P3 — Backlog |
| 26 | FUNC-05 | 🔵 BAIXA | Baixo | P3 — Backlog |

---

## Parecer Final

O sistema **NÃO está pronto para produção**. As 5 vulnerabilidades críticas (SEC-01 a SEC-05) permitem que qualquer usuário autenticado acesse dados de qualquer outro usuário, forje pagamentos, e obtenha controle total do sistema via Socket.io.

**Bloqueia deploy**:
1. Socket.io sem auth (SEC-01)
2. API routes sem RBAC (SEC-02)
3. Segredos hardcoded (SEC-03 + SEC-06)
4. Webhook sem assinatura (SEC-04)
5. IDOR sistêmico (SEC-05)
6. Nomes de tabelas inconsistentes que causarão crash em runtime (ARCH-02)

Após corrigir os itens P0 e P1, o sistema pode ser implantado em ambiente staging para testes de integração.
