# FLUXOS XUÁ DELIVERY

## Fluxo ponta a ponta com :

**- telas/módulos
- ações do usuário
- stakeholders envolvidos
- regras de usabilidade** (incluindo o que precisa virar regra de negócio, API,

## estados e eventos).

**1) Stakeholders (quem usa o quê, e por quê)**

**1.1. Consumidor (B2C)**

- Quer **comprar/assinar** água (foco inicial: **garrafão retornável 20L** ).
- Quer **agendar** e **acompanhar** entrega.
- Quer **repetir pedido** e controlar **troca/coleta de vasilhames**.
- Quer **suporte** e **FAQ**.

**1.2. Cliente B2B (condomínios, academias, obras)**

- Quer **assinatura mensal** e **entregas recorrentes** com **janelas**.
- Quer previsibilidade, **SLA** , e **suporte**.

**1.3. Distribuidor / Operador (parceiro local)**

- Recebe pedido, precisa **aceitar dentro do SLA** , **roteirizar** , separar carga e
    entregar.
- Precisa registrar **trocas** , **caução** (quando aplicável), e **motivos de não coleta**.
- Controla **estoque** (cheios/vazios) e **conciliação diária**.

**1.4. Entregador / Motorista**

- Executa rota por **zona/janela** , faz entrega e coleta vazios.
- Precisa de **checklist de saída** , script de comunicação e registro de ocorrências.


**1.5. Operações Xuá / Hub (central)**

- Define **zonas** , **janelas** (manhã/tarde) e capacidade.
- Monitora **KPIs** (SLA aceitação **98%** , taxa aceitação **95%** , reentrega **3%** , e outros).
- Faz governança, suporte e auditorias (ex.: campanha Moto Xuá prevê auditoria
    trimestral).

**1.6. Comercial Xuá**

- Usa o material para vender a proposta e garantir **onboarding** correto.
- Depende de métricas e argumentos (diferencial vs WhatsApp, SLAs, rastreio,
    gestão de vasilhames).

**1.7. Suporte / SAC**

- Trata dúvidas, incidentes e trocas; alimenta FAQ e padrões de resposta.

**2) Arquitetura funcional (aplicações e módulos)**

A plataforma é **dois produtos** :

1. **App Consumidor (mobile)**
2. **Dashboard Distribuidor/Xuá (web e/ou mobile)**

Além disso, existe o **módulo do entregador** ( “modo entregas” no app do distribuidor).

**3) Passo a passo (ponta a ponta) — com usabilidade + requisitos de programação**

**Etapa 0 — Pré-requisitos (cadastros, zonas, catálogo, SLAs)**

**Stakeholders:** Operações Xuá + Distribuidor
**Objetivo:** garantir que o app não prometa o que a operação não cumpre.

**Requisitos de programação**

- Cadastro e validação de **distribuidores** (documentação, integração, capacidade
    mínima).
- Configuração de **zona de atendimento** + **janelas** (manhã/tarde) + **SLA por zona**.
- **[NOVO]** Configuração por distribuidora do campo `allows_consumer_choice` (default `false`):
    - `true` — distribuidora aparece no seletor do consumidor no checkout.
    - `false` — distribuidora é usada apenas quando é a única da zona (modo auto).
- Catálogo (SKU), preços, promoções locais (previsto no dashboard).
- Parâmetros de vasilhames:
    - cota por cliente
    - regras de integridade/penalidades
    - rastreabilidade (scanner/identificação)


**Usabilidade (conceito)**

- Regra de ouro: **não mostrar disponibilidade/janela** se a zona não estiver
    atendida.
- Explicar com linguagem simples “ **por que** ” um horário não aparece (capacidade
    esgotada, fora da área etc.).

**Etapa 1 — Onboarding do consumidor (cadastro + localização)**

**Stakeholders:** Consumidor; Operações (indiretamente)
**Tela/Módulo:** Cadastro Simplificado + Localização Inteligente

**Passo a passo do usuário**

1. Abrir app
2. Cadastrar (e-mail/Google/etc., conforme projeto estratégico)
3. Confirmar endereço (geolocalização + edição manual)
4. App identifica distribuidor/zona

**Requisitos de programação**

- Autenticação (e-mail/social) + sessão.
- Serviço de geocoding + normalização de endereço.
- Match: endereço → zona → distribuidor (com fallback para “sem cobertura”).

**Usabilidade**

- Minimizar fricção: **1 – 2 passos** para chegar ao catálogo.
- Sempre permitir **editar endereço** (muito comum em condomínios/obras).
- Mostrar “ **entregamos aqui** ” com janela e SLA já no onboarding (reduz abandono).

**Etapa 2 — Catálogo e seleção de compra (avulso / pacote / assinatura)**

**Stakeholders:** Consumidor; Comercial (posicionamento); Distribuidor (preço/estoque)
**Tela/Módulo:** Catálogo de Produtos (foco 20L)

**Passo a passo**

1. Ver produto (garrafão 20L)
2. Escolher modalidade: avulso / pacote / assinatura (o projeto prevê assinatura)
3. Definir quantidade
4. Informar “tenho X vazios para troca” (gestão de vasilhames)


**Requisitos de programação**

- Catálogo com disponibilidade por zona/distribuidor.
- Regras de vasilhame:
    - campo “vazios para troca” (intenção)
    - validações (ex.: cota do cliente, pendências, caução se primeira compra)
- Carrinho com cálculo de taxas (se houver) e políticas.

**Usabilidade**

- “Gestão de vasilhames” tem que ser **assistida** (microcopy):
    - “Quantos garrafões vazios você tem para trocarmos na entrega?”
- Evitar termos internos (“vasilhame”) para B2C; usar “garrafão vazio”, e manter
    “vasilhame” apenas no backoffice.

**Etapa 3 — Agendamento e janela de entrega (SLA)**

**Stakeholders:** Consumidor; Operações; Distribuidor; Motorista
**Tela/Módulo:** Agendamento (expressa vs agendada; manhã/tarde)

**Passo a passo**

1. Escolher dia
2. Escolher janela (manhã/tarde) disponível
3. Confirmar SLA estimado

**Requisitos de programação**

- Motor de janelas: capacidade por zona/janela/dia.
- Cálculo e “reserva” de capacidade no momento do checkout.
- Estados do pedido: **created → scheduled → paid? → sent_to_distributor**.

**Usabilidade**

- Mostrar janelas como **slots simples** (ex.: “Manhã (8–12)”, “Tarde (13–18)”).
- Mostrar status de forma humana, mas com estados consistentes para o sistema.


**Etapa 3½ — Seleção de distribuidora [NOVA ETAPA]**

**Stakeholders:** Consumidor; Distribuidores com `allows_consumer_choice=true`
**Tela/Módulo:** Checkout — `/checkout/distributor`

**Passo a passo**

1. Após o agendamento, o sistema consulta `GET /api/distributors?zone_id=...&date=...&window=...`
2. Se 0 ou 1 resultado — a tela é ignorada e o sistema usa a distribuidora da zona automaticamente
3. Se 2 ou mais resultados — o consumidor vê cards de seleção com nome, média NPS (estrelas) e próxima disponibilidade
4. Consumidor escolhe e confirma

**Requisitos de programação**

- Endpoint `GET /api/distributors` filtra por `is_active + allows_consumer_choice + zone_coverage + capacidade disponível`.
- Média NPS calculada como `ROUND(AVG(nps_score)::numeric, 1)` de pedidos `DELIVERED` da distribuidora.
- Lista ordenada por `avg_nps DESC NULLS LAST`.
- `distributor_id` selecionado enviado no payload do pedido (campo opcional).
- O servico `resolveDistributor()` valida e registra `distributor_selection_mode: 'manual' | 'auto'` no evento de auditoria `ORDER_CREATED`.
- Endpoint `PATCH /api/consumers/:id/assign-mode` permite ao consumidor configurar a preferência `auto_assign_distributor` no perfil.

**Usabilidade**

- Se apenas 1 distribuidora disponível: fluxo completamente transparente (sem tela).
- Cards devem mostrar informações objetivas (nome, nota, próxima data).
- Consumidor pode sempre deixar o sistema escolher automaticamente via toggle no perfil.


**Etapa 4 — Checkout e pagamento (quando aplicável) + caução**

**Stakeholders:** Consumidor; Distribuidor; Suporte; Operações
**Tela/Módulo:** Checkout

**Passo a passo**

1. Revisar pedido
2. Selecionar pagamento
3. Se “primeira compra” e necessário: exibir política de **caução** (operação menciona)
4. Confirmar

**Requisitos de programação**

- Integração pagamento (se existir no escopo; a operação menciona “pedidos e
    pagamentos integrados”).
- Regra “primeira compra”:
    - aplicar desconto (operação cita “Primeira Compra Especial” com **R$ X** )
    - caução **R$ X** (retenção/controle e posterior devolução conforme regra)
- Registro de termos: aceite de política de troca/caução.

**Usabilidade**

- Transparência radical:
    - caução precisa ser explicada como “depósito reembolsável quando o
       garrafão retornar”.
- Se tiver caução, mostrar **linha separada** no resumo (valor do produto vs caução).

**Etapa 5 — Pedido chega ao distribuidor (Aceite dentro do SLA)**

**Stakeholders:** Distribuidor; Operações Xuá
**Aplicação:** Dashboard do Distribuidor (Gestão de Pedidos)

**Passo a passo do operador**

1. Receber notificação de novo pedido
2. Aceitar ou rejeitar com motivo (dentro do SLA de aceitação)
3. Pedido entra na fila de separação/rota

**Requisitos de programação**

- SLA de aceitação (documento operacional cita meta **98%** ).
- Eventos e logs:
    - timestamp de recebimento


- timestamp de aceite
- motivo de rejeição (se houver)
- Notificações (push/WhatsApp interno/painel — campanha Moto Xuá cita canais;
operação cita scripts e comunicação).

**Usabilidade**

- Botão de aceite com **contagem regressiva** /alertas.
- Rejeição exige motivo padronizado (para análise posterior).

**Etapa 6 — Preparação, roteirização e despacho (checklist)**

**Stakeholders:** Distribuidor; Entregador; Operações
**Aplicação:** Dashboard + Modo Entregas

**Passo a passo**

1. Agrupar pedidos por **zona e janela**
2. Gerar rota (roteirização inteligente, prevista no projeto)
3. Checklist de saída (operação menciona)
4. “Saiu para entrega”

**Requisitos de programação**

- Modelo de rota:
    - agrupamento por janela/zona
    - capacidade do veículo
- Checklist obrigatório antes de “despachar”:
    - itens/quantidades
    - vasilhames a coletar (intenção + confirmação)
    - endereço/contato
- Estados: **accepted → picking → dispatched**.

**Usabilidade**

- Operação não pode depender de memória: checklist tem que ser **interativo** e
    rápido.
- Erros comuns: endereço, troca não registrada, agrupamento ruim — então a UI
    deve prevenir.


**Etapa 7 — Entrega + troca/coleta de vazios + registro de exceções**

**Stakeholders:** Entregador; Consumidor; Distribuidor; Suporte
**Aplicação:** Modo Entregas + App Consumidor (tracking)

**Passo a passo**

1. Entregador chega
2. Confirma entrega (com prova: assinatura/foto/código — definir)
3. Coleta garrafões vazios (ou registra “não coletado” com motivo)
4. Se houver troca: registra no app (operação: “Utilize o campo ‘troca’ no aplicativo”)
5. Finaliza entrega

**Requisitos de programação**

- Prova de entrega (POD): escolher padrão e armazenar.
- Motivos de não coleta (operação menciona registro obrigatório e revisão
    semanal):
       - lista padronizada
       - texto opcional
       - evidência opcional
- Atualização de inventário de vasilhames:
    - cheios saíram
    - vazios entraram
    - divergências sinalizadas

**Usabilidade**

- Motivos de não coleta precisam ser **1 toque** (listas curtas).
- Registro deve ser possível offline (se área sem sinal) e sincronizar depois.

**Etapa 8 — Pós-entrega: feedback, NPS e reentrega**

**Stakeholders:** Consumidor; Operações; Comercial; Distribuidor
**Aplicação:** App consumidor + Painel Operações

**Passo a passo**

1. Consumidor recebe pedido como “entregue”
2. App pede avaliação (NPS/nota/feedback)
3. Se falha de entrega: fluxo de reentrega (operação cita reentrega como KPI)


**Requisitos de programação**

- Disparo de pesquisa NPS e armazenamento.
- Tratamento de incidentes:
    - pedido “não entregue”
    - reentrega
    - troca indevida
- KPI reentrega (meta citada **3%** ) e taxa de aceitação **95%**.

**Usabilidade**

- Feedback deve ser “ **1 pergunta + opcional** ”.
- Se nota baixa, abrir CTA direto para suporte (“resolver agora”).

**Etapa 9 — Conciliação diária e governança de vasilhames**

**Stakeholders:** Distribuidor; Operações Xuá
**Aplicação:** Dashboard (estoque e relatórios)

**Passo a passo**

1. Fechamento do dia: comparar saídas vs retornos (operação menciona conciliação
    diária)
2. Quarentena de vasilhames com defeito
3. Relatório final ao gestor

**Requisitos de programação**

- Rotina de conciliação:
    - entradas/saídas por dia
    - divergências e justificativas
- Fluxo de quarentena (status do vasilhame).
- Auditoria (campanha Moto Xuá: auditoria trimestral) — logs e trilha de auditoria.

**Usabilidade**

- Painel de divergências deve ser “fila de resolução” (não só relatório).
- Exportação/relatório simples para o gestor.


**4) Diferenciais de usabilidade (vs WhatsApp) que viram requisito técnico**

Dos docs: “ **Plataforma automatizada** , **rastreamento em tempo real** , **SLA garantido** ”.

Isso precisa virar:

- **Estados do pedido** bem definidos + push em eventos-chave.
- **Tracking** (mesmo que simplificado por status, não GPS real no MVP).
- **SLA por etapa** :
    - SLA de aceite (operacional)
    - SLA de entrega por janela/zona
- **Observabilidade** : logs e painéis para ver gargalos (aceite, despacho, reentrega).

**5) Artefatos de programação (o que especificar para o time dev)**

Para transformar esse passo a passo em backlog, recomendo estruturar assim:

1. **Jornadas (B2C, B2B, Distribuidor, Entregador, Operações)**
2. **Mapa de estados do pedido** (state machine)
3. **Entidades principais**
    - Usuário, Endereço, Zona, Janela, Distribuidor, Pedido, Item, Pagamento,
       Vasilhame, Ocorrência, Avaliação/NPS
4. **Eventos e KPIs**
    - timestamps por etapa (para SLA)
    - NPS
    - aceite, reentrega, não coleta, divergência de vasilhame


**Escopo do MVP** definido: ( **garrafão 20L + avulso + assinatura + pagamento in-appUser
stories (por stakeholder)**

- **Requisitos não funcionais** (SLA, auditoria, logs etc.)
- **Backlog técnico priorizado** ( **MVP → v1 → v2** ) pronto para produto/engenharia

**1) Premissas e decisões de produto (para guiar dev)**

**Canais/sistemas previstos pelos docs**

- **App Consumidor (mobile)** : cadastro simplificado, localização, catálogo, avulso +
    assinatura, agendamento, histórico, rastreio/status, notificações.
- **Dashboard Distribuidor (web/mobile)** : pedidos, aceite, roteirização, estoque,
    vasilhames (cheios/vazios), relatórios, comunicação, preços/promoções.
- **Módulo Entregas (motorista)** : checklist de saída, execução da rota, prova de
    entrega, troca/coleta e motivos de não coleta.

**Regras operacionais explícitas nos docs**

- Fluxo “ponta a ponta”: **Pedido → Processamento (validação**
    **estoque/agendamento) → Distribuição → Entrega (na janela + coleta) →**
    **Pós-entrega (feedback + inventário)**.
- Gestão de vasilhames: **integridade/penalidades** , **cota por**
    **cliente** , **monitoramento digital (scanner)**.
- **Regras de prioridade** :
    - Prioridade 1: **janela crítica**
    - Prioridade 2: **primeira compra** (e política de caução/condições)
- KPIs/SLAs (Operação): **SLA de aceitação 98%** , **taxa de aceitação 95%** , **reentrega**
    **3%**.
- Governança/auditoria: ranking/auditoria trimestral aparece na campanha;
    operação fala em **compliance e auditoria de vasilhames**.

**2) User Stories por stakeholder (com critérios de aceite)**

**2.1. Consumidor (B2C)**

**A. Onboarding, localização e cobertura**

1. **Como consumidor, quero me cadastrar rapidamente** para começar a comprar
    sem atrito.
       - Aceite: login/cadastro concluído em ≤2 min; persistência de sessão.
2. **Como consumidor, quero cadastrar/editar meu endereço** para ver
    disponibilidade real da minha região/zona.


- Aceite: endereço validado; se fora de cobertura, mensagem clara e opção
    “avise-me”.
3. **Como consumidor, quero que o app detecte minha zona/distribuidor
automaticamente** para mostrar catálogo e janelas corretas.
- Aceite: sempre há um distribuidor associado ou status “sem cobertura”.

**B. Catálogo 20L e carrinho** 4. **Como consumidor, quero ver o produto garrafão
retornável 20L** com preço e condições para comprar.

- Aceite: SKU 20L disponível por zona; preço exibido; restrições (estoque/limite)
    claras.
5. **Como consumidor, quero escolher quantidade e informar se tenho garrafões**
    **vazios para troca** para facilitar a logística reversa.
       - Aceite: campo “vazios para troca” obrigatório quando aplicável;
          validações de limites configuráveis.
6. **Como consumidor, quero revisar meu carrinho e custos (produto + entrega +**
    **caução quando existir)** para entender o total.
       - Aceite: breakdown completo; política de caução compreensível.

**C. Assinatura** 7. **Como consumidor, quero contratar uma assinatura** para ter reposição
contínua “sem ruptura” (proposta de valor).

- Aceite: plano configurável (frequência/quantidade); próxima entrega exibida.
8. **Como consumidor, quero pausar/retomar/cancelar assinatura** sem precisar
    falar no WhatsApp.
       - Aceite: regras de prazo (cutoff) por janela/dia; confirmação e registro do
          evento.

**D. Agendamento e SLA** 9. **Como consumidor, quero agendar entrega por janelas
(manhã/tarde)** para ter previsibilidade.

- Aceite: só exibe janelas com capacidade; confirma data/janela antes de pagar.
10. **Como consumidor, quero acompanhar o status do pedido** para reduzir
    ansiedade (diferencial vs WhatsApp).
- Aceite: estados padronizados; push a cada mudança relevante.

**E. Pagamento in-app** 11. **Como consumidor, quero pagar no app** para concluir o pedido
sem fricção.

- Aceite: pagamento aprovado → pedido confirmado; pagamento recusado →
    tentativa novamente.
12. **Como consumidor, quero reembolso/estorno quando aplicável** (cancelamento
    dentro da política) para ter confiança.
- Aceite: regras claras; logs; status financeiro e operacional separados.


**F. Pós-entrega** 13. **Como consumidor, quero avaliar a entrega (NPS)** para registrar
minha satisfação.

- Aceite: NPS disparado após “entregue”; notas baixas abrem canal de suporte.
14. **Como consumidor, quero histórico e “repetir pedido”** para comprar em poucos
    toques.
- Aceite: 1 clique repete com validação de estoque/janela.

**2.2. Distribuidor / Operador**

**A. Onboarding operacional**

1. **Como distribuidor, quero ter meu cadastro aprovado e integrar via API** para
    operar com o Xuá Delivery (requisito explícito).
       - Aceite: credenciais + chaves + ambiente de teste; checklist de
          homologação.
2. **Como distribuidor, quero configurar zona, janelas e capacidade** para não
    aceitar pedidos além do que consigo entregar.
       - Aceite: capacidade por zona/janela/dia; bloqueio automático quando
          lotado.

**B. Gestão de pedidos (recebimento → aceite)** 3. **Como distribuidor, quero receber
pedidos com notificação** para agir dentro do SLA de aceitação.

- Aceite: alerta imediato; indicador de tempo para expirar.
4. **Como distribuidor, quero aceitar/rejeitar com motivo** para manter governança e
    análise.
       - Aceite: rejeição exige motivo; métricas calculadas (aceite e SLA).

**C. Separação, roteirização e despacho** 5. **Como distribuidor, quero agrupar pedidos
por zona/janela e gerar rotas** para reduzir custo (eficiência operacional).

- Aceite: agrupamento; sugestão de rota; export/visualização simples.
6. **Como distribuidor, quero um checklist de saída** para reduzir erro de
    separação/entrega.
       - Aceite: não permite “despachar” sem checklist concluído.

**D. Vasilhames (cheios/vazios)** 7. **Como distribuidor, quero registrar trocas e
coletas** para manter controle de ativos.

- Aceite: troca registrada por pedido; atualização de inventário.
8. **Como distribuidor, quero registrar “não coleta” com motivo** (obrigatório nos
    docs) para gestão de exceções.
       - Aceite: lista de motivos padronizada; relatório semanal possível.


9. **Como distribuidor, quero conciliação diária de vasilhames** (in/out) para evitar
    perdas.
       - Aceite: relatório diário; divergências em fila para resolução.
10. **Como distribuidor, quero triagem/quarentena** para vasilhame com defeito.
- Aceite: status “quarentena”; motivo; rastreabilidade.

**E. KPIs, penalidades e incentivos** 11. **Como distribuidor, quero ver meus KPIs (SLA,
aceitação, reentrega)** para melhorar e participar de incentivos.

- Aceite: painel com métricas e séries; cálculo consistente com logs.
12. **Como distribuidor, quero trilha de auditoria** para me defender de penalidades e
    validar ranking.
- Aceite: logs imutáveis por evento (aceite, despacho, entrega, troca).

**2.3. Entregador / Motorista**

1. **Como motorista, quero receber minha rota e lista de paradas** para executar
    dentro da janela.
       - Aceite: ordenação; mapa ou lista; contato do cliente.
2. **Como motorista, quero registrar entrega com prova** para encerrar a parada com
    segurança.
       - Aceite: assinatura/foto/código (definir); timestamp e geolocalização
          (quando possível).
3. **Como motorista, quero registrar troca/coleta de vazios** para manter inventário
    correto.
       - Aceite: campos simples; confirmação final.
4. **Como motorista, quero registrar ocorrência e motivo de não coleta** para evitar
    retrabalho e reentrega.
       - Aceite: fluxo rápido; motivo obrigatório.

**2.4. Operações Xuá (Hub/central)**

1. **Como operações, quero definir SLAs e monitorar cumprimento** para garantir
    padrão de serviço.
       - Aceite: indicadores calculados automaticamente; alertas de risco.
2. **Como operações, quero auditar dados de distribuidores** (vasilhames e
    performance) para governança/compliance.
       - Aceite: trilha auditável; export de evidências; regras de amostragem.


3. **Como operações, quero monitorar reentregas e motivos** para atacar causas
    raiz.
       - Aceite: dashboard por zona/distribuidor/motivo; backlog de melhorias.

**2.5. Comercial / Suporte**

**Comercial**

1. **Como comercial, quero ver argumentos e métricas do serviço** para vender o
    diferencial vs WhatsApp.
       - Aceite: materiais e painéis com KPIs; “o que resolvemos” claro.

**Suporte** 2. **Como suporte, quero consultar pedido, status, pagamento e troca** para
resolver chamados rapidamente.

- Aceite: busca por telefone/pedido; histórico de eventos; ações permitidas (ex.:
    reentrega).

**3) Requisitos Não Funcionais (SLA, auditoria, logs, segurança, usabilidade)**

**3.1. SLAs e SLOs (operacionais e de produto)**

- **SLA de aceitação (distribuidor)** : meta **98%** dentro do tempo configurado (docs).
- **Taxa de aceitação** : meta **95%** (docs).
- **Reentrega** : meta **3%** (docs).
- **Janelas de entrega** : manhã/tarde; o sistema deve bloquear overbooking.

**SLOs técnicos recomendados (para engenharia)**

- Disponibilidade API (core): **99,5%** mensal (MVP pode ser menor, mas precisa
    meta).
- Tempo de resposta p95:
    - catálogo/checkout: ≤ **800ms** no backend
    - criação de pedido: ≤ **1.5s**

**3.2. Auditoria e trilha de eventos (obrigatório para KPIs/penalidades/incentivo)**

Registrar eventos com:

- **event_type** (pedido_criado, pagamento_aprovado, pedido_aceito, despachado,
    entregue, troca_registrada, nao_coletado, reentrega etc.)
- **actor_type** (consumidor, distribuidor, motorista, sistema, suporte)
- **actor_id**
- **order_id**


- **timestamp** (UTC)
- **metadata** (motivos, quantidades, evidências)

**Imutabilidade prática**

- Logs append-only (event sourcing “light”) ou trilha de auditoria com
    hash/assinatura.

**3.3. Observabilidade**

- Logs estruturados + correlação por **order_id**.
- Métricas: taxa de erro, latência, conversão checkout, falhas de pagamento, falhas
    de push.
- Alertas: risco de violar SLA (fila de pedidos sem aceite).

**3.4. Segurança e LGPD (mínimo)**

- RBAC no dashboard (perfis: admin distribuidor, operador, motorista, suporte,
    operações Xuá).
- Criptografia em trânsito (TLS 1.2+) e em repouso.
- Minimização de dados: só o necessário para entrega.
- Retenção: definir política (ex.: eventos e pedidos por X meses; evidências por Y).

**3.5. Usabilidade e acessibilidade (para “intuitivo” estilo Zé Delivery)**

- Fluxo de compra avulsa: objetivo **≤ 6 telas** até confirmar.
- Linguagem: “garrafão vazio” (front) vs “vasilhame” (backoffice).
- Estados claros e humanos + máquina de estados consistente.
- Offline tolerante no módulo entregador (cache e sincronização de eventos).

**4) Backlog técnico priorizado (MVP → v1 → v2)**

**4.1. MVP (go-live piloto com avulso + assinatura + pagamento in-app)**

**Objetivo:** operar com segurança, medir KPIs, cumprir janela e controlar troca básica.

**Produto/Funcional**

1. App consumidor:
    - cadastro/login
    - endereço + detecção de zona
    - catálogo 20L
    - carrinho
    - agendamento manhã/tarde (capacidade)


- assinatura (criar/pausar/cancelar) – versão simples
- pagamento in-app
- status do pedido + push (principais estados)
- histórico + repetir pedido
2. Dashboard distribuidor:
- fila de pedidos + notificação
- aceite/rejeite com motivo + SLA contador
- agrupamento por zona/janela
- despacho (checklist)
3. Módulo entregas:
- lista de paradas
- “entregue” + prova (definir 1 método)
- troca/coleta: registrar quantos vazios coletou
- motivo de não coleta (lista)
4. Backoffice/Operações:
- parametrização de zona/janela/capacidade
- KPIs básicos: SLA aceitação, taxa aceitação, reentrega
5. Auditoria/logs:
- trilha de eventos mínima para KPIs e disputas
6. Gestão de vasilhame (mínimo):
- campo “troca” por pedido
- conciliação diária simples (relatório)

**Técnico**

- API core (pedidos, janelas, assinatura, pagamentos, eventos)
- Modelo de dados (orders, subscriptions, events, inventory-lite)
- Observabilidade mínima (logs + métricas)

**4.2. v1 (robustez operacional + eficiência de custo)**

**Objetivo:** reduzir reentrega, profissionalizar inventário e roteirização, melhorar suporte.

1. Roteirização inteligente (melhorias) + otimização por zona/janela
2. Estoque completo (cheios/vazios) por distribuidor + alertas


3. Conciliação diária avançada + “fila de divergências”
4. Quarentena/triagem com fluxo completo
5. Suporte/SAC com console (busca por pedido/cliente) + ações (reagendar,
    reentrega)
6. Políticas completas:
    - “primeira compra especial” (desconto **R$ X** )
    - caução **R$ X** com devolução (se estiver no desenho final)
7. Notificações inteligentes (status + lembretes de janela)

**4.3. v2 (escala, governança e diferenciais)**

**Objetivo:** consolidar moat: rastreio, programa de fidelidade, auditoria forte e incentivos.

1. Rastreamento em tempo real (quando fizer sentido: GPS/ETA)
2. Scanner/identificação de vasilhames (rastreabilidade “de verdade”)
3. Programa de fidelidade
4. Painel de incentivos (Moto Xuá): ranking mensal, auditoria trimestral, penalidades
    automáticas
5. Analytics avançado (cohort de assinatura, churn, recorrência)
6. Múltiplos SKUs/portfólio (se expandir além do 20L)

**5) Entregáveis para o time (como transformar em Jira/Linear rapidamente)**

Se você quiser, eu já devolvo no próximo passo (em texto mesmo) um pacote com:

- **Epic → Features → User Stories** (com critérios de aceite em Gherkin)
- **Modelo de estados do pedido** (state machine)
- **Mapa de eventos auditáveis** (event types + payload)
- **Modelo de dados inicial** (tabelas e chaves)

Só preciso que você defina 3 escolhas do MVP (para não “inventar” regra operacional):

1. **Prova de entrega (POD)** : assinatura na tela / foto / código OTP?
2. **Caução** entra no MVP ou fica para v1? (os docs mencionam, mas dá para fatiar)
3. **Assinatura** : semanal, quinzenal, mensal — ou “a cada X dias”?


**POD via código OTP** , **assinatura mensal** e, sobre **caução** , o mais indicado (pelos
próprios documentos) é **manter caução no MVP** , porque:

- a operação coloca **“Primeira Compra + Caução”** como **prioridade 2** e como
    parte do fluxo;
- a caução é o mecanismo mais direto para reduzir perda de ativo (vasilhame) — e a
    plataforma tem **gestão de ativos como pilar central** (logística reversa).

_Base documental: Operação Xuá Delivery (pptx) traz “_ **_Política de Troca, Primeira Compra
e Caução_** _”, “_ **_Prioridade 2: Primeira Compra... caução_** _” e “_ **_Devolução Caução_** _”; e o
Projeto Estratégico reforça que_ **_gestão de garrafões (ativos) e logística reversa_** _são
pilares._

**1) User stories (por stakeholder) — com critérios de aceite objetivos**

**1.1. Consumidor (B2C)**

**A) Cadastro, cobertura e endereço**

1. **Como consumidor, quero me cadastrar/entrar com e-mail ou Google** para
    iniciar compras rapidamente.
    **Aceite**
       - Login cria sessão persistente.
       - Se falhar, exibir erro acionável (ex.: e-mail inválido).
2. **Como consumidor, quero cadastrar e editar meu endereço** para ver
    catálogo/janelas do meu distribuidor.
    **Aceite**
       - Endereço validado (logradouro/número/bairro/cidade).
       - Se “fora de área”, app informa indisponibilidade e não permite checkout.
3. **Como consumidor, quero que o app identifique automaticamente o**
    **distribuidor/zona** para garantir SLA real.
    **Aceite**
       - Sempre retorna **zona_id** e **distribuidor_id** ou status “sem cobertura”.

**B) Compra avulsa 20L (core do MVP)**

4. **Como consumidor, quero comprar garrafão retornável 20L avulso** escolhendo
    quantidade para resolver minha necessidade imediata.
    **Aceite**
       - SKU 20L aparece com preço vigente.
       - Quantidade limitada por regra (configurável) sem quebrar o app.
5. **Como consumidor, quero informar quantos garrafões vazios tenho para**
    **troca** para ajudar na logística reversa.
    **Aceite**


- Campo “vazios para troca” no carrinho/checkout.
- Persistência no pedido ( **expected_empty_return_qty** ).

**C) Assinatura mensal (no MVP)**

6. **Como consumidor, quero criar uma assinatura mensal de garrafão 20L** para
    reposição contínua sem ruptura.
    **Aceite**
       - Permite selecionar “mensal” e quantidade.
       - Exibe próxima entrega/renovação.
7. **Como consumidor, quero pausar/retomar/cancelar assinatura** para ter
    flexibilidade.
    **Aceite**
       - Cancelamento gera evento auditável e confirma política (cutoff).
       - Pausa impede cobrança/geração de novos pedidos.

**D) Janelas (manhã/tarde) e agendamento**

8. **Como consumidor, quero escolher janela de entrega (manhã/tarde)** para
    garantir previsibilidade.
    **Aceite**
       - Só mostra janelas com capacidade.
       - Reserva capacidade ao confirmar pedido (evita overbooking).

**E) Pagamento in-app + caução**

9. **Como consumidor, quero pagar no app** para confirmar meu pedido sem
    depender de WhatsApp.
    **Aceite**
       - **payment_approved** → pedido “confirmado”.
       - **payment_failed** → mantém carrinho e permite nova tentativa.
10. **Como consumidor de primeira compra, quero entender e pagar a caução do**
    **vasilhame** para receber o garrafão retornável com transparência.
    **Aceite**
- Caução aparece separada no resumo e no recibo.
- Termo/explicação simples: “depósito temporário até devolução”.
11. **Como consumidor, quero receber a devolução (reembolso) da caução quando**
    **devolver o vasilhame** para confiar no modelo.
    **Aceite**
- Evento “vasilhame devolvido” dispara fluxo de devolução (status rastreável).
- Histórico mostra: caução “retida” → “devolvida”.


**F) Entrega, OTP e pós-venda**

12. **Como consumidor, quero receber um código OTP** para validar a entrega e
    reduzir fraude/entrega indevida.
    **Aceite**
- OTP gerado por pedido e janela.
- OTP expira após entrega (ou tempo configurável).
13. **Como consumidor, quero acompanhar o status do pedido** para reduzir
    ansiedade (diferencial vs WhatsApp).
    **Aceite**
- Estados consistentes e notificados (push).
14. **Como consumidor, quero avaliar (NPS) após a entrega** para registrar minha
    satisfação.
    **Aceite**
- NPS dispara em até X min após status “entregue”.

**1.2. Distribuidor / Operador (dashboard)**

**A) Recebimento, aceite e SLA**

1. **Como distribuidor, quero ser notificado quando um pedido chegar** para aceitar
    dentro do SLA.
    **Aceite**
       - Notificação + fila com contador.
       - Registro de timestamps: recebido/aceito.
2. **Como distribuidor, quero aceitar ou rejeitar pedidos com motivo** para
    governança e melhoria contínua.
    **Aceite**
       - Rejeição exige motivo padronizado.
       - Métricas calculáveis: **SLA aceitação** e **taxa**
          **aceitação** (metas **98%** e **95%** citadas nos docs).

**B) Preparação, checklist e despacho**

3. **Como distribuidor, quero executar checklist de saída** (itens, vasilhames,
    endereço/contato) para reduzir erros comuns.
    **Aceite**
       - Não permite “despachar” sem checklist completo.
4. **Como distribuidor, quero agrupar pedidos por zona e janela** para eficiência
    operacional.
    **Aceite**


- Filtro por zona/janela.
- Lista pronta para atribuição ao motorista.

**C) Troca, não coleta e conciliação**

5. **Como distribuidor, quero registrar troca no app** (“Utilize o campo troca...”) para
    controle de ativos.
    **Aceite**
       - Campo obrigatório no fechamento da entrega (quando aplicável).
       - Evento auditável.
6. **Como distribuidor, quero que “não coletado” exija registro obrigatório com**
    **motivo** para gerar relatórios e revisão semanal.
    **Aceite**
       - Sem motivo, não finaliza ocorrência.
7. **Como distribuidor, quero conciliação diária de vasilhames (saídas vs**
    **retornos) com justificativa de diferença** para controle rigoroso.
    **Aceite**
       - Relatório diário; divergência exige justificativa.

**1.3. Motorista / Entregador (modo entregas)**

1. **Como motorista, quero ver minha lista de entregas por janela/zona** para
    executar dentro do horário crítico.
    **Aceite**
       - Paradas com endereço/contato/observações.
2. **Como motorista, quero confirmar entrega via OTP** para evitar contestação.
    **Aceite**
       - OTP válido encerra pedido como “entregue”.
       - Tentativas inválidas limitadas e auditadas.
3. **Como motorista, quero registrar troca/coleta e motivos de não coleta** para
    manter inventário correto.
    **Aceite**
       - Quantidade coletada e motivo (se não coletou) ficam no pedido.

**1.4. Operações Xuá (Hub/central)**

1. **Como operações, quero configurar zonas, janelas e capacidade** para garantir
    que a promessa do app seja executável.
    **Aceite**
       - Capacidade impede overbooking.


- Configurável por distribuidor.
2. **Como operações, quero acompanhar KPIs (SLA aceitação, taxa aceitação,
reentrega)** para governar a rede.
**Aceite**
- Painel por período e distribuidor.
- Baseado em logs (não “manual”).
3. **Como operações, quero trilha de auditoria** para validar dados (auditoria
trimestral/penalidades/incentivos).
**Aceite**
- Export de eventos e evidências.

**1.5. Suporte / Comercial**

**Suporte**

1. **Como suporte, quero consultar pedido/pagamento/entrega/troca em um**
    **console** para resolver chamados rápido.
    **Aceite**
       - Busca por telefone, e-mail ou **order_id**.
       - Mostra timeline de eventos.

**Comercial** 2. **Como comercial, quero ter relatórios dos diferenciais (SLA, rastreio,
vasilhames)** para argumentar contra WhatsApp/tradicional.
**Aceite**

- Indicadores e textos de proposta de valor disponíveis.

**2) Requisitos não funcionais (NFR) — já alinhados aos docs**

**2.1. SLAs/KPIs (negócio) com mensuração técnica**

- **SLA de aceitação do pedido** : meta **98%** (docs).
- **Taxa de aceitação** : meta **95%** (docs).
- **Reentrega** : meta **3%** (docs).

**Obrigatório para cálculo**

- Todos os eventos precisam de timestamp e actor (distribuidor/motorista/sistema).

**2.2. Auditoria (obrigatória para penalidades/incentivos e “verdade do dado”)**

- Trilhas de auditoria para:
    - aceite/rejeição (com motivo)
    - despacho


- tentativa OTP (sucesso/falha)
- entrega confirmada
- troca / não coleta (com motivo)
- conciliação diária e justificativas
- eventos financeiros (pagamento/caução/reembolso)

**2.3. Logs e observabilidade**

- Logs estruturados com **order_id** , **distributor_id** , **zone_id** , **subscription_id**.
- Métricas:
    - latência p95 em endpoints críticos
    - taxa de falha pagamento
    - taxa de falha geração OTP
    - conversão carrinho → pagamento aprovado
- Alertas:
    - pedidos “pendentes de aceite” perto do timeout
    - backlog de entregas na janela crítica

**2.4. Segurança e conformidade (mínimo de produção)**

- RBAC (operações, suporte, distribuidor admin, operador, motorista).
- TLS 1.2+; criptografia em repouso para dados sensíveis.
- LGPD: consentimento, minimização, e política de retenção (definir).

**2.5. Usabilidade (regras testáveis)**

- Fluxo avulso “abrir app → pedido confirmado” em **≤ 6 telas**.
- Mensagens de erro sempre com ação (ex.: “editar endereço”, “tentar outro
    pagamento”).
- Texto: “garrafão vazio” no app consumidor; termos técnicos no dashboard.

**3) Backlog técnico priorizado (MVP → v1 → v2)**

**3.1. MVP (piloto operável com governança)**

**Épico A — Fundamentos da plataforma**

- A1. Modelagem de
    domínio: **User** , **Address** , **Distributor** , **Zone** , **DeliveryWindow** , **Product(20L)** , **Ord**
    **er** , **Subscription** , **Payment** , **Deposit(Caução)** , **BottleExchange** , **AuditEvent**.
- A2. RBAC + autenticação (consumidor e operadores).


- A3. Serviço de zonas/janelas/capacidade (anti-overbooking).

**Épico B — Jornada consumidor (avulso + assinatura + pagamento)**

- B1. Cadastro/login + perfil.
- B2. Endereço + detecção de zona/distribuidor.
- B3. Catálogo 20L + carrinho.
- B4. Agendamento manhã/tarde com reserva de capacidade.
- B5. Assinatura mensal: criar/pausar/cancelar (regras simples).
- B6. Pagamento in-app:
    - pagamento de pedido avulso
    - pagamento inicial de assinatura
- B7. Caução (primeira compra):
    - cálculo/exibição
    - retenção e estado “caução pendente/devolvida”
- B8. Push de estados essenciais + histórico/repetir pedido.

**Épico C — Operação distribuidor e entregador**

- C1. Dashboard: fila de pedidos + notificação + aceite/rejeição com motivo e
    contador de SLA.
- C2. Agrupamento por zona/janela.
- C3. Checklist de saída obrigatório.
- C4. Modo entregas:
    - lista de paradas
    - confirmação via OTP
    - registro troca/coleta e “não coletado” com motivo

**Épico D — Auditoria e métricas**

- D1. Event log (timeline) com eventos mínimos (operacional + financeiro).
- D2. KPIs básicos: SLA aceitação, taxa aceitação, reentrega (mesmo que reentrega
    seja “flag” inicial).
- D3. Relatório diário simples de vasilhames (saídas vs retornos).

**3.2. v1 (eficiência + suporte + inventário forte)**

- V1-1. Console de suporte (busca, timeline, ações controladas).
- V1-2. Conciliação diária avançada: divergências em fila + justificativas + export.


- V1-3. Estoque completo (cheios/vazios) por distribuidor + alertas.
- V1-4. Políticas mais completas:
    - regras de devolução caução (SLA e condições)
    - “primeira compra especial” (desconto **R$ X** ) se for ativado
- V1-5. Roteirização aprimorada (heurísticas melhores, capacidade por veículo).
- V1-6. Reentrega como fluxo (abrir ocorrência → reprogramar → medir).

**3.3. v2 (escala, rastreio e auditoria “hard”)**

- V2-1. Rastreamento em tempo real (ETA + localização do entregador, se for
    estratégico).
- V2-2. Scanner/serialização de vasilhames (rastreio real de ativos).
- V2-3. Incentivos/penalidades automatizados e ranking (Moto Xuá):
    - auditoria trimestral suportada por evidências
    - penalidades por fraude/atraso conforme regra da campanha
- V2-4. Analytics avançado (cohort assinatura, churn, LTV, performance por zona).

**4) Decisões de MVP**

- **POD** : **OTP**
- **Assinatura** : **mensal**
- **Caução** : **recomendada no MVP** , por ser pilar de controle de ativo + prioridade
    operacional


**1) Mapa de eventos auditáveis (com payload mínimo)**

A base documental exige **governança/compliance** , **SLA de aceitação** , **taxa de
aceitação** , **reentrega** , e controle de **troca / não coleta / conciliação de
vasilhames** (com registro obrigatório no app e revisão semanal), além de **pagamentos
integrados** e **devolução de caução**. Isso pede um **event log** consistente (idealmente
append-only) para permitir auditoria e cálculo de KPIs.
(Fontes: Operação Xuá Delivery; Treinamento Comercial; Campanha Moto Xuá)

**1.1. Envelope padrão (campos obrigatórios em todo evento)**

Estes campos devem existir em **todos** os eventos, independentemente do tipo:

- **event_id** (UUID)
- **event_type** (string enum)
- **occurred_at** (ISO-8601 UTC)
- **recorded_at** (ISO-8601 UTC; quando persistido no backend)
- **actor** :
    - **actor_id** (UUID/ID interno)
- **correlation** :
    - **order_id** (UUID; opcional para eventos pré-pedido)
    - **subscription_id** (UUID; quando assinatura)
    - **payment_id** (UUID; quando financeiro)
    - **deposit_id** (UUID; quando caução)
    - **distributor_id** (UUID/ID)
    - **zone_id** (UUID/ID; se existir)
- **source** :
    - **version** (string)
    - **device_id** (string; opcional)
- **ip** (opcional; útil para fraude)
- **geo** (opcional; ex.: **lat** , **lng** , **accuracy_m** )
- **metadata** (objeto; **somente o mínimo do tipo do evento** )

_Regra de ouro:_ **_o KPI sempre deve poder ser calculado só com eventos_** _(ex.: SLA
aceitação = diferença
entre_ **_order_received_by_distributor_** _e_ **_order_accepted_by_distributor_** _)._


**1.2. Taxonomia de eventos (MVP) + payload mínimo**

**A) Identidade e endereço (MVP)**

1. **consumer_registered**
2. **consumer_address_saved**
- **metadata** : **{ "address_id": "UUID", "city": "string", "neighborhood": "string",**
    **"is_default": true }**
3. **coverage_resolved**

**B) Catálogo / carrinho (mínimo para rastreio de funil)**

4. **cart_created**
- **metadata** : **{ "cart_id": "UUID" }**
5. **cart_item_added**
- **metadata** : **{ "product_id": "20L", "qty": 1 }**
6. **delivery_window_selected**
- **metadata** : **{ "delivery_date": "YYYY-MM-DD", "window": "morning|afternoon" }**
7. **exchange_intent_declared**
- **metadata** : **{ "expected_empty_return_qty": 0 }**

**C) Pedido (core do estado operacional)**

8. **order_created**
- **metadata** : **{ "channel": "consumer_app", "items":**
    **[{"product_id":"20L","qty":1}], "delivery_date":"YYYY-MM-DD",**
    **"window":"morning|afternoon" }**
9. **order_pricing_finalized**
- **metadata** : **{ "items_total": "number", "delivery_fee": "number",**
    **"deposit_amount": "number", "grand_total": "number", "currency": "BRL" }**
10. **order_submitted_for_payment**
- **metadata** : **{ "payment_provider": "string", "attempt": 1 }**
11. **order_confirmed**

_Emite quando pagamento aprovado e reserva final de capacidade ok._

- **metadata** : **{ "confirmed_by": "system" }**
12. **order_cancelled**


**D) Pagamento e caução (MVP: pagamento in-app + caução)**

13. **payment_created**
14. **payment_authorized**
- **metadata** : **{ "provider_payment_ref":"string" }**
15. **payment_captured**
- **metadata** : **{ "provider_payment_ref":"string" }**
16. **payment_failed**
- **metadata** : **{ "provider_error_code":"string",**
    **"failure_stage":"authorize|capture", "is_retryable": true }**
17. **deposit_held** (caução retida)
- **metadata** : **{ "deposit_amount":"number", "currency":"BRL",**
    **"policy_version":"string", "trigger":"first_purchase|no_empty_return" }**
18. **deposit_refund_initiated**
- **metadata** : **{ "deposit_amount":"number", "currency":"BRL",**
    **"reason":"empties_returned|account_close" }**
19. **deposit_refunded**
- **metadata** : **{ "provider_refund_ref":"string" }**

_Observação importante: nos slides consta “_ **_Devolução Caução realizada após a
confirmação da entrega_** _”, mas a política completa envolve “devolução dos vasilhames”.
Para não abrir brecha, no MVP recomendo:_

- **(a)** entrega confirmada + **(b)** troca/coleta confirmada com quantidade adequada
    ⇒ **deposit_refund_initiated**.

**E) Distribuidor: recebimento, aceite, SLA e despacho**

20. **order_received_by_distributor**
- **metadata** : **{ "received_via":"api|dashboard", "acceptance_sla_seconds": 0 }**
21. **order_accepted_by_distributor**
- **metadata** : **{ "accepted": true }**
22. **order_rejected_by_distributor**
23. **route_assigned**
- **metadata** : **{ "route_id":"UUID", "driver_id":"UUID", "sequence": 12 }**
24. **dispatch_checklist_completed**
- **metadata** : **{ "items_ok": true, "empties_expected_ok": true,**
    **"address_contact_ok": true }**
25. **order_dispatched**


- **metadata** : **{ "route_id":"UUID" }**

**F) Entrega, OTP e troca/não coleta (registro obrigatório)**

26. **otp_generated**
- **metadata** : **{ "otp_purpose":"delivery_confirmation",**
    **"otp_method":"numeric_6", "expires_at":"ISO-8601" }**
27. **otp_sent**
28. **otp_validation_attempted**
29. **order_delivered**
- **metadata** : **{ "delivery_confirmed_by":"otp", "delivered_at":"ISO-8601" }**
30. **bottle_exchange_recorded** (troca/coleta)
31. **empty_not_collected** (não coletado)
32. **redelivery_required**
33. **redelivery_completed**
- **metadata** : **{ "attempt_number": 2 }**

**G) Conciliação diária e auditoria**

34. **daily_reconciliation_started**
- **metadata** : **{ "date":"YYYY-MM-DD" }**
35. **daily_reconciliation_closed**
- **metadata** : **{ "date":"YYYY-MM-DD", "full_bottles_out": 0, "empty_bottles_in":**
    **0, "delta": 0 }**
36. **daily_reconciliation_delta_justified**
- **metadata** : **{ "date":"YYYY-MM-DD", "delta": 0, "justification":"string" }**
37. **audit_snapshot_exported**


**2) Especificação do OTP (geração e validação) para entregas**

Nos documentos, a entrega final atualiza status para “entregue”, e há foco em governança
e auditoria; OTP entra como **prova de entrega** com trilha forte.

**2.1. Objetivo**

- Confirmar **entrega ao cliente correto**.
- Reduzir contestação, fraude e divergências de inventário/vasilhames.
- Alimentar auditoria (campanha prevê auditoria de dados) e KPIs.

**2.2. Regras de elegibilidade (guardrails)**

O pedido só pode usar OTP se:

- estiver em estado **OUT_FOR_DELIVERY** (saiu para entrega), e
- estiver **dentro da janela** (manhã/tarde) do agendamento, com tolerância
    configurável (ex.: ±30 min), e
- não estiver cancelado, e
- **otp_status** não for **LOCKED** (bloqueado por tentativas).

**2.3. Geração**

- Formato: **numérico de 6 dígitos** ( **000000** – **999999** ), evitando sequências óbvias
    (opcional).
- Gatilho de geração:
    1. (Recomendado) no momento de **order_dispatched** , ou
    2. quando a parada virar “próxima” na rota ( **route_assigned** + proximidade).
- Validade:
    - **ttl_seconds** : 30 a 120 min (configurável); sugestão inicial **60 min**.
- Armazenamento:
    - Persistir **somente hash** do OTP (ex.: HMAC/argon2/bcrypt) + **expires_at**.
    - Nunca logar OTP em texto claro.
- Campos mínimos (tabela/order):
    - **otp_hash**
    - **otp_expires_at**
    - **otp_attempts** (int)
    - **otp_last_attempt_at**


**2.4. Entrega do OTP ao consumidor**

Canais possíveis (o evento existe para auditoria):

- Push (app)
- SMS (fallback)
- WhatsApp (se houver canal oficial)

Eventos:

- **otp_generated**
- **otp_sent**

**2.5. Validação (no app do motorista)**

Fluxo:

1. Motorista seleciona pedido → “Confirmar entrega”
2. Digita OTP informado pelo cliente
3. Backend valida:
    - pedido elegível
    - **now <= otp_expires_at**
    - **otp_status == ACTIVE**
    - hash confere
4. Em sucesso:
    - marcar **otp_status = USED**
    - emitir **otp_validation_attempted (success)**
    - emitir **order_delivered**
5. Em falha:
    - incrementar **otp_attempts**
    - emitir **otp_validation_attempted (failure)**
    - se exceder tentativas: **otp_status = LOCKED**

Parâmetros recomendados:

- **max_attempts** : 5
- lockout: até expirar, ou por X minutos (configurável)


**2.6. Exceções (para não travar a operação)**

Caso OTP falhe por motivo legítimo (cliente sem acesso ao app, etc.), prever ação
controlada:

- “Entrega sem OTP” (somente perfis autorizados, ex.: supervisor distribuidor/ops)
    - exige motivo e evidência mínima
    - gera evento **order_delivered** com **delivery_confirmed_by =**
       **"manual_override"**

_Isso protege SLA e evita reentrega desnecessária, mas mantém governança._

**3) Máquina de estados do pedido (com transições e guardrails)**

Fontes citam claramente o fluxo **Recebimento → Aceite (SLA) → Preparação/Rota →
Entrega Final → Pós-entrega (feedback + inventário)** , além de troca e não coleta, e KPIs
de aceitação/reentrega.

**3.1. Estados (MVP)**

Vou separar em **estado operacional** e **estado financeiro** , mas o “estado do pedido”
principal (para UI/KPIs) pode ser:

1. **DRAFT** (carrinho, não pedido)
2. **CREATED** (pedido criado)
3. **PAYMENT_PENDING**
4. **CONFIRMED** (pagamento ok + janela reservada)
5. **SENT_TO_DISTRIBUTOR** (pedido notificado/encaminhado)
6. **ACCEPTED_BY_DISTRIBUTOR**
7. **REJECTED_BY_DISTRIBUTOR**
8. **PICKING** (separação)
9. **READY_FOR_DISPATCH**
10. **OUT_FOR_DELIVERY**
11. **DELIVERED**
12. **DELIVERY_FAILED** (falha na tentativa; pode virar reentrega)
13. **REDELIVERY_SCHEDULED**
14. **CANCELLED**
15. **REFUNDED** (financeiro; pode ser subestado/flag)


**3.2. Transições principais (happy path)**

- **DRAFT → CREATED**
    Guardrail: endereço válido + zona coberta + janela selecionada.
- **CREATED → PAYMENT_PENDING → CONFIRMED**
    Guardrail: pagamento aprovado ( **payment_captured** ) + reserva de capacidade ok.
- **CONFIRMED → SENT_TO_DISTRIBUTOR**
    Guardrail: distribuidor resolvido; emitir **order_received_by_distributor**.
- **SENT_TO_DISTRIBUTOR → ACCEPTED_BY_DISTRIBUTOR**
    Guardrail: deve ocorrer dentro do **SLA de aceitação** (meta 98%).
    Evento: **order_accepted_by_distributor**.
- **ACCEPTED_BY_DISTRIBUTOR → PICKING → READY_FOR_DISPATCH**
    Guardrail: checklist de separação (itens/vasilhames/endereço).
- **READY_FOR_DISPATCH → OUT_FOR_DELIVERY**
    Guardrail: **dispatch_checklist_completed**.
- **OUT_FOR_DELIVERY → DELIVERED**
    Guardrail: OTP validado (ou override autorizado).
    Eventos: **otp_validation_attempted**
    **(success)** + **order_delivered** + **bottle_exchange_recorded** / **empty_not_collecte**
    **d**.

**3.3. Rejeição e cancelamento**

- **SENT_TO_DISTRIBUTOR → REJECTED_BY_DISTRIBUTOR**
    Guardrail: motivo obrigatório.
    Ação: ops pode tentar redistribuir para outro distribuidor da zona (se existir) ou
    cancelar e reembolsar.
- **PAYMENT_PENDING → CANCELLED** (timeout/falha pagamento)
    Guardrail: registrar **payment_failed** e/ou timeout.
- **CONFIRMED/.../OUT_FOR_DELIVERY → CANCELLED** (casos excepcionais)
    Guardrail: políticas de cancelamento por janela; sempre gerar evento e tratar
    reembolso.

**3.4. Falha de entrega e reentrega (KPI 3%)**

- **OUT_FOR_DELIVERY → DELIVERY_FAILED**
    Guardrail: motivo obrigatório (ex.: sem acesso, cliente ausente).
    Evento: **redelivery_required**.
- **DELIVERY_FAILED → REDELIVERY_SCHEDULED → OUT_FOR_DELIVERY →**
    **DELIVERED**
    Guardrail: manter rastreio de **attempt_number**.
    KPI: contar pedidos com **redelivery_required** / total entregas.


**3.5. Guardrails específicos para vasilhames (controle de ativos)**

Base: “Troca permitida mediante registro no app”; “Não coleta: registro obrigatório”;
“Conciliação diária: diferença deve ser justificada”.

Regras mínimas:

- Ao concluir entrega ( **DELIVERED** ), exigir um dos dois:
    1. **bottle_exchange_recorded** , ou
    2. **empty_not_collected** com motivo
- Se existir caução ativa:
    - só liberar **deposit_refund_initiated** quando:
       - **DELIVERED** e
       - **collected_empty_qty >= expected_empty_return_qty** (ou regra
          que vocês definirem)
    - se não houver coleta, caução permanece **HELD**.

**4) KPIs: como calcular somente por eventos (para garantir auditabilidade)**

1. **SLA de aceitação (meta 98%)**
    - Numerador: pedidos com **order_accepted_by_distributor.occurred_at -**
       **order_received_by_distributor.occurred_at <=**
       **acceptance_sla_seconds**
    - Denominador: pedidos recebidos pelo distribuidor (exceto cancelados
       antes do recebimento, conforme regra)
2. **Taxa de aceitação (meta 95%)**
    - Numerador: **order_accepted_by_distributor**
    - Denominador: **order_received_by_distributor**
3. **Reentrega (meta 3%)**
    - Numerador: pedidos com **redelivery_required**
    - Denominador: pedidos com **order_delivered** (ou tentativas, conforme
       definição)


**1) Mapa de eventos auditáveis (payload mínimo)**

**1.1. Objetivo do “audit log”**

- Permitir **auditoria (quem fez o quê e quando)** , inclusive para disputas
    (entrega/troca/caução).
- Permitir cálculo consistente de KPIs (SLA aceitação, taxa aceitação, reentrega).
- Permitir rastreio financeiro (pagamento pedido, pagamento assinatura, **caução**
    **retida** e **caução devolvida** ).

**1.2. Envelope padrão (obrigatório em TODOS os eventos)**

**json**

{

"event_id": "uuid",

"event_type": "string",

"occurred_at": "2026- 02 - 27T12:34:56Z",

"recorded_at": "2026- 02 - 27T12:34:56Z",

"actor": { "type": "consumer|distributor_user|driver|support|ops|system", "id": "string" },

"correlation": {

"order_id": "uuid|null",

"subscription_id": "uuid|null",

"payment_id": "uuid|null",

"deposit_id": "uuid|null",

"distributor_id": "string|null",

"zone_id": "string|null",

"route_id": "uuid|null"

},

"source": { "app":
"consumer_app|distributor_dashboard|driver_app|ops_console|backend", "version":
"string" },

"client_context": { "ip": "string|null", "device_id": "string|null" },

"geo": { "lat": 0.0, "lng": 0.0, "accuracy_m": 0.0 },

"metadata": {}

}


**Regras**

- **occurred_at** = momento real do fato (no cliente ou servidor).
- **recorded_at** = momento de persistência no backend (para auditoria de
    atrasos/offline).
- **metadata nunca** deve carregar PII livre (evitar texto do cliente com telefone, etc.).
    Se precisar de texto, limitar tamanho e aplicar sanitização.

**1.3. Catálogo de eventos (MVP) com payload mínimo**

**A) Pedido (core operacional)**

1. **order_created**

**{ "items":[{"sku":"20L","qty":1}], "delivery_date":"YYYY-MM-DD",
"window":"morning|afternoon", "expected_empty_return_qty":0 }**

2. **order_pricing_finalized**

**{ "items_total": 0, "delivery_fee": 0, "deposit_amount": 0, "grand_total": 0,
"currency":"BRL" }**

3. **order_confirmed**
    (emitir quando pagamento + reserva de capacidade ok)

**{ "confirmed_by":"system" }**

4. **order_cancelled**

**{
"reason":"consumer_request|payment_failed|ops|fraud|timeout|distributor_rejected
", "note":"string|null" }**

**B) Distribuidor (SLA de aceitação + operação)**

5. **order_received_by_distributor**

**{ "acceptance_sla_seconds": 0, "received_via":"api|dashboard" }**

6. **order_accepted_by_distributor**

**{ "accepted": true }**

7. **order_rejected_by_distributor**

**{ "accepted": false, "reason_code":"no_capacity|no_stock|out_of_zone|other" }**

8. **dispatch_checklist_completed**

**{ "items_ok": true, "address_ok": true, "empties_ok": true }**

9. **order_dispatched**

**{ "route_id":"uuid" }**


**C) Entrega + OTP (prova de entrega)**

10. **otp_generated**

**{ "purpose":"delivery_confirmation", "format":"numeric_6", "expires_at":"ISO-8601" }**

11. **otp_sent**

**{ "channel":"push|sms|whatsapp", "masked_destination":"string" }**

12. **otp_validation_attempted**

**{ "result":"success|failure",
"failure_reason":"wrong_code|expired|locked|not_eligible", "attempt": 1 }**

13. **order_delivered**

**{ "delivery_confirmed_by":"otp|manual_override", "delivered_at":"ISO-8601" }**

**D) Troca / não coleta (controle de ativo)**

14. **bottle_exchange_recorded**

**{ "expected_empty_return_qty": 0, "collected_empty_qty": 0,
"condition":"ok|damaged|dirty|unknown" }**

15. **empty_not_collected**

**{ "reason_code":"customer_not_home|no_access|no_empty_available|unsafe|other",
"notes":"string|null" }**

**E) Reentrega (KPI)**

16. **redelivery_required**

**{ "reason_code":"customer_not_home|address_issue|access_denied|unsafe|other",
"attempt_number": 1 }**

17. **redelivery_scheduled**

**{ "new_delivery_date":"YYYY-MM-DD", "window":"morning|afternoon",
"attempt_number": 2 }**

18. **redelivery_completed**

**{ "attempt_number": 2 }**

**F) Pagamento (pedido/assinatura/caução)**

19. **payment_created**


**{ "provider":"string", "amount": 0, "currency":"BRL",
"kind":"order|subscription|deposit" }**

20. **payment_captured**

**{ "provider_payment_ref":"string" }**

21. **payment_failed**

**{ "provider_error_code":"string", "stage":"authorize|capture", "is_retryable": true }**

**G) Caução (retida/devolvida)**

22. **deposit_held**

**{ "deposit_amount": 0, "currency":"BRL", "trigger":"first_purchase|no_empty_return",
"policy_version":"string" }**

23. **deposit_refund_initiated**

**{ "deposit_amount": 0, "currency":"BRL", "reason":"empties_returned|policy_rule" }**

24. **deposit_refunded**

**{ "provider_refund_ref":"string" }**

**2) OTP para entregas — especificação de geração e validação (MVP)**

**2.1. Regras funcionais (MVP)**

- OTP serve como **POD** (proof of delivery).
- OTP deve ser **único por pedido por tentativa de entrega**.
- OTP deve ser **inutilizável** após expiração ou após uso.

**2.2. Campos mínimos (no banco)**

Na tabela **orders** (ou **order_delivery_security** ):

- **otp_hash** (string)
- **otp_expires_at** (timestamp)
- **otp_attempts** (int)
- **otp_last_attempt_at** (timestamp)
- **otp_delivery_attempt_number** (int; começa em 1)


**2.3. Geração do OTP**

**Quando gerar**

- No evento **order_dispatched** (pedido saiu para entrega).
    Motivo: reduz vazamento e evita OTP ativo por muitas horas.

**Como gerar**

- Formato: numérico 6 dígitos.
- Aleatoriedade: **cryptographically secure RNG**.
- Armazenar somente **hash(otp + salt)** (ex.: HMAC-SHA256 com segredo do
    servidor).

**TTL (validade)**

- Recomendação MVP: **90 minutos** (configurável por operação).
    (Cobre deslocamento e tolerâncias de janela sem estourar segurança.)

**Eventos**

- Emitir **otp_generated** e depois **otp_sent**.

**2.4. Entrega do OTP ao consumidor**

- Preferência: push no app consumidor.
- Fallback: SMS (se cadastro tiver telefone).
- Registrar **masked_destination** (ex.: *****- 1234** ) para auditoria sem expor PII.

**2.5. Validação do OTP (no app do motorista)**

Endpoint: **POST /orders/{order_id}/deliveries/confirm-otp**

**Validações (guardrails)**

1. Pedido deve estar em **OUT_FOR_DELIVERY**.
2. **otp_status == ACTIVE**.
3. **now <= otp_expires_at**.
4. **otp_attempts < max_attempts** (recomendado 5).
5. Se houver reentrega: **otp_delivery_attempt_number** deve bater com a tentativa
    atual.

**Sucesso**

- **otp_status = USED**
- emitir **otp_validation_attempted** (success)
- transicionar pedido para **DELIVERED**
- emitir **order_delivered**


**Falha**

- incrementar **otp_attempts**
- emitir **otp_validation_attempted** (failure)
- se atingiu limite: **otp_status = LOCKED** (e
    emitir **otp_validation_attempted** com **failure_reason=locked** na próxima
    tentativa)

**2.6. Override controlado (para não quebrar operação)**

Permitir “entrega sem OTP” **somente** para **support/ops** (ou supervisor distribuidor), com:

- motivo obrigatório
- (opcional) evidência (foto)
- evento **order_delivered** com **delivery_confirmed_by="manual_override"**

**3) Máquina de estados do pedido (com transições e guardrails)**

**3.1. Estados (MVP)**

**Estados principais**

- **DRAFT**
- **CREATED**
- **PAYMENT_PENDING**
- **CONFIRMED**
- **SENT_TO_DISTRIBUTOR**
- **ACCEPTED_BY_DISTRIBUTOR**
- **REJECTED_BY_DISTRIBUTOR**
- **PICKING**
- **READY_FOR_DISPATCH**
- **OUT_FOR_DELIVERY**
- **DELIVERED**
- **DELIVERY_FAILED**
- **REDELIVERY_SCHEDULED**
- **CANCELLED**


**3.2. Transições (com condições)**

1. **DRAFT → CREATED**
    Guardrails:
       - endereço válido e coberto
       - janela selecionada
       - SKU 20L disponível (regra de estoque/capacidade) Eventos: **order_created**
2. **CREATED → PAYMENT_PENDING**
    Guardrails:
       - preço final calculado Evento: **order_pricing_finalized** , **payment_created**
3. **PAYMENT_PENDING → CONFIRMED**
    Guardrails:
       - pagamento capturado ( **payment_captured** )
       - capacidade reservada/confirmada Evento: **order_confirmed**
4. **CONFIRMED → SENT_TO_DISTRIBUTOR**
    Guardrails:
       - distribuidor resolvido Evento: **order_received_by_distributor**
5. **SENT_TO_DISTRIBUTOR → ACCEPTED_BY_DISTRIBUTOR**
    Guardrails:
       - dentro do SLA de aceitação configurado (para meta **98%** )
          Evento: **order_accepted_by_distributor**
6. **SENT_TO_DISTRIBUTOR → REJECTED_BY_DISTRIBUTOR**
    Guardrails:
       - motivo obrigatório Evento: **order_rejected_by_distributor** Ação: cancelar
          e reembolsar, ou redistribuir (se houver fallback).
7. **ACCEPTED_BY_DISTRIBUTOR → PICKING → READY_FOR_DISPATCH**
    Guardrails:
       - checklist de separação interno Evento: **dispatch_checklist_completed**
8. **READY_FOR_DISPATCH → OUT_FOR_DELIVERY**
    Guardrails:
       - checklist concluído
          Evento: **order_dispatched** + **otp_generated** + **otp_sent**


### 9. OUT_FOR_DELIVERY → DELIVERED

```
Guardrails:
```
- OTP válido **ou** override autorizado
- antes de finalizar, exigir registro de troca:
    - **bottle_exchange_recorded ou**
    - **empty_not_collected** com motivo
       Eventos: **otp_validation_attempted** , **order_delivered** , **bottle_exc**
       **hange_recorded|empty_not_collected**
10. **OUT_FOR_DELIVERY → DELIVERY_FAILED**
Guardrails:
- motivo obrigatório Evento: **redelivery_required**
11. **DELIVERY_FAILED → REDELIVERY_SCHEDULED → OUT_FOR_DELIVERY →
DELIVERED**
Guardrails:
- **attempt_number** incrementa
- novo OTP deve ser gerado por tentativa
Eventos: **redelivery_scheduled** , **otp_generated** , etc.
12. Cancelamentos
- **PAYMENT_PENDING → CANCELLED** (timeout/falha pagamento)
Eventos: **payment_failed** , **order_cancelled**
- **CONFIRMED → CANCELLED** (política de cancelamento)
Guardrails: cutoff por janela; sempre auditar e tratar reembolso

**3.3. Guardrails de caução (MVP)**

- Se “primeira compra” **ou expected_empty_return_qty** insuficiente para a política:
    - **deposit_held** deve ocorrer no momento de confirmação financeira.
- Devolução de caução:
    - somente quando **DELIVERED e** a regra de devolução for satisfeita
       (ex.: **collected_empty_qty >= expected_empty_return_qty** ou outro
       critério definido)
    - eventos: **deposit_refund_initiated** → **deposit_refunded**


**4) KPIs auditáveis (derivados só de eventos)**

1. **SLA de aceitação (meta 98%)**

```
SLAaceite=
```
### #(Δ𝑡≤𝑆𝐿𝐴)

```
#(order_received_by_distributor)
onde Δ𝑡=𝑡(order_accepted)−𝑡(order_received)
```
2. **Taxa de aceitação (meta 95%)**

```
Taxaaceite=
```
```
#(order_accepted)
#(order_received)
```
3. **Reentrega (meta 3%)**

```
Reentrega=
```
```
#(redelivery_required)
#(order_delivered)
```

**1) Regras de devolução da caução no MVP (duas opções claras e auditáveis)**

**Regra A (MVP recomendado): devolve quando coletar 1 vazio na entrega**

**Quando aplicar**

- Cliente fez **primeira compra** e foi cobrada caução (depósito).

**Condição objetiva**

- Pedido foi entregue ( **order_delivered** )
- E houve **bottle_exchange_recorded.collected_empty_qty >= 1**

**Por que é a melhor no MVP**

- É simples, reduz atrito e já incentiva logística reversa.
- Não depende de serialização/scanner no MVP.
- É auditável por eventos (entrega + troca/coleta).

**Risco**

- Não garante “mesmo garrafão”, apenas “um vazio”. Mas para MVP é aceitável e
    operacional.

**Regra B (pós-MVP / v2 recomendado): devolve quando devolver o mesmo garrafão
serializado**

**Quando aplicar**

- Cliente pagou caução vinculada a um **asset_id** (serial).

**Condição objetiva**

- Pedido entregue ( **order_delivered** ) e/ou devolução posterior
- Evento **bottle_asset_returned** com **asset_id** = “asset_id do depósito”
- E o asset passa em triagem ( **asset_condition_ok** )

**Por que não é indicada no MVP**

- Exige scanner/serialização e rastreabilidade real (aparece como pilar, mas é
    pesado para MVP).
- Aumenta fricção e risco de falha operacional no piloto.


**Decisão do MVP (fechada)**

- **MVP usa Regra A** (coleta de **1 vazio** ) para **deposit_refund_initiated**.
- **Regra B fica definida como evolução** (v2), sem bloquear o go-live.

**2) Contrato de domínio (PostgreSQL) — tabelas mínimas + índices + constraints**

**2.1. Convenções**

- UUID v4 para entidades principais (boa prática e alinhada ao seu padrão de
    anonimização em outros projetos).
- Timestamps em UTC ( **timestamptz** ).
- Soft delete quando necessário ( **deleted_at** ).

_Observação: abaixo está o mínimo “implementável amanhã”, sem microserviços e sem
event sourcing completo (mas com audit log robusto)._

**2.2. DDL (núcleo)**

**2.2.1. consumers**

**sql**

create table consumers (

id uuid primary key,

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

email text unique,

phone text,

full_name text,

status text not null default 'active'

);

create index consumers_created_at_idx on consumers (created_at);


**2.2.2. addresses**

**sql**

create table addresses (

id uuid primary key,

consumer_id uuid not null references consumers(id) on delete cascade,

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

label text,

line1 text not null,

line2 text,

neighborhood text,

city text not null,

state text not null,

postal_code text,

lat double precision,

lng double precision,

is_default boolean not null default false

);

create index addresses_consumer_idx on addresses (consumer_id);

create index addresses_geo_idx on addresses (lat, lng);

**Constraint recomendado (opcional, com trigger)**

- garantir no máximo 1 **is_default=true** por consumidor.

**2.2.3. distributors**

**sql**

create table distributors (

id text primary key,

created_at timestamptz not null default now(),

name text not null,

status text not null default 'active',


api_enabled boolean not null default true

);

**2.2.4. zones e zone_coverage**

**sql**

create table zones (

id text primary key,

distributor_id text not null references distributors(id),

name text not null,

status text not null default 'active'

);

create index zones_distributor_idx on zones (distributor_id);

create table zone_coverage (

id uuid primary key,

zone_id text not null references zones(id),

city text not null,

neighborhood text,

postal_code_prefix text,

created_at timestamptz not null default now()

);

create index zone_coverage_zone_idx on zone_coverage (zone_id);

create index zone_coverage_city_neighborhood_idx on zone_coverage (city,
neighborhood);

**2.2.5. Capacidade por janela: delivery_capacity**

**sql**

create table delivery_capacity (

id uuid primary key,

zone_id text not null references zones(id),

delivery_date date not null,


window text not null, _-- 'morning'|'afternoon'_

capacity_total int not null check (capacity_total >= 0),

capacity_reserved int not null default 0 check (capacity_reserved >= 0),

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

unique (zone_id, delivery_date, window)

);

create index delivery_capacity_lookup_idx on delivery_capacity (zone_id, delivery_date,
window);

**Guardrail crítico**

- reserva de capacidade deve ser transacional ( **select ... for update** ) no checkout.

**2.2.6. Produtos (MVP só 20L, mas já modela)**

**sql**

create table products (

sku text primary key, _-- '20L'_

name text not null,

is_active boolean not null default true

);

**2.3. Pedidos e itens**

**2.3.1. orders**

**sql**

create table orders (

id uuid primary key,

consumer_id uuid not null references consumers(id),

address_id uuid not null references addresses(id),

distributor_id text not null references distributors(id),

zone_id text not null references zones(id),


status text not null, _-- ver enum lógico abaixo_

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

delivery_date date not null,

window text not null, _-- 'morning'|'afternoon'_

expected_empty_return_qty int not null default 0 check (expected_empty_return_qty >=
0),

collected_empty_qty int not null default 0 check (collected_empty_qty >= 0),

items_total numeric(12,2) not null default 0,

delivery_fee numeric(12,2) not null default 0,

deposit_amount numeric(12,2) not null default 0,

grand_total numeric(12,2) not null default 0,

currency text not null default 'BRL',

acceptance_sla_seconds int,

accepted_at timestamptz,

dispatched_at timestamptz,

delivered_at timestamptz,

cancel_reason text,

cancelled_at timestamptz

);

create index orders_consumer_idx on orders (consumer_id, created_at desc);

create index orders_distributor_idx on orders (distributor_id, created_at desc);

create index orders_status_idx on orders (status);

create index orders_window_idx on orders (delivery_date, window, zone_id);

**Constraints/guardrails recomendados**


- **window** em ( **morning** , **afternoon** ) via check constraint.
- impedir **delivered_at** se status != **DELIVERED** (via trigger, opcional).

**2.3.2. order_items**

**sql**

create table order_items (

id uuid primary key,

order_id uuid not null references orders(id) on delete cascade,

sku text not null references products(sku),

qty int not null check (qty > 0),

unit_price numeric(12,2) not null,

line_total numeric(12,2) not null

);

create index order_items_order_idx on order_items (order_id);

**2.4. Assinaturas (mensal)**

**2.4.1. subscriptions**

**sql**

create table subscriptions (

id uuid primary key,

consumer_id uuid not null references consumers(id),

address_id uuid not null references addresses(id),

distributor_id text not null references distributors(id),

zone_id text not null references zones(id),

status text not null, _-- 'active'|'paused'|'cancelled'_

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

cadence text not null default 'monthly', _-- fixo MVP_

sku text not null references products(sku),


qty int not null check (qty > 0),

next_run_date date not null,

window_preference text, _-- opcional; 'morning'|'afternoon'|null_

cancelled_at timestamptz

);

create index subscriptions_consumer_idx on subscriptions (consumer_id, created_at
desc);

create index subscriptions_status_idx on subscriptions (status);

create index subscriptions_next_run_idx on subscriptions (next_run_date, status);

**2.4.2. subscription_orders (ligação assinatura → pedidos)**

**sql**

create table subscription_orders (

id uuid primary key,

subscription_id uuid not null references subscriptions(id) on delete cascade,

order_id uuid not null references orders(id) on delete cascade,

created_at timestamptz not null default now(),

unique (subscription_id, order_id)

);

create index subscription_orders_subscription_idx on subscription_orders
(subscription_id);

**2.5. Pagamentos e caução**

**2.5.1. payments**

**sql**

create table payments (

id uuid primary key,

created_at timestamptz not null default now(),

provider text not null,


kind text not null, _-- 'order'|'subscription'|'deposit'_

amount numeric(12,2) not null check (amount >= 0),

currency text not null default 'BRL',

status text not null, _-- 'created'|'authorized'|'captured'|'failed'|'refunded'_

provider_payment_ref text,

failure_code text,

order_id uuid references orders(id),

subscription_id uuid references subscriptions(id),

deposit_id uuid references deposits(id)

);

create index payments_order_idx on payments (order_id);

create index payments_status_idx on payments (status, created_at desc);

**2.5.2. deposits (caução)**

**sql**

create table deposits (

id uuid primary key,

created_at timestamptz not null default now(),

consumer_id uuid not null references consumers(id),

order_id uuid references orders(id),

amount numeric(12,2) not null check (amount >= 0),

currency text not null default 'BRL',

status text not null, _-- 'held'|'refund_initiated'|'refunded'|'forfeited'_

trigger text not null, _-- 'first_purchase'|'no_empty_return'_

policy_version text not null,

held_at timestamptz,

refund_initiated_at timestamptz,

refunded_at timestamptz

);


create index deposits_consumer_idx on deposits (consumer_id, created_at desc);

create index deposits_status_idx on deposits (status);

create index deposits_order_idx on deposits (order_id);

**Constraint de regra A (MVP) — via aplicação/trigger**

- **refund_initiated_at** só pode ocorrer se:
    - pedido **DELIVERED**
    - e **collected_empty_qty >= 1**

**2.6. OTP (segurança de entrega)**

**2.6.1. order_otps**

Separar OTP em tabela própria evita mexer no **orders** e permite histórico por tentativa.

**sql**

create table order_otps (

id uuid primary key,

order_id uuid not null references orders(id) on delete cascade,

delivery_attempt_number int not null default 1 check (delivery_attempt_number > 0),

otp_hash text not null,

otp_status text not null, _-- 'active'|'used'|'expired'|'locked'_

expires_at timestamptz not null,

attempts int not null default 0 check (attempts >= 0),

last_attempt_at timestamptz,

created_at timestamptz not null default now(),

used_at timestamptz,

unique (order_id, delivery_attempt_number)

);


create index order_otps_order_idx on order_otps (order_id);

create index order_otps_status_idx on order_otps (otp_status, expires_at);

**2.7. Audit log de eventos (o “coração”)**

**2.7.1. audit_events**

**sql**

create table audit_events (

event_id uuid primary key,

event_type text not null,

occurred_at timestamptz not null,

recorded_at timestamptz not null default now(),

actor_type text not null,

actor_id text not null,

order_id uuid,

subscription_id uuid,

payment_id uuid,

deposit_id uuid,

distributor_id text,

zone_id text,

route_id uuid,

source_app text not null,

source_version text,

ip text,

device_id text,

geo_lat double precision,

geo_lng double precision,


geo_accuracy_m double precision,

metadata jsonb not null default '{}'::jsonb

);

create index audit_events_order_idx on audit_events (order_id, occurred_at desc);

create index audit_events_type_idx on audit_events (event_type, occurred_at desc);

create index audit_events_actor_idx on audit_events (actor_type, actor_id, occurred_at
desc);

create index audit_events_distributor_idx on audit_events (distributor_id, occurred_at
desc);

**Constraints recomendados**

- **metadata** sempre JSON válido (já garantido por **jsonb** ).
- **occurred_at <= recorded_at + tolerancia_offline** (via aplicação; opcional).

**3) Enums recomendados (Node) — estados e valores fixos**

**3.1. OrderStatus**

- **CREATED**
- **PAYMENT_PENDING**
- **CONFIRMED**
- **SENT_TO_DISTRIBUTOR**
- **ACCEPTED_BY_DISTRIBUTOR**
- **REJECTED_BY_DISTRIBUTOR**
- **PICKING**
- **READY_FOR_DISPATCH**
- **OUT_FOR_DELIVERY**
- **DELIVERED**
- **DELIVERY_FAILED**
- **REDELIVERY_SCHEDULED**
- **CANCELLED**

**3.2. DeliveryWindow**

- **morning**


- **afternoon**

**3.3. OtpStatus**

- **active**
- **used**
- **expired**
- **locked**

**4) JSON Schemas (por evento) — prontos para validar no Node**

Abaixo vai um padrão que o time pode usar com **Ajv** : um schema base + schemas
por **event_type**.
(Observação: estou incluindo schemas só dos eventos MVP mais críticos; os demais
seguem o mesmo padrão.)

**4.1. Schema base (AuditEventBase.schema.json)**

**json**

{

"$id": "https://xua.delivery/schemas/AuditEventBase.schema.json",

"$schema": "https://json-schema.org/draft/2020-12/schema",

"type": "object",

"required": ["event_id", "event_type", "occurred_at", "actor", "correlation", "source",
"metadata"],

"properties": {

"event_id": { "type": "string", "format": "uuid" },

"event_type": { "type": "string" },

"occurred_at": { "type": "string", "format": "date-time" },

"actor": {

"type": "object",

"required": ["type", "id"],

"properties": {

"type": { "type": "string", "enum": ["consumer", "distributor_user", "driver", "support",
"ops", "system"] },

"id": { "type": "string", "minLength": 1 }

},

"additionalProperties": false


### },

"correlation": {

"type": "object",

"properties": {

"order_id": { "type": ["string", "null"], "format": "uuid" },

"subscription_id": { "type": ["string", "null"], "format": "uuid" },

"payment_id": { "type": ["string", "null"], "format": "uuid" },

"deposit_id": { "type": ["string", "null"], "format": "uuid" },

"distributor_id": { "type": ["string", "null"] },

"zone_id": { "type": ["string", "null"] },

"route_id": { "type": ["string", "null"], "format": "uuid" }

},

"additionalProperties": false

},

"source": {

"type": "object",

"required": ["app", "version"],

"properties": {

"app": { "type": "string", "enum": ["consumer_app", "distributor_dashboard",
"driver_app", "ops_console", "backend"] },

"version": { "type": "string", "minLength": 1 }

},

"additionalProperties": false

},

"client_context": {

"type": "object",

"properties": {

"ip": { "type": ["string", "null"] },

"device_id": { "type": ["string", "null"] }

},

"additionalProperties": false


### },

"geo": {

"type": "object",

"properties": {

"lat": { "type": "number" },

"lng": { "type": "number" },

"accuracy_m": { "type": "number" }

},

"additionalProperties": false

},

"metadata": { "type": "object" }

},

"additionalProperties": false

}

**4.2. order_created (order_created.schema.json)**

**json**

{

"$id": "https://xua.delivery/schemas/order_created.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_created" },

"metadata": {

"type": "object",

"required": ["items", "delivery_date", "window", "expected_empty_return_qty"],

"properties": {

"items": {

"type": "array",


"minItems": 1,

"items": {

"type": "object",

"required": ["sku", "qty"],

"properties": {

"sku": { "type": "string", "const": "20L" },

"qty": { "type": "integer", "minimum": 1 }

},

"additionalProperties": false

}

},

"delivery_date": { "type": "string", "format": "date" },

"window": { "type": "string", "enum": ["morning", "afternoon"] },

"expected_empty_return_qty": { "type": "integer", "minimum": 0 }

},

"additionalProperties": false

}

}

}

]

}

**4.3. order_received_by_distributor**

**json**

{

"$id": "https://xua.delivery/schemas/order_received_by_distributor.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_received_by_distributor" },


"metadata": {

"type": "object",

"required": ["acceptance_sla_seconds", "received_via"],

"properties": {

"acceptance_sla_seconds": { "type": "integer", "minimum": 0 },

"received_via": { "type": "string", "enum": ["api", "dashboard"] }

},

"additionalProperties": false

}

}

}

]

}

**4.4. order_accepted_by_distributor**

**json**

{

"$id": "https://xua.delivery/schemas/order_accepted_by_distributor.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_accepted_by_distributor" },

"metadata": {

"type": "object",

"required": ["accepted"],

"properties": { "accepted": { "type": "boolean", "const": true } },

"additionalProperties": false

}

}

}


### ]

### }

**4.5. otp_generated**

**json**

{

"$id": "https://xua.delivery/schemas/otp_generated.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "otp_generated" },

"metadata": {

"type": "object",

"required": ["purpose", "format", "expires_at"],

"properties": {

"purpose": { "type": "string", "const": "delivery_confirmation" },

"format": { "type": "string", "const": "numeric_6" },

"expires_at": { "type": "string", "format": "date-time" }

},

"additionalProperties": false

}

}

}

]

}

**4.6. otp_validation_attempted**

**json**

{

"$id": "https://xua.delivery/schemas/otp_validation_attempted.schema.json",

"allOf": [


{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "otp_validation_attempted" },

"metadata": {

"type": "object",

"required": ["result", "attempt"],

"properties": {

"result": { "type": "string", "enum": ["success", "failure"] },

"failure_reason": { "type": ["string", "null"], "enum": ["wrong_code", "expired",
"locked", "not_eligible", null] },

"attempt": { "type": "integer", "minimum": 1 }

},

"additionalProperties": false

}

}

}

]

}

**4.7. order_delivered**

**json**

{

"$id": "https://xua.delivery/schemas/order_delivered.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_delivered" },

"metadata": {


"type": "object",

"required": ["delivery_confirmed_by", "delivered_at"],

"properties": {

"delivery_confirmed_by": { "type": "string", "enum": ["otp", "manual_override"] },

"delivered_at": { "type": "string", "format": "date-time" }

},

"additionalProperties": false

}

}

}

]

}

**4.8. bottle_exchange_recorded**

**json**

{

"$id": "https://xua.delivery/schemas/bottle_exchange_recorded.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "bottle_exchange_recorded" },

"metadata": {

"type": "object",

"required": ["expected_empty_return_qty", "collected_empty_qty", "condition"],

"properties": {

"expected_empty_return_qty": { "type": "integer", "minimum": 0 },

"collected_empty_qty": { "type": "integer", "minimum": 0 },

"condition": { "type": "string", "enum": ["ok", "damaged", "dirty", "unknown"] }

},

"additionalProperties": false


### }

### }

### }

### ]

### }

**4.9. deposit_refund_initiated (MVP regra A)**

**json**

{

"$id": "https://xua.delivery/schemas/deposit_refund_initiated.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "deposit_refund_initiated" },

"metadata": {

"type": "object",

"required": ["deposit_amount", "currency", "reason"],

"properties": {

"deposit_amount": { "type": "number", "minimum": 0 },

"currency": { "type": "string", "const": "BRL" },

"reason": { "type": "string", "enum": ["empties_returned", "policy_rule"] }

},

"additionalProperties": false

}

}

}

]

}

_O restante dos schemas segue o mesmo padrão (event_type const + metadata com
required). Se você quiser, eu gero a coleção completa (todos os eventos do MVP) em um
pacote único no mesmo formato._


**5) Constraints e transações críticas (para evitar bugs no MVP)**

**5.1. Reserva de capacidade (anti-overbooking)**

- Em **PAYMENT_PENDING → CONFIRMED** , fazer:
    - **select ... from delivery_capacity where ... for update**
    - validar **capacity_reserved < capacity_total**
    - incrementar **capacity_reserved**
    - confirmar pedido Tudo na **mesma transação**.

**5.2. SLA de aceitação (contador real)**

- Persistir **acceptance_sla_seconds** no pedido (copiado de config por
    zona/distribuidor).
- Registrar **order_received_by_distributor.occurred_at** e **order_accepted_by_dist**
    **ributor.occurred_at**.
- O painel calcula **delta_seconds** e marca violação.

**5.3. Caução (regra A do MVP)**

- Só emitir **deposit_refund_initiated** se:
    - pedido em **DELIVERED**
    - e **collected_empty_qty >= 1**
- A validação deve ser no backend (não confiar no app do motorista).

**6) Implementação Node (diretriz rápida)**

- Validar eventos com **Ajv** usando os schemas acima.
- Persistir em **audit_events** com **metadata jsonb**.
- Publicar eventos internamente (fila) se quiser evoluir para arquitetura orientada a
    eventos, sem mudar o contrato.


**1) Contrato de domínio (PostgreSQL) — versão “MVP agnóstica de provider”**

Abaixo eu consolido em um pacote coerente, com:

- **tabelas mínimas**
- **índices**
- **constraints/checks**
- pontos onde eu recomendo **trigger** (quando Postgres não resolve sozinho com
    check)

**1.1. Tipos/Enums (recomendado no Postgres)**

Você pode usar **check constraints** (mais simples) ou **create type**. Para robustez e
consistência com Node, recomendo **create type**.

**sql**

create type delivery_window as enum ('morning', 'afternoon');

create type order_status as enum (

'CREATED',

'PAYMENT_PENDING',

'CONFIRMED',

'SENT_TO_DISTRIBUTOR',

'ACCEPTED_BY_DISTRIBUTOR',

'REJECTED_BY_DISTRIBUTOR',

'PICKING',

'READY_FOR_DISPATCH',

'OUT_FOR_DELIVERY',

'DELIVERED',

'DELIVERY_FAILED',

'REDELIVERY_SCHEDULED',

'CANCELLED'

);

create type otp_status as enum ('active', 'used', 'expired', 'locked');

create type subscription_status as enum ('active', 'paused', 'cancelled');


create type payment_kind as enum ('order', 'subscription', 'deposit');

create type payment_status as enum ('created', 'authorized', 'captured', 'failed', 'refunded');

create type deposit_status as enum ('held', 'refund_initiated', 'refunded', 'forfeited');

create type actor_type as enum ('consumer', 'distributor_user', 'driver', 'support', 'ops',
'system');

create type source_app as enum ('consumer_app', 'distributor_dashboard', 'driver_app',
'ops_console', 'backend');

**2) Tabelas (DDL)**

**2.1. Consumidor e endereços**

**sql**

create table consumers (

id uuid primary key,

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

email text unique,

phone text,

full_name text,

status text not null default 'active'

);

create index consumers_created_at_idx on consumers (created_at);

create table addresses (

id uuid primary key,

consumer_id uuid not null references consumers(id) on delete cascade,

created_at timestamptz not null default now(),


updated_at timestamptz not null default now(),

label text,

line1 text not null,

line2 text,

neighborhood text,

city text not null,

state text not null,

postal_code text,

lat double precision,

lng double precision,

is_default boolean not null default false

);

create index addresses_consumer_idx on addresses (consumer_id);

create index addresses_geo_idx on addresses (lat, lng);

_Se quiser garantir “1 default por consumer”, faça via trigger (Postgres não tem constraint
direta pra isso sem gambiarras)._

**2.2. Distribuidor, zona e capacidade (anti-overbooking)**

**sql**

create table distributors (

id text primary key,

created_at timestamptz not null default now(),

name text not null,

status text not null default 'active',

api_enabled boolean not null default true

);

create table zones (

id text primary key,

distributor_id text not null references distributors(id),


name text not null,

status text not null default 'active'

);

create index zones_distributor_idx on zones (distributor_id);

create table delivery_capacity (

id uuid primary key,

zone_id text not null references zones(id),

delivery_date date not null,

window delivery_window not null,

capacity_total int not null check (capacity_total >= 0),

capacity_reserved int not null default 0 check (capacity_reserved >= 0),

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

unique (zone_id, delivery_date, window),

check (capacity_reserved <= capacity_total)

);

create index delivery_capacity_lookup_idx on delivery_capacity (zone_id, delivery_date,
window);

**Regra crítica de implementação**

- Incrementar **capacity_reserved** em transação com **select ... for update**.

**2.3. Produto (MVP 20L)**

**sql**

create table products (

sku text primary key, _-- '20L'_

name text not null,

is_active boolean not null default true

);


**2.4. Pedidos e itens (com campos para SLA, troca e status)**

**sql**

create table orders (

id uuid primary key,

consumer_id uuid not null references consumers(id),

address_id uuid not null references addresses(id),

distributor_id text not null references distributors(id),

zone_id text not null references zones(id),

status order_status not null default 'CREATED',

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

delivery_date date not null,

window delivery_window not null,

expected_empty_return_qty int not null default 0 check (expected_empty_return_qty >=
0),

collected_empty_qty int not null default 0 check (collected_empty_qty >= 0),

items_total numeric(12,2) not null default 0,

delivery_fee numeric(12,2) not null default 0,

deposit_amount numeric(12,2) not null default 0,

grand_total numeric(12,2) not null default 0,

currency text not null default 'BRL',

acceptance_sla_seconds int check (acceptance_sla_seconds is null or
acceptance_sla_seconds >= 0),

received_by_distributor_at timestamptz,

accepted_at timestamptz,


dispatched_at timestamptz,

delivered_at timestamptz,

cancel_reason text,

cancelled_at timestamptz

);

create index orders_consumer_idx on orders (consumer_id, created_at desc);

create index orders_distributor_idx on orders (distributor_id, created_at desc);

create index orders_status_idx on orders (status);

create index orders_schedule_idx on orders (zone_id, delivery_date, window);

create table order_items (

id uuid primary key,

order_id uuid not null references orders(id) on delete cascade,

sku text not null references products(sku),

qty int not null check (qty > 0),

unit_price numeric(12,2) not null check (unit_price >= 0),

line_total numeric(12,2) not null check (line_total >= 0)

);

create index order_items_order_idx on order_items (order_id);

**Constraints por trigger (recomendado)**

- Se **status = 'DELIVERED'** então **delivered_at is not null**.
- Impedir regressão de estado (ex.: de **OUT_FOR_DELIVERY** para **PICKING** ) — isso
    normalmente é regra do serviço, mas dá para reforçar com trigger.

**2.5. Assinaturas (mensal)**

**sql**

create table subscriptions (

id uuid primary key,


consumer_id uuid not null references consumers(id),

address_id uuid not null references addresses(id),

distributor_id text not null references distributors(id),

zone_id text not null references zones(id),

status subscription_status not null default 'active',

created_at timestamptz not null default now(),

updated_at timestamptz not null default now(),

cadence text not null default 'monthly', _-- fixo MVP_

sku text not null references products(sku),

qty int not null check (qty > 0),

next_run_date date not null,

window_preference delivery_window,

cancelled_at timestamptz

);

create index subscriptions_consumer_idx on subscriptions (consumer_id, created_at
desc);

create index subscriptions_status_idx on subscriptions (status);

create index subscriptions_next_run_idx on subscriptions (next_run_date, status);

create table subscription_orders (

id uuid primary key,

subscription_id uuid not null references subscriptions(id) on delete cascade,

order_id uuid not null references orders(id) on delete cascade,

created_at timestamptz not null default now(),

unique (subscription_id, order_id)

);


create index subscription_orders_subscription_idx on subscription_orders
(subscription_id);

**2.6. Pagamentos (provider-neutral) + idempotência de webhook**

Aqui é onde o “provedor em aberto” mais impacta. Para não travar:

**sql**

create table payments (

id uuid primary key,

created_at timestamptz not null default now(),

provider text not null, _-- 'stripe'|'mercadopago'|'pagarme' etc._

kind payment_kind not null,

amount numeric(12,2) not null check (amount >= 0),

currency text not null default 'BRL',

status payment_status not null default 'created',

provider_payment_ref text, _-- id no provedor_

provider_customer_ref text,

provider_error_code text,

order_id uuid references orders(id) on delete set null,

subscription_id uuid references subscriptions(id) on delete set null,

deposit_id uuid references deposits(id) on delete set null,

unique (provider, provider_payment_ref)

);

create index payments_order_idx on payments (order_id);

create index payments_status_idx on payments (status, created_at desc);


create index payments_kind_idx on payments (kind, created_at desc);

create table payment_webhook_events (

id uuid primary key,

created_at timestamptz not null default now(),

provider text not null,

provider_event_ref text not null,

received_at timestamptz not null default now(),

payload jsonb not null,

unique (provider, provider_event_ref)

);

**2.7. Caução (depósitos)**

**sql**

create table deposits (

id uuid primary key,

created_at timestamptz not null default now(),

consumer_id uuid not null references consumers(id),

order_id uuid references orders(id) on delete set null,

amount numeric(12,2) not null check (amount >= 0),

currency text not null default 'BRL',

status deposit_status not null default 'held',

trigger text not null, _-- 'first_purchase'|'no_empty_return'_

policy_version text not null,

held_at timestamptz,

refund_initiated_at timestamptz,

refunded_at timestamptz


### );

create index deposits_consumer_idx on deposits (consumer_id, created_at desc);

create index deposits_status_idx on deposits (status);

create index deposits_order_idx on deposits (order_id);

**Regra A (MVP) — enforcement**

- Melhor implementar no serviço (Node) + reforçar com trigger opcional:
    - só permitir mudar **status** de **held** → **refund_initiated** quando:
       - pedido está **DELIVERED**
       - **orders.collected_empty_qty >= 1**

**2.8. OTP por tentativa**

**sql**

create table order_otps (

id uuid primary key,

order_id uuid not null references orders(id) on delete cascade,

delivery_attempt_number int not null default 1 check (delivery_attempt_number > 0),

otp_hash text not null,

otp_status otp_status not null default 'active',

expires_at timestamptz not null,

attempts int not null default 0 check (attempts >= 0),

last_attempt_at timestamptz,

created_at timestamptz not null default now(),

used_at timestamptz,

unique (order_id, delivery_attempt_number)

);


create index order_otps_order_idx on order_otps (order_id);

create index order_otps_status_idx on order_otps (otp_status, expires_at);

**2.9. Audit events (evento auditável + JSON metadata)**

**sql**

create table audit_events (

event_id uuid primary key,

event_type text not null,

occurred_at timestamptz not null,

recorded_at timestamptz not null default now(),

actor_type actor_type not null,

actor_id text not null,

order_id uuid,

subscription_id uuid,

payment_id uuid,

deposit_id uuid,

distributor_id text,

zone_id text,

route_id uuid,

source_app source_app not null,

source_version text,

ip text,

device_id text,

geo_lat double precision,

geo_lng double precision,

geo_accuracy_m double precision,


metadata jsonb not null default '{}'::jsonb

);

create index audit_events_order_idx on audit_events (order_id, occurred_at desc);

create index audit_events_type_idx on audit_events (event_type, occurred_at desc);

create index audit_events_actor_idx on audit_events (actor_type, actor_id, occurred_at
desc);

create index audit_events_distributor_idx on audit_events (distributor_id, occurred_at
desc);

**3) JSON Schemas por evento (coleção MVP) — padrão Ajv**

Você já tem o **AuditEventBase**. Abaixo vai a coleção dos eventos críticos do MVP (os
mesmos do mapa), com schemas enxutos. Para reduzir repetição, o ideal é o time usar:

- 1 schema base (envelope)
- 1 schema por **event_type** (com **allOf** )

Vou listar os schemas (sem repetir o base).

_Observação: onde há valores monetários, uso_ **_number_** _por simplicidade. Se vocês
preferirem evitar float, podem padronizar_ **_inteiro em centavos_** _(_ **_amount_cents_** _), e ajustar
schema._

**3.1. order_pricing_finalized**

**json**

{

"$id": "https://xua.delivery/schemas/order_pricing_finalized.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_pricing_finalized" },

"metadata": {

"type": "object",

"required": ["items_total", "delivery_fee", "deposit_amount", "grand_total", "currency"],


"properties": {

"items_total": { "type": "number", "minimum": 0 },

"delivery_fee": { "type": "number", "minimum": 0 },

"deposit_amount": { "type": "number", "minimum": 0 },

"grand_total": { "type": "number", "minimum": 0 },

"currency": { "type": "string", "const": "BRL" }

},

"additionalProperties": false

}

}

}

]

}

**3.2. order_confirmed**

**json**

{

"$id": "https://xua.delivery/schemas/order_confirmed.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_confirmed" },

"metadata": {

"type": "object",

"required": ["confirmed_by"],

"properties": { "confirmed_by": { "type": "string", "enum": ["system", "support", "ops"] }
},

"additionalProperties": false

}

}


### }

### ]

### }

**3.3. order_cancelled**

**json**

{

"$id": "https://xua.delivery/schemas/order_cancelled.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_cancelled" },

"metadata": {

"type": "object",

"required": ["reason"],

"properties": {

"reason": { "type": "string", "enum": ["consumer_request", "payment_failed", "ops",
"fraud", "timeout", "distributor_rejected"] },

"note": { "type": ["string", "null"], "maxLength": 300 }

},

"additionalProperties": false

}

}

}

]

}

**3.4. order_rejected_by_distributor**

**json**

{

"$id": "https://xua.delivery/schemas/order_rejected_by_distributor.schema.json",


"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_rejected_by_distributor" },

"metadata": {

"type": "object",

"required": ["accepted", "reason_code"],

"properties": {

"accepted": { "type": "boolean", "const": false },

"reason_code": { "type": "string", "enum": ["no_capacity", "no_stock", "out_of_zone",
"other"] }

},

"additionalProperties": false

}

}

}

]

}

**3.5. dispatch_checklist_completed**

**json**

{

"$id": "https://xua.delivery/schemas/dispatch_checklist_completed.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "dispatch_checklist_completed" },

"metadata": {


"type": "object",

"required": ["items_ok", "address_ok", "empties_ok"],

"properties": {

"items_ok": { "type": "boolean" },

"address_ok": { "type": "boolean" },

"empties_ok": { "type": "boolean" }

},

"additionalProperties": false

}

}

}

]

}

**3.6. otp_sent**

**json**

{

"$id": "https://xua.delivery/schemas/otp_sent.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "otp_sent" },

"metadata": {

"type": "object",

"required": ["channel", "masked_destination"],

"properties": {

"channel": { "type": "string", "enum": ["push", "sms", "whatsapp"] },

"masked_destination": { "type": "string", "minLength": 3, "maxLength": 50 }

},

"additionalProperties": false


### }

### }

### }

### ]

### }

**3.7. order_dispatched**

**json**

{

"$id": "https://xua.delivery/schemas/order_dispatched.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "order_dispatched" },

"metadata": {

"type": "object",

"required": ["route_id"],

"properties": { "route_id": { "type": "string", "format": "uuid" } },

"additionalProperties": false

}

}

}

]

}

**3.8. empty_not_collected**

**json**

{

"$id": "https://xua.delivery/schemas/empty_not_collected.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },


### {

"type": "object",

"properties": {

"event_type": { "const": "empty_not_collected" },

"metadata": {

"type": "object",

"required": ["reason_code"],

"properties": {

"reason_code": { "type": "string", "enum": ["customer_not_home", "no_access",
"no_empty_available", "unsafe", "other"] },

"notes": { "type": ["string", "null"], "maxLength": 300 }

},

"additionalProperties": false

}

}

}

]

}

**3.9. payment_created**

**json**

{

"$id": "https://xua.delivery/schemas/payment_created.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "payment_created" },

"metadata": {

"type": "object",

"required": ["provider", "amount", "currency", "kind"],


"properties": {

"provider": { "type": "string", "minLength": 1 },

"amount": { "type": "number", "minimum": 0 },

"currency": { "type": "string", "const": "BRL" },

"kind": { "type": "string", "enum": ["order", "subscription", "deposit"] }

},

"additionalProperties": false

}

}

}

]

}

**3.10. payment_captured**

**json**

{

"$id": "https://xua.delivery/schemas/payment_captured.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "payment_captured" },

"metadata": {

"type": "object",

"required": ["provider_payment_ref"],

"properties": { "provider_payment_ref": { "type": "string", "minLength": 1 } },

"additionalProperties": false

}

}

}

]


### }

**3.11. payment_failed**

**json**

{

"$id": "https://xua.delivery/schemas/payment_failed.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "payment_failed" },

"metadata": {

"type": "object",

"required": ["provider_error_code", "stage", "is_retryable"],

"properties": {

"provider_error_code": { "type": "string", "minLength": 1 },

"stage": { "type": "string", "enum": ["authorize", "capture"] },

"is_retryable": { "type": "boolean" }

},

"additionalProperties": false

}

}

}

]

}

**3.12. deposit_held**

**json**

{

"$id": "https://xua.delivery/schemas/deposit_held.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },


### {

"type": "object",

"properties": {

"event_type": { "const": "deposit_held" },

"metadata": {

"type": "object",

"required": ["deposit_amount", "currency", "trigger", "policy_version"],

"properties": {

"deposit_amount": { "type": "number", "minimum": 0 },

"currency": { "type": "string", "const": "BRL" },

"trigger": { "type": "string", "enum": ["first_purchase", "no_empty_return"] },

"policy_version": { "type": "string", "minLength": 1 }

},

"additionalProperties": false

}

}

}

]

}

**3.13. deposit_refunded**

**json**

{

"$id": "https://xua.delivery/schemas/deposit_refunded.schema.json",

"allOf": [

{ "$ref": "AuditEventBase.schema.json" },

{

"type": "object",

"properties": {

"event_type": { "const": "deposit_refunded" },

"metadata": {

"type": "object",


"required": ["provider_refund_ref"],

"properties": { "provider_refund_ref": { "type": "string", "minLength": 1 } },

"additionalProperties": false

}

}

}

]

}


**4) Checklist final para o time (Node + Postgres)**

**4.1. Ordem de implementação (MVP)**

1. Criar enums + tabelas core
    ( **consumers** , **addresses** , **distributors** , **zones** , **delivery_capacity** , **products** )
2. Criar **orders** , **order_items** , **payments** , **deposits** , **order_otps** , **audit_events**
3. Implementar transações críticas:
    - reserva capacidade + confirmação pedido
    - aceite dentro SLA (registrar timestamps)
    - entrega com OTP + registro troca/não coleta
    - devolução caução (regra A)
4. Ajv schemas + validação de evento antes de persistir
5. Webhook idempotente (tabela **payment_webhook_events** )

**4.2. Padrão de “emitEvent()”**

- Toda mutação de estado relevante:
    - atualiza tabela normalizada
    - emite evento em **audit_events**
    - (opcional) publica em fila interna


