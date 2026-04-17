# Fluxo Atual de Pedidos — Xuá Delivery

## Auditoria funcional do sistema como está implementado hoje

> Data de referência: 08/04/2026
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

Hoje, o pedido do cliente e salvo de verdade no banco de dados. O que está mockado no ambiente atual nao e o pedido, e sim o pagamento.

Em termos práticos, o fluxo atual funciona assim:

1. O consumidor fecha a compra no checkout.
2. O frontend faz um POST para a API de pedidos.
3. A API valida endereco, zona e produtos.
4. A API grava o pedido, os itens do pedido e o evento de auditoria no banco.
5. Como o ambiente atual usa pagamento mock, o backend tenta avancar automaticamente o pedido para os estados de pagamento e envio ao distribuidor.
6. O pedido deveria entao entrar na fila da distribuidora responsavel pela zona do endereco.
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

### 3.3. O detalhe que gera confusao

O usuario logado com perfil distributor_admin nao tem como identificador principal o id da distribuidora. O token JWT atual usa o id do usuario autenticado.

Ou seja:

- pedido.distributor_id = id da distribuidora
- req.user.sub = id do usuario distribuidor logado

Esses dois ids nao sao a mesma coisa.

Esse detalhe e a principal causa do pedido nao aparecer para o distribuidor hoje.

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
- relacao com capacidade de entrega da zona

Tudo isso acontece dentro de transacao.

Entao, para a pergunta "o pedido e salvo no banco?", a resposta e:

**Sim. O pedido e salvo no banco de dados real.**

---

## 5.4. Etapa 4 — o pagamento esta mockado

Embora o pedido seja persistido de verdade, o ambiente atual usa pagamento mock.

Isso significa que:

- o sistema nao depende de uma cobranca real para continuar o fluxo em desenvolvimento
- o backend tenta simular automaticamente o ciclo de pagamento

Na implementacao atual, depois de criar o pedido, o backend tenta avancar automaticamente pelos estados:

- CREATED
- PAYMENT_PENDING
- CONFIRMED
- SENT_TO_DISTRIBUTOR

Portanto, o comportamento correto de desenvolvimento hoje e:

- pedido real
- pagamento simulado

### Ponto importante

Essa simulacao de pagamento acontece de forma assincrona, depois da criacao do pedido.

Isso abre uma possibilidade importante:

- o pedido pode ser criado com sucesso
- o frontend pode redirecionar o consumidor para a tela de confirmacao
- mas a simulacao de pagamento pode falhar depois
- se isso acontecer, o pedido pode permanecer em CREATED e nao chegar ate SENT_TO_DISTRIBUTOR

Entao existem dois niveis de problema possiveis:

1. problema de visibilidade da distribuidora e do motorista
2. eventual falha na simulacao mock que impede o avancar do status

---

## 5.5. Etapa 5 — quando o pedido deveria aparecer para a distribuidora

Hoje a fila da distribuidora foi desenhada para listar pedidos com status:

- SENT_TO_DISTRIBUTOR

Ou seja, o pedido deveria chegar para a distribuidora somente depois que a simulacao de pagamento avanca o fluxo ate esse ponto.

Fluxo esperado:

1. consumidor cria pedido
2. pagamento mock confirma
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

O distribuidor deveria ver os pedidos da propria distribuidora, filtrados pelo distributor_id do pedido.

Porem, hoje existe um erro de associacao de identidade.

### Como deveria funcionar

Se a Xuá for a distribuidora responsavel pela zona, entao:

- o pedido recebe o distributor_id da Xuá
- os usuarios distributor_admin ligados a Xuá deveriam enxergar esse pedido

### Como esta funcionando hoje

O backend filtra e autoriza o acesso do distribuidor usando o id do usuario logado, e nao o id da distribuidora.

Na pratica, o sistema compara:

- order.distributor_id
- req.user.sub

Mas:

- order.distributor_id = id da distribuidora
- req.user.sub = id do usuario distribuidor autenticado

Esses ids nao coincidem.

Resultado:

- o pedido existe
- o pedido pertence a distribuicao da Xuá
- mas a fila do distribuidor pode vir vazia porque o filtro esta usando o identificador errado

### Efeito colateral no tempo real

O mesmo problema acontece nas salas de socket:

- o usuario entra na sala baseada no id do usuario
- o evento de novo pedido e emitido para a sala baseada no id da distribuidora

Entao a notificacao em tempo real do distribuidor tambem pode falhar pelo mesmo motivo estrutural.

---

## 6.3. Motorista

O motorista deveria ver apenas pedidos que ja foram despachados para ele.

Hoje o backend do motorista lista pedidos quando:

- driver_id = id do motorista logado
- status esta entre OUT_FOR_DELIVERY e DELIVERED
- a entrega e do dia

Isso significa que um pedido recem-criado nunca apareceria para o motorista antes do dispatch, e isso e esperado.

### Porem existe um segundo problema

Mesmo quando houver pedidos validos para o motorista, a pagina atual da web do motorista consome a resposta da API em um formato diferente do que o backend devolve.

Em outras palavras:

- a API retorna um array cru
- a tela tenta ler data.deliveries

Resultado:

- mesmo havendo entregas validas, a interface pode continuar exibindo lista vazia

Ou seja, para o motorista existem hoje dois motivos para nao ver o pedido:

1. o pedido ainda nao foi despachado para ele
2. a propria tela esta lendo a resposta da API no formato errado

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

## 7.1. Motivo principal na tela da distribuidora

O pedido nao aparece na fila da distribuidora porque existe uma quebra entre:

- o id da distribuidora dona do pedido
- o id do usuario distribuidor autenticado

O sistema esta filtrando como se essas duas coisas fossem iguais, mas elas nao sao.

### Consequencia

Mesmo com o pedido corretamente salvo e associado a distribuidora Xuá, a fila pode retornar vazia para o usuario distributor_admin.

Esse e hoje o principal motivo funcional para o distribuidor nao enxergar o pedido.

---

## 7.2. Motivo estrutural adicional no realtime da distribuidora

O problema nao acontece apenas na listagem por HTTP. Ele tambem afeta a notificacao em tempo real.

Como a sala do socket do usuario distribuidor e baseada no id do usuario, mas o evento do novo pedido e publicado para a sala baseada no id da distribuidora, o evento tambem nao chega corretamente ao operador.

Entao o distribuidor perde duas coisas ao mesmo tempo:

- a listagem correta
- a notificacao em tempo real

---

## 7.3. Motivo principal na tela do motorista

O pedido nao aparece para o motorista, em primeiro lugar, porque o motorista so ve pedidos despachados para ele.

Se o pedido ainda nao passou por:

- aceite da distribuidora
- checklist
- dispatch com driver_id

entao ele nao deveria mesmo aparecer no modulo do motorista.

---

## 7.4. Motivo adicional na tela do motorista

Mesmo depois do dispatch, a tela do motorista ainda pode continuar vazia por um bug de consumo da resposta da API.

Entao existe uma falha de implementacao no frontend do motorista que impede a tela de refletir corretamente os dados retornados pelo backend.

---

## 7.5. Motivo eventual ligado ao pagamento mock

Existe ainda um terceiro ponto que precisa ser documentado: a simulacao de pagamento acontece de forma assincrona.

Se essa simulacao falhar, o pedido pode permanecer em CREATED.

Se isso acontecer:

- o consumidor recebeu confirmacao de criacao do pedido
- mas o pedido ainda nao chegou a SENT_TO_DISTRIBUTOR
- portanto ele nao aparece na fila da distribuidora que filtra apenas pedidos enviados ao distribuidor

Esse nao parece ser o unico problema atual, mas e uma fragilidade real do fluxo como esta hoje.

---

## 8. Como interpretar a Xuá dentro desse fluxo

Se a Xuá e a distribuidora da operacao, entao o comportamento de negocio esperado deveria ser:

1. o pedido do cliente cai na zona da Xuá
2. essa zona aponta para a distribuidora Xuá
3. o pedido recebe o distributor_id da Xuá
4. os usuarios distributor_admin da Xuá veem esse pedido na fila
5. a Xuá aceita, prepara e despacha
6. o motorista da Xuá faz a entrega

Hoje o sistema esta muito perto dessa modelagem, mas tropeca no elo entre:

- usuario distribuidor autenticado
- distribuidora proprietaria do pedido

Portanto, o problema atual nao e que o sistema nao entende a Xuá como distribuidora. O problema e que a camada de acesso e visibilidade nao esta respeitando corretamente essa relacao.

---

## 9. Resposta direta para as perguntas de negocio

### O pedido e salvo no banco?

Sim. O pedido e salvo no banco de dados real, junto com seus itens e eventos associados.

### O pedido e mockado?

Nao. O pedido nao e mockado. O que esta mockado hoje e o pagamento.

### O pedido cai aonde quando o cliente compra?

Ele cai na distribuidora dona da zona do endereco do consumidor.

Se a Xuá for a distribuidora configurada para aquela zona, o pedido e da Xuá.

### Quem deveria ver esse pedido primeiro?

Primeiro a distribuidora responsavel pela zona. Depois, quando houver despacho, o motorista designado.

### Existe admin master?

Nao existe uma role admin_master no codigo atual.

O mais proximo disso hoje sao os perfis ops e support, que possuem permissao ampla no backend, mas sem uma fila master operacional unica e dedicada.

### Por que o pedido nao aparece hoje?

Pelos seguintes motivos principais:

1. a fila do distribuidor usa o id do usuario logado onde deveria considerar a relacao com a distribuidora do pedido
2. o realtime do distribuidor usa a mesma associacao incorreta
3. o motorista so ve pedidos apos dispatch com driver_id
4. a tela do motorista le a resposta da API no formato errado
5. se a simulacao de pagamento mock falhar, o pedido pode nem chegar ao estado esperado pela fila do distribuidor

---

## 10. Conclusao

O sistema atual ja possui a espinha dorsal correta do fluxo de pedidos:

- checkout cria pedido real
- banco persiste pedido real
- zona define a distribuidora responsavel
- distribuidora deveria receber o pedido
- motorista deveria receber apenas pedidos despachados
- ops e support possuem visibilidade ampla em nivel de permissao

O problema central hoje nao esta na criacao do pedido, mas sim na passagem do pedido entre os atores operacionais.

Em resumo:

- o consumidor cria o pedido corretamente
- o pedido e persistido corretamente
- a Xuá pode ser a distribuidora correta do pedido
- mas a visibilidade do distribuidor esta quebrada por uma associacao incorreta entre usuario e distribuidora
- a visibilidade do motorista depende de dispatch e ainda sofre com um bug de frontend

Por isso, o comportamento observado hoje pode ser exatamente este:

- o cliente cria o pedido
- o pedido existe no banco
- mas ele nao aparece nem para o distribuidor nem para o motorista nas telas esperadas

Nao porque o pedido nao exista, e sim porque o fluxo de exibicao e atribuicao ainda esta inconsistente na implementacao atual.

---

## 11. Anexo tecnico resumido

### O que ja esta implementado de forma real

- criacao de pedido
- persistencia de itens
- auditoria de criacao
- associacao com zona e distribuidora
- simulacao de pagamento mock
- estados de aceite, checklist, despacho e entrega

### O que esta incompleto ou inconsistente hoje

- visibilidade correta do pedido para distributor_admin
- notificacao realtime correta para distribuidor
- tela do motorista consumindo resposta da API corretamente
- experiencia de painel global unificado para administracao total

### Leitura correta do estado atual

O sistema nao esta sem fluxo de pedido. Ele ja possui fluxo real. O que falta e alinhar a camada de exibicao, autorizacao e atribuicao operacional para que esse fluxo apareca corretamente nas interfaces certas.