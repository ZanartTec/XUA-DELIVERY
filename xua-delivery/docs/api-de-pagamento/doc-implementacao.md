**Diagnóstico Atual (com base no código real)**
Sua base já tem uma fundação boa para pagamentos, mas ainda está em estágio inicial para produção de alto volume.

1. O checkout ainda não chama gateway de pagamento; ele só cria pedido e redireciona para confirmação em xua-delivery/app/(consumer)/checkout/payment/page.tsx#L95/checkout/payment/page.tsx#L95), xua-delivery/app/(consumer)/checkout/payment/page.tsx#L117/checkout/payment/page.tsx#L117) e o próprio texto indica placeholder em xua-delivery/app/(consumer)/checkout/payment/page.tsx#L170/checkout/payment/page.tsx#L170).
2. O gateway atual está mockado e sem adapter Mercado Pago em payment-gateway.ts, payment-gateway.ts, payment-gateway.ts.
3. Existe webhook, mas com alguns riscos de consistência:
- Assinatura usando header genérico em route.ts, diferente do padrão oficial do Mercado Pago.
- Conversão direta de status externo para enum interno em route.ts, enquanto compara approved em route.ts, o que pode gerar inconsistência sem mapeamento explícito.
- Emite sempre PAYMENT_CAPTURED em route.ts, mesmo para outros desfechos.
4. A tabela de webhook já existe em schema.prisma, com unique útil em schema.prisma, mas não está sendo usada no processamento atual.
5. O campo de status de pagamento no pedido está como texto livre em schema.prisma, o que reduz consistência semântica.
6. A modelagem de pagamento é 1:N entre pedido e pagamentos em schema.prisma, o que é bom para tentativas múltiplas, mas faltam campos de rastreabilidade mais fortes.
7. Redis e rate limit existem, mas o rate limit não está plugado nas rotas de pagamento/webhook (helper em rate-limit.ts).
8. A arquitetura está em processo único com Socket e cron no mesmo servidor em server.ts, server.ts, server.ts, ótimo para MVP, mas com risco sob pico de tráfego transacional.

---

**1) Modelagem de Dados Ideal para Pagamentos**
Sugestão: manter o que já existe, mas evoluir para trilha de auditoria financeira completa.

1. Tabelas recomendadas:
- payments (já existe): entidade agregada da cobrança.
- payment_transactions (nova): cada interação com provedor (authorize, capture, refund, chargeback).
- payment_status_history (nova): trilha cronológica imutável por pagamento.
- payment_webhook_events (já existe): inbox de eventos externos, sempre persistindo raw payload e headers.
- idempotency_keys (nova, opcional): controle de chave idempotente por operação de negócio.
2. Relacionamentos:
- order 1:N payments.
- payment 1:N payment_transactions.
- payment 1:N payment_status_history.
- payment_webhook_events pode referenciar payment e order quando identificados.
3. Campos obrigatórios de rastreabilidade:
- provider.
- provider_payment_id.
- provider_event_ref.
- external_reference (order_id no Mercado Pago).
- idempotency_key.
- correlation_id e request_id.
- raw_payload e raw_headers no webhook.
- signature_valid, processed_at, processing_error, retry_count.
- actor, source_app e audit_event correlacionado.
4. Concorrência e volume:
- lock por order_id na criação de pagamento.
- unique para provider + provider_payment_id.
- unique para provider + provider_event_ref (você já tem).
- versionamento otimista por pagamento para evitar overwrite.
5. Índices recomendados:
- payments(order_id, created_at desc).
- payments(status, updated_at).
- payments(provider, provider_payment_ref) unique parcial not null.
- payments(external_id) já unique em schema.prisma.
- webhook_events(processed_at, created_at) para fila de reprocessamento.
- webhook_events(provider, provider_event_ref) já unique.
- audit_events(order_id, occurred_at) para timeline e reconciliação.

---

**2) Integração com Mercado Pago (fluxo recomendado)**
Fluxo robusto para produção:

1. Checkout cria/valida pedido local.
2. Backend gera idempotency_key de negócio.
3. Backend chama Mercado Pago para criar pagamento/preference com external_reference = order_id.
4. Salva payment com status interno inicial.
5. Front recebe init_point ou resultado do brick.
6. Retorno síncrono atualiza UX, mas não confirma financeiramente sozinho.
7. Webhook Mercado Pago é fonte de verdade final para captura/aprovação.
8. Webhook só valida + persiste evento + enfileira job + responde 200 rápido.
9. Worker processa webhook com idempotência e atualiza payment/order/audit em transação.
10. Sistema publica eventos internos (ex.: pagamento confirmado) para próxima etapa do pedido.

Boas práticas:
- mapear explicitamente status externos -> status internos.
- nunca confiar somente no retorno do frontend para confirmação financeira.
- reconciliar periodicamente via API do Mercado Pago para eventos perdidos.

Tratamento de erro:
- duplicidade: dedupe por provider_event_ref e idempotency_key.
- timeout na criação: consultar pelo external_reference antes de recriar cobrança.
- webhook fora de ordem: aplicar state machine de pagamento e ignorar regressão inválida.

---

**3) Redis para Fila e Performance**
Recomendação prática no seu stack atual (ioredis já presente em redis.ts):

1. Filas:
- queue webhook_ingress: recebe evento validado.
- queue payment_reconcile: jobs de conciliação ativa.
- queue payment_retry: retentativas de operações de gateway.
2. Estratégia de retry:
- exponencial com jitter.
- número máximo de tentativas + DLQ.
- reprocessamento manual para DLQ.
3. Controle de concorrência:
- lock distribuído por payment_id ou order_id via Redis SET NX EX.
- limiter por fila para respeitar rate limit do provedor.
4. Cache vs fila:
- cache: leitura frequente não crítica (ex.: catálogo, resumo de métodos).
- fila: qualquer operação com efeito financeiro e dependência externa.
5. Observação importante:
- hoje há rate limiter implementado, mas sem uso nas rotas críticas; conectar isso no webhook e criação de pagamento.

---

**4) Arquitetura e Escalabilidade**
Você pode escalar em duas fases sem ruptura:

1. Fase 1 (recomendada já):
- manter monólito Next.
- extrair workers de pagamento em processo separado (mesmo repo).
- webhook só ingressa evento; worker processa.
- outbox pattern para eventos de domínio após commit.
2. Fase 2 (quando volume crescer):
- microserviço de pagamentos dedicado.
- banco lógico separado ou schema separado.
- contrato assíncrono via fila/event bus.
- reconciliação e antifraude isoladas.

Ponto crítico atual:
- app web + websocket + cron + pagamento competem pelo mesmo processo em server.ts. Sob pico, isso aumenta latência e risco de timeout.

---

**5) Segurança**
Checklist essencial:

1. Segredos:
- access token Mercado Pago e webhook secret apenas em secret manager.
- rotação periódica.
2. Webhook:
- validar assinatura no formato oficial Mercado Pago.
- validar timestamp para anti-replay.
- armazenar hash do payload assinado.
3. Dados sensíveis:
- não persistir PAN/CVV.
- mascarar dados de pagador em logs.
4. Proteções de API:
- rate limit por IP + por order_id em endpoints financeiros.
- validação estrita de payload (schema).
- autorização forte por dono do pedido.
5. Hardening:
- CSP atual ainda permite unsafe-inline e unsafe-eval em next.config.ts; reduzir isso no caminho para produção.

---

**6) Monitoramento e Logs**
Você já usa Pino em logger.ts. Evolução recomendada:

1. Log estruturado obrigatório por evento de pagamento com:
- order_id.
- payment_id.
- provider_payment_id.
- idempotency_key.
- webhook_event_ref.
- correlation_id.
2. Métricas:
- taxa de sucesso por status.
- webhook lag (criação vs processamento).
- tamanho de fila e idade do job mais antigo.
- taxa de retry e DLQ.
3. Alertas:
- divergência order confirmado sem payment capturado.
- aumento de PAYMENT_FAILED.
- webhook backlog acima de limite.
- diferença entre valor capturado e valor esperado do pedido.
4. Conciliação:
- job diário comparando base local e Mercado Pago.
- geração de relatório de inconsistências financeiras.

---

**7) Fluxo Completo Ideal (fim a fim)**
Fluxo recomendado:

1. Cliente confirma checkout.
2. Cria order em CREATED.
3. Move para PAYMENT_PENDING.
4. Gera idempotency_key.
5. Cria payment local em created.
6. Chama Mercado Pago com idempotência + external_reference.
7. Devolve init_point/resultado ao front.
8. Front redireciona para etapa de pagamento.
9. Mercado Pago envia webhook.
10. Endpoint valida assinatura e persiste evento bruto.
11. Endpoint enfileira processamento e responde 200 rapidamente.
12. Worker aplica dedupe e lock por payment.
13. Worker consulta/normaliza status no Mercado Pago.
14. Atualiza payment, order e audit em transação única.
15. Publica evento interno pagamento confirmado.
16. Ordem segue para CONFIRMED e envio ao distribuidor.

Pontos críticos e falhas comuns:
- webhook duplicado.
- webhook fora de ordem.
- retorno front sem confirmação real.
- timeout na criação com pagamento criado no provedor.
- concorrência em reprocessamento paralelo.
- indisponibilidade temporária do provedor.
- divergência de valor por arredondamento ou frete/caução.

---

**Prioridades práticas para seu projeto (ordem sugerida)**
1. Implementar adapter Mercado Pago real e endpoint de criação de pagamento.
2. Corrigir mapeamento de status externo -> enum interno e auditoria por tipo correto.
3. Passar webhook para modelo inbox + fila + worker + dedupe forte.
4. Evoluir schema com trilha de transações/histórico e índices operacionais.
5. Ativar observabilidade financeira com métricas e alertas.
6. Separar processamento assíncrono de pagamento do processo web principal.

