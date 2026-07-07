# 01 — Blueprint: Escopo, Público e Entidades

> **Árvore de Contexto — Raiz.** Consolidado a partir de `doc_sistema.md`, `fluxo_atual_pedidos_xua.md`, `fluxo_usuarios_xua.md`, `guia_tecnico_xua.md` e `tabelas_banco_xua.md`. Última consolidação: 06/07/2026.

---

## 1. Objetivo e proposta de valor

O **Xuá Delivery** é uma plataforma de delivery de **água mineral em garrafão retornável 20L**, conectando consumidores a distribuidoras parceiras com entregas agendadas, rastreamento por status e gestão de logística reversa (vasilhames).

**Proposta de valor (diferencial vs. venda por WhatsApp):**

- **Plataforma automatizada** — pedido, pagamento e agendamento integrados no app, sem conversa manual.
- **Rastreamento em tempo real** — estados do pedido padronizados + notificações push/Socket.io em eventos-chave (tracking por status no MVP, não GPS).
- **SLA garantido** — metas monitoradas por eventos auditáveis: SLA de aceitação ≥ **98%**, taxa de aceitação ≥ **95%**, taxa de reentrega ≤ **3%**.
- **Gestão de ativos (vasilhames)** — logística reversa como pilar central: troca registrada por pedido, programa de caução por cliente, conciliação diária e inventário operacional.
- **Assinatura por planos** — reposição contínua "sem ruptura" via planos pré-definidos com desconto e geração automática de pedidos.

**Escopo do MVP:** garrafão 20L + compra avulsa + assinatura + pagamento in-app + POD via OTP + caução.

---

## 2. Público-alvo e papéis

### 2.1 Stakeholders de negócio

| Stakeholder | O que quer |
|---|---|
| **Consumidor (B2C)** | Comprar/assinar água 20L, agendar e acompanhar entrega, repetir pedido, controlar troca de vasilhames, suporte/FAQ |
| **Cliente B2B** (condomínios, academias, obras) | Assinatura com entregas recorrentes em janelas, previsibilidade, SLA, suporte |
| **Distribuidor / Operador (parceiro local)** | Receber e aceitar pedidos dentro do SLA, roteirizar, separar carga, registrar trocas/caução/não-coleta, controlar estoque e conciliação diária |
| **Entregador / Motorista** | Executar rota por zona/janela, entregar com prova (OTP), coletar vazios, checklist de saída, registrar ocorrências |
| **Operações Xuá / Hub** | Definir zonas e janelas, monitorar KPIs, governança, suporte, auditorias |
| **Comercial Xuá** | Vender a proposta com métricas e argumentos; garantir onboarding correto |
| **Suporte / SAC** | Tratar dúvidas, incidentes e trocas; alimentar FAQ |

### 2.2 Perfis de acesso (roles no JWT — enum `ConsumerRole`)

Todos os usuários vivem na tabela `01_mst_consumers`, diferenciados pelo campo `role`. **Não existe role `admin_master`.**

| Role | Superfície | Rota raiz | Permissões |
|---|---|---|---|
| `consumer` | Web mobile-first | `/catalog` | Criar/ver os próprios pedidos, endereços e assinaturas; escolher distribuidora no checkout (quando 2+ opções); avaliar NPS; configurar preferência de seleção automática |
| `distributor_admin` | Web responsivo | `/distributor/queue` | Aceitar/rejeitar pedidos (SLA countdown), checklist, despacho, atribuir motorista, conciliação, KPIs próprios, agenda semanal, inventário, config. de pagamento, programa de caução |
| `driver` | Web PWA (offline) | `/driver/deliveries` | Ver apenas pedidos despachados para si; validar OTP; registrar troca/não-coleta/falha; operar offline com fila IndexedDB |
| `ops` | Web desktop | `/ops/kpis` | Tudo do support + zonas, KPIs globais, banners, produtos, planos de assinatura, inventário global, exportar auditoria CSV |
| `support` | Web desktop | `/support` | Console de busca (telefone/email/order_id), timeline de auditoria, reagendar entrega, override de OTP com motivo obrigatório |

**Visão global:** `ops` e `support` têm permissão ampla no backend, mas **não existe** uma "fila master" unificada na UI (ver `04-active-state.md`).

### 2.3 Jornadas resumidas

- **Consumidor:** login/cadastro (com "esqueci minha senha") → endereço + detecção de zona por CEP → catálogo (bloqueado sem endereço) → carrinho (informa vazios para troca) → agendamento (14 dias, agenda da distribuidora) → seleção de distribuidora (auto-skip se ≤1 opção) → pagamento → acompanhamento em tempo real → OTP na entrega → NPS pós-entrega. Alternativa: contratar assinatura via wizard de 5 etapas.
- **Distribuidor:** fila com SLA countdown → aceitar/rejeitar com motivo → checklist 3 itens (bloqueia despacho até 100%) → despachar (gera OTP + atribui motorista) → conciliação diária → KPIs. Configura agenda semanal, datas bloqueadas, métodos de pagamento e programa de caução.
- **Motorista:** lista de entregas do dia (offline-capable) → valida OTP (máx 5 tentativas) → registra troca de vasilhames ou não-coleta com motivo → próxima parada. Sync automático ao reconectar.
- **Ops/Suporte:** KPIs globais, console de busca com timeline de auditoria, reagendamento, override de OTP, exportação CSV, CRUDs de zonas/banners/produtos/planos.

---

## 3. Entidades principais e interações no macro

### 3.1 Mapa de entidades

```
Consumer (usuário: qualquer role)
  ├── Address (N) ──> Zone ──> Distributor
  ├── Order (N)
  ├── UserSubscription (N) ──> SubscriptionPlan ──> Product
  ├── ConsumerDepositProgram / DepositBalance (caução v2, por distribuidora)
  └── PasswordResetToken / PushToken (segurança)

Distributor (distribuidora parceira)
  ├── Zone (N) ──> ZoneCoverage (bairros/CEPs)
  ├── DistributorSchedule (agenda semanal) + BlockedDates + TimeSlots
  ├── DistributorPaymentSettings (1:1 — credenciais Mercado Pago próprias)
  ├── InventoryBalance / InventoryMovement / ReconciliationSession
  └── Order (N)

Order (entidade central)
  ├── OrderItem (N) — snapshot de produto/preço
  ├── Payment (N) ──> PaymentTransaction (trilha técnica)
  ├── OrderOtp (N) — prova de entrega
  ├── Deposit (caução financeira v1, legado)
  ├── AuditEvent (N) — timeline append-only
  └── SubscriptionDeliveryDate (0..1) — quando gerado por assinatura
```

### 3.2 Interações no macro

1. **Endereço → Zona → Distribuidora:** o CEP/bairro do endereço resolve a zona (`05_mst_zone_coverage`), e a zona pertence a uma distribuidora. O consumidor pode escolher outra distribuidora que cubra a zona (se `allows_consumer_choice = true`); senão o sistema usa a da zona (modo `auto` vs `manual`, registrado na auditoria).
2. **Pedido:** criado pelo consumidor, pago via Mercado Pago **na conta da distribuidora do pedido**, enviado à fila da distribuidora, aceito, despachado com OTP e motorista, entregue com validação de OTP e registro de troca de vasilhames.
3. **Assinatura:** ops define planos (`SubscriptionPlan`, N:N com distribuidoras); consumidor contrata distribuindo a quantidade total entre datas; o sistema **gera pedidos automaticamente** para cada data (com retry e compensação em falha).
4. **Vasilhames (logística reversa):** cada água (`kind=WATER`) pode apontar para seu vasilhame (`kind=BOTTLE`). O programa de caução v2 controla quantos vasilhames cada cliente pode ter emprestados por distribuidora; saldo derivado de movimentos append-only. Inventário operacional rastreia estoque físico da distribuidora.
5. **Auditoria como fonte de verdade:** toda mutação relevante grava um `AuditEvent` na mesma transação; KPIs são calculados **somente** a partir desses eventos, nunca da tabela de pedidos.

### 3.3 A Xuá dentro do modelo

A Xuá, como operação, **é uma distribuidora registrada** na tabela de distribuidoras — não uma entidade especial. Seus operadores são usuários `distributor_admin` vinculados a ela (mapeamento via `resolveDistributorId(userId)`). Se a Xuá for a única distribuidora, todas as zonas ativas apontam para ela e todos os pedidos caem na sua fila.

---

## 4. Requisitos não funcionais (síntese)

- **SLAs de negócio:** aceitação 98% / taxa de aceite 95% / reentrega ≤ 3%.
- **SLOs técnicos (recomendados):** disponibilidade API 99,5% mensal; p95 catálogo/checkout ≤ 800ms; criação de pedido ≤ 1,5s.
- **Auditoria:** trilha append-only obrigatória (KPIs, disputas, penalidades/incentivos).
- **Segurança/LGPD:** RBAC, TLS 1.2+, criptografia em repouso para dados sensíveis, minimização de dados, política de retenção [A DEFINIR].
- **Usabilidade:** fluxo avulso em ≤ 6 telas; linguagem "garrafão vazio" no B2C vs "vasilhame" no backoffice; erros sempre com ação; módulo do entregador tolerante a offline.
