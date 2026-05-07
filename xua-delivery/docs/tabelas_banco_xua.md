# Xuá Delivery - Guia das Tabelas do Banco

Documento de referência do banco de dados do Xuá Delivery, gerado a partir do schema atual em `prisma/schema.prisma`.

## Visão geral

- O schema atual possui 24 tabelas mapeadas no Prisma.
- A convenção de nomes segue o padrão `<ordem>_<tipo>_<nome>`.
- Tipos usados no nome da tabela:
  - `mst`: cadastro mestre
  - `cfg`: configuração operacional
  - `trn`: dado transacional
  - `piv`: tabela de associação
  - `sec`: segurança
  - `aud`: auditoria

## Tabelas de cadastro mestre

### 01_mst_consumers

Guarda os usuários da plataforma. Apesar do nome "consumers", ela também concentra os perfis internos definidos pelo campo `role`, como consumidor, distribuidor, motorista, suporte e operações.

Serve como base de autenticação e identidade do sistema. Também guarda preferências operacionais, como distribuidora vinculada, distribuidora preferida e se a escolha de distribuidora deve ser automática.

Relacionamentos principais:
- 1:N com `02_mst_addresses`
- 1:N com `09_trn_orders`
- 1:N com `08_sec_consumer_push_tokens`
- 1:N com `11_trn_subscriptions`
- 1:N com `15_trn_deposits`
- N:1 com `03_mst_distributors` quando o usuário pertence a uma distribuidora

### 02_mst_addresses

Armazena os endereços do consumidor. Um mesmo usuário pode ter vários endereços, com indicação de endereço padrão.

Essa tabela é usada no checkout para definir o local de entrega e para associar o endereço a uma zona de atendimento.

Relacionamentos principais:
- N:1 com `01_mst_consumers`
- N:1 com `04_mst_zones`
- 1:N com `09_trn_orders`

### 03_mst_distributors

Representa as distribuidoras parceiras que operam os pedidos. Guarda os dados cadastrais e parâmetros importantes da operação, como SLA de aceite e se a distribuidora pode aparecer no seletor do consumidor.

É a tabela central da operação logística, porque dela partem zonas, agendas, datas bloqueadas, faixas horárias e vínculos com pedidos.

Relacionamentos principais:
- 1:N com `04_mst_zones`
- 1:N com `09_trn_orders`
- 1:N com `17_trn_reconciliations`
- 1:N com `22_cfg_distributor_schedule`
- 1:N com `23_cfg_distributor_blocked_dates`
- 1:N com `24_cfg_time_slots`
- 1:N com usuários da `01_mst_consumers`

### 04_mst_zones

Define as zonas de atendimento de cada distribuidora. Uma zona representa um agrupamento operacional para cobertura, capacidade e roteirização.

Ela é importante para descobrir se um endereço pode ser atendido, qual distribuidora deve receber o pedido e qual capacidade existe para uma data e janela.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- 1:N com `05_mst_zone_coverage`
- 1:N com `07_cfg_delivery_capacity`
- 1:N com `02_mst_addresses`
- 1:N com `09_trn_orders`

### 05_mst_zone_coverage

Detalha a cobertura de cada zona por bairro e/ou CEP. É a tabela usada para transformar um endereço informado pelo consumidor em uma zona válida de entrega.

Na prática, ela responde à pergunta: "esse endereço está dentro da área atendida?".

Relacionamentos principais:
- N:1 com `04_mst_zones`

### 06_mst_products

Mantém o catálogo de produtos vendidos no sistema. Guarda nome, descrição, imagem, preço e valor de caução associado ao item.

É a fonte de referência para montagem do catálogo e para o snapshot dos itens do pedido.

Relacionamentos principais:
- 1:N com `10_trn_order_items`

## Tabelas de configuração operacional

### 07_cfg_delivery_capacity

Controla a capacidade disponível por zona, data, janela e, quando aplicável, faixa horária específica. É a tabela usada para evitar overbooking.

Quando um pedido é criado, o sistema reserva capacidade nessa tabela. O campo `capacity_reserved` indica quanto já foi consumido dentro da capacidade total.

Relacionamentos principais:
- N:1 com `04_mst_zones`
- N:1 com `24_cfg_time_slots`

### 14_cfg_payment_webhook_events

Registra os webhooks recebidos dos provedores de pagamento. Armazena o identificador do evento no provedor, payload bruto, cabeçalhos, validação de assinatura, processamento e erros.

Serve para garantir rastreabilidade e idempotência no processamento de notificações externas, evitando que o mesmo webhook gere efeitos duplicados.

### 19_cfg_banners

Armazena os banners promocionais exibidos no catálogo do consumidor e gerenciados pela área de operações.

Na prática, essa tabela controla conteúdo visual e comercial, como carrosséis do topo, banners de destaque, textos, CTA, cores, gradientes, imagem e ordem de exibição.

### 20_cfg_idempotency_keys

Guarda chaves de idempotência usadas para deduplicar operações críticas. Cada chave possui estado de processamento, trava temporária e data de conclusão.

Essa tabela é importante principalmente em fluxos assíncronos e reprocessamentos, para impedir que a mesma ação seja executada duas vezes em chamadas repetidas, retries ou reenvios de webhook.

### 22_cfg_distributor_schedule

Define a agenda semanal de cada distribuidora. Cada registro informa um dia da semana, se ele está ativo e qual antecedência mínima em horas é necessária para aceitar pedidos naquele dia.

É usada para calcular datas disponíveis no agendamento. Se uma distribuidora não atende em um dia específico, esse dia não deve aparecer como opção para o consumidor.

Relacionamentos principais:
- N:1 com `03_mst_distributors`

### 23_cfg_distributor_blocked_dates

Lista exceções da agenda da distribuidora, como feriados, manutenção, falta de operação ou bloqueios pontuais.

Mesmo que o dia da semana esteja ativo em `22_cfg_distributor_schedule`, uma data presente aqui deve ser tratada como indisponível.

Relacionamentos principais:
- N:1 com `03_mst_distributors`

### 24_cfg_time_slots

Define faixas horárias menores dentro das janelas de entrega, como intervalos específicos dentro da manhã ou da tarde.

Ela permite que a operação trabalhe com agendamento mais granular. Também se conecta à capacidade e ao pedido para reservar uma faixa exata, não apenas uma janela ampla.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- 1:N com `07_cfg_delivery_capacity`
- 1:N com `09_trn_orders`

## Tabelas transacionais

### 09_trn_orders

É a tabela principal do sistema. Cada registro representa um pedido e concentra o ciclo operacional completo: criação, pagamento, aceite da distribuidora, despacho, entrega, falha, reentrega, cancelamento e avaliação.

Além do status, ela guarda dados logísticos e comerciais importantes, como endereço, distribuidora, zona, janela, faixa horária, totais financeiros, quantidades de garrafões enviados e retornados, dados de avaliação e informações de entrega.

Relacionamentos principais:
- N:1 com `01_mst_consumers`
- N:1 com `02_mst_addresses`
- N:1 com `03_mst_distributors`
- N:1 com `04_mst_zones`
- N:1 com `24_cfg_time_slots`
- 1:N com `10_trn_order_items`
- 1:N com `13_trn_payments`
- 1:N com `15_trn_deposits`
- 1:N com `16_sec_order_otps`
- 1:N com `18_aud_audit_events`
- N:N com `11_trn_subscriptions` via `12_piv_subscription_orders`

### 10_trn_order_items

Guarda os itens de cada pedido. Cada linha representa um produto comprado com nome, preço unitário, quantidade e subtotal copiados do momento da compra.

Esse snapshot protege o histórico do pedido contra mudanças futuras no cadastro do produto.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- N:1 com `06_mst_products`

### 11_trn_subscriptions

Armazena as assinaturas de reposição recorrente do consumidor. Define quantidade, janela, dia preferido e próxima data de entrega.

Serve para automatizar pedidos recorrentes, normalmente criados por rotina agendada, sem o consumidor precisar refazer manualmente a compra todo mês.

Relacionamentos principais:
- N:1 com `01_mst_consumers`
- N:N com `09_trn_orders` via `12_piv_subscription_orders`

### 12_piv_subscription_orders

Tabela de associação entre assinaturas e pedidos gerados a partir delas.

Ela existe para permitir rastreabilidade completa do vínculo entre uma assinatura recorrente e cada pedido efetivamente criado.

Relacionamentos principais:
- N:1 com `11_trn_subscriptions`
- N:1 com `09_trn_orders`

### 13_trn_payments

Guarda as cobranças relacionadas aos pedidos. Registra tipo de pagamento, status, valor, provedor, referência externa, chave de idempotência e data de pagamento.

É a tabela principal do domínio financeiro do pedido. Um pedido pode ter um ou mais registros de pagamento conforme o fluxo adotado pelo sistema.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- 1:N com `21_trn_payment_transactions`

### 15_trn_deposits

Registra a caução de vasilhame vinculada ao pedido e ao consumidor. Guarda valor, status da caução e quando houve devolução.

Essa tabela existe para controlar o dinheiro retido até que o fluxo de retorno do vasilhame seja concluído conforme a regra operacional.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- N:1 com `01_mst_consumers`

### 17_trn_reconciliations

Armazena a conciliação diária da operação da distribuidora. Registra saídas cheias, vazios retornados, diferença apurada, justificativa e quem fechou o dia.

É uma tabela de controle operacional e auditoria de estoque circulante de garrafões.

Relacionamentos principais:
- N:1 com `03_mst_distributors`

### 21_trn_payment_transactions

Guarda o histórico técnico das interações com o provedor de pagamento. Cada registro representa uma ação realizada ou recebida, com status retornado, resposta do provedor e eventual chave de idempotência.

Enquanto `13_trn_payments` representa o estado de negócio da cobrança, esta tabela funciona como trilha detalhada de integração, útil para diagnóstico, suporte e auditoria técnica.

Relacionamentos principais:
- N:1 com `13_trn_payments`

## Tabelas de segurança

### 08_sec_consumer_push_tokens

Armazena os tokens de push web do consumidor. Esses dados permitem enviar notificações para o navegador ou PWA.

É a ponte entre a conta do usuário e o dispositivo habilitado para receber notificações.

Relacionamentos principais:
- N:1 com `01_mst_consumers`

### 16_sec_order_otps

Guarda os OTPs de entrega associados ao pedido. Em vez de salvar o código em texto puro, a tabela armazena o hash, o status, o número de tentativas e a expiração.

Ela suporta a confirmação segura da entrega, reduzindo risco de fraude e permitindo bloqueio após repetidas tentativas inválidas.

Relacionamentos principais:
- N:1 com `09_trn_orders`

## Tabelas de auditoria

### 18_aud_audit_events

É o log estruturado de eventos do sistema. Cada linha registra um evento de negócio com tipo, ator, origem da ação, payload e instante da ocorrência.

Essa tabela é essencial para auditoria, suporte, reconstrução de timeline do pedido e cálculo de indicadores operacionais. Na documentação do projeto, ela é tratada como fonte de verdade para KPIs.

Relacionamentos principais:
- N:1 opcional com `09_trn_orders`

## Leitura rápida por domínio

- Cadastro de usuários: `01_mst_consumers`, `02_mst_addresses`
- Operação de distribuidores: `03_mst_distributors`, `04_mst_zones`, `05_mst_zone_coverage`, `22_cfg_distributor_schedule`, `23_cfg_distributor_blocked_dates`, `24_cfg_time_slots`, `07_cfg_delivery_capacity`
- Catálogo e vitrine: `06_mst_products`, `19_cfg_banners`
- Pedidos: `09_trn_orders`, `10_trn_order_items`, `16_sec_order_otps`, `18_aud_audit_events`
- Assinaturas: `11_trn_subscriptions`, `12_piv_subscription_orders`
- Pagamentos: `13_trn_payments`, `14_cfg_payment_webhook_events`, `20_cfg_idempotency_keys`, `21_trn_payment_transactions`
- Caução e operação física: `15_trn_deposits`, `17_trn_reconciliations`
- Notificações: `08_sec_consumer_push_tokens`

## Observação importante

Parte da documentação antiga do projeto menciona 21 tabelas, mas o schema Prisma atual já inclui tabelas adicionais, como banners, chaves de idempotência, transações de pagamento e faixas horárias. Este documento reflete o estado atual do banco no repositório.