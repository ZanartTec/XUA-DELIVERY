# Plano de Features e Módulos - Estoque e Conciliação

Status: planejamento técnico para implementação incremental do módulo de estoque e conciliação do XUA Delivery.
Data: 26/05/2026.
Escopo: estoque por distribuidora, ledger auditável, saldo materializado, conciliação física por sessão, integração com pedidos e visão global read-only para operação.

---

## Visão Macro

O objetivo do projeto é substituir gradualmente a conciliação operacional simples, hoje baseada em campos de pedido e agregações legadas, por um domínio próprio de estoque. O novo módulo deve controlar todos os produtos e itens operacionais relevantes por distribuidora, registrar cada alteração de saldo em um ledger imutável e manter uma tabela de saldo atual otimizada para leitura.

A abordagem recomendada é evolutiva: criar o novo domínio em paralelo ao legado, integrar primeiro os fluxos críticos de aceite/cancelamento/falha de entrega, habilitar leitura e conciliação por distribuidora, liberar visão global para OPS e somente depois decidir o corte definitivo da conciliação antiga.

### Objetivos de Produto

- Dar ao distribuidor uma visão confiável do estoque atual por item.
- Impedir aceite de pedidos quando não houver saldo suficiente.
- Registrar entradas, saídas, retornos e ajustes com rastreabilidade.
- Permitir conciliação física por sessão, item e distribuidora.
- Permitir que OPS visualize todos os estoques e conciliações sem poder ajustar saldo no MVP.
- Preservar compatibilidade com a conciliação legada durante o rollout.

### Objetivos Técnicos

- Usar ledger append-only como fonte histórica dos movimentos.
- Usar saldo materializado para leitura rápida e validação transacional.
- Manter ownership explícito por `distributor_id` em saldos, movimentos e sessões.
- Isolar regra de negócio em `apps/api/src/modules/inventory`.
- Expor rotas por escopo de papel: distribuidora em `/api/distributor/inventory/*` e OPS em `/api/ops/inventory/*`.
- Centralizar contratos HTTP em `packages/shared/src/schemas/inventory.ts`.
- Seguir o padrão existente: routes -> controllers -> services -> repositories.
- Garantir idempotência para eventos reprocessáveis, principalmente movimentos derivados de pedido.

### Escopo do MVP Robusto

Inclui:

- Catálogo de itens de estoque, com vínculo opcional a `Product`.
- Saldo atual por distribuidora e item.
- Ledger de movimentos com actor, origem, referência e metadata.
- Carga inicial manual por distribuidora.
- Saída de estoque no aceite da distribuidora.
- Retorno de estoque em cancelamento pós-aceite e falha de entrega quando aplicável.
- Registro de retornáveis nos fluxos de logística reversa.
- Conciliação por sessão, snapshot, contagem, divergência, justificativa e ajuste final.
- UI para distribuidor consultar estoque e fechar conciliação.
- UI para OPS consultar estoque e conciliações de todas as distribuidoras.
- Testes automatizados dos fluxos críticos.

Fora do MVP, mas previsto pelo desenho:

- Transferência entre distribuidoras.
- Aprovação de ajuste por OPS.
- Importação CSV avançada.
- Forecast de demanda e sugestão automática de reposição.
- Alertas ativos por push/e-mail/WhatsApp.
- Integração com ERP externo.

### Mapa de Módulos

| Camada | Responsabilidade | Local sugerido |
| --- | --- | --- |
| Banco | Enums, tabelas, constraints e índices | `prisma/schema.prisma` e `prisma/migrations/*_add_inventory_module` |
| Shared | Schemas Zod, filtros, payloads e tipos de contrato | `packages/shared/src/schemas/inventory.ts` |
| API Inventory | Regras transacionais, ledger, saldo, conciliação | `apps/api/src/modules/inventory` |
| API Distributor | Rotas autenticadas da distribuidora | `apps/api/src/modules/distributor/routes/distributor.routes.ts` |
| API OPS | Rotas read-only globais | `apps/api/src/modules/ops/routes/ops.routes.ts` |
| Orders | Integração com aceite, cancelamento, falha e reversa | `apps/api/src/modules/orders` |
| Web Distributor | Estoque, extrato e conciliação operacional | `apps/web/app/(distributor)/distributor/inventory` |
| Web OPS | Monitoramento global read-only | `apps/web/app/(ops)/ops/inventory` |
| Navegação | Exposição do item Estoque por role | `apps/web/src/components/shared/role-app-shell.tsx` |
| Testes | Unidade, integração de serviço e smoke manual | `apps/api/src/modules/inventory/**/*.test.ts` e fluxos manuais |

### Princípios de Arquitetura

- O saldo nunca deve ser alterado diretamente fora do serviço de inventory.
- Todo movimento deve ter referência de negócio quando derivar de pedido, conciliação ou carga inicial.
- Movimentos devem ser append-only; correções são novos movimentos, não edição retroativa.
- `DistributorInventoryBalance` é uma projeção materializada, não a fonte histórica.
- Transações Prisma devem envolver criação do movimento e atualização do saldo.
- APIs devem validar payloads com schemas compartilhados antes de chamar services.
- Distribuidor só acessa o próprio `distributor_id`; OPS pode filtrar qualquer distribuidora, mas não altera saldo no MVP.
- A conciliação antiga permanece viva até validação operacional da nova.

### Ordem Recomendada de Entrega

1. Modelagem e migração do banco.
2. Schemas compartilhados.
3. Backend inventory sem integração com pedidos.
4. Rotas distributor e OPS.
5. Integração com pedidos.
6. Conciliação física.
7. Frontend distribuidor.
8. Frontend OPS.
9. Testes, piloto e corte operacional.

---

## Feature 01 - Contrato Funcional e Governança do Rollout

### Objetivo

Formalizar as regras de negócio e a estratégia de entrada em produção antes de alterar fluxos críticos de pedido.

### Descrição Funcional

Consolidar um contrato de comportamento para estoque, conciliação, responsabilidades por papel, convivência com legado e fases de ativação. Esta feature é mais de governança técnica/produto do que de código, mas reduz ambiguidade na implementação.

### Regras de Negócio

- Estoque é diferente de capacidade de entrega; capacidade limita agenda, estoque limita disponibilidade física.
- Estoque pertence sempre a uma distribuidora.
- O compromisso de estoque acontece no aceite da distribuidora.
- Rejeição antes do aceite não movimenta estoque.
- Cancelamento depois do aceite devolve saldo quando o item físico não saiu definitivamente.
- OPS tem acesso global de leitura no MVP.
- Support não ganha acesso ao módulo de estoque no MVP.
- Ajustes de saldo devem ocorrer por carga inicial ou conciliação fechada, não por edição direta.

### Dependências

- Alinhamento entre produto, operação e desenvolvimento.
- Diagnóstico da conciliação legada já realizado.
- Definição dos tipos de item iniciais.

### Critérios de Aceitação

- Documento de regras validado pelo time.
- Matriz de papéis definida: distribuidor opera, OPS observa, support sem acesso.
- Estratégia de dual-run definida.
- Lista de fluxos que movimentam estoque aprovada.
- Critérios de corte do legado acordados.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Ambiguidade sobre quando uma falha de entrega devolve estoque.
- Operação usar conciliação nova e antiga em paralelo sem regra clara.
- Saldo inicial incorreto comprometer confiança no módulo.

### Sugestão de Estrutura Técnica

- Manter este contrato como seção versionada da documentação do módulo.
- Referenciar decisões nos testes de serviço e nos nomes dos cenários.
- Criar checklist operacional de rollout junto ao documento técnico.

---

## Feature 02 - Catálogo de Itens de Estoque

### Objetivo

Criar um catálogo próprio para itens controlados em estoque, sem depender exclusivamente da tabela de produtos vendáveis.

### Descrição Funcional

O catálogo deve representar produtos vendidos, garrafões cheios retornáveis, garrafões vazios retornáveis e insumos operacionais. Um item pode ter vínculo com `Product`, mas também pode existir sem produto comercial correspondente.

### Regras de Negócio

- Todo movimento de estoque referencia um `InventoryItem`.
- `Product` continua sendo catálogo comercial; `InventoryItem` é catálogo operacional.
- Um item de estoque vinculado a produto ativo deve ser elegível para baixa no aceite.
- Itens inativos não podem receber novos movimentos operacionais, exceto ajustes controlados de migração/correção quando permitido.
- `code` deve ser único e estável para uso em importação, relatórios e integrações futuras.

### Dependências

- Definição de tipos do enum `InventoryItemType`.
- Modelo `Product` existente.
- Regras sobre quais produtos entram no MVP.

### Critérios de Aceitação

- Existe tabela `InventoryItem` com `code`, `name`, `type`, `product_id`, `unit_label`, `low_stock_threshold`, `is_active`, `created_at` e `updated_at`.
- `code` é único.
- `product_id` é opcional e indexado.
- Produtos ativos podem ter item de estoque correspondente.
- Itens operacionais sem `Product` podem ser cadastrados.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Duplicar o mesmo produto em mais de um item de estoque sem regra clara.
- Misturar item comercial com retornável físico e gerar baixa errada.
- Criar acoplamento excessivo entre catálogo comercial e operação.

### Sugestão de Estrutura Técnica

- Prisma: model `InventoryItem` mapeado como tabela master, por exemplo `29_mst_inventory_items`.
- API: métodos de bootstrap no `inventory.service.ts` para garantir item por produto quando necessário.
- Shared: schemas para criação, atualização e filtros de item.
- UI futura: tela administrativa pode ser separada do MVP se o bootstrap inicial bastar.

---

## Feature 03 - Ledger de Movimentos e Saldo Materializado

### Objetivo

Garantir rastreabilidade total de todas as alterações de estoque e leitura eficiente do saldo atual.

### Descrição Funcional

Cada alteração de estoque cria um `InventoryMovement` com delta positivo ou negativo. Na mesma transação, o sistema atualiza `DistributorInventoryBalance`. O ledger permite auditoria e reconstrução histórica; o saldo materializado permite consultas rápidas e bloqueio no aceite.

### Regras de Negócio

- Movimento negativo não pode deixar saldo abaixo de zero, exceto se houver regra explícita futura de saldo negativo controlado.
- O método `applyMovement` é o único caminho autorizado para alterar saldo.
- Movimentos derivados de eventos reprocessáveis devem ser idempotentes por referência.
- Todo movimento deve carregar `distributor_id`, `inventory_item_id`, `quantity_delta`, `movement_type`, `actor_type`, `actor_id`, `source_app`, `reference_type`, `reference_id` e `metadata` quando aplicável.
- Alteração manual retroativa de movimento não é permitida.

### Dependências

- Feature 02.
- Prisma Client gerado após migration.
- Enum `ActorType` e `SourceApp` já existentes.

### Critérios de Aceitação

- Existe tabela de saldo com unique por `distributor_id` + `inventory_item_id`.
- Existe tabela de movimentos com índices por distribuidora/data, item/data e referência.
- `applyMovement` grava movimento e saldo na mesma transaction.
- Saída sem saldo suficiente falha com erro de domínio previsível.
- Reprocessar uma referência idempotente não duplica movimento.
- Testes cobrem entrada, saída, saldo insuficiente e idempotência.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Condição de corrida em aceites simultâneos para o mesmo item.
- Atualização direta da tabela de saldo por outro service.
- Índices insuficientes em extratos por período.
- Metadata virar campo sem padrão e dificultar auditoria.

### Sugestão de Estrutura Técnica

- Repository: queries Prisma de saldo, movimento e lock transacional.
- Service: `applyMovement(input, tx?)`, validações de saldo e idempotência.
- Padrão: aceitar `TxClient = Prisma.TransactionClient` para compor com pedidos.
- Banco: constraints e índices para leitura operacional e auditoria.
- Observabilidade: log estruturado para tentativa de saldo negativo e conflito de idempotência.

---

## Feature 04 - Carga Inicial e Bootstrap Operacional

### Objetivo

Permitir registrar o saldo inicial por distribuidora e item sem inferir dados a partir do histórico legado.

### Descrição Funcional

Antes de ativar o bloqueio de estoque no aceite, cada distribuidora precisa receber uma carga inicial. Essa carga gera movimentos `INITIAL_LOAD` e atualiza os saldos. O processo pode começar por UI simples, endpoint interno ou script controlado, mas deve seguir o mesmo caminho transacional do ledger.

### Regras de Negócio

- Saldo inicial é informado manualmente pela operação/distribuidora autorizada.
- Não deve haver backfill automático a partir de pedidos antigos.
- Cada item pode receber carga inicial por distribuidora.
- Carga inicial deve ser auditável e identificável no extrato.
- Se houver necessidade de correção posterior, deve ser novo movimento de ajuste, não edição da carga inicial.

### Dependências

- Features 02 e 03.
- Definição operacional de quem informa o saldo inicial.
- Catálogo mínimo de itens ativo.

### Critérios de Aceitação

- Endpoint de carga inicial cria movimentos `INITIAL_LOAD`.
- Payload valida quantidades inteiras e não negativas.
- Extrato mostra a carga inicial com actor e data.
- Saldo materializado reflete a soma carregada.
- Carga inicial não exige pedido associado.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Saldo inicial incorreto gerar bloqueios indevidos.
- Reaplicar carga inicial como se fosse correção e inflar saldo.
- Falta de trilha de quem informou o número.

### Sugestão de Estrutura Técnica

- Endpoint distribuidor: `POST /api/distributor/inventory/initial-load`.
- Service: chamar `applyMovement` com `movement_type = INITIAL_LOAD`.
- Shared: schema com lista de itens e quantidades.
- Auditoria: metadata com origem da carga, observação e versão do lote.

---

## Feature 05 - Consulta de Saldo e Extrato da Distribuidora

### Objetivo

Dar ao distribuidor visibilidade do próprio estoque atual, alertas simples e histórico recente de movimentos.

### Descrição Funcional

A distribuidora acessa uma tela de estoque com saldo por item, indicador de baixo estoque e extrato filtrável. Todas as consultas são escopadas automaticamente ao `distributor_id` do usuário autenticado.

### Regras de Negócio

- Distribuidor só visualiza estoque da própria distribuidora.
- Saldos devem mostrar item, tipo, unidade, quantidade atual, limiar mínimo e estado de alerta.
- Extrato deve permitir filtro por item, tipo de movimento e período.
- Movimentos derivados de pedidos devem mostrar referência navegável ou identificável.
- Itens inativos podem aparecer no histórico, mas devem ser diferenciados na UI.

### Dependências

- Features 02, 03 e 04.
- Middleware de autenticação e RBAC existente.
- API client frontend.

### Critérios de Aceitação

- `GET /api/distributor/inventory/balances` retorna somente itens da distribuidora autenticada.
- `GET /api/distributor/inventory/movements` retorna extrato paginado e filtrável.
- Baixo estoque é calculado quando `quantity_on_hand <= low_stock_threshold`.
- Response não expõe saldos de outras distribuidoras.
- Frontend apresenta loading, vazio e erro de forma consistente.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Vazamento de dados entre distribuidoras por filtro vindo do cliente.
- Extrato sem paginação ficar lento.
- Alertas simples serem confundidos com previsão de demanda.

### Sugestão de Estrutura Técnica

- Controller da distribuidora ignora `distributor_id` do body/query para escopo e usa o usuário autenticado.
- Repository projeta item + saldo + último movimento.
- UI em `apps/web/app/(distributor)/distributor/inventory/page.tsx`.
- Componentes com layout denso e operacional, usando tabelas/listas para leitura rápida.

---

## Feature 06 - Visão Global Read-Only para OPS

### Objetivo

Permitir que a operação acompanhe estoque e movimentações de todas as distribuidoras sem capacidade de ajuste no MVP.

### Descrição Funcional

OPS acessa uma visão global com filtros por distribuidora, item, tipo de movimento, período e status de alerta. A visualização ajuda suporte operacional, monitoramento e auditoria, mas não permite criar carga inicial, ajuste ou fechamento de conciliação.

### Regras de Negócio

- OPS pode visualizar todas as distribuidoras.
- OPS não pode alterar saldo no MVP.
- Todas as respostas de OPS devem incluir `distributor_id` e nome da distribuidora.
- Support não herda acesso de OPS.
- A UI não deve exibir botões de ajuste para OPS.

### Dependências

- Features 03 e 05.
- Middleware `requireRole()`.
- Definição clara entre role OPS e SUPPORT.

### Critérios de Aceitação

- `GET /api/ops/inventory/balances` aceita filtro por distribuidora e retorna visão global.
- `GET /api/ops/inventory/movements` aceita filtros por período, item e distribuidora.
- Usuário support recebe 403 nas rotas de OPS inventory.
- UI OPS é somente leitura.
- Dados exibidos incluem contexto da distribuidora.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Permissão excessiva permitir ajuste por OPS antes da governança estar pronta.
- Listagens globais sem paginação afetarem performance.
- Confusão visual entre visão operacional e tela da distribuidora.

### Sugestão de Estrutura Técnica

- Rotas em `apps/api/src/modules/ops/routes/ops.routes.ts` delegando para controller do inventory.
- Service com métodos separados para leitura escopada e leitura global.
- UI em `apps/web/app/(ops)/ops/inventory/page.tsx`.
- Queries com paginação obrigatória e índices por distribuidora/data.

---

## Feature 07 - Conciliação Física por Sessão

### Objetivo

Permitir que uma distribuidora compare o saldo sistêmico com a contagem física e gere ajustes auditáveis somente ao fechar a sessão.

### Descrição Funcional

A distribuidora abre uma sessão de conciliação. O sistema cria um snapshot dos saldos atuais por item. O usuário informa contagens físicas, o sistema calcula divergências e exige justificativa quando houver delta. Ao fechar, são gerados movimentos de ajuste para os itens divergentes.

### Regras de Negócio

- Só pode existir uma sessão `OPEN` por distribuidora.
- Snapshot de `system_quantity` é congelado na abertura.
- `counted_quantity` deve ser inteiro e não negativo.
- `delta_quantity = counted_quantity - system_quantity`.
- Divergência diferente de zero exige justificativa.
- Ajuste de saldo só ocorre no fechamento da sessão.
- Sessão fechada não pode ser editada.
- OPS pode visualizar sessões, mas não fechar no MVP.

### Dependências

- Features 03, 05 e 06.
- Tabelas `InventoryReconciliationSession` e `InventoryReconciliationItem`.
- Tipo de movimento `RECONCILIATION_ADJUSTMENT`.

### Critérios de Aceitação

- `POST /api/distributor/inventory/reconciliations` abre sessão com snapshot.
- Abertura falha se já houver sessão aberta para a distribuidora.
- `GET /api/distributor/inventory/reconciliations/:id` retorna sessão e itens.
- Fechamento exige contagem dos itens obrigatórios e justificativa para deltas.
- Fechamento cria movimentos de ajuste apenas para divergências.
- OPS consegue listar e detalhar sessões em modo leitura.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Movimento de pedido ocorrer enquanto sessão está aberta e gerar divergência esperada.
- Fechar sessão com snapshot antigo sem indicar idade da contagem.
- Ajuste duplicado se o endpoint de fechamento for reprocessado.
- Falta de regra para sessões abandonadas.

### Sugestão de Estrutura Técnica

- Prisma: índice por `distributor_id` e `status`; constraint parcial para uma sessão aberta deve ser feita via migration SQL se Prisma não expressar diretamente.
- Service: `openReconciliationSession`, `getReconciliationSession`, `closeReconciliationSession`.
- Fechamento transacional: validar sessão aberta, gravar itens, aplicar movimentos de ajuste e marcar como fechada.
- Metadata do movimento deve guardar `session_id`, `system_quantity`, `counted_quantity` e justificativa.

---

## Feature 08 - Integração com Aceite, Cancelamento e Falha de Pedido

### Objetivo

Conectar o estoque ao ciclo de vida real do pedido, impedindo aceite sem saldo e revertendo saldo quando a regra operacional exigir.

### Descrição Funcional

Quando a distribuidora aceita um pedido, o backend mapeia cada `OrderItem` para `InventoryItem`, verifica saldo e aplica movimentos `ORDER_ACCEPT_OUT`. Cancelamentos após aceite e falhas de entrega podem gerar movimentos de retorno conforme a regra de estado.

### Regras de Negócio

- O estoque é comprometido no aceite da distribuidora.
- Aceite sem saldo suficiente deve falhar com erro de domínio `STOCK_UNAVAILABLE`.
- Todos os itens do pedido devem ser validados antes de confirmar o aceite.
- Rejeição antes do aceite não movimenta estoque.
- Cancelamento depois do aceite gera `ORDER_CANCEL_RETURN` quando o produto retorna ao estoque.
- Falha de entrega gera `DELIVERY_FAILED_RETURN` somente quando houver retorno físico confirmado.
- O status do pedido e os movimentos de estoque devem ser persistidos na mesma transação.

### Dependências

- Features 02 e 03.
- Serviço de pedidos existente.
- Mapeamento confiável entre `OrderItem.product_id` e `InventoryItem.product_id`.

### Critérios de Aceitação

- Aceite com saldo suficiente atualiza pedido e baixa estoque em uma transaction.
- Aceite sem saldo não altera status do pedido nem cria movimento parcial.
- Cancelamento pós-aceite devolve saldo uma única vez.
- Reprocessamento do mesmo evento de pedido não duplica movimento.
- Testes cobrem sucesso, falha por saldo e retorno por cancelamento.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Pedido com múltiplos itens e saldo insuficiente em apenas um deles gerar baixa parcial.
- Fluxos antigos alterarem status sem chamar inventory.
- Race condition em dois aceites simultâneos para último item em estoque.
- Falha de entrega sem retorno físico mascarar perda operacional.

### Sugestão de Estrutura Técnica

- Integrar em `apps/api/src/modules/orders/services/orders.service.ts`.
- Chamar `inventoryService.applyMovement` dentro da transaction do aceite.
- Criar helper de agregação de itens por produto antes da baixa.
- Usar reference `ORDER` + `order.id` e metadata com itens baixados.
- Mapear erro de domínio para HTTP apropriado no controller.

---

## Feature 09 - Logística Reversa e Retornáveis

### Objetivo

Registrar movimentos de retorno de vazios ou outros retornáveis nos fluxos já existentes de troca/coleta.

### Descrição Funcional

Os fluxos de `bottle-exchange` e `empty-not-collected` continuam preenchendo campos legados do pedido, mas também passam a gerar movimentos de inventory quando houver item retornável correspondente. Isso conecta a operação física ao novo ledger sem quebrar telas atuais.

### Regras de Negócio

- Coleta de vazio aumenta saldo do item retornável vazio quando aplicável.
- Não coleta deve registrar evento operacional sem entrada de retornável.
- Condição do garrafão pode ir para metadata do movimento.
- Campos legados do pedido permanecem sendo atualizados enquanto houver dependência de UI/relatórios antigos.
- Movimentos de reversa devem referenciar o pedido e o motorista/actor responsável.

### Dependências

- Features 02, 03 e 08.
- Fluxos existentes em orders controller/service.
- Definição dos itens retornáveis no catálogo.

### Critérios de Aceitação

- `recordBottleExchange` atualiza legado e cria movimento de retornável quando quantidade > 0.
- `recordEmptyNotCollected` preserva legado e não cria entrada indevida de retornável.
- Movimentos têm reference para o pedido.
- Metadata registra condição, driver e origem do registro.
- Testes cobrem coleta e não coleta.

### Prioridade

Média.

### Possíveis Riscos ou Pontos de Atenção

- Duplicidade entre `qty_20l_returned`, `returned_empty_qty` e novo movimento.
- Registrar entrada de retornável quando o motorista ainda não devolveu fisicamente à base.
- Falta de item de catálogo para retornável impedir movimento esperado.

### Sugestão de Estrutura Técnica

- Preservar controller como parser de request e mover regra para service.
- Chamar inventory dentro da mesma transaction que atualiza o pedido, quando possível.
- Usar movement types específicos para retorno, ou metadata clara se o enum inicial for mais enxuto.
- Não remover campos legados nesta fase.

---

## Feature 10 - Auditoria, Segurança e Observabilidade

### Objetivo

Garantir que todo evento relevante de estoque seja rastreável, seguro e diagnosticável.

### Descrição Funcional

O módulo deve registrar actor, source app, referência, metadata e eventos de auditoria. Deve aplicar RBAC estrito, proteger escopo por distribuidora e emitir logs estruturados para situações críticas como saldo insuficiente, conflito de sessão e divergência elevada.

### Regras de Negócio

- Nenhuma rota de escrita pode ser acessada por usuário sem role autorizada.
- Distribuidor não pode informar `distributor_id` arbitrário para acessar outro estoque.
- OPS é read-only no MVP.
- Toda alteração de saldo deve ser rastreável até um actor e uma referência.
- Dados sensíveis não devem ser gravados em metadata.

### Dependências

- Middleware de auth/RBAC existente.
- Enum `ActorType`, `SourceApp` e audit repository.
- Features que geram movimentos.

### Critérios de Aceitação

- Rotas distributor exigem `DISTRIBUTOR_ADMIN`.
- Rotas OPS exigem `OPS`.
- Support recebe 403 em rotas inventory de OPS e distributor.
- Movimentos têm actor/source/reference preenchidos.
- Fechamento de conciliação gera evento auditável.
- Logs não expõem credenciais ou dados indevidos.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Vazamento multi-tenant por filtro de query.
- Metadata com dados pessoais desnecessários.
- Falta de correlação entre movimento e pedido dificultar suporte.
- Excesso de logs em fluxo de alto volume.

### Sugestão de Estrutura Técnica

- Resolver escopo do distribuidor no backend a partir do usuário autenticado.
- Usar audit repository para eventos de fechamento e movimentos relevantes.
- Padronizar payload de metadata por tipo de movimento.
- Adicionar testes de autorização e escopo.

---

## Feature 11 - Frontend da Distribuidora

### Objetivo

Entregar uma experiência operacional simples para a distribuidora consultar estoque, revisar extrato e executar conciliação.

### Descrição Funcional

A distribuidora acessa uma nova área de Estoque com visão de saldos, alertas de baixo estoque, busca por item e extrato recente. A tela de conciliação permite abrir sessão, informar contagens, justificar divergências e fechar.

### Regras de Negócio

- O menu Estoque aparece para `distributor_admin`.
- A distribuidora vê somente seus dados.
- Divergências exigem justificativa antes do fechamento.
- A UI deve deixar claro quando uma sessão está aberta.
- Estados de loading, vazio, erro e sucesso devem ser tratados.

### Dependências

- Features 05 e 07.
- `api-client` existente.
- Componentes visuais já usados no app.

### Critérios de Aceitação

- Página `/distributor/inventory` lista saldos e alertas.
- Página `/distributor/inventory/reconciliation` permite fluxo completo de sessão.
- Navegação inclui item Estoque para distribuidor.
- UI é responsiva e adequada a uso mobile.
- Erros de API são exibidos de forma acionável.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Tela de conciliação ficar longa demais para mobile.
- Usuário fechar sessão sem revisar divergências.
- Confusão com a tela legada de conciliação.

### Sugestão de Estrutura Técnica

- Criar rotas em `apps/web/app/(distributor)/distributor/inventory`.
- Usar componentes compactos e tabelas/listas com boa leitura.
- Manter a tela legada disponível durante dual-run.
- Evitar lógica de permissão no cliente como fonte de segurança; backend continua soberano.

---

## Feature 12 - Frontend da Operação

### Objetivo

Dar à equipe de OPS uma visão global, filtrável e somente leitura do estoque e das conciliações.

### Descrição Funcional

OPS acessa páginas para monitorar saldos por distribuidora, identificar itens críticos, consultar extrato e revisar sessões de conciliação. A interface deve priorizar filtros, densidade informacional e clareza operacional.

### Regras de Negócio

- Menu Estoque aparece para `ops`.
- Support não recebe item de menu Estoque.
- OPS não vê ações de ajuste ou fechamento.
- Filtros devem incluir distribuidora, item, status e período.
- Listagens devem ser paginadas.

### Dependências

- Feature 06.
- Feature 07 para conciliações.
- Navegação por role existente.

### Critérios de Aceitação

- Página `/ops/inventory` lista saldos globais com filtros.
- Página `/ops/inventory/reconciliations` lista sessões globais.
- Detalhe de sessão é read-only.
- Navegação inclui Estoque para OPS e não inclui para Support.
- API nega qualquer tentativa de escrita por OPS no MVP.

### Prioridade

Média.

### Possíveis Riscos ou Pontos de Atenção

- Visão global pesada sem índices e paginação.
- UI incentivar ação operacional que OPS ainda não pode realizar.
- Filtros inconsistentes entre saldos e movimentos.

### Sugestão de Estrutura Técnica

- Criar rotas em `apps/web/app/(ops)/ops/inventory`.
- Componentizar filtros reutilizáveis entre saldos e conciliações.
- Usar projeções da API já enriquecidas com nome da distribuidora.
- Separar claramente páginas de OPS das páginas de distribuidor.

---

## Feature 13 - Contratos Compartilhados e Validações

### Objetivo

Padronizar payloads, filtros e respostas esperadas do módulo para reduzir divergência entre API e frontend.

### Descrição Funcional

Criar schemas Zod para operações de inventory: filtros de saldo, filtros de movimento, carga inicial, abertura de sessão, fechamento de sessão, contagens e payloads de catálogo. Exportar os contratos pelo pacote shared.

### Regras de Negócio

- Toda entrada HTTP do módulo deve ser validada por schema compartilhado ou schema local equivalente.
- Quantidades de estoque são inteiras.
- Quantidades físicas não podem ser negativas.
- Datas de filtro devem ter formato previsível.
- Enums públicos devem permanecer sincronizados com Prisma/shared.

### Dependências

- Features 02, 03 e 07.
- Convenção de exports do pacote shared.
- Script de verificação de enums já introduzido no projeto.

### Critérios de Aceitação

- Existe `packages/shared/src/schemas/inventory.ts`.
- Schemas são exportados em `packages/shared/src/index.ts` ou via subpath export quando aplicável.
- `npm run shared:check` passa.
- API usa schemas para parse/validação.
- Frontend reaproveita tipos derivados quando útil.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Divergência entre enum Prisma e enum shared.
- Validar no frontend e esquecer validação no backend.
- Schemas muito acoplados à UI dificultarem evolução da API.

### Sugestão de Estrutura Técnica

- Seguir padrão existente em `packages/shared/src/schemas/order.ts`.
- Criar constantes de enum em `packages/shared/src/enums` quando os novos enums forem públicos.
- Rodar `npm run shared:check` e `npm run enums:check` após alterações.

---

## Feature 14 - Testes Automatizados e Qualidade

### Objetivo

Cobrir os fluxos críticos para evitar regressões em saldo, escopo e conciliação.

### Descrição Funcional

Adicionar testes de serviço/repository para o módulo inventory e testes de integração dos pontos de pedido que movimentam estoque. Complementar com checklist manual dos fluxos de UI e permissão.

### Regras de Negócio

- Baixa sem saldo deve falhar sem efeito colateral.
- Movimento e saldo devem ser atômicos.
- Ajuste de conciliação só ocorre no fechamento.
- Distribuidora não acessa estoque de outra distribuidora.
- OPS é read-only.

### Dependências

- Features 03, 07, 08 e 10.
- Infra de testes Vitest existente.
- Banco/test client configurado para o padrão do repo.

### Critérios de Aceitação

- Testes cobrem `applyMovement` com entrada, saída, insuficiência e idempotência.
- Testes cobrem aceite com saldo suficiente e sem saldo.
- Testes cobrem cancelamento pós-aceite.
- Testes cobrem abertura e fechamento de conciliação.
- Testes cobrem escopo por distribuidora e leitura OPS.
- `npm run typecheck:api`, `npm run shared:check` e `npm test` passam ou têm falhas preexistentes documentadas.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Testes dependerem de estado global de seed.
- Falta de isolamento transacional em cenários concorrentes.
- Cobrir apenas service e esquecer autorização de rotas.

### Sugestão de Estrutura Técnica

- Usar factories locais para distribuidor, item, saldo e pedido.
- Preferir testes de service para regra transacional e testes de rota para RBAC.
- Nomear cenários pela regra de negócio, não pela implementação interna.
- Adicionar teste específico para evitar saldo negativo sob tentativas concorrentes quando possível.

---

## Feature 15 - Migração, Dual-Run e Corte Operacional

### Objetivo

Colocar o novo módulo em produção com menor risco, preservando o legado até haver confiança nos saldos e nas conciliações.

### Descrição Funcional

A ativação deve ocorrer por etapas: migration, cadastro/carga inicial, leitura interna, piloto com uma distribuidora, bloqueio de aceite por estoque, conciliação nova, expansão gradual e decisão sobre legado.

### Regras de Negócio

- O legado de conciliação permanece ativo até o corte aprovado.
- Saldo inicial é requisito para ativar bloqueio por estoque em uma distribuidora.
- Piloto deve ter monitoramento de divergências e incidentes.
- Corte deve ser reversível no início por configuração ou feature flag, se viável.
- Histórico antigo não deve ser reescrito.

### Dependências

- Features 01 a 14.
- Planejamento operacional com distribuidoras.
- Ambiente de produção com migration aplicada.

### Critérios de Aceitação

- Migration aplicada com sucesso e Prisma Client gerado.
- Carga inicial registrada para distribuidora piloto.
- OPS consegue monitorar saldo piloto.
- Pedidos piloto respeitam bloqueio de estoque.
- Conciliação nova fecha sessão e gera ajustes auditáveis.
- Time decide manter legado, redirecionar ou remover gradualmente após validação.

### Prioridade

Alta.

### Possíveis Riscos ou Pontos de Atenção

- Ativar bloqueio antes de carga inicial confiável.
- Divergência entre relatórios legado e novo sem comunicação clara.
- Rollback difícil se a integração com pedidos não for protegida por configuração.
- Treinamento insuficiente da distribuidora piloto.

### Sugestão de Estrutura Técnica

- Considerar feature flag por distribuidora para ativar baixa no aceite.
- Registrar versão do rollout em metadata dos movimentos iniciais.
- Criar dashboard/checklist manual de validação pós-deploy.
- Manter endpoints legados até conclusão do dual-run.

---

## Feature 16 - Extensões Futuras de Escalabilidade

### Objetivo

Preparar o desenho para crescimento sem aumentar o escopo do MVP.

### Descrição Funcional

Algumas capacidades não precisam ser implementadas agora, mas o modelo deve permitir evolução: transferências entre distribuidoras, aprovação de ajustes por OPS, importação CSV, alertas ativos, forecasting e integração ERP.

### Regras de Negócio

- Transferência entre distribuidoras deve gerar saída na origem e entrada no destino de forma atômica ou compensável.
- Ajuste por OPS deve exigir trilha de aprovação se for liberado no futuro.
- Importação em lote deve ser idempotente por arquivo/lote.
- Alertas automáticos não substituem bloqueio transacional de estoque.

### Dependências

- Módulo base estabilizado.
- Métricas de uso real e necessidades operacionais.
- Decisão de produto sobre priorização pós-MVP.

### Critérios de Aceitação

- Modelo atual suporta novos `movement_type` e `reference_type` sem reescrever ledger.
- Metadata dos movimentos segue padrão suficiente para integrações.
- Índices principais suportam volume inicial esperado.
- Backlog pós-MVP está documentado.

### Prioridade

Baixa.

### Possíveis Riscos ou Pontos de Atenção

- Antecipar complexidade demais no MVP.
- Criar enums estreitos demais e exigir migrações frequentes.
- Integrar ERP antes de estabilizar regras internas.

### Sugestão de Estrutura Técnica

- Manter enum de movement/reference preparado para expansão controlada.
- Evitar lógica hardcoded por produto específico.
- Separar importadores e integrações externas em serviços próprios quando chegarem.
- Usar jobs/filas para rotinas em lote ou integrações assíncronas.

---

## Modelo de Dados Recomendado

### Enums

- `InventoryItemType`: `SELLABLE_PRODUCT`, `RETURNABLE_FULL`, `RETURNABLE_EMPTY`, `SUPPLY`.
- `InventoryMovementType`: `INITIAL_LOAD`, `ORDER_ACCEPT_OUT`, `ORDER_CANCEL_RETURN`, `DELIVERY_FAILED_RETURN`, `EMPTY_RETURN_IN`, `RECONCILIATION_ADJUSTMENT`, `MANUAL_CORRECTION`, `LOSS_WRITE_OFF`, `PURCHASE_IN`.
- `InventoryReferenceType`: `ORDER`, `RECONCILIATION_SESSION`, `INITIAL_LOAD`, `MANUAL_ADJUSTMENT`, `PURCHASE`, `SYSTEM`.
- `InventoryReconciliationStatus`: `OPEN`, `CLOSED`, `CANCELLED`.

### Tabelas

- `InventoryItem`: catálogo operacional dos itens.
- `DistributorInventoryBalance`: saldo atual por distribuidora e item.
- `InventoryMovement`: ledger auditável de deltas.
- `InventoryReconciliationSession`: sessão de conciliação por distribuidora.
- `InventoryReconciliationItem`: contagem e divergência por item dentro da sessão.

### Constraints e Índices

- Unique em `InventoryItem.code`.
- Unique em `DistributorInventoryBalance(distributor_id, inventory_item_id)`.
- Índice em `InventoryMovement(distributor_id, occurred_at)`.
- Índice em `InventoryMovement(inventory_item_id, occurred_at)`.
- Índice em `InventoryMovement(reference_type, reference_id)`.
- Proteção idempotente para movimentos por referência quando aplicável.
- Proteção para apenas uma sessão `OPEN` por distribuidora, preferencialmente via índice parcial SQL na migration.

---

## Endpoints Recomendados

### Distribuidora

- `GET /api/distributor/inventory/balances`
- `GET /api/distributor/inventory/movements`
- `POST /api/distributor/inventory/initial-load`
- `POST /api/distributor/inventory/reconciliations`
- `GET /api/distributor/inventory/reconciliations/:id`
- `POST /api/distributor/inventory/reconciliations/:id/close`

### OPS

- `GET /api/ops/inventory/balances`
- `GET /api/ops/inventory/movements`
- `GET /api/ops/inventory/reconciliations`
- `GET /api/ops/inventory/reconciliations/:id`

---

## Critérios Gerais de Pronto

- Schema Prisma e migration aplicados.
- Prisma Client gerado.
- Schemas shared criados e typecheck do shared passando.
- API respeitando arquitetura routes -> controller -> service -> repository.
- Saldo só alterado pelo service de inventory.
- Aceite de pedido integrado de forma transacional.
- Conciliação por sessão funcionando com ajuste auditável.
- Distribuidor vê somente seu estoque.
- OPS vê todas as distribuidoras em modo leitura.
- Support não acessa inventory.
- UI de distribuidor e OPS adicionadas ao menu correto.
- Testes automatizados dos fluxos críticos passando.
- Plano de dual-run e corte operacional validado.

---

## Checklist de Validação

### Comandos Técnicos

- `npm run shared:check`
- `npm run enums:check`
- `prisma generate`
- `npm run typecheck:api`
- `npm test`

### Fluxos Manuais

- Registrar saldo inicial para uma distribuidora.
- Consultar saldo como distribuidor.
- Consultar saldo global como OPS.
- Confirmar que support não acessa inventory.
- Aceitar pedido com saldo suficiente.
- Bloquear aceite sem saldo suficiente.
- Cancelar pedido pós-aceite e devolver saldo.
- Registrar falha de entrega com retorno físico.
- Registrar coleta de retornável.
- Abrir sessão de conciliação.
- Fechar sessão sem divergência.
- Fechar sessão com divergência justificada.
- Confirmar que o legado continua disponível durante dual-run.

---

## Decisões Registradas

- O módulo controla todos os produtos por distribuidora.
- O estoque é comprometido no aceite da distribuidora.
- OPS tem visão global e read-only no MVP.
- Support não recebe acesso ao módulo.
- O domínio usa ledger append-only e saldo materializado.
- `Product` não será sobrecarregado como única entidade de estoque.
- A nova conciliação é baseada em sessão e item.
- O legado permanece ativo até estabilização do rollout.
- Backfill inicial é manual por distribuidora, não inferido por histórico.
