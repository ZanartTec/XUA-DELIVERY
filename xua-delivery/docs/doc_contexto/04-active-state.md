# 04 — Active State: Estado Atual e Tarefas

> **Árvore de Contexto — Folhas (arquivo dinâmico).** Atualize este arquivo a cada entrega relevante. Estado consolidado em: **06/07/2026**.

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
| 1 | **Caução v1 legada no schema** | `15_trn_deposits` + `deposit_cents` + `DepositStatus` + eventos `DEPOSIT_HELD/REFUND_*` permanecem no schema/enum como legado da caução financeira, substituída pela v2. Decidir: remoção formal ou manutenção para histórico |
| 2 | **Endpoint órfão de cancelamento de assinatura** | `PATCH /api/user-subscriptions/:id/cancel` existe no backend, mas o botão "Cancelar" foi removido da UI do consumer (pendência "P6" citada na doc). Decidir destino do endpoint |
| 3 | **Sem anti-overbooking numérico** | A tabela `07_cfg_delivery_capacity` foi removida; não há bloqueio por contagem de pedidos por slot — só agenda/lead-time/bloqueios. Se overbooking virar problema real, reintroduzir controle de capacidade |
| 4 | **DDL histórico divergente** | O `doc_sistema.md` contém rascunhos de DDL e envelope de eventos "ricos" (correlation, geo, recorded_at) que **não** correspondem ao schema real (plano). Fonte da verdade: `prisma/schema.prisma`. Não implementar a partir do rascunho |
| 5 | **Eventos idealizados não implementados** | `payment_authorized`, `redelivery_completed`, `route_assigned`, `cart_created`, `consumer_registered`, `coverage_resolved` etc. constam apenas no rascunho — não existem no enum real |
| 6 | **Sem geocoding** | Endereços não têm lat/lng; cobertura resolvida por CEP/bairro (ViaCEP + `05_mst_zone_coverage`). Roteirização real exigirá geocoding |
| 7 | **Scheduler externo indefinido** | Jobs dependem de cron externo (Railway Cron ou Render citados). [A DEFINIR: provedor e frequências oficiais em produção] |
| 8 | **Socket.io monolítico** | Roda no mesmo processo da API — ok para MVP; extrair para serviço dedicado se precisar de escala horizontal |
| 9 | **LGPD / retenção** | Política de retenção de dados e evidências [A DEFINIR] |
| 10 | **CI/CD e ambientes** | Pipeline, staging e estratégia de migrations em produção não documentados [A DEFINIR] |
| 11 | **SMS fallback do OTP** | Docs citam "SMS fallback" e telefone obrigatório para OTP por SMS, mas só Web Push é descrito como canal implementado. [A DEFINIR: SMS está ativo?] |
| 12 | **Valores de negócio abertos** | Valor da caução v1 (R$ X), desconto de primeira compra (R$ X), frete — placeholders na doc original [A DEFINIR] |

---

## 4. Referências

- Documentação detalhada original: `docs/Doc_sistema/` (5 arquivos, atualizados em 06/07/2026)
- Schema: `prisma/schema.prisma` · Rotas: `apps/api/src/http/routes.ts` · Páginas: `apps/web/app/`
- Detalhes de filas: `docs/Redis_BullMQ_Queue/`
- Últimos marcos: esqueci minha senha (`4ef76ad`, 01/07), fix aceite distribuidor (`01754e9`), caução v2 (24/06), retry de assinaturas (28/06)
