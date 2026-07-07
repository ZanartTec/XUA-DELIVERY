# Fluxo Atual de Pedidos — Xuá Delivery

## Auditoria funcional do sistema como está implementado hoje

> Data de referência: 06/07/2026
> Escopo: fluxo de compra, persistência do pedido, papel da distribuidora Xuá, visibilidade por perfil e causas do pedido não aparecer nas telas operacionais.

---

## 1. Objetivo deste documento

Este documento descreve o fluxo real de pedidos do sistema Xuá Delivery com base na implementação atual do código.

O foco aqui não é descrever o comportamento ideal do produto, mas sim responder, de forma objetiva e coesa, às seguintes perguntas:

- Quando o cliente faz um pedido, o que acontece em seguida?
- O pedido é salvo de verdade no banco ou apenas mockado?
- Para qual distribuidora o pedido vai?
- Quem consegue ver esse pedido hoje?
- Existe um "admin master" que vê tudo?
- Por que o pedido atualmente não aparece na tela do motorista nem na tela administrativa do distribuidor?

---

## 2. Resumo executivo

Hoje, o pedido do cliente e salvo de verdade no banco de dados, e o pagamento e processado por gateway real.

**Atualização (julho/2026):** o pagamento deixou de ser mockado como padrão. O provider configurado é o **Mercado Pago** (`PAYMENT_PROVIDER` com default `mercadopago`), usando as credenciais da própria distribuidora armazenadas criptografadas em `34_cfg_distributor_payment_settings`. O provider `mock` continua disponível apenas como opção de ambiente de desenvolvimento.

Em termos práticos, o fluxo atual funciona assim:

1. O consumidor fecha a compra no checkout.
2. O frontend faz um POST para a API de pedidos.
3. A API valida endereco, zona e produtos.
4. A API grava o pedido, os itens do pedido e o evento de auditoria no banco.
5. A cobranca e criada no gateway da distribuidora; a confirmacao chega via webhook idempotente e avanca o pedido para os estados de pagamento e envio ao distribuidor.
6. O pedido entra na fila da distribuidora responsavel pela zona do endereco (ou da distribuidora escolhida pelo consumidor).
7. Depois de aceito e despachado, o pedido passa a ficar visivel para o motorista designado.

O principal problema atual nao e a ausencia de persistencia. O problema e que existem falhas de visibilidade e associacao de identidade entre:

- o usuario distribuidor logado
- a distribuidora dona do pedido
- a tela do motorista
- a resposta da API do motorista

Por isso, o pedido pode existir no banco e mesmo assim nao aparecer nas filas esperadas.

---

## 3. Como a Xuá aparece no modelo atual

### 3.1. O sistema foi modelado para suportar distribuidoras

Mesmo que, na pratica de negocio, a Xuá seja a operacao distribuidora, o sistema foi implementado com uma entidade explicita de distribuidora.

Isso significa que o modelo atual separa:

- a empresa distribuidora
- as zonas de atendimento da distribuidora
- os usuarios humanos que operam essa distribuidora

Em outras palavras: a Xuá, como operacao, deve existir como um registro na tabela de distribuidoras. Os usuarios que trabalham nessa operacao entram no sistema com a role distributor_admin, mas eles nao sao a distribuidora em si. Eles sao usuarios vinculados a uma distribuidora.

### 3.2. Estrutura conceitual

Hoje o relacionamento e este:

- Consumidor faz pedido para um endereco.
- O endereco pertence a uma zona de entrega.
- A zona pertence a uma distribuidora.
- O pedido recebe o distributor_id dessa distribuidora.

Se a Xuá for a unica distribuidora operando no sistema, entao todas as zonas ativas devem apontar para o registro da Xuá na tabela de distribuidoras. Nesse caso, todos os pedidos deveriam cair na fila operacional da Xuá.

### 3.3. Como o distribuidor e identificado no sistema

O usuario logado com perfil distributor_admin usa o id do usuario autenticado (
eq.user.sub), e nao o id da distribuidora. Para resolver esse mapeamento, o sistema usa o servico 
esolveDistributorId(userId) no repositorio do distribuidor.

Ou seja:

- pedido.distributor_id = id da distribuidora
- req.user.sub = id do usuario distribuidor logado

O servico 
esolveDistributorId() faz o join entre usuario e distribuidora para que as queries de pedidos da distribuidora funcionem corretamente.

> **Status (junho/2026):** Corrigido. O distributorRepository.resolveDistributorId(userId) e chamado em todos os endpoints do distribuidor, resolvendo a associacao corretamente.

---

## 4. Perfis existentes no sistema hoje

As roles existentes no codigo atual sao:

- consumer
- distributor_admin
- driver
- ops
- support

Nao existe uma role chamada admin_master no codigo atual.

### 4.1. O que cada perfil deveria enxergar

| Perfil | Papel no fluxo | Visao esperada |
|---|---|---|
| consumer | Cliente que compra | Ve apenas os proprios pedidos |
| distributor_admin | Operador da distribuidora | Ve pedidos da propria distribuidora |
| driver | Motorista | Ve apenas pedidos que foram despachados para ele |
| ops | Operacao central | Pode ter visao global do sistema |
| support | Suporte | Pode consultar pedidos para atendimento |

### 4.2. Existe alguem que ve tudo?

Do ponto de vista de backend, sim: ops e support possuem permissao para acesso amplo aos pedidos.

Do ponto de vista de interface pronta para uso, nao existe hoje uma "fila master" dedicada mostrando todos os pedidos do sistema em uma tela administrativa unica.

Entao a resposta correta e:

- existe capacidade tecnica de visao global no backend para ops e support
- mas nao existe hoje uma experiencia completa de "admin master" com painel operacional unico de todos os pedidos

Na pratica:

- support tem uma tela de busca de pedidos
- ops pode consultar todos os pedidos via backend
- o distribuidor tem uma fila operacional propria
- o motorista so ve pedidos despachados para ele

---

## 5. Fluxo ponta a ponta do pedido

## 5.1. Etapa 1 — o consumidor fecha a compra

O consumidor segue o fluxo de checkout na area do cliente:

1. escolhe os produtos
2. escolhe a data da entrega (calendário com próximos 14 dias — apenas datas disponíveis)
3. escolhe a janela de entrega
4. escolhe o endereço
5. **[NOVO]** escolhe a distribuidora (quando há 2 ou mais disponíveis com `allows_consumer_choice=true`)
6. confirma o pagamento

Se apenas uma distribuidora cobre a zona com `allows_consumer_choice=true`, essa etapa é ignorada e o sistema seleciona automaticamente. A preferência pode ser configurada no perfil do consumidor pelo campo `auto_assign_distributor`.

**[NOVO] Validação de agenda no checkout:** Antes de avançar para o pagamento, o sistema valida a data escolhida via `validateDeliveryDate()`. Essa validação verifica:
- Se o dia da semana está ativo na agenda da distribuidora (`22_cfg_distributor_schedule`).
- Se a data não está bloqueada (`23_cfg_distributor_blocked_dates`).
- Se o lead_time mínimo é atendido (horário atual + lead_time < horário limite do dia).
Caso alguma regra seja violada, o pedido é rejeitado com HTTP 422 e o erro correspondente (`WEEKDAY_INACTIVE`, `DATE_BLOCKED` ou `LEAD_TIME_VIOLATION`).

### O que vai no payload

O pedido enviado pelo checkout contem, em linhas gerais:

- address_id
- lista de itens
- quantidade de vasilhames vazios informada pelo cliente
- delivery_date
- delivery_window
- indicacao do metodo de pagamento
- **distributor_id (opcional)** — presente apenas quando o consumidor escolheu manualmente

---

## 5.2 — Etapa 2 — a API resolve a distribuidora do pedido

Quando o backend recebe o POST do pedido, ele executa o servico `resolveDistributor()` para determinar qual distribuidora atendera o pedido.

Esse servico aplica a seguinte logica:

1. valida se o endereco pertence ao consumidor logado
2. obtem o `zone_id` do endereco
3. verifica se a zona esta ativa
4. **[NOVO] se o payload contem `distributor_id`:**
   - valida se essa distribuidora cobre a zona
   - valida se ela tem `is_active = true` e `allows_consumer_choice = true`
   - se valido: usa a distribuidora escolhida pelo consumidor (`mode = 'manual'`)
5. **[NOVO] se nao ha `distributor_id` ou a validacao falha:**
   - pega o `distributor_id` diretamente da zona (`zone.distributor_id`)
   - modo automatico (`mode = 'auto'`)

O modo de selecao (`manual` ou `auto`) e registrado no evento de auditoria `ORDER_CREATED`.

Em resumo:

**endereco -> zona -> resolveDistributor() -> distribuidora**

Se o consumidor escolheu uma distribuidora valida, ela prevalece. Caso contrario, a distribuidora da zona e usada automaticamente.

---

## 5.3. Etapa 3 — o pedido e salvo no banco

O pedido nao fica apenas em memoria e nao e apenas um mock de interface.

Hoje o backend persiste de verdade:

- o registro principal do pedido
- os itens do pedido
- o evento de auditoria de criacao do pedido
- eventual caucao, quando aplicavel

Tudo isso acontece dentro de transacao.

Entao, para a pergunta "o pedido e salvo no banco?", a resposta e:

**Sim. O pedido e salvo no banco de dados real.**

---

## 5.4. Etapa 4 — o pagamento e real (Mercado Pago por distribuidora)

O pedido e persistido de verdade e a cobranca tambem e real.

**Atualização (julho/2026):**

- O gateway padrao e o Mercado Pago (`PAYMENT_PROVIDER` default `mercadopago`); o adapter `mock` existe apenas como opcao de desenvolvimento.
- As credenciais usadas na cobranca sao as da **propria distribuidora** do pedido, lidas de `34_cfg_distributor_payment_settings` (tokens criptografados com AES-256-GCM). Cada distribuidora tambem define quais metodos aceita (Pix online, cartao online, dinheiro/cartao na entrega).
- A confirmacao chega via webhook (`POST /api/payments/webhook`), com validacao de assinatura HMAC e idempotencia por `14_cfg_payment_webhook_events` + `20_cfg_idempotency_keys`, processada de forma resiliente via fila BullMQ.

Depois de criar o pedido, os estados avancam:

- CREATED
- PAYMENT_PENDING
- CONFIRMED (apos captura do pagamento)
- SENT_TO_DISTRIBUTOR

### Ponto importante

A confirmacao de pagamento e assincrona (webhook). Ate o webhook chegar, o pedido permanece em PAYMENT_PENDING e ainda nao aparece na fila da distribuidora. Cobrancas nao pagas expiram (`PAYMENT_EXPIRED`).

---

## 5.5. Etapa 5 — quando o pedido deveria aparecer para a distribuidora

Hoje a fila da distribuidora foi desenhada para listar pedidos com status:

- SENT_TO_DISTRIBUTOR

Ou seja, o pedido deveria chegar para a distribuidora somente depois que a simulacao de pagamento avanca o fluxo ate esse ponto.

Fluxo esperado:

1. consumidor cria pedido
2. pagamento confirmado via webhook do gateway
3. pedido vira SENT_TO_DISTRIBUTOR
4. pedido entra na fila do distribuidor
5. distribuidor aceita ou recusa

Depois disso, o fluxo continua para checklist e despacho.

---

## 5.6. Etapa 6 — o que a distribuidora faz depois

Depois que o pedido entra corretamente na fila operacional da distribuidora, o fluxo esperado e:

1. aceitar ou recusar o pedido
2. se aceitar, concluir checklist
3. despachar o pedido para um motorista especifico

Os estados esperados sao:

- SENT_TO_DISTRIBUTOR
- ACCEPTED_BY_DISTRIBUTOR
- READY_FOR_DISPATCH
- OUT_FOR_DELIVERY

No momento do dispatch, o sistema grava o driver_id no pedido.

Esse e o ponto em que o pedido deixa de ser apenas um pedido da distribuidora e passa a ser tambem uma entrega atribuida a um motorista especifico.

---

## 5.7. Etapa 7 — quando o pedido deveria aparecer para o motorista

O motorista nao deveria ver pedidos imediatamente apos a compra do cliente.

No fluxo atual, ele so deve ver pedidos quando:

- a distribuidora ja aceitou o pedido
- o checklist foi concluido
- o pedido foi despachado
- um driver_id foi efetivamente atribuido ao pedido

Entao, conceitualmente, o motorista **nao** deveria ver pedidos novos que ainda estao apenas em CREATED, CONFIRMED ou SENT_TO_DISTRIBUTOR.

Ele so deveria enxergar pedidos em rota, isto e, ja atribuidos a ele.

---

## 6. Quem ve o pedido hoje, na pratica

## 6.1. Consumidor

O consumidor ve apenas os proprios pedidos.

Essa parte do fluxo esta coerente com a ideia do produto: cada cliente acompanha somente o seu historico e os detalhes dos seus proprios pedidos.

---

## 6.2. Distribuidor

O distribuidor ve os pedidos da propria distribuidora, filtrados pelo distributor_id do pedido.

### Como funciona

Se a Xuá for a distribuidora responsavel pela zona, entao:

- o pedido recebe o distributor_id da Xuá
- os usuarios distributor_admin ligados a Xuá enxergam esse pedido

### Resolucao do mapeamento usuario → distribuidora

O backend chama distributorRepository.resolveDistributorId(userId) para mapear o id do usuario logado para o id da distribuidora correspondente. Assim, a query de pedidos filtra corretamente por distributor_id.

> **Status (junho/2026):** O bug de associacao de identidade entre usuario e distribuidora foi **corrigido** por meio do servico 
esolveDistributorId(). O distribuidor agora enxerga corretamente os pedidos da sua distribuidora.

### Salas de socket

O evento de novo pedido e emitido para a sala distributor:{distributorId}, e o usuario distributor_admin entra nessa sala com o distributorId resolvido no handshake.

---

## 6.3. Motorista

O motorista deveria ver apenas pedidos que ja foram despachados para ele.

Hoje o backend do motorista lista pedidos quando:

- driver_id = id do motorista logado
- status esta entre OUT_FOR_DELIVERY e DELIVERED
- a entrega e do dia

Isso significa que um pedido recem-criado nunca apareceria para o motorista antes do dispatch, e isso e esperado.

### Visibilidade do motorista hoje

Para o motorista ver um pedido, e necessario que:

1. a distribuidora tenha aceitado o pedido
2. o checklist tenha sido concluido
3. o pedido tenha sido despachado com um driver_id atribuido ao motorista logado

> **Status (junho/2026):** O bug de consumo do formato da resposta da API (data.deliveries) foi corrigido. A tela do motorista consome corretamente a resposta atual do backend.

---

## 6.4. Ops e Support

Ops e Support sao os perfis mais proximos do que se poderia chamar de "admin master", mas com uma ressalva importante.

### O que existe hoje

No backend, ops e support podem ter visao ampla dos pedidos.

### O que nao existe hoje

Nao existe uma role chamada admin_master.

Tambem nao existe hoje uma tela operacional unificada, pronta e dedicada, que funcione como uma central de todos os pedidos do sistema com a experiencia de uma fila geral de administracao.

### O que support faz hoje

Support trabalha mais como busca e consulta de pedidos, e nao como fila operacional de distribuicao.

Entao a visao global existe mais no nivel de permissao backend do que como uma experiencia operacional consolidada na interface.

---

## 7. Por que o pedido nao aparece hoje

Esta e a parte central da auditoria.

## 7.1. Visibilidade da tela da distribuidora (corrigida)

O mapeamento entre usuario distribuidor e distribuidora foi corrigido via 
esolveDistributorId(). O pedido salvo com distributor_id correto e retornado pela fila do distribuidor quando o usuario distributor_admin logado esta vinculado a essa distribuidora.

> **Status (junho/2026):** Resolvido. A fila operacional do distribuidor exibe corretamente os pedidos em SENT_TO_DISTRIBUTOR.

---

## 7.2. Realtime da distribuidora (corrigido)

O usuario distributor_admin entra na sala distributor:{distributorId} com o distributorId resolvido no handshake. Eventos de novos pedidos sao publicados para essa sala, e o operador recebe as notificacoes corretamente.

> **Status (junho/2026):** Resolvido. O socket usa o mesmo distributorId que a query HTTP.

---

## 7.3. Motivo principal na tela do motorista

O pedido nao aparece para o motorista, em primeiro lugar, porque o motorista so ve pedidos despachados para ele.

Se o pedido ainda nao passou por:

- aceite da distribuidora
- checklist
- dispatch com driver_id

entao ele nao deveria mesmo aparecer no modulo do motorista.

---

## 7.4. Tela do motorista (corrigida)

A tela do motorista foi corrigida e consome corretamente a resposta do backend. Pedidos despachados para o motorista logado aparecem na lista de entregas do dia.

> **Status (junho/2026):** Resolvido. O bug de formato de resposta (data.deliveries) foi corrigido.

---

## 7.5. Motivo eventual ligado ao pagamento assincrono

A confirmacao de pagamento depende do webhook do gateway, que e assincrono.

Enquanto o webhook nao chega (ou se o pagamento nao for concluido):

- o consumidor pode ter visto a tela de confirmacao de criacao do pedido
- mas o pedido permanece em PAYMENT_PENDING e nao chegou a SENT_TO_DISTRIBUTOR
- portanto ele nao aparece na fila da distribuidora, que filtra apenas pedidos enviados ao distribuidor

O processamento do webhook e idempotente e resiliente (fila BullMQ com retry), e cobrancas nao pagas expiram automaticamente.

---

## 8. Como interpretar a Xuá dentro desse fluxo

Se a Xuá e a distribuidora da operacao, entao o comportamento de negocio esperado deveria ser:

1. o pedido do cliente cai na zona da Xuá
2. essa zona aponta para a distribuidora Xuá
3. o pedido recebe o distributor_id da Xuá
4. os usuarios distributor_admin da Xuá veem esse pedido na fila
5. a Xuá aceita, prepara e despacha
6. o motorista da Xuá faz a entrega

O sistema implementa corretamente essa modelagem. O elo entre usuario distribuidor e distribuidora e resolvido por 
esolveDistributorId().

Portanto, o sistema entende a Xuá como distribuidora e respeita corretamente a relacao de acesso e visibilidade.

---

## 9. Resposta direta para as perguntas de negocio

### O pedido e salvo no banco?

Sim. O pedido e salvo no banco de dados real, junto com seus itens e eventos associados.

### O pedido e mockado?

Nao. O pedido nao e mockado, e o pagamento tambem nao: a cobranca e feita via Mercado Pago com as credenciais da distribuidora do pedido. O adapter `mock` existe apenas como opcao de desenvolvimento.

### O pedido cai aonde quando o cliente compra?

Ele cai na distribuidora dona da zona do endereco do consumidor.

Se a Xuá for a distribuidora configurada para aquela zona, o pedido e da Xuá.

### Quem deveria ver esse pedido primeiro?

Primeiro a distribuidora responsavel pela zona. Depois, quando houver despacho, o motorista designado.

### Existe admin master?

Nao existe uma role admin_master no codigo atual.

O mais proximo disso hoje sao os perfis ops e support, que possuem permissao ampla no backend, mas sem uma fila master operacional unica e dedicada.

### Por que o pedido nao aparece no estado esperado?

Os problemas historicos foram corrigidos:

1. ~~a fila do distribuidor usa o id do usuario logado~~ → corrigido via 
esolveDistributorId()
2. ~~o realtime usa a associacao incorreta~~ → corrigido: sala usa distributor:{distributorId}
3. o motorista so ve pedidos apos dispatch com driver_id → comportamento correto e esperado
4. ~~a tela do motorista le a resposta no formato errado~~ → corrigido
5. enquanto o webhook de pagamento nao confirma, o pedido fica em PAYMENT_PENDING e nao chega a SENT_TO_DISTRIBUTOR → comportamento esperado do fluxo assincrono
6. ~~erro de tipo de produto no aceite do distribuidor~~ → corrigido em julho/2026 (commit 01754e9)

---

## 10. Conclusao

O sistema atual ja possui a espinha dorsal correta do fluxo de pedidos:

- checkout cria pedido real
- banco persiste pedido real
- zona define a distribuidora responsavel
- distribuidora deveria receber o pedido
- motorista deveria receber apenas pedidos despachados
- ops e support possuem visibilidade ampla em nivel de permissao

O fluxo ponta a ponta esta funcional.

Em resumo:

- o consumidor cria o pedido corretamente
- o pedido e persistido corretamente (36 tabelas, incluindo inventario operacional, caucao de vasilhames v2 e configuracao de pagamento por distribuidora)
- a Xuá e a distribuidora correta do pedido
- a visibilidade do distribuidor funciona corretamente via 
esolveDistributorId()
- o realtime do distribuidor funciona corretamente via sala distributor:{distributorId}
- a visibilidade do motorista funciona apos dispatch com driver_id atribuido
- a tela do motorista consome a resposta da API corretamente

O comportamento correto hoje e:

- o cliente cria o pedido
- o pagamento e processado pelo Mercado Pago da distribuidora (ou simulado em dev via provider mock)
- o pedido chega a SENT_TO_DISTRIBUTOR
- o distribuidor ve o pedido na fila operacional e recebe notificacao em tempo real
- apos despacho, o motorista ve a entrega na propria lista

---

## 11. Anexo tecnico resumido

### O que ja esta implementado de forma real

- criacao de pedido
- persistencia de itens
- auditoria de criacao
- associacao com zona e distribuidora (com selecao manual pelo consumidor quando ha 2+ opcoes)
- pagamento real via Mercado Pago com credenciais por distribuidora (provider mock disponivel para dev)
- estados de aceite, checklist, despacho e entrega
- assinaturas com geracao automatica de pedidos (fases 1 e 2, com retry e compensacao)
- caucao de vasilhames v2 (programa por cliente, saldo e movimentos)
- redefinicao de senha por e-mail (esqueci minha senha)

### O que esta incompleto ou em evolucao

- experiencia de painel global unificado para administracao total (ops/support possuem permissao, mas sem fila master dedicada na UI)

### Leitura correta do estado atual

O sistema possui fluxo de pedido completo e funcional. A criacao, persistencia, roteamento para a distribuidora, pagamento real, visibilidade operacional e atribuicao ao motorista estao todos implementados e funcionando corretamente.

---

**Última atualização: 06 de julho de 2026.**