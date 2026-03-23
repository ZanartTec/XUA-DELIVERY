# Fluxo de Usuários — Xuá Delivery
## Versão Web — Next.js Fullstack Unificado

> **Zanart — Confidencial**

O sistema tem **4 usuários** com jornadas distintas. O fluxo abaixo descreve cada página, decisão, caminho alternativo e ponto de integração entre os usuários. Todas as superfícies rodam no mesmo projeto Next.js, acessíveis via navegador web (mobile-first). O Socket.io é embutido no custom server para notificações em tempo real.

---

## Usuários e Superfícies

| Usuário | Superfície | Perfil JWT | Rota raiz |
|---|---|---|---|
| Consumidor | Web mobile-first | `consumer` | `/catalog` |
| Distribuidor | Web responsivo | `distributor_admin` | `/distributor/queue` |
| Motorista | Web PWA (offline) | `operator` | `/driver/deliveries` |
| Operações / Suporte | Web desktop | `ops` / `support` | `/ops/kpis` ou `/ops/support` |

---

## Fluxo 1 — Consumidor
**15 páginas · Web mobile-first**

### Autenticação

```
Abre o navegador -> /login
├── Página de boas-vindas com logo Xuá e botões
│   ├── [Tem conta?] -> Form login: e-mail + senha
│   │   ├── [Erro de senha] -> toast de erro + tenta novamente
│   │   └── [Sucesso] -> middleware.ts decodifica JWT
│   │       ├── role=consumer           -> redirect /catalog
│   │       ├── role=distributor_admin  -> redirect /distributor/queue
│   │       ├── role=operator           -> redirect /driver/deliveries
│   │       └── role=ops                -> redirect /ops/kpis
│   └── [Novo?] -> /register -> nome + e-mail + senha (min 8 chars)
│       ├── Validação inline com Zod + React Hook Form
│       └── [Sucesso] -> redirect /profile/addresses (cadastrar endereço)
```

### Endereço e Cobertura

```
Confirmar endereço (/profile/addresses)
├── Input de CEP (8 dígitos)
│   ├── Ao completar: fetch ViaCEP -> autocompleta rua, bairro, cidade, estado
│   └── Sistema consulta 05_mst_zone_coverage para detectar zona
│       └── Zona encontrada -> define distribuidor automaticamente
├── [Sem cobertura] -> mensagem 'Ainda não atendemos sua região'
│   └── Botão 'Avise-me quando chegar' (salva email + CEP para futuro)
└── [Com cobertura] -> endereço salvo em 02_mst_addresses
    ├── Checkbox 'Definir como padrão' -> is_default = true
    └── Redirect para /catalog
```

### Fluxo de Compra (máx 6 páginas)

```
Catálogo (/catalog)
├── Garrafão 20L: imagem + preço (R$ XX,XX) + badge disponibilidade hoje
├── Botão 'Adicionar ao carrinho' -> store/cart.ts (Zustand)
└── [Sem endereço confirmado] -> catálogo não carrega (regra de negócio)

Carrinho (/cart)
├── Seletor de quantidade (+ / -)
├── [Campo obrigatório] 'Quantos garrafões vazios você tem?' (0–5+)
├── [1ª compra do consumidor] -> DepositBanner:
│   'Na primeira compra, cobramos uma caução de R$ XX,XX
│    pelo vasilhame. Ela é devolvida quando você devolver
│    o garrafão vazio na próxima entrega.'
└── Botão 'Agendar entrega' -> /checkout/schedule

Agendar entrega (/checkout/schedule)
├── Calendário horizontal: próximos 7 dias (componente Calendar shadcn/ui)
├── Para cada dia: pills 'Manhã (8h–12h)' e 'Tarde (13h–18h)'
│   └── [Slot esgotado] -> pill desabilitada + tooltip 'Esgotado'
├── Capacidade consultada: GET /api/zones/[id]/capacity
├── [Sem slots em nenhum dia] -> mensagem + link suporte
└── Botão 'Continuar para pagamento' -> /checkout/payment

Resumo e pagamento (/checkout/payment)
├── Breakdown do valor:
│     Garrafão 20L x 2 ............ R$ 50,00
│     Frete ........................ R$  5,00
│     [1ª compra] Caução ........... R$ 15,00
│     ----------------------------------------
│     Total ........................ R$ 70,00
├── SDK do gateway (iframe ou redirect)
├── [Pagamento aprovado] -> /checkout/confirmation
│   ├── Animação de sucesso (checkmark)
│   ├── 'Pedido #12345 confirmado!'
│   └── Botão 'Acompanhar pedido' -> /orders/[id]
└── [Pagamento recusado] -> mensagem erro + botão retry
    └── [3 tentativas falhadas] -> link suporte
```

### Acompanhamento e Pós-entrega

```
Status do pedido (/orders/[id]) — atualiza via Socket.io em tempo real
├── OrderTimeline (componente vertical colorido):
│   ├── [x] Pedido criado              (CREATED)
│   ├── [x] Pagamento confirmado       (CONFIRMED)
│   ├── [x] Enviado ao distribuidor    (SENT_TO_DISTRIBUTOR)
│   ├── [x] Aceito pelo distribuidor   (ACCEPTED_BY_DISTRIBUTOR)
│   ├── [x] Checklist concluído        (READY_FOR_DISPATCH)
│   ├── [ ] Em rota de entrega         (OUT_FOR_DELIVERY)
│   └── [ ] Entregue                   (DELIVERED)
│
├── [Estado = OUT_FOR_DELIVERY] -> OtpDisplay aparece:
│   ├── Card grande com OTP de 6 dígitos: '4 8 2 7 1 5'
│   ├── Texto: 'Informe este código ao motorista na entrega'
│   └── Timer: 'Expira em 87 minutos'
│
├── [Estado = DELIVERED] -> Avaliação NPS (modal automático):
│   ├── 5 estrelas clicáveis + textarea comentário (opcional)
│   ├── [Nota 1–2] -> 'Sentimos muito! Abrimos um chamado de suporte.'
│   ├── [Nota 3+] -> 'Obrigado pela avaliação!'
│   └── POST /api/orders/[id]/rating
│
└── [1ª compra + vasilhame coletado] -> Banner de caução:
    'Sua caução de R$ XX,XX foi devolvida com sucesso!'

Histórico de pedidos (/orders)
├── Lista paginada: data, status (badge colorido), total, itens
├── Filtro por status (select: todos, em andamento, entregues, cancelados)
└── [Pedido entregue] -> Botão 'Repetir pedido'
    └── 1 clique: copia itens + endereço + janela preferencial para /cart
    [Pedido cancelado] -> Badge cinza + motivo visível

Assinatura mensal (/subscription/create)
├── Selecionar quantidade (1–5 garrafões)
├── Selecionar janela preferencial (manhã ou tarde)
├── Calendário: próxima data de entrega calculada
├── Preview: 'Você receberá X garrafões todo dia DD de cada mês'
├── [Confirmar] -> POST /api/subscriptions
└── [Automático] Cron diário 06h gera pedido na data configurada

Gerenciar assinatura (/subscription/manage)
├── Card com status: ativa / pausada / cancelada
├── Botão 'Pausar'   -> Dialog confirmação: 'Pausa a partir do próximo ciclo'
├── Botão 'Retomar'  -> Reativa com próxima data recalculada
└── Botão 'Cancelar' -> Dialog: 'Tem certeza? Esta ação é irreversível'

Perfil (/profile)
├── Dados pessoais: nome, email, telefone
├── Lista de endereços com estrela no padrão
├── Status da caução: badge 'Retida R$ XX' ou 'Devolvida'
├── Botão 'Editar dados' -> /profile/edit
└── Botão logout -> limpa cookie + redirect /login
```

---

## Fluxo 2 — Distribuidor
**6 páginas · Web responsivo**

```
Login (role: distributor_admin) -> middleware redirect /distributor/queue

Fila de pedidos (/distributor/queue)
├── Cards de pedidos com status SENT_TO_DISTRIBUTOR
├── Cada card: nome cliente, endereço resumido, qty, janela, SlaCountdown
├── SlaCountdown: timer regressivo (verde > 2min, amarelo > 1min, vermelho < 60s)
│   └── [< 60s] -> animação pulse + bordas vermelhas
├── Socket.io: evento 'new_order' -> card novo aparece no topo com animação
└── Clique no card -> /distributor/orders/[id]

Detalhe do pedido (/distributor/orders/[id])
├── Info completa: cliente (nome, telefone, email), endereço, itens, valor total
├── SlaCountdown no topo da página
├── [Aceitar] -> Checklist de saída (/distributor/orders/[id]/checklist)
│   ├── 3 seções obrigatórias:
│   │   [ ] Itens separados e conferidos?
│   │   [ ] Vasilhames vazios para coleta preparados?
│   │   [ ] Endereço e contato do cliente confirmados?
│   ├── Progress bar: 0/3 -> 1/3 -> 2/3 -> 3/3
│   ├── Botão 'Despachar' -> DESABILITADO até 3/3 marcados
│   └── [100% marcado] -> Botão ativa -> confirma despacho
│       ├── OTP gerado no backend (HMAC-SHA256, 6 dígitos)
│       ├── Web Push enviado ao consumidor com o código
│       ├── Lista de paradas gerada para o motorista
│       └── Socket.io: 'order_dispatched' para consumer:{id}
└── [Recusar] -> RejectDialog (shadcn Dialog)
    ├── Select com motivos obrigatórios:
    │   'Sem estoque' | 'Endereço inválido' | 'Fora da zona' | 'Outro'
    ├── [Motivo = Outro] -> textarea obrigatória
    └── [Confirmar] -> Pedido cancelado + reembolso automático

Lista de paradas (/distributor/routes/[id])
├── Paradas agrupadas por zona e janela (manhã / tarde)
├── Cada parada: endereço, nome, qty, telefone, status (pendente/entregue)
└── Botão 'Abrir no Google Maps' -> window.open(maps_url)

Conciliação diária (/distributor/reconciliation)
├── Tabela editável:
│   | Saídas (cheios entregues)  | [input numérico] |
│   | Retornos (vazios coletados)| [input numérico] |
│   | Delta (calculado auto)     | X                |
├── [Delta > 0] -> Textarea justificativa obrigatória
│   └── Botão 'Fechar dia' desabilitado sem justificativa
├── [Delta = 0 ou Delta < 0] -> Botão 'Fechar dia' ativo
├── POST /api/reconciliations -> grava em 17_trn_reconciliations
└── Evento: DAILY_RECONCILIATION_CLOSED em audit_events

KPI Dashboard (/distributor/kpis)
├── 3 KpiCards com gráficos Recharts (últimos 30 dias):
│   [SLA aceitação: 98.5%]  meta >= 98% [verde/vermelho]
│   [Taxa aceitação: 96.2%] meta >= 95% [verde/vermelho]
│   [Taxa reentrega: 2.1%]  meta <= 3%  [verde/vermelho]
├── Seletor de período: 7d / 30d / 90d
└── Calculado via KpiService (somente audit_events)
```

---

## Fluxo 3 — Motorista
**5 páginas · Web PWA com offline**

```
Login (role: operator) -> middleware redirect /driver/deliveries

Lista de entregas do dia (/driver/deliveries)
├── Carregada ao abrir (GET /api/driver/deliveries)
├── Service Worker cacheia resposta no IndexedDB (funciona offline)
├── Cards: endereço, nome cliente, qty garrafões, telefone
├── Status de cada parada: pendente (cinza) / entregue (verde) / falha (vermelho)
├── [Sem internet] -> OfflineBanner no topo:
│   'Você está offline. X eventos na fila de sincronização.'
└── Clique na parada -> /driver/deliveries/[id]/otp

Confirmar OTP (/driver/deliveries/[id]/otp)
├── 6 inputs numéricos (cada um aceita 1 dígito)
├── Auto-avanço: ao digitar, foco vai pro próximo input automaticamente
├── Backspace: volta pro input anterior
├── [OTP correto]
│   ├── Checkmark verde + vibração (navigator.vibrate)
│   └── Redirect -> /driver/deliveries/[id]/exchange
└── [OTP errado]
    ├── Shake animation nos inputs + toast 'Código incorreto'
    ├── Contador: 'Tentativa 2 de 5'
    └── [5 erros] -> Inputs bloqueados + mensagem:
        'Código bloqueado. Contate o suporte para override.'
        └── Botão 'Ligar para suporte' -> tel: link

Registro de troca (/driver/deliveries/[id]/exchange)
├── Stepper visual: Passo 1 (quantidade) -> Passo 2 (condição)
├── Passo 1: 'Quantos garrafões vazios você coletou?' (0 a 5+)
│   └── Botões numéricos grandes (fácil de tocar com luva)
├── [qty > 0] -> Passo 2: Condição de cada garrafão
│   ├── Radio buttons: OK / Danificado / Sujo
│   └── [1ª compra do consumidor + qty >= 1]
│       ├── Caução devolvida automaticamente no backend (Regra A)
│       └── Consumer recebe Web Push: 'Caução devolvida!'
├── [qty = 0] -> Redirect /driver/deliveries/[id]/non-collection
└── [Confirmar] -> POST /api/orders/[id]/bottle-exchange
    ├── Se offline: evento salvo no IndexedDB com UUID v4
    └── Redirect -> próxima parada na lista

Motivo de não coleta (/driver/deliveries/[id]/non-collection)
├── Select obrigatório com motivos:
│   'Cliente ausente' | 'Sem acesso ao local' | 'Sem vasilhame'
│   'Local inseguro'  | 'Outro'
├── [Motivo = Outro] -> Textarea obrigatória (min 10 caracteres)
├── Botão 'Registrar' desabilitado sem motivo selecionado
├── POST /api/orders/[id]/empty-not-collected
└── Evento: EMPTY_NOT_COLLECTED em audit_events

Offline sync (Service Worker + IndexedDB)
├── [Sem internet] -> Eventos enfileirados no IndexedDB
│   ├── Cada evento recebe UUID v4 ANTES de enfileirar (idempotência)
│   └── OfflineBanner: 'Offline. 3 eventos na fila.'
└── [Reconectou] -> Sync automático:
    ├── Banner muda: 'Sincronizando... 2/3'
    ├── Progress bar animada
    ├── Servidor valida UUID: duplicado ignorado
    ├── [Tudo sincronizado] -> Banner verde: 'Tudo sincronizado!'
    └── [Erro em algum] -> Banner amarelo: 'X eventos falharam. Tentar novamente?'
```

---

## Fluxo 4 — Operações e Suporte
**6 páginas · Web desktop**

```
Login (role: ops ou support) -> middleware redirect por role
├── ops     -> /ops/kpis
└── support -> /ops/support

[ops] Configurar zonas (/ops/zones)
├── Lista de zonas existentes com distribuidor vinculado
├── Botão 'Nova zona' -> /ops/zones/create
│   ├── Form: nome da zona, selecionar distribuidor, bairros/CEPs cobertos
│   ├── Configurar capacidade: para cada dia da semana, definir
│   │   slots manhã (qtd) e tarde (qtd)
│   └── Configuração reflete imediatamente no checkout do consumidor
└── Clique em zona existente -> /ops/zones/[id] (editar)

[ops] Dashboard KPIs (/ops/kpis)
├── Visão de TODOS os distribuidores (diferente do /distributor/kpis que é individual)
├── Tabela: distribuidor | SLA | aceitação | reentrega | status
├── Gráficos Recharts: linha temporal dos 3 KPIs
├── Filtro por distribuidor (select) e período (7d/30d/90d)
├── Cards resumo: melhor distribuidor, pior distribuidor, média geral
└── Calculado via KpiService com filtro por distributor_id

[ops + support] Console de suporte (/ops/support)
├── Barra de busca: telefone, e-mail ou order_id
├── Resultado: dados do cliente + lista de todos os pedidos
└── Clique no pedido -> /ops/support/[id]
    ├── Detalhe completo: cliente, endereço, itens, valores, distribuidor
    ├── Timeline de TODOS os audit_events do pedido (cronológica)
    │   └── Cada evento: tipo, ator, timestamp, metadata expansível
    └── [Ação] Botão 'Reagendar entrega' -> Dialog:
        ├── Calendar: nova data
        ├── Select: nova janela (manhã/tarde)
        ├── [Confirmar] -> PATCH /api/orders/[id]/reschedule
        └── Evento: REDELIVERY_SCHEDULED em audit_events

[ops + support] Override de OTP (/ops/otp-override)
├── Buscar pedido por order_id
├── Info do pedido: cliente, status, tentativas de OTP
├── Confirmar entrega SEM código OTP (cliente sem acesso ao navegador)
├── Select motivo obrigatório:
│   'Cliente idoso sem smartphone' | 'Problema técnico no navegador'
│   'Cliente confirmou por telefone' | 'Outro'
├── [Motivo = Outro] -> Textarea obrigatória
├── [Confirmar override] -> POST /api/orders/[id]/confirm-otp body:{override:true}
├── Evento: OTP_VALIDATION_ATTEMPTED com metadata.manual_override=true
└── Evento: ORDER_DELIVERED com actor=support/ops

[ops] Exportar auditoria (/ops/audit)
├── Filtros:
│   ├── Período: data início + data fim (Calendar shadcn)
│   ├── Distribuidor: select (todos ou específico)
│   └── Tipo de evento: multi-select dos 24 tipos
├── Preview: tabela com primeiros 50 resultados
├── Botão 'Exportar CSV' -> Route Handler gera e retorna download
└── CSV com colunas: event_id, event_type, occurred_at, actor_type,
    actor_id, order_id, distributor_id, source_app, metadata (JSON)
```

---

## Pontos de Integração entre Usuários

Todos os eventos de notificação passam pelo **Socket.io** embutido no custom server do Next.js. Web Push é usado como fallback para quando o usuário não está com a página aberta.

| Evento | Emissor | Receptor | Canal |
|---|---|---|---|
| Novo pedido criado | Consumidor | Distribuidor | Socket.io (sala `distributor:{id}`) |
| Pedido confirmado (pago) | Sistema | Consumidor | Socket.io + Web Push |
| Pedido aceito | Distribuidor | Consumidor | Socket.io + Web Push |
| Pedido despachado + OTP | Distribuidor | Consumidor | Socket.io + Web Push (com OTP) |
| OTP enviado | Sistema | Consumidor | Web Push (código no corpo) |
| Pedido entregue | Motorista | Consumidor | Socket.io + Web Push |
| Caução devolvida | Sistema | Consumidor | Socket.io + Web Push |
| SLA em risco (< 60s) | Sistema | Distribuidor | Socket.io (sala `distributor:{id}`) |

---

## Regras de Negócio Críticas

- **Sem endereço confirmado** → catálogo não carrega (sem zona detectada = sem produto)
- **Sem slot disponível** → checkout bloqueado (anti-overbooking com `SELECT FOR UPDATE`, retorna 409)
- **Caução** → cobrada apenas na 1ª compra, devolvida automaticamente quando motorista coleta ≥ 1 vasilhame (Regra A no DepositService)
- **OTP** → gerado ao despachar com HMAC-SHA256, TTL 90min, max 5 tentativas. Após 5 erros → status `locked` → só override de ops/support
- **Despachar** → botão bloqueado até checklist 100% marcado (3/3 itens). Não tem bypass.
- **Não coleta** → motivo obrigatório sempre. Campo de texto livre NUNCA é a única opção (select + opcional texto).
- **Conciliação** → justificativa obrigatória quando delta (saídas - retornos) > 0. Botão bloqueado sem justificativa.
- **Todos os estados** → registrados em `18_aud_audit_events` na mesma transação da mutação. `emitEvent()` atômico.

---

## Mapa Completo de Rotas Next.js (App Router)

| Rota | Layout | Perfil | Descrição |
|---|---|---|---|
| `/login` | (auth) | todos | Login e-mail + senha. Middleware redireciona por role. |
| `/register` | (auth) | consumer | Cadastro: nome + email + senha (min 8). Redirect → `/profile/addresses`. |
| `/catalog` | (consumer) | consumer | Catálogo: garrafão 20L com preço + disponibilidade. Requer endereço. |
| `/cart` | (consumer) | consumer | Carrinho: qty + garrafões vazios (obrigatório) + banner caução 1ª compra. |
| `/checkout/schedule` | (consumer) | consumer | Agendamento: Calendar 7 dias + pills manhã/tarde + slot esgotado. |
| `/checkout/payment` | (consumer) | consumer | Resumo (produto+frete+caução) + SDK gateway + retry. |
| `/checkout/confirmation` | (consumer) | consumer | Confirmação: animação sucesso + botão acompanhar pedido. |
| `/orders` | (consumer) | consumer | Histórico paginado + filtro status + "Repetir pedido" 1 clique. |
| `/orders/[id]` | (consumer) | consumer | Detalhe: OrderTimeline + OTP display + NPS modal + caução badge. |
| `/subscription/create` | (consumer) | consumer | Criar assinatura: qty + janela + Calendar + preview valor. |
| `/subscription/manage` | (consumer) | consumer | Gerenciar: pausar / retomar / cancelar com Dialog confirmação. |
| `/profile` | (consumer) | consumer | Dados + endereços + caução + logout. |
| `/profile/addresses` | (consumer) | consumer | CRUD endereços: CEP + ViaCEP + definir padrão. |
| `/profile/edit` | (consumer) | consumer | Editar nome, email, telefone. |
| `/distributor/queue` | (distributor) | dist_admin | Fila: cards com SlaCountdown + Socket.io `new_order`. |
| `/distributor/orders/[id]` | (distributor) | dist_admin | Detalhe: info + aceitar/recusar (motivo obrigatório). |
| `/distributor/orders/[id]/checklist` | (distributor) | dist_admin | Checklist 3 itens + Progress + Despachar bloqueado até 100%. |
| `/distributor/routes/[id]` | (distributor) | dist_admin | Paradas: por zona/janela + link Google Maps. |
| `/distributor/reconciliation` | (distributor) | dist_admin | Conciliação: saídas/retornos/delta + justificativa obrigatória. |
| `/distributor/kpis` | (distributor) | dist_admin | KPIs: 3 cards Recharts + seletor período. |
| `/driver/deliveries` | (driver) | operator | Lista entregas do dia (funciona offline via Service Worker). |
| `/driver/deliveries/[id]/otp` | (driver) | operator | OTP: 6 inputs auto-avanço + shake erro + contador tentativas. |
| `/driver/deliveries/[id]/exchange` | (driver) | operator | Troca: stepper qty→condição. Caução Regra A automática. |
| `/driver/deliveries/[id]/non-collection` | (driver) | operator | Não-coleta: select motivo obrigatório + texto opcional. |
| `/driver/sync` | (driver) | operator | Status fila offline: eventos pendentes + progresso sync. |
| `/ops/zones` | (ops) | ops | Configurar zonas: CRUD + capacidade por dia/janela. |
| `/ops/zones/create` | (ops) | ops | Nova zona: nome + distribuidor + bairros/CEPs + capacidade. |
| `/ops/zones/[id]` | (ops) | ops | Editar zona existente. |
| `/ops/kpis` | (ops) | ops | KPIs global: todos distribuidores + gráficos + filtros. |
| `/ops/support` | (ops) | ops/support | Console: busca telefone/email/order_id + lista pedidos. |
| `/ops/support/[id]` | (ops) | ops/support | Detalhe: timeline audit_events + reagendar (Dialog). |
| `/ops/otp-override` | (ops) | ops/support | Override OTP: confirmar sem código + motivo obrigatório. |
| `/ops/audit` | (ops) | ops | Exportar: filtros período/distribuidor/tipo + download CSV. |

---

*Xuá Delivery — Fluxo de Usuários v3.0 (Next.js Fullstack Unificado)*
*Zanart · Março 2026*
*33 rotas · 4 perfis · 32 páginas · Socket.io embutido · PWA offline*
