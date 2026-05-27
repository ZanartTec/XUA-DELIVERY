# Prompts Agrupados - Pós Feature 07

Status: prompts agrupados para executar o backlog posterior à Feature 07 do módulo de estoque e conciliação.
Data: 27/05/2026.
Documento base: docs/estoque-conciliacao/prompts-por-feature.md.

---

## Objetivo

Este arquivo substitui o prompt único muito grande por poucos prompts mais utilizáveis. A ideia é manter contexto suficiente para avançar bem, sem tentar empilhar backend, frontend, testes, rollout e documentação futura em uma única execução longa demais.

Os blocos abaixo foram agrupados por afinidade de trabalho. Cada um pode ser usado de forma independente, na sequência sugerida, depois da Feature 07.

---

## Instrução Base Comum

Use este bloco antes de qualquer um dos prompts agrupados abaixo quando quiser reforçar o contexto do projeto.

```text
Você está trabalhando no monorepo XUA Delivery. Continue a evolução do módulo de estoque e conciliação a partir do ponto em que a Feature 07 foi finalizada ou está funcionalmente estável.

Siga a arquitetura existente: routes -> controllers -> services -> repositories. Use Prisma via getPrisma(), preserve suporte a transações com TxClient quando houver escrita coordenada e mantenha contratos compartilhados no pacote @xua/shared quando a API for consumida pelo frontend.

Regras fixas do módulo:
- estoque usa ledger append-only + saldo materializado;
- saldo nunca deve ser alterado diretamente fora do service de inventory;
- distribuidor só acessa o próprio estoque;
- OPS tem leitura global read-only;
- support não acessa o módulo no MVP;
- preserve compatibilidade com fluxos legados enquanto o dual-run existir.

Antes de editar:
- leia os arquivos relevantes do trecho que será trabalhado;
- confirme o estado atual das features já implementadas;
- preserve alterações existentes que não façam parte desta tarefa;
- faça mudanças pequenas, consistentes com o padrão do projeto;
- ao final, informe arquivos alterados, comandos executados, falhas encontradas e riscos residuais.
```

---

## Prompt 1 - Backend de Pedidos, Retornáveis e Segurança

Use este prompt para cobrir o núcleo backend posterior à Feature 07: integração com pedidos, logística reversa, auditoria, RBAC e observabilidade.

```text
Implemente e valide o bloco backend posterior à Feature 07 do módulo de inventory no XUA Delivery.

1. Integração com aceite, cancelamento e falha de pedido
- Leia orders.service, repositories, controllers e políticas relacionados a pedidos.
- No aceite da distribuidora, agregue OrderItem por produto, resolva InventoryItem por product_id, valide saldo e aplique ORDER_ACCEPT_OUT dentro da mesma transação que altera o status do pedido.
- Se qualquer item não tiver saldo suficiente, retorne erro de domínio STOCK_UNAVAILABLE sem alterar status e sem baixa parcial.
- Rejeição antes do aceite não movimenta estoque.
- Cancelamento depois do aceite deve aplicar ORDER_CANCEL_RETURN apenas quando houver retorno físico ao estoque.
- Falha de entrega deve aplicar DELIVERY_FAILED_RETURN apenas quando a regra operacional indicar retorno físico.
- Use reference ORDER + order.id e trate idempotência para evitar duplicidade em reprocessamento.

2. Logística reversa e retornáveis
- Leia os fluxos de bottle-exchange e empty-not-collected em orders controller/service.
- Preserve os campos legados do pedido, mas gere movimentos de inventory para retornáveis quando houver item correspondente no catálogo e quantidade maior que zero.
- Coleta de vazio deve aumentar saldo do item retornável vazio apenas quando a regra operacional indicar entrada física.
- Empty-not-collected não deve gerar entrada indevida no ledger.
- Inclua actor, driver quando aplicável, reference do pedido e metadata com condição do garrafão, motivo ou observações.

3. Auditoria, segurança e observabilidade
- Garanta RBAC em todas as rotas do módulo: distributor_admin para operações da distribuidora, OPS para leitura global e support sem acesso ao módulo no MVP.
- Padronize actor, source, reference e metadata em todos os movimentos.
- Gere evento de auditoria para fechamento de conciliação e outros movimentos críticos, quando o padrão do projeto permitir.
- Adicione logs estruturados para saldo insuficiente, conflito de sessão aberta, divergência elevada e falha de idempotência.
- Evite gravar dados sensíveis em metadata ou logs.

4. Revisão obrigatória
- Procure baixa parcial em pedido com múltiplos itens, quebra transacional entre status e estoque, falta de idempotência, mapeamento incorreto Product -> InventoryItem e devolução duplicada.
- Procure duplicidade de movimento em retornáveis, conflitos entre campos legados e o ledger, actor incorreto, metadata sensível, middleware ausente, vazamento multi-tenant e escrita indevida para OPS.

5. Validação obrigatória
- Valide cenários: aceite com saldo suficiente, aceite com saldo insuficiente, pedido com múltiplos itens com um item insuficiente, rejeição antes do aceite, cancelamento pós-aceite, falha de entrega com retorno físico, troca com retorno de vazio, troca com quantidade zero, não coleta por motivo operacional e repetição da mesma chamada.
- Valide com usuários consumer, distributor_admin, driver, support e ops, confirmando 403 nos papéis indevidos, escopo correto por distribuidora e read-only para OPS.

Critérios de saída:
- informe o que foi implementado, o que permaneceu pendente e quais riscos residuais continuam abertos;
- liste arquivos alterados;
- registre comandos executados e resultado das validações;
- separe falhas preexistentes das falhas novas.
```

---

## Prompt 2 - Frontend e Contratos Compartilhados

Use este prompt para cobrir a experiência da distribuidora, a visão read-only de OPS e os contratos shared necessários para sustentar essas telas.

```text
Implemente e valide o bloco de frontend e contratos compartilhados do módulo de inventory no XUA Delivery.

1. Frontend da distribuidora
- Implemente /distributor/inventory com saldos, alerta de baixo estoque, busca/filtro por item e extrato recente.
- Implemente /distributor/inventory/reconciliation para abrir sessão, informar contagens, justificar divergências e fechar conciliação.
- Use o api-client existente e preserve os padrões visuais do app.
- Atualize a navegação em role-app-shell.tsx para exibir Estoque para distributor_admin.
- Preserve a tela legada de reconciliação durante o dual-run.
- Trate loading, vazio, erro, sucesso e mobile.

2. Frontend da operação
- Implemente o frontend read-only de inventory para OPS.
- Crie /ops/inventory para saldos globais com filtros por distribuidora, item, status de alerta e período.
- Crie /ops/inventory/reconciliations para listar sessões e permitir drill-down read-only.
- Use apenas endpoints /api/ops/inventory/*.
- Atualize a navegação para exibir Estoque para ops, mas não para support.
- Não inclua botões de ajuste, carga inicial ou fechamento na UI de OPS.

3. Contratos compartilhados e validações
- Implemente ou complete os contratos compartilhados do módulo em packages/shared/src/schemas/inventory.ts.
- Garanta schemas Zod para filtros de saldo, filtros de movimento, criação e edição de item, carga inicial, abertura de sessão, fechamento de sessão e contagens.
- Exporte schemas e tipos conforme o padrão do pacote shared.
- Se novos enums forem públicos, adicione constantes em packages/shared/src/enums e mantenha paridade com Prisma.
- Atualize controllers para usar esses schemas na validação de query e body.

4. Revisão obrigatória
- Verifique uso indevido de dados globais na área da distribuidora, ausência de tratamento de loading/erro/vazio, fechamento sem justificativa, confusão visual entre telas de OPS e distribuidora, falta de paginação e suporte vendo menu indevido.
- Verifique divergência entre regra de negócio e schemas, quantidades não inteiras, datas e filtros imprevisíveis, enums fora de sincronia e acoplamento excessivo à UI.

5. Validação obrigatória
- Valide manualmente a UI da distribuidora: abrir estoque, filtrar item, ver baixo estoque, abrir sessão, preencher contagens, tentar fechar divergência sem justificativa, fechar com justificativa e conferir atualização de saldo e extrato.
- Valide a UI de OPS com múltiplas distribuidoras, filtros por distribuidora, item, alerta e período, abertura de detalhe de sessão, ausência de ações de escrita e visibilidade correta da navegação.
- Valide payloads inválidos para filtros, fechamento de conciliação, criação de item e carga inicial.
- Execute as validações aplicáveis como shared:check, enums:check e typecheck dos módulos afetados.

Critérios de saída:
- informe telas entregues, contratos compartilhados ajustados e pendências restantes;
- liste arquivos alterados;
- registre comandos executados, testes manuais realizados e riscos residuais.
```

---

## Prompt 3 - Testes, Qualidade e Fechamento Técnico

Use este prompt quando o backend e o frontend principais já estiverem implementados e você quiser endurecer a qualidade antes do rollout.

```text
Fortaleça os testes automatizados e a qualidade geral do módulo de inventory no XUA Delivery.

1. Testes automatizados
- Adicione ou complete testes para applyMovement cobrindo entrada, saída, saldo insuficiente, idempotência e transação.
- Cubra aceite de pedido com saldo suficiente, aceite sem saldo, cancelamento pós-aceite e reprocessamento.
- Cubra conciliação: abertura, bloqueio de segunda sessão aberta, fechamento sem divergência, fechamento com divergência justificada e rejeição sem justificativa.
- Cubra autorização e escopo por distribuidora e OPS.
- Use o padrão de Vitest existente no projeto, com factories locais quando necessário, sem depender de seed global frágil.

2. Revisão obrigatória
- Verifique se os testes validam regra de negócio real, não apenas mocks superficiais.
- Procure lacunas de cobertura em idempotência, concorrência, escopo multi-tenant, transações e autorização.
- Identifique falhas preexistentes que possam mascarar regressões novas.

3. Validação obrigatória
- Execute shared:check, enums:check, prisma generate, typecheck da API e a suíte de testes disponível.
- Separe falhas novas de falhas já existentes.
- Liste cenários críticos que ainda dependem de validação manual.

Critérios de saída:
- informe cobertura adicionada ou reforçada;
- liste arquivos alterados;
- registre comandos executados, resultado de cada validação e gaps restantes.
```

---

## Prompt 4 - Rollout, Dual-Run e Evolução Futura

Use este prompt para fechar a camada operacional e documental depois que a base técnica estiver pronta.

```text
Documente e revise o fechamento operacional do módulo de inventory no XUA Delivery.

1. Migração, dual-run e corte operacional
- Crie o plano operacional de migração, dual-run e corte do módulo de estoque.
- Documente fases: aplicar migration, gerar Prisma Client, cadastrar catálogo, registrar saldo inicial por distribuidora, liberar leitura para OPS, ativar piloto em uma distribuidora, habilitar bloqueio de aceite por estoque, ativar conciliação nova, expandir gradualmente e decidir destino da conciliação legada.
- Inclua checklist de rollback, responsabilidades por papel, critérios de sucesso do piloto, métricas de divergência e comunicação para operação.
- Se fizer sentido, proponha feature flag por distribuidora para ativar a baixa no aceite.

2. Extensões futuras de escalabilidade
- Documente extensões futuras sem aumentar o escopo do MVP.
- Inclua propostas para transferência entre distribuidoras, aprovação de ajuste por OPS, importação CSV em lote, alertas ativos de baixo estoque, forecasting de demanda e integração com ERP.
- Para cada extensão, descreva objetivo, gatilho de negócio, dependências técnicas, riscos, mudanças prováveis no modelo e como o desenho atual deve se preparar sem implementar agora.

3. Revisão obrigatória
- Revise riscos operacionais como bloqueio antes da carga inicial, ausência de rollback, corte prematuro do legado, falta de treinamento e pouca observabilidade no piloto.
- Verifique se as extensões futuras estão claramente fora do MVP, se respeitam ledger append-only e se devem virar épicos separados ou ADRs.

4. Validação obrigatória
- Transforme o plano de rollout em checklist executável para deploy e pós-deploy, com responsável sugerido, evidência esperada e condição de aprovação.
- Entregue também uma lista curta de ajustes preventivos aceitáveis no MVP e outra lista do que deve permanecer explicitamente fora do MVP.

Critérios de saída:
- informe o que foi documentado e quais decisões ainda dependem de produto, operação ou engenharia;
- liste arquivos alterados;
- destaque riscos residuais do rollout e do dual-run.
```

---

## Como Escolher

Use este arquivo quando quiser menos fragmentação do que o modelo por feature, mas sem cair no custo de um único prompt gigante.

- Prompt 1: backend crítico e integrações operacionais.
- Prompt 2: frontend e contratos compartilhados.
- Prompt 3: endurecimento de qualidade e testes.
- Prompt 4: rollout, dual-run e backlog futuro.

Se o objetivo for trabalhar em etapas ainda menores, continue usando docs/estoque-conciliacao/prompts-por-feature.md.