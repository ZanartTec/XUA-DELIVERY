# Prompts por Feature - Estoque e Conciliação

Status: documento de prompts para orientar implementação, revisão e validação das features do módulo de estoque e conciliação.
Data: 26/05/2026.
Documento base: `docs/estoque-conciliacao/plano-features-modulos.md`.

---

## Como Usar

Use estes prompts em etapas pequenas. Cada prompt foi escrito para ser usado com um agente de desenvolvimento ou revisão no contexto do repositório XUA Delivery.

Antes de iniciar uma feature, leia o documento base e confirme o estado atual dos arquivos. O projeto pode ter mudanças paralelas, então preserve alterações existentes que não fazem parte da tarefa.

### Prompt Base Recomendado

Use este bloco antes de qualquer prompt específico quando quiser reforçar o contexto do projeto.

```text
Você está trabalhando no monorepo XUA Delivery. Siga a arquitetura existente: routes -> controllers -> services -> repositories. Use Prisma via getPrisma(), preserve suporte a transações com TxClient quando houver escrita coordenada e mantenha contratos compartilhados no pacote @xua/shared quando a API for consumida pelo frontend.

O módulo de estoque deve usar ledger append-only + saldo materializado. O saldo nunca deve ser alterado diretamente fora do service de inventory. Distribuidor só acessa o próprio estoque; OPS tem leitura global; support não acessa o módulo no MVP.

Antes de editar, leia os arquivos relevantes. Faça mudanças pequenas, consistentes com o padrão do projeto, sem reverter alterações de terceiros. Ao final, indique comandos de validação executados e riscos residuais.
```

---

## Feature 01 - Contrato Funcional e Governança do Rollout

### Prompt de Implementação

```text
Crie ou atualize a documentação funcional do módulo de estoque e conciliação do XUA Delivery, formalizando as regras de negócio antes da implementação técnica.

Inclua: diferença entre estoque e capacidade de entrega; ownership por distribuidora; momento de compromisso do estoque no aceite; comportamento em rejeição, cancelamento pós-aceite, falha de entrega e logística reversa; matriz de papéis para distributor_admin, ops e support; estratégia de dual-run com a conciliação legada; critérios para ativar piloto e cortar o legado.

Mantenha o documento em Markdown, com linguagem clara para produto, operação e engenharia. Não altere código de aplicação nesta etapa.
```

### Prompt de Revisão

```text
Revise a documentação funcional do módulo de estoque e conciliação. Procure ambiguidades que possam gerar implementação divergente, especialmente em falha de entrega, cancelamento pós-aceite, carga inicial, ajuste de conciliação e permissões de OPS/support.

Liste achados por severidade, informe quais regras precisam de decisão de produto/operação e sugira ajustes objetivos no texto. Não implemente código.
```

### Prompt de Validação

```text
Transforme o contrato funcional do módulo de estoque em uma checklist de aceite para o time. A checklist deve cobrir regras de negócio, permissões, dual-run, critérios de piloto, critérios de rollback e definição de pronto para cortar a conciliação legada.

Use itens verificáveis, sem texto genérico, e destaque decisões que ainda estejam pendentes.
```

---

## Feature 02 - Catálogo de Itens de Estoque

### Prompt de Implementação

```text
Implemente a base do catálogo de itens de estoque no XUA Delivery.

Leia `prisma/schema.prisma`, os modelos `Product` e `Distributor`, o pacote shared e os padrões atuais de migrations. Adicione o enum `InventoryItemType` e o model `InventoryItem` com `code`, `name`, `type`, `product_id` opcional, `unit_label`, `low_stock_threshold`, `is_active`, `created_at` e `updated_at`. Preserve `Product` como catálogo comercial e use `InventoryItem` como catálogo operacional.

Crie a migration correspondente, gere os tipos Prisma quando necessário e adicione schemas Zod básicos em `packages/shared/src/schemas/inventory.ts` para criação, atualização e filtro de item. Exporte os schemas conforme o padrão do pacote shared.

Não implemente saldo, movimento ou UI nesta feature além do necessário para compilar o catálogo.
```

### Prompt de Revisão

```text
Revise a implementação do catálogo `InventoryItem`. Verifique se o model não acopla estoque diretamente ao catálogo comercial, se `product_id` é opcional, se `code` é único, se os nomes de tabelas seguem a convenção do schema e se os schemas shared validam corretamente tipos e quantidades.

Aponte riscos de duplicidade entre Product e InventoryItem, falta de índice, enum ausente no shared ou quebra de geração do Prisma.
```

### Prompt de Validação

```text
Valide a feature de catálogo de itens de estoque. Execute ou indique os comandos necessários: `prisma generate`, `npm run shared:check`, `npm run enums:check` quando aplicável e `npm run typecheck:api`.

Confirme que é possível representar um produto vendável vinculado a Product e também um item operacional sem Product. Liste qualquer falha ou pendência encontrada.
```

---

## Feature 03 - Ledger de Movimentos e Saldo Materializado

### Prompt de Implementação

```text
Implemente o núcleo de ledger e saldo materializado do módulo de estoque.

Leia o schema atual, o padrão de repository/service dos módulos existentes e a feature de catálogo. Adicione os models `DistributorInventoryBalance` e `InventoryMovement`, além dos enums `InventoryMovementType` e `InventoryReferenceType`. O saldo deve ter unique por `distributor_id` + `inventory_item_id`. Movimentos devem ter índices por distribuidora/data, item/data e referência.

Crie `apps/api/src/modules/inventory/repository/inventory.repository.ts` e `apps/api/src/modules/inventory/services/inventory.service.ts`. Implemente `applyMovement` como único caminho de mutação de saldo: validar item/distribuidora, impedir saldo negativo, criar movimento e atualizar saldo na mesma transação. Inclua suporte a `TxClient`, actor, source, reference e metadata.

Mantenha a implementação sem integrar pedidos ou conciliação ainda, exceto pelos tipos necessários.
```

### Prompt de Revisão

```text
Revise o ledger e o saldo materializado. Priorize bugs de concorrência, saldo negativo, idempotência, transação incompleta, atualização direta de saldo fora de `applyMovement`, índices ausentes e uso incorreto de Prisma transaction.

Verifique se `InventoryMovement` é append-only, se `DistributorInventoryBalance` é tratado como projeção e se erros de domínio são previsíveis para controllers futuros.
```

### Prompt de Validação

```text
Crie ou execute testes para o service de inventory cobrindo: carga positiva, saída com saldo suficiente, saída sem saldo suficiente, item/distribuidora inválidos, metadata preservada, reference registrada e operação transacional sem baixa parcial.

Rode `npm run typecheck:api` e `npm test` quando houver suíte disponível. Documente falhas preexistentes separadamente de falhas desta feature.
```

---

## Feature 04 - Carga Inicial e Bootstrap Operacional

### Prompt de Implementação

```text
Implemente o fluxo de carga inicial de estoque por distribuidora.

Use o service de inventory e o método `applyMovement` para registrar movimentos `INITIAL_LOAD`. Crie schema shared para payload de carga inicial com lista de itens e quantidades inteiras não negativas. Exponha endpoint de distribuidora em `POST /api/distributor/inventory/initial-load`, seguindo o padrão routes -> controller -> service -> repository.

A carga inicial deve ser auditável, não deve inferir saldo a partir de pedidos antigos e não deve permitir acesso a outra distribuidora. Inclua metadata com origem da carga e observação quando houver.
```

### Prompt de Revisão

```text
Revise a carga inicial de estoque. Verifique se ela usa `applyMovement`, se não atualiza saldo diretamente, se não aceita `distributor_id` arbitrário do cliente, se valida quantidades e se registra actor/source/reference de forma rastreável.

Procure risco de reaplicar carga inicial e inflar saldo. Sugira mecanismo de idempotência ou referência de lote se ainda não existir.
```

### Prompt de Validação

```text
Valide a carga inicial com cenários manuais ou automatizados: carga de um item novo, carga de múltiplos itens, quantidade zero, quantidade negativa rejeitada, usuário sem role negado e distribuidor tentando carregar saldo de outra distribuidora.

Confirme que o extrato mostra `INITIAL_LOAD` e que o saldo materializado reflete a soma correta.
```

---

## Feature 05 - Consulta de Saldo e Extrato da Distribuidora

### Prompt de Implementação

```text
Implemente as APIs de leitura de estoque da distribuidora.

Crie ou complete os endpoints `GET /api/distributor/inventory/balances` e `GET /api/distributor/inventory/movements`. A leitura deve ser sempre escopada ao `distributor_id` resolvido do usuário autenticado, nunca ao valor enviado livremente pelo cliente.

Inclua paginação e filtros por item, tipo de movimento e período. A resposta de saldos deve trazer item, tipo, unidade, saldo atual, limiar mínimo e indicador de baixo estoque quando `quantity_on_hand <= low_stock_threshold`.

Use schemas shared para query params e preserve o padrão controller fino + service com regra + repository com Prisma.
```

### Prompt de Revisão

```text
Revise as APIs de saldo e extrato da distribuidora. Procure vazamento multi-tenant, ausência de paginação, filtros não validados, consultas lentas sem índice, cálculo incorreto de baixo estoque e response incompatível com frontend.

Confirme que o controller não confia em `distributor_id` vindo do cliente e que os repositories projetam apenas os campos necessários.
```

### Prompt de Validação

```text
Valide a leitura de estoque da distribuidora com pelo menos duas distribuidoras e dois itens. Confirme que cada distribuidor vê apenas seus próprios saldos e movimentos, que filtros por período/item funcionam e que o indicador de baixo estoque aparece corretamente.

Execute `npm run typecheck:api` e registre cenários que ainda precisam de teste automatizado.
```

---

## Feature 06 - Visão Global Read-Only para OPS

### Prompt de Implementação

```text
Implemente as APIs read-only de inventory para OPS.

Crie endpoints em `/api/ops/inventory/*`: `GET /balances`, `GET /movements`, `GET /reconciliations` quando a conciliação já existir, e detalhe por id quando aplicável. Nesta feature, foque saldos e movimentos se a conciliação ainda não estiver pronta.

OPS pode filtrar por distribuidora, item, tipo de movimento e período. Todas as respostas devem incluir `distributor_id` e nome da distribuidora. Não crie endpoints de escrita para OPS no MVP.

Garanta `requireRole(OPS)` e rejeite support. Use paginação obrigatória para listagens globais.
```

### Prompt de Revisão

```text
Revise a visão global de OPS. Verifique se as rotas exigem role OPS, se support não acessa, se não há operações de escrita, se listagens são paginadas e se todas as projeções incluem o contexto da distribuidora.

Aponte riscos de performance em consultas globais e vazamento de dados sensíveis em metadata.
```

### Prompt de Validação

```text
Valide as rotas de inventory para OPS com usuários de roles OPS, SUPPORT e DISTRIBUTOR_ADMIN. Confirme que OPS enxerga múltiplas distribuidoras, support recebe 403 e distribuidor não acessa endpoints globais.

Teste filtros por distribuidora, item e período. Registre payloads de exemplo para o frontend.
```

---

## Feature 07 - Conciliação Física por Sessão

### Prompt de Implementação

```text
Implemente a conciliação física por sessão no módulo de estoque.

Adicione os models `InventoryReconciliationSession` e `InventoryReconciliationItem` e o enum `InventoryReconciliationStatus`. Uma sessão pertence a uma distribuidora, captura snapshot dos saldos por item na abertura e só gera movimentos `RECONCILIATION_ADJUSTMENT` no fechamento.

Implemente endpoints de distribuidora: abrir sessão, consultar sessão por id e fechar sessão. Implemente endpoints OPS read-only para listar e detalhar sessões. Garanta que só exista uma sessão OPEN por distribuidora, preferencialmente com índice parcial SQL na migration se necessário.

No fechamento, valide contagens inteiras não negativas, calcule delta, exija justificativa para divergências e aplique ajustes via `applyMovement` em uma única transação.
```

### Prompt de Revisão

```text
Revise a conciliação por sessão. Priorize: duplicidade de sessão aberta, snapshot mutável, fechamento não idempotente, ajuste criado antes do fechamento, divergência sem justificativa, sessão fechada editável e falha transacional entre itens e movimentos.

Verifique também se OPS permanece read-only e se os movimentos de ajuste carregam metadata suficiente para auditoria.
```

### Prompt de Validação

```text
Valide a conciliação física com cenários: abertura sem sessão anterior, bloqueio de segunda sessão aberta, fechamento sem divergência, fechamento com divergência justificada, divergência sem justificativa rejeitada, sessão fechada não editável e OPS consultando em modo leitura.

Confirme que os ajustes aparecem no extrato e atualizam saldo apenas após fechamento.
```

---

## Feature 08 - Integração com Aceite, Cancelamento e Falha de Pedido

### Prompt de Implementação

```text
Integre o inventory ao ciclo de vida do pedido.

Leia `apps/api/src/modules/orders/services/orders.service.ts`, repository de orders e políticas/controllers relacionados. No aceite da distribuidora, agregue os `OrderItem` por produto, resolva `InventoryItem` vinculado a cada `product_id`, valide saldo e aplique `ORDER_ACCEPT_OUT` dentro da mesma transação que altera o status do pedido.

Se qualquer item não tiver saldo suficiente, falhe com erro de domínio `STOCK_UNAVAILABLE` sem alterar status e sem criar baixa parcial. Rejeição antes do aceite não movimenta estoque. Cancelamento depois do aceite deve aplicar `ORDER_CANCEL_RETURN` quando o item físico retorna ao estoque. Falha de entrega deve aplicar `DELIVERY_FAILED_RETURN` apenas quando a regra operacional indicar retorno físico.

Use reference `ORDER` + `order.id` e idempotência para evitar movimentos duplicados em reprocessamento.
```

### Prompt de Revisão

```text
Revise a integração de pedidos com inventory. Procure baixa parcial em pedido com múltiplos itens, transação quebrada entre status e estoque, falta de idempotência por pedido, mapeamento incorreto Product -> InventoryItem e cancelamento devolvendo saldo mais de uma vez.

Verifique se erros de estoque são mapeados para resposta HTTP adequada e se o fluxo legado de pedidos continua preservado.
```

### Prompt de Validação

```text
Valide a integração com pedidos usando cenários: aceite com saldo suficiente, aceite com saldo insuficiente, pedido com múltiplos itens e um item insuficiente, rejeição antes do aceite, cancelamento pós-aceite e falha de entrega com retorno físico.

Confirme que o status do pedido e os movimentos de estoque são atômicos e que não há baixa duplicada em chamada repetida.
```

---

## Feature 09 - Logística Reversa e Retornáveis

### Prompt de Implementação

```text
Integre os fluxos de logística reversa ao ledger de inventory.

Leia os fluxos de `bottle-exchange` e `empty-not-collected` em orders controller/service. Preserve os campos legados do pedido, mas crie movimentos de inventory para retornáveis quando houver item correspondente no catálogo e quantidade maior que zero.

Coleta de vazio deve aumentar saldo do item retornável vazio quando a regra operacional indicar entrada física. Não coleta deve registrar o evento legado, mas não criar entrada de retornável. Inclua actor, driver quando aplicável, reference do pedido e metadata com condição do garrafão, motivo ou observações.
```

### Prompt de Revisão

```text
Revise a integração de logística reversa. Verifique se os campos legados continuam funcionando, se não há entrada indevida em `empty-not-collected`, se os movimentos referenciam o pedido, se o actor/driver está correto e se a mesma coleta não pode ser registrada duas vezes gerando saldo duplicado.

Aponte qualquer conflito entre `qty_20l_returned`, `returned_empty_qty` e o novo ledger.
```

### Prompt de Validação

```text
Valide logística reversa com cenários: troca com retorno de vazio, troca com quantidade zero, garrafão danificado, não coleta por motivo operacional e repetição da mesma chamada.

Confirme que o pedido legado é atualizado como antes e que o ledger só recebe movimento quando houver retorno físico aplicável.
```

---

## Feature 10 - Auditoria, Segurança e Observabilidade

### Prompt de Implementação

```text
Fortaleça auditoria, segurança e observabilidade do módulo de inventory.

Garanta RBAC em todas as rotas: distributor_admin para operações da distribuidora, OPS para leitura global e support sem acesso ao módulo no MVP. Padronize actor, source, reference e metadata em todos os movimentos. Gere evento de auditoria para fechamento de conciliação e outros movimentos críticos quando o padrão do projeto permitir.

Adicione logs estruturados para saldo insuficiente, conflito de sessão aberta, divergência elevada e falha de idempotência. Evite gravar dados sensíveis em metadata ou logs.
```

### Prompt de Revisão

```text
Revise segurança e auditoria do inventory. Procure vazamento multi-tenant, role errada, endpoint sem middleware, escrita disponível para OPS, support com acesso indevido, metadata sensível, log excessivo e movimento sem actor/reference.

Apresente achados por severidade e cite os arquivos afetados.
```

### Prompt de Validação

```text
Valide segurança do módulo com usuários consumer, distributor_admin, driver, support e ops. Confirme 403 nos papéis indevidos, escopo correto da distribuidora e read-only para OPS.

Valide também que movimentos críticos têm actor/source/reference e que fechamento de conciliação fica rastreável em auditoria ou payload auditável equivalente.
```

---

## Feature 11 - Frontend da Distribuidora

### Prompt de Implementação

```text
Implemente o frontend de inventory para distribuidora.

Crie `/distributor/inventory` com saldos, alerta de baixo estoque, busca/filtro por item e extrato recente. Crie `/distributor/inventory/reconciliation` para abrir sessão, informar contagens, justificar divergências e fechar conciliação. Use o `api-client` existente e padrões visuais do app.

Atualize a navegação em `role-app-shell.tsx` para exibir Estoque para `distributor_admin`. Preserve a tela legada de reconciliação durante o dual-run. A UI deve tratar loading, vazio, erro, sucesso e ser confortável em mobile.
```

### Prompt de Revisão

```text
Revise o frontend da distribuidora. Verifique se não há acesso a dados globais, se os endpoints corretos são usados, se estados de loading/erro/vazio estão tratados, se divergência exige justificativa antes do fechamento e se a navegação não remove a conciliação legada.

Avalie usabilidade mobile e risco de textos/elementos sobrepostos.
```

### Prompt de Validação

```text
Valide manualmente a UI da distribuidora: abrir estoque, filtrar item, ver baixo estoque, abrir sessão, preencher contagens, tentar fechar divergência sem justificativa, fechar com justificativa e conferir atualização de saldo/extrato.

Teste em viewport mobile e desktop. Registre qualquer inconsistência visual ou de fluxo.
```

---

## Feature 12 - Frontend da Operação

### Prompt de Implementação

```text
Implemente o frontend read-only de inventory para OPS.

Crie `/ops/inventory` para saldos globais com filtros por distribuidora, item, status de alerta e período. Crie `/ops/inventory/reconciliations` para listar sessões e permitir drill-down read-only. Use respostas da API com `distributor_id` e nome da distribuidora.

Atualize a navegação para exibir Estoque para `ops`, mas não para `support`. Não inclua botões de ajuste, carga inicial ou fechamento na UI de OPS.
```

### Prompt de Revisão

```text
Revise o frontend de OPS. Confirme que ele usa apenas endpoints `/api/ops/inventory/*`, que não há ações de escrita, que support não recebe navegação, que filtros funcionam de forma consistente e que listagens globais não carregam tudo sem paginação.

Aponte riscos de confusão visual entre tela OPS e tela da distribuidora.
```

### Prompt de Validação

```text
Valide a UI OPS com dados de múltiplas distribuidoras. Teste filtros por distribuidora, item, alerta e período; abra detalhe de sessão; confirme ausência de ações de ajuste; confirme que support não vê o menu Estoque.

Teste responsividade e legibilidade em desktop e mobile.
```

---

## Feature 13 - Contratos Compartilhados e Validações

### Prompt de Implementação

```text
Implemente ou complete os contratos compartilhados do módulo de inventory em `packages/shared`.

Crie `packages/shared/src/schemas/inventory.ts` com schemas Zod para filtros de saldo, filtros de movimento, criação/edição de item, carga inicial, abertura de sessão, fechamento de sessão e contagens. Exporte os schemas e tipos pelo padrão atual do pacote. Se novos enums forem públicos, adicione constantes em `packages/shared/src/enums` e mantenha paridade com Prisma.

Atualize controllers para usar esses schemas na validação de query/body. Rode `npm run shared:check` e `npm run enums:check` quando aplicável.
```

### Prompt de Revisão

```text
Revise contratos shared do inventory. Verifique se schemas refletem a regra de negócio, se quantidades são inteiras e não negativas onde necessário, se datas/filtros são previsíveis, se enums estão sincronizados e se API e frontend não duplicam validação divergente.

Aponte qualquer acoplamento excessivo à UI ou campos de resposta sendo tratados como input.
```

### Prompt de Validação

```text
Valide os contratos shared executando `npm run shared:check` e `npm run enums:check`. Confirme que API importa schemas sem quebrar resolução de módulos e que tipos derivados podem ser usados pelo frontend.

Teste payloads inválidos para carga inicial, filtros, fechamento de conciliação e criação de item.
```

---

## Feature 14 - Testes Automatizados e Qualidade

### Prompt de Implementação

```text
Adicione testes automatizados para o módulo de inventory e integrações críticas.

Cubra `applyMovement`: entrada, saída, saldo insuficiente, idempotência e transação. Cubra aceite de pedido com saldo suficiente, aceite sem saldo, cancelamento pós-aceite e reprocessamento. Cubra conciliação: abertura, bloqueio de segunda sessão aberta, fechamento sem divergência, fechamento com divergência justificada e rejeição sem justificativa. Cubra autorização e escopo por distribuidora/OPS.

Use o padrão de Vitest existente no projeto, crie factories locais se necessário e evite dependência frágil de seed global.
```

### Prompt de Revisão

```text
Revise a suíte de testes do inventory. Verifique se os testes realmente validam regra de negócio e não apenas mocks, se isolam dados entre cenários, se cobrem casos negativos, se há teste de autorização e se falhas preexistentes não estão mascarando regressões novas.

Sugira lacunas de cobertura por risco.
```

### Prompt de Validação

```text
Execute a validação de qualidade do módulo: `npm run shared:check`, `npm run enums:check`, `prisma generate`, `npm run typecheck:api` e `npm test`.

Separe falhas novas de falhas preexistentes documentadas. Informe quais cenários críticos ainda dependem de teste manual.
```

---

## Feature 15 - Migração, Dual-Run e Corte Operacional

### Prompt de Implementação

```text
Crie o plano operacional de migração, dual-run e corte do módulo de estoque.

Documente fases: aplicar migration, gerar Prisma Client, cadastrar catálogo, registrar saldo inicial por distribuidora, liberar leitura para OPS, ativar piloto em uma distribuidora, habilitar bloqueio de aceite por estoque, ativar conciliação nova, expandir gradualmente e decidir destino da conciliação legada.

Inclua checklist de rollback, responsabilidades por papel, critérios de sucesso do piloto, métricas de divergência e comunicação para operação. Se fizer sentido no código, proponha feature flag por distribuidora para ativar a baixa no aceite.
```

### Prompt de Revisão

```text
Revise o plano de rollout do módulo de estoque. Procure riscos de ativar bloqueio antes da carga inicial, ausência de rollback, falta de critério para cortar legado, treinamento insuficiente, divergência entre relatórios e falta de observabilidade no piloto.

Sugira ajustes práticos para reduzir risco operacional.
```

### Prompt de Validação

```text
Transforme o plano de rollout em checklist executável para deploy e pós-deploy. Inclua validações antes da migration, depois da migration, antes de ativar piloto, durante o piloto e antes de expandir para todas as distribuidoras.

Cada item deve ter responsável sugerido, evidência esperada e condição de aprovação.
```

---

## Feature 16 - Extensões Futuras de Escalabilidade

### Prompt de Implementação

```text
Documente as extensões futuras do módulo de estoque sem aumentar o escopo do MVP.

Inclua propostas para transferência entre distribuidoras, aprovação de ajuste por OPS, importação CSV em lote, alertas ativos de baixo estoque, forecasting de demanda e integração com ERP. Para cada extensão, descreva objetivo, gatilho de negócio, dependências técnicas, riscos, mudanças prováveis no modelo e como o desenho atual deve se preparar sem implementar agora.

Não implemente código desta feature, exceto ajustes mínimos de documentação.
```

### Prompt de Revisão

```text
Revise o backlog futuro de escalabilidade do inventory. Verifique se as extensões estão claramente fora do MVP, se não introduzem complexidade prematura, se respeitam o ledger append-only e se indicam dependências reais para crescimento.

Aponte itens que deveriam virar épicos separados ou ADRs.
```

### Prompt de Validação

```text
Valide se o desenho atual do módulo suporta evolução futura sem reescrita: novos movement types, novos reference types, transferências, importações em lote e integrações assíncronas.

Produza uma lista curta de ajustes preventivos aceitáveis no MVP e uma lista de coisas que devem permanecer fora do MVP.
```

---

## Prompt de Encerramento de Feature

Use este prompt ao final de qualquer feature para consolidar o resultado.

```text
Faça uma revisão final da feature implementada. Informe: arquivos alterados, comportamento entregue, critérios de aceitação atendidos, comandos executados, falhas encontradas, riscos residuais e próximos passos recomendados.

Não esconda validações não executadas. Se houver mudanças paralelas no repositório que não fazem parte da feature, mencione que foram preservadas.
```
