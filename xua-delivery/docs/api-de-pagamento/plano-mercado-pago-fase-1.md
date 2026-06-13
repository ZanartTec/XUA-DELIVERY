# Plano Mercado Pago - Fase 1

## Objetivo

Implementar a primeira integração real de pagamento da plataforma usando Mercado Pago em sandbox, começando por pedido avulso e sem recorrência automática.

A meta desta fase é transformar o fluxo atual de pagamento mock em um fluxo financeiro real, controlado e observável:

1. O consumidor cria um pedido avulso no checkout.
2. O backend inicia uma cobrança real no Mercado Pago.
3. O frontend envia o consumidor para o checkout hospedado ou exibe a ação necessária de pagamento.
4. O Mercado Pago confirma o resultado via webhook.
5. A API valida e registra o webhook rapidamente.
6. O worker processa o evento, atualiza `Payment`, `Order` e auditoria.
7. O frontend acompanha o status até pagamento aprovado, falho ou pendente.

## Escopo Desta Fase

Inclui:

- Mercado Pago como primeiro provider real.
- Ambiente sandbox antes de produção.
- Pedido avulso criado pelo carrinho do consumidor.
- Separação entre criação de pedido e iniciação de pagamento.
- Checkout online simples, preferencialmente checkout hospedado do Mercado Pago.
- Webhook com inbox persistido no banco.
- Processamento assíncrono do webhook pelo worker BullMQ.
- Frontend com estado de pagamento pendente e polling de status.
- Idempotência básica para não criar cobranças duplicadas.
- Retentativas seguras no processamento assíncrono.

Não inclui:

- Renovação automática de assinatura.
- Cartão salvo/tokenização de cartão.
- Checkout de cartão embutido e coleta direta de dados de cartão no app.
- Split de pagamento.
- Antifraude avançado.
- Chargeback operacional completo.
- Múltiplos gateways simultâneos.
- Migração de assinaturas para recorrência real.

## Conceitos

### Pedido avulso

Pedido avulso é o pedido comum criado pelo checkout do carrinho em `POST /api/orders`. Ele nasce da compra pontual do consumidor e não vem da agenda de uma assinatura.

No projeto atual, esse fluxo começa em:

- `apps/web/app/(consumer)/checkout/payment/page.tsx`
- `apps/api/src/modules/orders/controllers/orders.controller.ts`
- `apps/api/src/modules/orders/services/orders.service.ts`

### Assinatura nesta fase

O modelo atual de assinatura é uma compra antecipada de um pacote de entregas. A assinatura é criada com `UserSubscription`, e depois o job diário gera pedidos com valor zero para as entregas programadas.

Isso é diferente de recorrência automática. Nesta fase, a compra inicial da assinatura pode reaproveitar o desenho no futuro, mas a primeira implementação deve focar apenas no pedido avulso.

### Gateway real em sandbox

Gateway real em sandbox significa usar APIs reais do Mercado Pago, credenciais reais de teste e webhooks reais de teste, mas sem movimentar dinheiro de produção.

Isso permite validar:

- criação de cobrança;
- redirecionamento do consumidor;
- retorno do consumidor ao app;
- webhook recebido pela API;
- atualização de status pelo worker;
- comportamento do frontend enquanto o pagamento ainda está pendente.

## Estado Atual Do Projeto

### Backend

O projeto já possui uma base de pagamentos:

- `apps/api/src/modules/payments/gateway/payments.gateway.ts` define a interface `IPaymentGateway`.
- `apps/api/src/modules/payments/adapters/mock-payment-adapter.ts` implementa o mock atual.
- `apps/api/src/modules/payments/services/payments.service.ts` cria pagamentos, confirma e reembolsa no desenho atual.
- `apps/api/src/modules/payments/controllers/payments.controller.ts` expõe um webhook público.
- `prisma/schema.prisma` já contém `Payment`, `PaymentWebhookEvent` e `PaymentTransaction`.

Mas ainda há lacunas importantes:

- `PAYMENT_PROVIDER=mock` ainda é o modo real de execução.
- A factory não implementa Mercado Pago.
- O webhook atual processa o evento de forma síncrona dentro da API.
- `PaymentWebhookEvent` ainda não é usado como inbox.
- `PaymentTransaction` ainda não registra interações reais com provider.
- O worker ainda processa apenas `internal-jobs`, não filas de pagamento.
- O `express.json()` global em `apps/api/src/http/app.ts` pode quebrar validação de assinatura de webhook se não houver tratamento de raw body.
- O frontend envia `payment_method`, mas o backend ainda não usa esse campo.

### Frontend

O frontend já possui uma etapa de pagamento:

- `apps/web/app/(consumer)/checkout/payment/page.tsx` cria o pedido.
- `apps/web/src/components/consumer/payment-method-selector.tsx` lista Pix, cartão e dinheiro.
- `apps/web/app/(consumer)/checkout/confirmation/page.tsx` assume sucesso imediato.

Para gateway real, a confirmação imediata precisa mudar. O frontend deve aceitar estados como:

- pagamento iniciado;
- aguardando confirmação;
- aprovado;
- falhou;
- expirou;
- cancelado.

### Worker

O worker já foi validado em produção para jobs internos:

- `otp-cleanup`;
- `subscription-generation`;
- `subscription-expiry`.

A fase de pagamento deve aproveitar essa base, mas criando processamento específico para pagamentos. Webhook financeiro não deve ser processado diretamente no request HTTP da API.

## Gateway Recomendado

O gateway recomendado para começar é Mercado Pago.

Motivos:

- Bom encaixe para um produto Brasil-first.
- Suporte forte a Pix e cartão.
- Checkout hospedado reduz complexidade e risco de segurança.
- O frontend já menciona Mercado Pago como caminho natural.
- É mais simples para uma primeira implementação do que começar com uma integração financeira mais sofisticada.

Para longo prazo, Pagar.me pode ser avaliado se a operação precisar de mais controle financeiro, split, conciliação avançada ou desenho comercial mais complexo. Stripe é excelente tecnicamente, mas faz menos sentido como primeira escolha para um fluxo local brasileiro centrado em Pix/cartão.

## Decisão Da Fase 1

Começar com checkout hospedado do Mercado Pago para pedido avulso.

Essa decisão evita que a plataforma colete dados sensíveis de cartão. O backend cria uma preferência/cobrança no Mercado Pago, devolve uma URL de checkout para o frontend, e o consumidor conclui o pagamento fora da plataforma.

Depois, o Mercado Pago avisa a API via webhook, e o backend decide se o pedido foi realmente pago.

## Arquitetura Alvo

Fluxo principal:

```text
Frontend
  -> API: cria pedido
  -> API: inicia pagamento
  <- API: retorna checkoutUrl/paymentId
  -> Mercado Pago: consumidor paga

Mercado Pago
  -> API webhook: envia evento
  -> API: valida, persiste inbox, enfileira job, responde 200

Worker
  -> lê fila payment-webhooks
  -> consulta/normaliza evento no Mercado Pago
  -> atualiza Payment/Order/Audit em transação

Frontend
  -> API: consulta status do pedido/pagamento
  <- API: pendente/aprovado/falho
```

Responsabilidades:

- Frontend: experiência de pagamento, redirecionamento e polling.
- API: autenticação, autorização, criação de pedido, criação de pagamento, webhook rápido.
- Banco: fonte de verdade para pedido, pagamento, webhook inbox e auditoria.
- Redis/BullMQ: fila de processamento financeiro assíncrono.
- Worker: processamento idempotente dos eventos financeiros.
- Mercado Pago: autorização/captura real do pagamento.

## Fluxo Detalhado Do Pedido Avulso

### 1. Criação do pedido

O frontend chama `POST /api/orders` como hoje, mas o resultado não deve ser tratado como pedido confirmado.

Resultado esperado:

- cria `Order` em `CREATED`;
- não chama provider real dentro da criação do pedido;
- não envia para distribuidor;
- retorna `order.id`, total e status.

Com `PAYMENT_PROVIDER=mock`, o comportamento atual pode continuar por compatibilidade em desenvolvimento, mas o modo Mercado Pago deve seguir o fluxo novo.

### 2. Iniciação do pagamento

Criar um endpoint autenticado para iniciar pagamento de um pedido existente.

Sugestão de rota:

```http
POST /api/payments/orders/:orderId/checkout
```

Responsabilidades:

- validar usuário autenticado;
- garantir que o pedido pertence ao consumidor;
- garantir que o pedido está em `CREATED` ou `PAYMENT_PENDING`;
- calcular o valor pelo banco, nunca pelo payload do frontend;
- mover o pedido para `PAYMENT_PENDING`;
- criar ou reutilizar `Payment` aberto para o pedido;
- gerar uma `idempotency_key` estável;
- chamar Mercado Pago para criar a preferência/cobrança;
- salvar `provider`, `external_id`, `provider_payment_ref` quando disponível;
- registrar `PaymentTransaction` com request/response relevante;
- devolver ao frontend `checkoutUrl`, `paymentId`, `orderId` e status inicial.

### 3. Redirecionamento ou checkout hospedado

O frontend recebe `checkoutUrl` e redireciona o consumidor para o Mercado Pago.

O retorno visual do Mercado Pago não confirma pagamento. Ele apenas ajuda a UX a voltar para uma página da plataforma.

Rotas úteis no frontend:

- `/checkout/payment/return?orderId=...`
- `/checkout/confirmation?orderId=...`

A tela deve mostrar algo como `Aguardando confirmação do pagamento` enquanto consulta a API.

### 4. Webhook

O Mercado Pago chama:

```http
POST /api/payments/webhook
```

A API deve:

- preservar raw body quando necessário;
- validar assinatura oficial do Mercado Pago;
- extrair `provider_event_ref`;
- persistir `PaymentWebhookEvent` com payload e headers;
- ignorar duplicados com segurança;
- enfileirar `process-webhook`;
- responder 200 rapidamente.

O webhook não deve:

- confirmar pedido diretamente no request;
- chamar muitas APIs externas antes de responder;
- depender do frontend;
- confiar apenas no payload sem normalização/verificação.

### 5. Processamento no worker

O worker processa o evento da fila `payment-webhooks`.

Responsabilidades:

- carregar `PaymentWebhookEvent`;
- garantir idempotência;
- consultar Mercado Pago quando necessário para obter status autoritativo;
- localizar `Payment` por provider reference, external reference ou metadata;
- mapear status externo para status interno;
- registrar `PaymentTransaction`;
- atualizar `Payment.status`;
- se aprovado/capturado, chamar `orderService.confirmOrder(orderId)`;
- preservar o comportamento atual de envio ao distribuidor chamando `orderService.sendToDistributor(orderId)` após confirmação, se essa regra continuar desejada;
- marcar `PaymentWebhookEvent.processed_at`;
- registrar erro em `processing_error` quando falhar.

### 6. Polling no frontend

O frontend deve consultar o backend até o status final.

Opções:

- reutilizar `GET /api/orders/:id` se ele já retornar status de pedido e pagamento suficiente;
- criar `GET /api/payments/:paymentId/status` se for necessário separar melhor.

Estados mínimos para UX:

- aguardando pagamento;
- pagamento aprovado;
- pagamento recusado/falhou;
- pagamento expirado;
- pagamento cancelado;
- ainda processando.

## Status E Mapeamento

O sistema deve separar status de pedido e status de pagamento.

Status de pagamento interno existente:

- `CREATED`;
- `AUTHORIZED`;
- `CAPTURED`;
- `FAILED`;
- `REFUNDED`.

Status de pedido relevante:

- `CREATED`;
- `PAYMENT_PENDING`;
- `CONFIRMED`;
- `SENT_TO_DISTRIBUTOR`;
- `CANCELLED`.

Regra base:

- pagamento pendente mantém pedido em `PAYMENT_PENDING`;
- pagamento aprovado/capturado permite `PAYMENT_PENDING -> CONFIRMED -> SENT_TO_DISTRIBUTOR`;
- pagamento falho marca `Payment` como `FAILED`, mas não precisa cancelar imediatamente o pedido;
- cancelamento do pedido antes do pagamento não precisa gerar refund;
- cancelamento após pagamento capturado deve seguir política de reembolso.

## Idempotência

Pontos obrigatórios:

- Criar cobrança com `idempotency_key` por pedido/tentativa.
- Repetir `POST /api/payments/orders/:orderId/checkout` não deve criar cobranças infinitas.
- Webhook duplicado deve retornar sucesso sem reprocessar efeito financeiro.
- Worker deve conseguir rodar duas vezes o mesmo evento sem confirmar pedido duas vezes.

Estratégia inicial:

- Uma tentativa aberta por pedido enquanto `Payment.status` estiver `CREATED` ou `AUTHORIZED`.
- Criar nova tentativa apenas se a tentativa anterior estiver `FAILED`, expirada ou cancelada.
- `PaymentWebhookEvent` com unique por `provider + provider_event_ref`.
- Lock lógico por `paymentId` ou `orderId` durante processamento do worker, se houver risco de concorrência.

## Segurança

Regras essenciais:

- Credenciais Mercado Pago apenas no backend e no Render, nunca no frontend.
- Webhook público, mas autenticado por assinatura do provider.
- Validar ownership do pedido antes de iniciar pagamento.
- Valor cobrado sempre calculado no backend.
- Nunca confiar em `amount_cents` vindo do frontend.
- Não logar token, payload sensível ou dados de cartão.
- Não coletar cartão diretamente na plataforma nesta fase.
- Configurar URLs de retorno e webhook apenas para domínios controlados.

Env vars esperadas:

```env
PAYMENT_PROVIDER=mercadopago
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
PAYMENT_PUBLIC_BASE_URL=https://xua-delivery-1.onrender.com
PAYMENT_WEB_RETURN_URL=https://seu-front.vercel.app
```

Os nomes exatos podem ser ajustados na implementação, mas devem separar claramente URL pública da API, URL pública do frontend e credenciais do provider.

## BullMQ E Worker

As filas de pagamento já aparecem nos contratos atuais:

- `payment-webhooks`;
- `payments`;
- `payment-reconciliation`.

Nesta fase, a fila prioritária é `payment-webhooks`.

Implementação esperada:

- criar producer para webhook de pagamento;
- criar processor de payment webhook;
- registrar novo Worker ou estender o worker atual para consumir também `payment-webhooks`;
- configurar attempts e backoff;
- logar `jobId`, `webhookEventId`, `correlationId`, `provider` e `provider_event_ref`.

Não é necessário criar microserviço separado. O processo `worker-xua` atual pode evoluir para consumir mais de uma fila, desde que a concorrência seja controlada.

## Reconciliation

Conciliação não precisa bloquear o primeiro corte, mas deve entrar logo depois do fluxo básico.

Objetivo:

- encontrar pagamentos pendentes há muito tempo;
- consultar Mercado Pago;
- corrigir divergências entre provider e banco local;
- recuperar webhooks perdidos;
- gerar logs e alertas operacionais.

Primeiro formato aceitável:

- cron diário ou manual;
- fila `payment-reconciliation`;
- relatório simples de inconsistências.

## Plano De Implementação

### Corte 0 - Preparação

- Criar conta/app Mercado Pago sandbox.
- Obter access token sandbox.
- Definir URL pública de webhook da API.
- Definir URL de retorno do frontend.
- Manter `PAYMENT_PROVIDER=mock` como default local.
- Criar feature flag para habilitar Mercado Pago de forma controlada, se necessário.

Critério de saída:

- credenciais sandbox disponíveis no Render e localmente;
- webhook URL configurável;
- plano de rollback para voltar para mock.

### Corte 1 - Adapter Mercado Pago

- Criar adapter `mercadopago-payment-adapter`.
- Estender `getPaymentGateway()` para aceitar `PAYMENT_PROVIDER=mercadopago`.
- Normalizar resposta do Mercado Pago para tipos internos.
- Implementar criação de checkout hospedado/preference.
- Implementar status mapping externo -> interno.
- Adicionar testes unitários do mapping.

Critério de saída:

- API consegue criar uma preferência/cobrança sandbox;
- nenhum segredo aparece no frontend ou em logs;
- mock continua funcionando.

### Corte 2 - Separar Pedido E Pagamento

- Ajustar criação do pedido para não assumir pagamento confirmado quando provider real estiver ativo.
- Criar endpoint de iniciação de pagamento para pedido avulso.
- Validar ownership do pedido.
- Gerar e persistir `Payment` com provider, valor e idempotência.
- Chamar adapter Mercado Pago.
- Retornar `checkoutUrl` ao frontend.

Critério de saída:

- criar pedido não confirma pedido automaticamente no modo Mercado Pago;
- iniciar pagamento retorna URL sandbox;
- repetir a chamada não cria cobranças duplicadas sem controle.

### Corte 3 - Webhook Inbox

- Ajustar parser para preservar raw body do webhook.
- Validar assinatura oficial Mercado Pago.
- Persistir `PaymentWebhookEvent`.
- Deduplicar eventos pelo provider event ref.
- Enfileirar job `process-webhook`.
- Responder 200 rapidamente.

Critério de saída:

- webhook duplicado é seguro;
- evento fica salvo no banco;
- API não processa regra financeira pesada no request.

### Corte 4 - Worker De Webhook

- Criar producer/processor para `payment-webhooks`.
- Consumir evento no worker.
- Consultar Mercado Pago quando necessário.
- Atualizar `Payment` e `PaymentTransaction`.
- Confirmar pedido quando pagamento for aprovado.
- Enviar pedido ao distribuidor se essa continuar sendo a regra de negócio.
- Marcar webhook como processado.

Critério de saída:

- evento aprovado no sandbox move pedido para confirmado/enviado;
- evento pendente mantém pedido pendente;
- evento falho não confirma pedido;
- logs do worker permitem rastrear o evento.

### Corte 5 - Frontend Pendente E Polling

- Alterar checkout para chamar criação de pedido e iniciação de pagamento.
- Redirecionar para checkout Mercado Pago quando necessário.
- Criar tela de retorno/aguardando pagamento.
- Fazer polling de status.
- Ajustar confirmação para não dizer `Pedido confirmado` antes da captura real.
- Mostrar opção de tentar novamente se pagamento falhar.

Critério de saída:

- consumidor entende quando o pagamento ainda está pendente;
- confirmação só aparece após backend confirmar pagamento;
- pedido falho ou pendente não é apresentado como entregue ao distribuidor.

### Corte 6 - Validação Sandbox Ponta A Ponta

- Criar pedido avulso em ambiente de teste.
- Iniciar pagamento sandbox.
- Concluir pagamento no Mercado Pago.
- Conferir webhook salvo.
- Conferir job processado no worker.
- Conferir `Payment.status`.
- Conferir `Order.status`.
- Conferir tela do consumidor.
- Testar pagamento pendente, aprovado, recusado e webhook duplicado.

Critério de saída:

- fluxo aprovado funciona ponta a ponta;
- fluxo falho não confirma pedido;
- webhook duplicado não duplica efeitos;
- rollback para mock é simples.

## Estratégia De Rollout

1. Manter produção com `PAYMENT_PROVIDER=mock` durante desenvolvimento.
2. Validar Mercado Pago localmente com sandbox.
3. Subir API e worker com código novo, mas provider ainda mock.
4. Habilitar Mercado Pago em ambiente controlado.
5. Fazer pedido avulso de teste em sandbox.
6. Validar logs da API, logs do worker e registros no banco.
7. Só depois habilitar para fluxo real de usuário.

## Testes Necessários

Unitários:

- status mapping Mercado Pago -> `PaymentStatus`;
- criação/reuso idempotente de payment;
- assinatura/validação de webhook;
- dedupe de `PaymentWebhookEvent`;
- processor do worker para approved/pending/rejected;
- transições válidas de pedido.

Integração local:

- iniciar pagamento com provider mock;
- iniciar pagamento com Mercado Pago sandbox usando credenciais de teste;
- receber webhook fake assinado;
- processar job no worker.

Manual sandbox:

- pagamento aprovado;
- pagamento pendente;
- pagamento recusado;
- webhook duplicado;
- retry de iniciação de pagamento;
- usuário atualizando a tela durante pagamento pendente.

## Riscos E Mitigações

| Risco | Mitigação |
| --- | --- |
| Cobrança duplicada | Idempotency key e reuso de Payment aberto |
| Pedido confirmado sem pagamento | Confirmar apenas via webhook/consulta autoritativa |
| Webhook perdido | Inbox + reconciliação posterior |
| Webhook duplicado | Unique provider/event ref e processor idempotente |
| Assinatura de webhook quebrada | Preservar raw body e testar assinatura real |
| Frontend exibir sucesso cedo demais | Estado `aguardando pagamento` e polling |
| Chamada externa dentro de transação | Separar persistência local e chamada ao provider |
| Falha temporária do provider | Retry seguro e status pendente |
| Segredo vazando no browser | Somente backend usa tokens Mercado Pago |

## Decisões A Confirmar Antes Do Código

1. Usar Checkout Pro/hospedado como primeiro fluxo.
2. Quais métodos ficam disponíveis no Mercado Pago sandbox: Pix, cartão, boleto.
3. Se pedido aprovado deve ir automaticamente para distribuidor, mantendo o comportamento atual do mock.
4. Tempo máximo que um pedido pode ficar em `PAYMENT_PENDING` antes de expirar/cancelar.
5. Nome final das env vars no Render.
6. Se o primeiro rollout será acessível apenas por usuários de teste.

## Próxima Etapa Recomendada

Começar pelo Corte 1 e Corte 2 juntos, em um slice pequeno:

- adapter Mercado Pago sandbox;
- endpoint de iniciar pagamento para pedido avulso;
- criação/reuso de `Payment`;
- retorno de `checkoutUrl`;
- sem webhook ainda como fonte de confirmação final.

Depois disso, implementar webhook inbox + worker como segundo slice obrigatório antes de considerar o fluxo pronto.

O primeiro slice prova que a plataforma consegue criar cobrança real. O segundo slice prova que a plataforma consegue confiar no resultado financeiro real.