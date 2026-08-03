# 04 — Active State: Estado Atual e Tarefas

> **Árvore de Contexto — Folhas (arquivo dinâmico).** Atualize este arquivo a cada entrega relevante. Estado consolidado em: **02/08/2026**.

---

## 1. Funcionalidades já implementadas ✅

### Núcleo de pedidos
- [x] Criação de pedido real e persistido (transação: pedido + itens + evento de auditoria)
- [x] Máquina de estados completa (14 estados) com trigger de proteção contra regressão pós `DELIVERED`/`CANCELLED`
- [x] Resolução de distribuidora por zona (`resolveDistributor()`) com seleção manual pelo consumidor quando 2+ opções (`allows_consumer_choice`) e registro do modo (`manual`/`auto`) na auditoria
- [x] Agendamento por agenda semanal da distribuidora + datas bloqueadas + lead-time (`validateDeliveryDate()`, HTTP 422 com códigos específicos); calendário de 14 dias no checkout
- [x] Aceite/rejeição com motivo obrigatório + SLA countdown; fix do tipo de produto no aceite (jul/2026, commit `01754e9`)
- [x] Checklist de despacho (3 itens, bloqueia até 100%), atribuição de motorista, despacho com geração de OTP
- [x] Entrega com OTP (HMAC-SHA256, 6 dígitos, TTL 90 min, máx 5 tentativas, lock + override ops/support)
- [x] Troca de vasilhames, não-coleta com motivo, falha de entrega e reagendamento
- [x] Avaliação NPS pós-entrega + histórico com "repetir pedido"
- [x] **Aba "Histórico" na fila do distribuidor** (26/07/2026): pedidos com status final (`DELIVERED`, `CANCELLED`, `REJECTED_BY_DISTRIBUTOR`, `DELIVERY_FAILED`) saíam de qualquer aba/filtro/busca da fila assim que deixavam de ser ativos — o timeline completo do pedido (já correto e atômico na gravação) ficava inacessível na prática, sem link algum na UI. Nova aba `stage=history` em `GET /api/orders?scope=distributor` (`DISTRIBUTOR_QUEUE_STAGE_VALUES`/`DISTRIBUTOR_QUEUE_TERMINAL_STATUS_VALUES` em `packages/shared/src/schemas/order.ts`), com janela padrão de 30 dias quando nenhum filtro de data é informado (evita full-scan do histórico). Reaproveita os componentes existentes (`OrderDetailSheet`, `OrderTimelineSection`) sem duplicar UI

### Pagamentos
- [x] Gateway real **Mercado Pago** como padrão (mock apenas para dev)
- [x] Configuração de pagamento **por distribuidora** (`34_cfg_distributor_payment_settings`): métodos aceitos + credenciais próprias criptografadas (AES-256-GCM) + UI `/distributor/payment-config`
- [x] Webhook idempotente (assinatura HMAC, dedup, fila BullMQ `payment-webhooks`) + expiração automática de cobranças (`PAYMENT_EXPIRED`)

### Assinaturas (v2 — planos pré-definidos)
- [x] CRUD de planos pela ops (N:N com distribuidoras) + wizard de contratação em 5 etapas
- [x] **Fase 1:** geração atômica e idempotente de pedidos por data agendada (evento na ativação + cron de segurança) + expiração de assinaturas não pagas
- [x] **Fase 2:** compensação — recrédito e retry em rejeição/cancelamento (máx 3 → `FAILED` + notificação); notificação de saldo baixo idempotente
- [x] Pausar/retomar na UI do consumidor

### Caução e inventário
- [x] **Caução de vasilhames v2:** programa por (distribuidora, consumidor) com `max_bottles`, saldo materializado, movimentos append-only, UI `/distributor/deposit-program` (jun/2026, migration `20260624030000`)
- [x] Produtos com `kind` (`WATER`/`BOTTLE`/`OTHER`) e vínculo água → vasilhame (`bottle_product_id`)
- [x] Inventário operacional: itens, saldos por distribuidora, log de movimentações (11 tipos), sessões de reconciliação com ajuste automático
- [x] Conciliação diária de vasilhames (delta > 0 exige justificativa)
- [x] **Fix itens inativos nas listagens de saldo** (07/07/2026): `GET /api/distributor/inventory/balances` e `GET /api/ops/inventory/balances` ganharam filtro `is_active` (query param, default `true`) — antes, item desativado (`29_mst_inventory_items.is_active = false`) mantinha o saldo visível, gerando duplicidade com item substituto, KPIs inflados e alertas falsos de baixo estoque. Helper DRY `balance-query.helpers.ts` unifica o where entre os repositórios distributor/ops; `item.is_active` agora exposto nos payloads de saldos, movimentos e detalhe por id. Sem filtro (intencional): `findBalanceById` (auditoria) e extrato de movimentações (histórico imutável)
- [x] **Fix produto criado pela ops nascia invendável** (07/07/2026): `POST /api/products` criava só o registro em `06_mst_products` — sem `InventoryItem` vinculado, o aceite falhava com `INVENTORY_ITEM_NOT_FOUND` (exigia INSERT manual). Agora `productsService.create`/`update` rodam em `$transaction` com o novo `inventory-item-provisioning.service.ts` (`provisionForProduct`, idempotente por `product_id`): 1 item ativo → no-op; >1 ativo → warn + no-op (conflito pré-existente); só inativos → reativa o mais recente; nenhum → cria item `SELLABLE_PRODUCT` (todos os kinds; nunca `RETURNABLE_*`, singletons do settlement de caução) com `code` determinístico slug+UUID, `unit_label "un"`, `low_stock_threshold 10`. Invariante: **produto ativo ⇒ item vendável ativo** (update provisiona quando o produto resultante está ativo — reativar produto legado provisiona sozinho). Sem propagação de `name`/`is_active` produto→item (deliberado); saldos continuam lazy (`upsertBalance` na 1ª movimentação); sem migration, sem mudança de contrato. **Saneamento de legados:** rodar `npx tsx scripts/backfill-product-inventory-items.ts --dry-run` e depois sem a flag em produção (uma transação por produto; falha em um não aborta os demais; exit code 1 se houver falhas). Produtos inativos legados só ganham item quando reativados (por design)

### Autenticação e segurança
- [x] Login JWT em cookie httpOnly + RBAC 5 roles + logout com blacklist Redis
- [x] **"Esqueci minha senha"** (jul/2026, commit `4ef76ad`): token HMAC uso único TTL 30 min, e-mail via Resend, invalidação de JWTs antigos, mitigação de enumeração
- [x] Rate limiting por escopo; headers de segurança

### Plataforma
- [x] Realtime Socket.io (salas por role/distribuidora; `new_order`, `order_status_changed`, `sla_warning`)
- [x] PWA offline do motorista (Service Worker + IndexedDB + sync idempotente por UUID)
- [x] KPIs via auditoria (SLA aceite, taxa de aceite, reentrega, NPS) — dashboards distribuidor e ops
- [x] Console de suporte (busca + timeline), override de OTP, exportação CSV de auditoria
- [x] Banners promocionais, categorias de produto, Web Push
- [x] Bugs históricos de visibilidade corrigidos (jun/2026): fila do distribuidor (`resolveDistributorId`), sala de socket, formato de resposta da tela do motorista

---

## 2. O que precisa ser feito / Próximos passos

### Bloqueado — aguardando o usuário
- [ ] **Aplicar a migration do CRUD de Distribuidor/Motorista em DEV** (`20260802130000_add_consumer_is_active_and_management_audit_events`, código completo desde 02/08/2026 — ver item #18 em §3 e `doc_desenvolvimento/distribuidor-motorista-crud.md`). Bloqueado até o usuário fornecer as credenciais do banco de DEV. Depois de aplicada: validar smoke test ponta a ponta (criar distribuidora+admin, cadastrar/desativar motorista, vincular órfão, criar zona) e só então avaliar promoção para produção

### Do backlog v1 (robustez operacional) — pendentes
- [ ] **Roteirização inteligente** (Google Directions API ou OSRM) — hoje a lista de paradas agrupa por zona/janela com link manual para o Google Maps
- [ ] **Fila de divergências** de conciliação como fluxo de resolução (hoje é relatório; painel de divergências "fila de resolução" previsto)
- [ ] **Quarentena/triagem de vasilhames** com fluxo completo (status "quarentena" + motivo + rastreabilidade) — citado nos docs, sem tabela/fluxo implementado
- [ ] **Política "Primeira Compra Especial"** (desconto R$ X) — mencionada, valores [A DEFINIR]
- [ ] **Notificações inteligentes** (lembretes de janela, além dos pushes de status)
- [ ] **Reentrega como fluxo completo** (abrir ocorrência → reprogramar → medir) — reagendamento existe; fluxo de ocorrência formal não

### Do backlog v2 (escala e diferenciais)
- [ ] Rastreamento em tempo real (GPS/ETA do entregador via Geolocation + Socket.io room)
- [ ] Scanner/serialização de vasilhames — "Regra B", QR code via câmera (rastreabilidade individual do ativo)
- [ ] Painel de incentivos/penalidades (campanha Moto Xuá): ranking mensal, auditoria trimestral, penalidades automáticas baseadas nos KPIs já calculados
- [ ] Programa de fidelidade com pontos (nova tabela + service, sem impacto no fluxo)
- [ ] Analytics avançado: cohort de assinatura, churn, LTV — tudo derivável de `18_aud_audit_events`
- [ ] App nativo (React Native) reutilizando a API
- [ ] Múltiplos SKUs além do 20L (catálogo já suporta)

### Experiência operacional
- [ ] **Painel "admin master" unificado**: ops/support têm permissão ampla no backend, mas não existe fila operacional global de todos os pedidos na UI
- [ ] Dashboard de KPIs da ops com gráficos completos (KpiService pronto; UI Recharts parcial)
- [ ] Fluxo "Avise-me quando chegar" para CEPs sem cobertura (salvar email + CEP) — [A DEFINIR: se já persiste ou é apenas UI]

---

## 3. Débitos técnicos e observações pendentes

| # | Item | Detalhe |
|---|---|---|
| 1 | ~~**Caução v1 legada no schema**~~ **✅ RESOLVIDO (jul/2026)** | Caução financeira v1 removida. Tabela `15_trn_deposits` arquivada em `z_arch_15_trn_deposits` e removida do schema; removidos `model Deposit`, `enum DepositStatus`, `Product.deposit_cents` e o include `deposits[]` do `GET /orders/:id`. **Mantidos de propósito:** `PaymentKind.DEPOSIT` e `AuditEventType.DEPOSIT_HELD/REFUND_*` (Postgres não suporta `DROP VALUE` em enum; `18_aud` é append-only) e as colunas `Order.deposit_cents`/`deposit_amount_cents` (histórico compõe `total_cents`; novos pedidos gravam 0). Migrations: `20260708130000_archive_legacy_financial_deposits`, `20260708130001_drop_legacy_financial_deposits`. Ver `doc_desenvolvimento/caucao-vasilhames.md` |
| 2 | **Endpoint órfão de cancelamento de assinatura** | `PATCH /api/user-subscriptions/:id/cancel` existe no backend, mas o botão "Cancelar" foi removido da UI do consumer (pendência "P6" citada na doc). Decidir destino do endpoint |
| 3 | **Sem anti-overbooking numérico** | A tabela `07_cfg_delivery_capacity` foi removida; não há bloqueio por contagem de pedidos por slot — só agenda/lead-time/bloqueios. Se overbooking virar problema real, reintroduzir controle de capacidade |
| 4 | **DDL histórico divergente** | O `doc_sistema.md` contém rascunhos de DDL e envelope de eventos "ricos" (correlation, geo, recorded_at) que **não** correspondem ao schema real (plano). Fonte da verdade: `prisma/schema.prisma`. Não implementar a partir do rascunho |
| 5 | **Eventos idealizados não implementados** | `payment_authorized`, `redelivery_completed`, `route_assigned`, `cart_created`, `consumer_registered`, `coverage_resolved` etc. constam apenas no rascunho — não existem no enum real |
| 6 | **Sem geocoding** | Endereços não têm lat/lng; cobertura resolvida por CEP/bairro (ViaCEP + `05_mst_zone_coverage`). Roteirização real exigirá geocoding |
| 7 | **Scheduler externo indefinido** | Jobs dependem de cron externo (Railway Cron ou Render citados). [A DEFINIR: provedor e frequências oficiais em produção] |
| 8 | **Socket.io monolítico** | Roda no mesmo processo da API — ok para MVP; extrair para serviço dedicado se precisar de escala horizontal |
| 9 | **LGPD / retenção** | Política de retenção de dados e evidências [A DEFINIR] |
| 10 | **CI/CD e ambientes** | Pipeline, staging e estratégia de migrations em produção não documentados [A DEFINIR] |
| 11 | **`OTP_SENT` nunca implementado (nem auditoria, nem envio real)** | Confirmado em 26/07/2026: não existe SMS em nenhum lugar do backend, e o Web Push real (`"Pedido saiu para entrega!"`) não carrega o código — é só aviso de status. O código chega ao consumidor via Socket.io (`otp_generated`) ou fallback `GET /api/orders/:id` (role `consumer`, lido do Redis). O evento de auditoria `OTP_SENT` nunca é emitido porque não há o que auditar. Doc técnica corrigida (`guia-tecnico.md`) para não descrever um envio inexistente. [A DEFINIR: implementar SMS/push com código de fato, ou remover o evento do enum] |
| 12 | **Valores de negócio abertos** | Desconto de primeira compra (R$ X), frete — placeholders na doc original [A DEFINIR] |
| 13 | **Sem endpoint de escrita para itens de inventário** | `inventoryItemUpdateSchema` existe em `packages/shared/src/schemas/inventory.ts` (com teste), mas nenhuma rota o consome. Itens vendáveis passaram a ser criados automaticamente pelo provisionamento na criação/reativação de produto (07/07/2026), mas edição/desativação de `29_mst_inventory_items` continua sendo UPDATE manual no banco, sem validação de saldo remanescente (item pode ser desativado com saldo > 0, que fica oculto nas listagens; causa raiz do fix de 07/07/2026). Proposta técnica do CRUD aprovada: `docs/doc_desenvolvimento/inventario-itens-crud-proposta.md` |
| 14 | **Criação de produto e de item de inventário sem AuditEvent** | O provisionamento (07/07/2026) e o próprio `POST /api/products` não emitem eventos de auditoria — `AuditEventType` não tem valores para catálogo/inventário mestre. Decisão: criar os eventos junto com o CRUD de itens de inventário (ver proposta em `doc_desenvolvimento/inventario-itens-crud-proposta.md`) |
| 15 | **Invariante "1 item vendável ativo por produto" só aplicacional** | Não há constraint de banco (índice único parcial exigiria migration raw SQL). O provisionamento detecta >1 item ativo, loga warn e faz no-op. Decisão futura do xua-banco-dados |
| 16 | **`createMovementOnce` captura P2002 dentro de transação interativa** | Padrão pré-existente em `inventory.repository.ts` (~linha 545): captura `P2002` e retorna `null`, mas em Postgres o erro aborta a transação — se um caller emitir statements na mesma tx após receber `null`, sofrerá `25P02` ("current transaction is aborted"). Candidato a revisão (por isso o provisionamento pré-checa unicidade do `code` antes do create, em vez de reagir à colisão) |
| 17 | **`REDELIVERY_SCHEDULED` invisível na fila do distribuidor** | Status intermediário (não ativo, não terminal) que também some de toda a UI da fila — não entra em `DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES` nem no novo grupo `DISTRIBUTOR_QUEUE_TERMINAL_STATUS_VALUES` (aba "Histórico", 26/07/2026). Diferente do caso resolvido (pedido finalizado, consulta), este é operacional — o pedido ainda precisa de ação (voltar para `OUT_FOR_DELIVERY`). Fora de escopo da entrega de 26/07 por decisão do usuário; decidir se vira aba própria ou entra em algum stage ativo existente |
| 18 | ~~**Cadastro de distribuidor/motorista só via SQL manual em produção**~~ **🟡 RESOLVIDO EM CÓDIGO (02/08/2026) — MIGRATION PENDENTE** | Não existia caminho de aplicação para criar distribuidora, criar motorista, vincular motorista↔distribuidora ou desativar qualquer um dos dois — evidência em `prisma/production/seed_distributor_sao_luiz_jf_users.sql` (admin criado via `INSERT` manual, hash de senha reciclado entre contas, sem auditoria). **Resolvido em código**: schema (`Consumer.is_active`, 5 novos `AuditEventType`), 6 endpoints novos no módulo `distributor` (`POST /api/distributor`, `PATCH /api/distributor/:id`, `POST/PATCH /api/distributor/drivers[/:id]`, `GET /api/distributor/drivers/unlinked`, `PATCH /api/distributor/drivers/:id/link`), checagem de `is_active` no login, 4 telas novas/editadas (`ops/distributors`, `ops/drivers`, `distributor/drivers`, `ops/zones` agora com escrita). **Não é um "concluído 100%":** a migration `20260802130000_add_consumer_is_active_and_management_audit_events` foi gerada mas **não foi aplicada em nenhum banco** — aguardando o usuário fornecer credenciais do banco de DEV (ver §2 "Bloqueado — aguardando o usuário"). Sem a migration aplicada, o campo `Consumer.is_active` e os novos endpoints não podem ser validados contra um banco real. **Recomendação sobre os seeds legados:** `prisma/production/seed_distributor_sao_luiz_jf*.sql` devem passar a ser tratados como fallback de emergência/disaster-recovery, não mais como fluxo padrão de onboarding de parceiros — o CRUD é o caminho oficial a partir desta entrega. Arquivos **não foram alterados nem removidos**, só a recomendação foi documentada. **Atenção — PII real:** `seed_distributor_sao_luiz_jf_users.sql` contém e-mail e hash de senha reais de um parceiro em produção (hash reciclado entre 3 contas); decisão de arquivar/restringir acesso/rotacionar senha cabe ao usuário e ao `xua-seguranca`. Detalhe completo: `doc_desenvolvimento/distribuidor-motorista-crud.md` |

---

## 4. Referências

- Documentação detalhada original: `docs/doc_sistema/` (5 arquivos, atualizados em 06/07/2026)
- Schema: `prisma/schema.prisma` · Rotas: `apps/api/src/http/routes.ts` · Páginas: `apps/web/app/`
- Detalhes de filas: `docs/doc_desenvolvimento/redis-bullmq/`
- CRUD de Distribuidor/Motorista (código completo, migration pendente): `docs/doc_desenvolvimento/distribuidor-motorista-crud.md`
- Últimos marcos: CRUD de Distribuidor/Motorista — código completo, migration pendente de aplicação em DEV (02/08), aba "Histórico" na fila do distribuidor (26/07), provisionamento automático de item de estoque na criação/reativação de produto (07/07), fix itens inativos no saldo de estoque (07/07), esqueci minha senha (`4ef76ad`, 01/07), fix aceite distribuidor (`01754e9`), caução v2 (24/06), retry de assinaturas (28/06)

**Última atualização: 02 de agosto de 2026.**
