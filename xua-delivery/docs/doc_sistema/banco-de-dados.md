# Xuá Delivery - Guia das Tabelas do Banco

Documento de referência do banco de dados do Xuá Delivery, gerado a partir do schema atual em `prisma/schema.prisma`.

## Visão geral

- O schema atual possui 36 tabelas mapeadas no Prisma (numeração de `01` a `38`, sem `11` e `12`).
- A convenção de nomes segue o padrão `<ordem>_<tipo>_<nome>`.
- Tipos usados no nome da tabela:
  - `mst`: cadastro mestre
  - `cfg`: configuração operacional
  - `trn`: dado transacional
  - `piv`: tabela de associação
  - `sec`: segurança
  - `aud`: auditoria
  - `log`: histórico append-only (event-sourcing)

## Tabelas de cadastro mestre

### 01_mst_consumers

Guarda os usuários da plataforma. Apesar do nome "consumers", ela também concentra os perfis internos definidos pelo campo `role`, como consumidor, distribuidor, motorista, suporte e operações.

Serve como base de autenticação e identidade do sistema. Também guarda preferências operacionais, como distribuidora vinculada, distribuidora preferida e se a escolha de distribuidora deve ser automática.

Relacionamentos principais:
- 1:N com `02_mst_addresses`
- 1:N com `09_trn_orders`
- 1:N com `08_sec_consumer_push_tokens`
- 1:N com `15_trn_deposits`
- 1:N com `27_trn_user_subscriptions`
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
- N:N com `07_mst_categories`

Observação: o campo `kind` (`ProductKind`: `WATER`, `BOTTLE`, `OTHER`) classifica o produto para o fluxo de caução de vasilhames — águas (`WATER`) podem apontar para o vasilhame correspondente via `bottle_product_id` (produto `BOTTLE` com preço próprio).

### 07_mst_categories

Organiza os produtos do catálogo em categorias, com nome, ordem de exibição e status de ativação. É usada pela vitrine do consumidor para agrupar e filtrar produtos.

Relacionamentos principais:
- N:N com `06_mst_products` (relação implícita do Prisma)

## Tabelas de configuração operacional

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

Ela permite que a operação trabalhe com agendamento mais granular. Também se conecta ao pedido para reservar uma faixa exata dentro da janela de entrega.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- 1:N com `09_trn_orders`
- 1:N com `28_trn_subscription_delivery_dates`

### 34_cfg_distributor_payment_settings

Configuração de pagamento por distribuidora. Define quais métodos a distribuidora aceita (`accepts_pix_online`, `accepts_credit_online`, `accepts_cash_on_delivery`, `accepts_card_on_delivery`) e guarda as credenciais do gateway Mercado Pago da própria distribuidora — `mp_access_token_enc` e `mp_webhook_secret_enc` são armazenados criptografados (AES-256-GCM), além da `mp_public_key`.

Com ela, cada distribuidora recebe os pagamentos online na sua própria conta Mercado Pago, em vez de uma conta única da plataforma. Registro único por distribuidora (`UNIQUE(distributor_id)`).

Relacionamentos principais:
- 1:1 com `03_mst_distributors`

### 35_cfg_consumer_deposit_programs

Habilitação do programa de caução de vasilhames (v2) por consumidor e por distribuidora. O operador da distribuidora habilita clientes de confiança informando o limite de vasilhames (`max_bottles` — `0` significa bloqueado, nunca "ilimitado"), com snapshot do documento do cliente e trilha de quem habilitou/desabilitou e quando.

Chave única: `(distributor_id, consumer_id)`.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- N:1 com `01_mst_consumers`

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
- 0..1:1 com `28_trn_subscription_delivery_dates` quando gerado por assinatura v2

### 10_trn_order_items

Guarda os itens de cada pedido. Cada linha representa um produto comprado com nome, preço unitário, quantidade e subtotal copiados do momento da compra.

Esse snapshot protege o histórico do pedido contra mudanças futuras no cadastro do produto.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- N:1 com `06_mst_products`

### 13_trn_payments

Guarda as cobranças relacionadas aos pedidos. Registra tipo de pagamento, status, valor, provedor, referência externa, chave de idempotência e data de pagamento.

É a tabela principal do domínio financeiro do pedido. Um pedido pode ter um ou mais registros de pagamento conforme o fluxo adotado pelo sistema.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- 1:N com `21_trn_payment_transactions`

### 15_trn_deposits

Registra a caução financeira (v1, legado) vinculada ao pedido e ao consumidor. Guarda valor, status da caução e quando houve devolução.

Essa tabela existia para controlar o dinheiro retido até o retorno do vasilhame. O modelo atual de caução é o **programa de vasilhames (v2)** — `35_cfg_consumer_deposit_programs`, `36_trn_consumer_deposit_balances` e `37_log_consumer_deposit_movements` — que controla vasilhames emprestados por quantidade, não por valor retido.

Relacionamentos principais:
- N:1 com `09_trn_orders`
- N:1 com `01_mst_consumers`

### 36_trn_consumer_deposit_balances

Saldo materializado de vasilhames caucionados por combinação `(distribuidora, consumidor, item de inventário)`. O campo `bottles_on_loan` (nunca negativo) é a soma dos deltas registrados em `37_log_consumer_deposit_movements`, com `last_movement_at` indicando a última movimentação.

Chave única: `(distributor_id, consumer_id, inventory_item_id)`.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- N:1 com `01_mst_consumers`
- N:1 com `29_mst_inventory_items`

### 37_log_consumer_deposit_movements

Histórico append-only (event-sourcing) das movimentações de caução de vasilhames. Cada registro guarda o delta de vasilhames (`bottles_delta`), o tipo de movimento (`DepositMovementType`: `LOAN_OUT`, `RETURN_IN`, `MANUAL_ADJUSTMENT`, `WRITE_OFF`), o ator, a origem (`source_app`) e o pedido relacionado quando aplicável.

É a fonte de verdade da caução v2 — o saldo em `36_trn_consumer_deposit_balances` é derivado destes eventos.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- N:1 com `01_mst_consumers`
- N:1 com `29_mst_inventory_items`
- N:1 opcional com `09_trn_orders`

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

### 38_sec_password_reset_tokens

Tokens de redefinição de senha ("esqueci minha senha"). Armazena apenas o hash HMAC-SHA256 do token (`token_hash`, único) — o valor em claro existe somente no link enviado por e-mail. Cada token tem expiração curta (30 minutos) e uso único, marcado por `used_at`.

Relacionamentos principais:
- N:1 com `01_mst_consumers`

## Tabelas de auditoria

### 18_aud_audit_events

É o log estruturado de eventos do sistema. Cada linha registra um evento de negócio com tipo, ator, origem da ação, payload e instante da ocorrência.

Essa tabela é essencial para auditoria, suporte, reconstrução de timeline do pedido e cálculo de indicadores operacionais. Na documentação do projeto, ela é tratada como fonte de verdade para KPIs.

Relacionamentos principais:
- N:1 opcional com `09_trn_orders`

## Leitura rápida por domínio

- Cadastro de usuários: `01_mst_consumers`, `02_mst_addresses`
- Segurança e acesso: `38_sec_password_reset_tokens`, `16_sec_order_otps`, `08_sec_consumer_push_tokens`
- Operação de distribuidores: `03_mst_distributors`, `04_mst_zones`, `05_mst_zone_coverage`, `22_cfg_distributor_schedule`, `23_cfg_distributor_blocked_dates`, `24_cfg_time_slots`
- Catálogo e vitrine: `06_mst_products`, `07_mst_categories`, `19_cfg_banners`
- Pedidos: `09_trn_orders`, `10_trn_order_items`, `16_sec_order_otps`, `18_aud_audit_events`
- Assinaturas v2 (planos pré-definidos): `25_cfg_subscription_plans`, `26_piv_subscription_plan_distributors`, `27_trn_user_subscriptions`, `28_trn_subscription_delivery_dates`
- Pagamentos: `13_trn_payments`, `14_cfg_payment_webhook_events`, `20_cfg_idempotency_keys`, `21_trn_payment_transactions`, `34_cfg_distributor_payment_settings`
- Caução de vasilhames (v2): `35_cfg_consumer_deposit_programs`, `36_trn_consumer_deposit_balances`, `37_log_consumer_deposit_movements`
- Caução financeira (v1, legado) e conciliação: `15_trn_deposits`, `17_trn_reconciliations`
- Inventário operacional: `29_mst_inventory_items`, `30_trn_distributor_inventory_balances`, `31_trn_inventory_movements`, `32_trn_inventory_reconciliation_sessions`, `33_trn_inventory_reconciliation_items`
- Notificações: `08_sec_consumer_push_tokens`

## Tabelas de assinaturas v2 (planos pré-definidos)

### 25_cfg_subscription_plans

Armazena os planos de assinatura criados pela área de operações. Cada plano define um produto, quantidade total de entregas, percentual de desconto, preço unitário já com desconto e o período de validade.

O consumidor não cria um plano — ele escolhe um plano existente e cria uma assinatura (`27_trn_user_subscriptions`) a partir dele.

Campos principais: `name`, `description`, `product_id`, `quantity`, `discount_percentage`, `unit_price_with_discount_cents`, `valid_from`, `valid_until`, `is_active`.

Relacionamentos principais:
- N:1 com `06_mst_products`
- N:N com `03_mst_distributors` via `26_piv_subscription_plan_distributors`
- 1:N com `27_trn_user_subscriptions`

### 26_piv_subscription_plan_distributors

Tabela pivot que vincula planos de assinatura a distribuidores. Um plano pode ser operado por uma ou mais distribuidoras, e o consumidor só pode escolher distribuidoras listadas aqui ao criar sua assinatura.

Chave composta: `(plan_id, distributor_id)`.

Relacionamentos principais:
- N:1 com `25_cfg_subscription_plans`
- N:1 com `03_mst_distributors`

### 27_trn_user_subscriptions

Representa a assinatura efetivamente contratada pelo consumidor. Guarda a referência ao plano escolhido, à distribuidora, ao endereço, à quantidade total de entregas, ao saldo restante e ao status atual.

O pagamento é vinculado diretamente a este registro (não a um pedido). O campo `remaining_quantity` é decrementado a cada entrega confirmada. Quando chega a 3 ou menos, o job `subscription-expiry-job` envia uma notificação push.

Campos principais: `consumer_id`, `plan_id`, `distributor_id`, `address_id`, `total_quantity`, `remaining_quantity`, `start_date`, `end_date`, `status`, `low_balance_notification_sent_at`.

Status possíveis (`UserSubscriptionStatus`): `PENDING_PAYMENT` → `ACTIVE` → `PAUSED` / `CANCELLED` / `COMPLETED`.

Relacionamentos principais:
- N:1 com `01_mst_consumers`
- N:1 com `25_cfg_subscription_plans`
- N:1 com `03_mst_distributors`
- N:1 com `02_mst_addresses`
- 1:N com `28_trn_subscription_delivery_dates`
- 1:N com `13_trn_payments`

### 28_trn_subscription_delivery_dates

Detalha cada data de entrega agendada dentro de uma assinatura. O consumidor distribui a quantidade total do plano entre múltiplas datas ao criar a assinatura, e cada data pode ter sua própria faixa horária e quantidade.

O worker de geração cria o pedido da data agendada e preenche `order_id` (status `ORDER_CREATED`). Quando o pedido é entregue, o status passa a `DELIVERED`. Se a geração ou a entrega falhar, há retry com recrédito da quantidade — o campo `generation_attempts` conta as tentativas e, após 3 falhas, a data é marcada como `FAILED`.

Campos principais: `user_subscription_id`, `delivery_date`, `time_slot_id`, `quantity_for_this_delivery`, `status`, `order_id`, `generation_attempts`.

Status possíveis (`DeliveryDateStatus`): `PENDING`, `ORDER_CREATED`, `DELIVERED`, `FAILED`, `CANCELLED`.

Relacionamentos principais:
- N:1 com `27_trn_user_subscriptions`
- N:1 com `24_cfg_time_slots`
- 0..1 com `09_trn_orders`

## Tabelas de inventário operacional

Essas tabelas foram adicionadas para controlar o estoque físico de garrafões e insumos de cada distribuidora, com rastreabilidade completa de movimentações e sessões de reconciliação de inventário.

### 29_mst_inventory_items

Catálogo de itens de inventário disponíveis no sistema. Cada item tem um código único, tipo (`SELLABLE_PRODUCT`, `RETURNABLE_FULL`, `RETURNABLE_EMPTY`, `SUPPLY`), unidade de medida e limiar de estoque baixo.

Pode estar vinculado a um produto do catálogo (`06_mst_products`) quando o item de inventário representa um produto vendável.

Relacionamentos principais:
- N:1 opcional com `06_mst_products`
- 1:N com `30_trn_distributor_inventory_balances`
- 1:N com `31_trn_inventory_movements`
- 1:N com `33_trn_inventory_reconciliation_items`

### 30_trn_distributor_inventory_balances

Saldo materializado de estoque por distribuidora e por item. Mantém o `quantity_on_hand` atual, atualizado a cada movimentação. A constraint `UNIQUE(distributor_id, inventory_item_id)` garante um único registro de saldo por combinação.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- N:1 com `29_mst_inventory_items`

### 31_trn_inventory_movements

Log imutável de todas as movimentações de inventário. Cada registro registra o delta (positivo ou negativo), o tipo de movimento (`INITIAL_LOAD`, `ORDER_ACCEPT_OUT`, `EMPTY_RETURN_IN`, `RECONCILIATION_ADJUSTMENT`, etc.), o ator responsável e a referência de origem (pedido, sessão de reconciliação, carga inicial, etc.).

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- N:1 com `29_mst_inventory_items`
- 0..1 com `33_trn_inventory_reconciliation_items` (quando gerado por ajuste de reconciliação)

### 32_trn_inventory_reconciliation_sessions

Sessões de reconciliação de estoque abertas pelo operador da distribuidora. Uma sessão tem status `OPEN` ou `CLOSED`, registra quem abriu e fechou, e pode ter uma justificativa para divergências encontradas.

Relacionamentos principais:
- N:1 com `03_mst_distributors`
- 1:N com `33_trn_inventory_reconciliation_items`

### 33_trn_inventory_reconciliation_items

Detalha cada item dentro de uma sessão de reconciliação. Armazena o saldo no momento da abertura da sessão (`snapshot_quantity`), a contagem física registrada pelo operador (`counted_quantity`), o delta calculado e a referência ao movimento de ajuste gerado ao fechar a sessão.

Relacionamentos principais:
- N:1 com `32_trn_inventory_reconciliation_sessions`
- N:1 com `29_mst_inventory_items`
- 0..1 com `31_trn_inventory_movements` (movimento de ajuste gerado no fechamento)

## Observação importante

O schema atual possui **36 tabelas** e **20 enums**. Em relação às versões anteriores documentadas:

- A tabela `07_cfg_delivery_capacity` (controle de overbooking por slot) foi **removida** na migration `20260601000000_remove_delivery_capacity`. O número `07` foi reutilizado por `07_mst_categories`. O controle de disponibilidade agora é gerenciado via agenda da distribuidora (`22_cfg_distributor_schedule`), datas bloqueadas (`23_cfg_distributor_blocked_dates`) e validação de lead-time no serviço de agendamento.
- **5 tabelas de inventário operacional** foram adicionadas: `29_mst_inventory_items`, `30_trn_distributor_inventory_balances`, `31_trn_inventory_movements`, `32_trn_inventory_reconciliation_sessions`, `33_trn_inventory_reconciliation_items`.
- **Configuração de pagamento por distribuidora** (`34_cfg_distributor_payment_settings`): credenciais Mercado Pago próprias de cada distribuidora, criptografadas com AES-256-GCM (migration de junho/2026).
- **Caução de vasilhames v2** (migration `20260624030000_add_bottle_deposit_program`): `35_cfg_consumer_deposit_programs`, `36_trn_consumer_deposit_balances`, `37_log_consumer_deposit_movements`. Substitui o modelo de caução financeira de `15_trn_deposits` (mantida como legado).
- **Retry de assinaturas** (migration `20260628000000`): status `ORDER_CREATED`/`FAILED` e campo `generation_attempts` em `28_trn_subscription_delivery_dates`.
- **Redefinição de senha** (migration `20260701140000_add_password_reset_tokens`): tabela `38_sec_password_reset_tokens`.

Este documento reflete o estado atual do banco no repositório.

**Última atualização: 06 de julho de 2026.**