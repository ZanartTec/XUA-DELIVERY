# Relatorio de SQL bruto no backend Node.js

Escopo analisado: runtime Node.js em `apps/api/src`. Migrations, triggers e arquivos SQL de `prisma/migrations` ficaram fora do escopo conforme decisao tomada durante a execucao.

Resultado final: 17 ocorrencias iniciais de `$queryRaw`; 11 refatoradas para Prisma ORM puro; 6 mantidas como excecoes tecnicas por dependerem de `SELECT ... FOR UPDATE`, recurso de lock pessimista que o Prisma Client nao expoe para PostgreSQL.

Nao foram encontrados usos de `$executeRaw`, `queryRawUnsafe` ou `executeRawUnsafe` no runtime do backend.

## Ocorrencias refatoradas

### 1. Readiness database check - `server/readiness.ts`

O que fazia: executava `SELECT 1` para validar conectividade com o banco.

Por que usava SQL bruto: era uma forma simples de forcar round-trip ao PostgreSQL.

Antes:

```ts
await prisma.$queryRaw`SELECT 1`;
```

Depois:

```ts
await prisma.distributor.findFirst({ select: { id: true } });
```

Limitacao/diferenca: a nova checagem usa uma tabela real do schema. Banco vazio continua retornando sucesso; erro de conexao ou schema indisponivel continua falhando.

### 2. Readiness database check - `http/handlers/readiness.ts`

O que fazia: mesma checagem `SELECT 1` do handler HTTP.

Por que usava SQL bruto: health/readiness tradicional com SQL minimo.

Antes:

```ts
await prisma.$queryRaw`SELECT 1`;
```

Depois:

```ts
await prisma.distributor.findFirst({ select: { id: true } });
```

Limitacao/diferenca: mesma da ocorrencia 1.

### 3. `capacityRepository.findAvailable`

O que fazia: listava slots de capacidade de uma zona em um intervalo de datas, somente quando `capacity_reserved < capacity_total`.

Por que usava SQL bruto: a query comparava duas colunas da mesma linha diretamente no banco.

Antes:

```ts
return (tx ?? prisma).$queryRaw<DeliveryCapacity[]>`
  SELECT * FROM "07_cfg_delivery_capacity"
  WHERE zone_id = ${zoneId}::uuid
    AND delivery_date BETWEEN ${startDate}::date AND ${endDate}::date
    AND capacity_reserved < capacity_total
  ORDER BY delivery_date ASC
`;
```

Depois:

```ts
const slots = await (tx ?? prisma).deliveryCapacity.findMany({
  where: {
    zone_id: zoneId,
    delivery_date: { gte: new Date(startDate), lte: new Date(endDate) },
  },
  orderBy: { delivery_date: "asc" },
});

return slots.filter((slot) => slot.capacity_reserved < slot.capacity_total);
```

Limitacao/diferenca: a comparacao campo-a-campo passou para TypeScript. O metodo e usado para janelas curtas de disponibilidade, entao o impacto esperado e baixo.

### 4. `kpiService.slaAcceptance`

O que fazia: calculava pedidos recebidos pela distribuidora e quantos foram aceitos dentro do SLA.

Por que usava SQL bruto: usava CTE, `JOIN`, cast de enum PostgreSQL e `EXTRACT(EPOCH FROM interval)`.

Antes:

```ts
const result = await prisma.$queryRaw<Array<{ total: number; within_sla: number }>>`
  WITH received AS (...), accepted AS (...)
  SELECT COUNT(r.order_id)::int AS total,
         COUNT(CASE WHEN EXTRACT(EPOCH FROM (a.accepted_at - r.received_at)) <= ${slaSeconds} THEN 1 END)::int AS within_sla
  FROM received r
  LEFT JOIN accepted a ON a.order_id = r.order_id
`;
```

Depois:

```ts
const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
  AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
  AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
]);

// Agrupa aceites por order_id e calcula o SLA em TypeScript.
```

Limitacao/diferenca: o calculo deixou o banco e passou para memoria da aplicacao. A semantica de eventos recebidos sem aceite e pares aceitos dentro do SLA foi preservada e coberta por teste.

### 5. `kpiService.acceptanceRate`

O que fazia: contava eventos `ORDER_RECEIVED_BY_DISTRIBUTOR` e `ORDER_ACCEPTED_BY_DISTRIBUTOR` dos pedidos da distribuidora.

Por que usava SQL bruto: usava CTE para filtrar pedidos por distribuidora e `COUNT(CASE WHEN ...)`.

Antes:

```ts
const result = await prisma.$queryRaw<Array<{ total: number; accepted: number }>>`
  WITH dist_orders AS (...)
  SELECT COUNT(CASE WHEN event_type = ... THEN 1 END)::int AS total,
         COUNT(CASE WHEN event_type = ... THEN 1 END)::int AS accepted
  FROM "18_aud_audit_events"
  WHERE order_id IN (SELECT id FROM dist_orders)
`;
```

Depois:

```ts
const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
  AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
  AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
]);
const total = events.filter((event) => event.event_type === AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR).length;
const accepted = events.filter((event) => event.event_type === AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR).length;
```

Limitacao/diferenca: agregacao em TypeScript em vez de `COUNT` no banco.

### 6. `kpiService.redeliveryRate`

O que fazia: contava entregas e reentregas por eventos de auditoria.

Por que usava SQL bruto: mesmo padrao de CTE e `COUNT(CASE WHEN ...)`.

Antes:

```ts
const result = await prisma.$queryRaw<Array<{ delivered: number; redeliveries: number }>>`
  WITH dist_orders AS (...)
  SELECT COUNT(CASE WHEN event_type = ... THEN 1 END)::int AS delivered,
         COUNT(CASE WHEN event_type = ... THEN 1 END)::int AS redeliveries
  FROM "18_aud_audit_events"
  WHERE order_id IN (SELECT id FROM dist_orders)
`;
```

Depois:

```ts
const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
  AuditEventType.ORDER_DELIVERED,
  AuditEventType.REDELIVERY_REQUIRED,
]);
const delivered = events.filter((event) => event.event_type === AuditEventType.ORDER_DELIVERED).length;
const redeliveries = events.filter((event) => event.event_type === AuditEventType.REDELIVERY_REQUIRED).length;
```

Limitacao/diferenca: mesma da ocorrencia 5.

### 7. `kpiService.getDailySeries`

O que fazia: montava serie diaria com SLA, aceitacao e reentrega usando CTEs, `DATE(occurred_at)` e `FULL OUTER JOIN`.

Por que usava SQL bruto: Prisma nao expoe `FULL OUTER JOIN` nem funcoes SQL de data/intervalo nesse formato.

Antes:

```ts
const rows = await prisma.$queryRaw<DailyRow[]>`
  WITH dist_orders AS (...), daily_events AS (...), received_events AS (...), accepted_events AS (...)
  SELECT COALESCE(r.day, a.day, d.day) AS day, ...
  FROM received_events r
  FULL OUTER JOIN accepted_events a ON ...
  FULL OUTER JOIN (...) d ON ...
  GROUP BY COALESCE(r.day, a.day, d.day)
`;
```

Depois:

```ts
const events = await findDistributorAuditEvents(distributorId, startDate, endDate, [
  AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR,
  AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR,
  AuditEventType.ORDER_DELIVERED,
  AuditEventType.REDELIVERY_REQUIRED,
]);

// Agrupa por dia/order_id com Map e Set, preservando contagens distintas.
```

Limitacao/diferenca: a uniao por dia foi reproduzida em TypeScript; o custo depende do volume de eventos no periodo consultado.

### 8. `distributorRepository.findAvailableForZone` com data/janela

O que fazia: buscava distribuidoras ativas que atendem a mesma cobertura da zona, possuem capacidade na data/janela, calcula NPS medio e proxima data disponivel.

Por que usava SQL bruto: usava cadeia de `JOIN`, `LEFT JOIN`, `ROUND(AVG(...))`, `MIN(...)`, `NULLS LAST` e casts PostgreSQL.

Antes:

```ts
const rows = await prisma.$queryRaw<DistributorAvailabilityRow[]>`
  SELECT d.id, d.name, ROUND(AVG(o.nps_score)::numeric, 1)::float AS avg_nps,
         MIN(dc_next.delivery_date) AS next_available_date
  FROM "03_mst_distributors" d
  JOIN "04_mst_zones" z2 ON ...
  JOIN "05_mst_zone_coverage" zc2 ON ...
  JOIN "07_cfg_delivery_capacity" dc ON ...
  LEFT JOIN "07_cfg_delivery_capacity" dc_next ON ...
  LEFT JOIN "09_trn_orders" o ON ...
  GROUP BY d.id, d.name
  ORDER BY avg_nps DESC NULLS LAST, d.name ASC
`;
```

Depois:

```ts
const originCoverage = await prisma.zoneCoverage.findMany({ where: { zone_id: zoneId }, select: { neighborhood: true, zip_code: true } });
const distributors = await prisma.distributor.findMany({
  where: { is_active: true, allows_consumer_choice: true, zones: { some: { is_active: true, coverage: { some: { OR: coverageOr } } } } },
  select: { id: true, name: true, zones: { select: { coverage: true, capacity_slots: true } } },
});
const npsRows = await prisma.order.groupBy({ by: ["distributor_id"], where: { distributor_id: { in: ids }, nps_score: { not: null } }, _avg: { nps_score: true } });
```

Limitacao/diferenca: `capacity_reserved < capacity_total`, `MIN` e `NULLS LAST` foram reproduzidos em TypeScript.

### 9. `distributorRepository.findAvailableForZone` sem data/janela

O que fazia: listava distribuidoras ativas que cobrem a mesma area, sem filtrar capacidade.

Por que usava SQL bruto: mesma cadeia de `JOIN` de cobertura e agregacao de NPS.

Antes:

```ts
const rows = await prisma.$queryRaw<DistributorAvailabilityRow[]>`
  SELECT d.id, d.name, ROUND(AVG(o.nps_score)::numeric, 1)::float AS avg_nps
  FROM "03_mst_distributors" d
  JOIN "04_mst_zones" z2 ON ...
  JOIN "05_mst_zone_coverage" zc2 ON ...
  LEFT JOIN "09_trn_orders" o ON ...
  GROUP BY d.id, d.name
  ORDER BY avg_nps DESC NULLS LAST, d.name ASC
`;
```

Depois: reaproveita `zoneCoverage.findMany`, `distributor.findMany`, `order.groupBy` e ordenacao `sortByNpsThenName`.

Limitacao/diferenca: ordenacao `NULLS LAST` agora esta explicita em TypeScript.

### 10. `distributorRepository.resolveCoveredZone`

O que fazia: encontrava a zona ativa de uma distribuidora que cobre bairro ou CEP da zona original.

Por que usava SQL bruto: usava `JOIN` entre zonas e coberturas da zona original.

Antes:

```ts
const rows = await prisma.$queryRaw<Array<{ zone_id: string }>>`
  SELECT z2.id AS zone_id
  FROM "04_mst_zones" z2
  JOIN "05_mst_zone_coverage" zc2 ON zc2.zone_id = z2.id
  JOIN "05_mst_zone_coverage" zc_orig ON zc_orig.zone_id = ${zoneId}::uuid
  WHERE z2.distributor_id = ${distributorId}::uuid
  LIMIT 1
`;
```

Depois:

```ts
const originCoverage = await prisma.zoneCoverage.findMany({ where: { zone_id: zoneId }, select: { neighborhood: true, zip_code: true } });
const zone = await prisma.zone.findFirst({
  where: { distributor_id: distributorId, is_active: true, coverage: { some: { OR: coverageOr } } },
  select: { id: true },
});
```

Limitacao/diferenca: Prisma continua sem `ORDER BY`, assim como a query antiga nao definia ordenacao.

### 11. `distributorRepository.validateDistributorForZone`

O que fazia: validava cobertura e capacidade disponivel para uma distribuidora/data/janela.

Por que usava SQL bruto: combinava `JOIN`, casts `::uuid`, `::date`, enum PostgreSQL e comparacao `capacity_reserved < capacity_total`.

Antes:

```ts
const rows = await prisma.$queryRaw<Array<{ zone_id: string }>>`
  SELECT z2.id AS zone_id
  FROM "04_mst_zones" z2
  JOIN "05_mst_zone_coverage" zc2 ON ...
  JOIN "07_cfg_delivery_capacity" dc ON ...
  WHERE z2.distributor_id = ${distributorId}::uuid
  LIMIT 1
`;
```

Depois:

```ts
const zones = await prisma.zone.findMany({
  where: {
    distributor_id: distributorId,
    is_active: true,
    coverage: { some: { OR: coverageOr } },
    capacity_slots: { some: { delivery_date: new Date(date), window: requestedWindow } },
  },
  select: { id: true, capacity_slots: { select: { capacity_total: true, capacity_reserved: true } } },
});
const zone = zones.find((candidateZone) => candidateZone.capacity_slots.some((slot) => slot.capacity_reserved < slot.capacity_total));
```

Limitacao/diferenca: a comparacao de disponibilidade ficou em memoria.

## Excecoes mantidas por `FOR UPDATE`

### 12 e 13. `capacityRepository.findSlotForUpdate`

O que faz: bloqueia a linha de capacidade antes de reservar/liberar slot, evitando overbooking em concorrencia.

Por que usa SQL bruto: Prisma Client nao expoe `SELECT ... FOR UPDATE` para PostgreSQL.

Implementacao atual mantida:

```ts
const slotRows = await tx.$queryRaw<DeliveryCapacity[]>`
  SELECT * FROM "07_cfg_delivery_capacity"
  WHERE zone_id = ${zoneId}::uuid
    AND delivery_date = ${date}::date
    AND "window" = ${windowDb}::"delivery_window"
    AND time_slot_id = ${timeSlotId}::uuid
  FOR UPDATE
  LIMIT 1
`;
```

Alternativa Prisma considerada: `deliveryCapacity.findFirst` dentro de transacao. Rejeitada porque nao bloqueia a linha; duas transacoes concorrentes poderiam ler a mesma disponibilidade e reservar acima da capacidade.

### 14. `otpRepository.findActiveForUpdate`

O que faz: bloqueia o OTP ativo para impedir validacao dupla concorrente.

Por que usa SQL bruto: depende de `FOR UPDATE`.

Implementacao atual mantida:

```ts
const rows = await tx.$queryRaw<OrderOtp[]>`
  SELECT * FROM "16_sec_order_otps"
  WHERE order_id = ${orderId}::uuid
    AND status = 'active'
  FOR UPDATE
  LIMIT 1
`;
```

Alternativa Prisma considerada: `orderOtp.findFirst` e posterior `update`. Rejeitada porque duas validacoes simultaneas poderiam consumir o mesmo OTP.

### 15. `inventoryRepository.findBalanceForUpdate`

O que faz: bloqueia saldo de estoque antes de aplicar movimento.

Por que usa SQL bruto: depende de `FOR UPDATE` para serializar alteracoes do mesmo saldo.

Implementacao atual mantida:

```ts
const rows = await tx.$queryRaw<DistributorInventoryBalance[]>`
  SELECT *
  FROM "30_trn_distributor_inventory_balances"
  WHERE distributor_id = ${distributorId}::uuid
    AND inventory_item_id = ${inventoryItemId}::uuid
  FOR UPDATE
  LIMIT 1
`;
```

Alternativa Prisma considerada: `findUnique` em transacao. Rejeitada porque nao impede dois movimentos concorrentes sobre o mesmo saldo.

### 16. `reconciliationSessionRepository.findSessionForUpdate`

O que faz: bloqueia uma sessao de conciliacao antes do fechamento.

Por que usa SQL bruto: depende de `FOR UPDATE` para impedir fechamento concorrente.

Implementacao atual mantida:

```ts
const rows = await tx.$queryRaw<SessionLockRow[]>`
  SELECT id, distributor_id, status
  FROM "32_trn_inventory_reconciliation_sessions"
  WHERE id = ${sessionId}::uuid
    AND distributor_id = ${distributorId}::uuid
  FOR UPDATE
  LIMIT 1
`;
```

Alternativa Prisma considerada: `findFirst` em transacao. Rejeitada porque nao bloqueia a linha e permitiria fechamento duplicado.

### 17. `orderRepository.findByIdWithItemsForUpdate`

O que faz: bloqueia o pedido antes de carregar itens para fluxo de mutacao/transicao.

Por que usa SQL bruto: depende de `FOR UPDATE`.

Implementacao atual mantida:

```ts
const rows = await tx.$queryRaw<Array<{ id: string }>>`
  SELECT id
  FROM "09_trn_orders"
  WHERE id = ${id}::uuid
  FOR UPDATE
  LIMIT 1
`;
```

Alternativa Prisma considerada: `order.findUnique({ include: { items: true } })`. Rejeitada porque nao bloqueia a linha do pedido contra transicoes concorrentes.

## Validacao executada

- `npm test -- apps/api/src/modules/distributor/services/kpi.service.test.ts apps/api/src/modules/distributor/repository/distributor.repository.test.ts` - passou, 7 testes.
- `npm run typecheck:api` - passou.
- `npm test` - passou, 18 arquivos e 132 testes.
- Busca final por `$queryRaw|$executeRaw|queryRawUnsafe|executeRawUnsafe` em `apps/api/src/**` - restaram apenas 6 ocorrencias, todas ligadas a `FOR UPDATE` e documentadas no codigo.
