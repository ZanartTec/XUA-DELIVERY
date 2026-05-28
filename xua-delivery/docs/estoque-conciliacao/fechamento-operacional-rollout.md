# Fechamento Operacional - Inventory e Conciliação

Status: plano operacional para deploy, dual-run, piloto, corte e evolução futura.
Data: 27/05/2026.
Escopo: módulo de estoque, ledger, saldo materializado, conciliação por sessão, leitura OPS e integração com pedidos no XUA Delivery.
Documentos relacionados: `docs/estoque-conciliacao/contrato-funcional-rollout.md`, `docs/estoque-conciliacao/checklist-aceite-funcional.md`, `docs/estoque-conciliacao/plano-features-modulos.md`.

---

## 1. Objetivo

Este documento fecha a visão operacional do módulo de inventory para evitar que o rollout técnico quebre a operação. Ele transforma o plano funcional em uma sequência executável de migração, dual-run, piloto, corte gradual e decisão sobre a conciliação legada.

O princípio central do rollout é: o novo ledger pode entrar antes, mas o bloqueio de aceite por estoque só deve ser ativado por distribuidora quando catálogo, saldo inicial, treinamento e observabilidade estiverem validados.

---

## 2. Decisões Base do MVP

- O ledger de inventory é append-only. Correção de erro operacional vira novo movimento, não edição retroativa.
- `DistributorInventoryBalance` é saldo materializado para leitura e validação transacional, não fonte histórica única.
- O aceite do pedido é o primeiro ponto em que estoque vendável pode ser baixado.
- Falta de saldo deve bloquear aceite, mas apenas depois da distribuidora estar pronta para o novo controle.
- A conciliação legada deve permanecer disponível durante o piloto e a expansão.
- OPS tem leitura global no MVP. OPS não ajusta saldo no MVP.
- Support não acessa inventory no MVP; pode atuar apenas em comunicação/triagem fora do módulo.
- Extensões como transferência, aprovação OPS, CSV, alertas ativos, forecasting e ERP ficam fora do MVP e devem virar épicos separados ou ADRs.

---

## 3. Fases de Migração, Dual-Run e Corte

### Fase 0 - Preparação de Rollout

Objetivo: garantir que produto, operação e engenharia concordem com escopo, riscos e plano de pausa antes de mexer na operação real.

Entradas obrigatórias:

- Distribuidora piloto escolhida.
- Responsável operacional do piloto definido.
- Lista de produtos controlados no MVP aprovada.
- Canal de incidentes definido.
- Comunicação para distribuidora e OPS preparada.
- Critérios de sucesso e rollback aprovados.

Fonte de verdade operacional: legado.

Condição de aprovação: todas as decisões de alta prioridade na seção 13 deste documento têm dono e data de decisão.

### Fase 1 - Aplicar Migration e Gerar Prisma Client

Objetivo: deixar a estrutura técnica disponível sem alterar comportamento operacional.

Passos:

- Aplicar migrations de inventory no ambiente alvo.
- Executar `prisma generate` no pacote implantado.
- Subir backend com rotas de inventory protegidas.
- Rodar validações técnicas: `shared:check`, `enums:check`, `typecheck:api` e suíte de testes.

Fonte de verdade operacional: legado.

Risco principal: schema aplicado sem client compatível ou deploy parcial.

Mitigação: deploy atômico e health check de API antes de expor telas.

### Fase 2 - Cadastrar Catálogo de Estoque

Objetivo: criar mapeamento operacional entre produtos vendidos e itens de estoque.

Passos:

- Criar `InventoryItem` para cada `Product` vendável do piloto, com `type = SELLABLE_PRODUCT`, `product_id` preenchido e `is_active = true`.
- Criar ao menos um item `RETURNABLE_EMPTY` ativo para garrafões vazios, se o fluxo de reversa entrar no piloto.
- Validar que cada `Product` ativo tem no máximo um `InventoryItem` ativo do tipo `SELLABLE_PRODUCT`.
- Validar códigos operacionais, unidade e limiar de baixo estoque.

Fonte de verdade operacional: legado.

Risco principal: produto sem item ou item duplicado bloquear aceite depois.

Mitigação: checklist de preflight antes de ativar bloqueio.

### Fase 3 - Registrar Saldo Inicial por Distribuidora

Objetivo: criar o ponto inicial auditável para a distribuidora piloto.

Passos:

- Operação faz contagem física dos itens controlados.
- Distribuidora registra carga inicial pela UI ou API da distribuidora.
- Engenharia/OPS confere movimentos `INITIAL_LOAD` e saldo materializado.
- Operação aprova saldo inicial da distribuidora piloto.

Fonte de verdade operacional: legado, com novo saldo em observação.

Risco principal: saldo inicial incorreto gerar bloqueio indevido.

Mitigação: dupla conferência antes de ativar baixa no aceite; correção por movimento auditável, não edição direta.

### Fase 4 - Liberar Leitura para OPS

Objetivo: permitir que OPS acompanhe saldos e movimentos sem poder alterar estoque.

Passos:

- Ativar navegação OPS de inventory.
- Validar filtros por distribuidora, item, status de alerta e período.
- Confirmar 403 para support e distributor_admin em endpoints globais.
- Confirmar ausência de botões de escrita para OPS.

Fonte de verdade operacional: legado; novo módulo em leitura/auditoria.

Risco principal: OPS interpretar saldo novo como fonte oficial antes do piloto.

Mitigação: comunicação explícita de fase read-only/observação.

### Fase 5 - Piloto em Uma Distribuidora

Objetivo: validar a operação real com uma distribuidora controlada.

Passos:

- Distribuidora piloto usa tela de estoque para consulta.
- Operação compara saldo sistêmico novo com controle físico/legado por um período curto.
- OPS acompanha divergências e incidentes.
- Engenharia monitora erros de inventory e rotas de pedido.

Fonte de verdade operacional: legado, salvo decisão explícita de usar novo saldo para piloto.

Risco principal: pouco treinamento e baixa confiança do distribuidor.

Mitigação: treinamento rápido, plantão operacional e roteiro de incidentes.

### Fase 6 - Habilitar Bloqueio de Aceite por Estoque

Objetivo: impedir aceite de pedido sem saldo apenas quando a distribuidora estiver pronta.

Recomendação: usar feature flag por distribuidora antes de produção ampla.

Flags sugeridas:

| Flag | Escopo | Efeito |
| --- | --- | --- |
| `inventory_read_enabled` | distribuidora | Exibe saldos e extrato para a distribuidora. |
| `inventory_order_accept_blocking_enabled` | distribuidora | Ativa baixa e bloqueio de aceite por saldo. |
| `inventory_reconciliation_enabled` | distribuidora | Ativa conciliação nova por sessão. |
| `legacy_reconciliation_enabled` | distribuidora | Mantém acesso à conciliação legada. |

Comportamento recomendado:

- Flag desligada: pedido segue fluxo legado sem bloquear aceite por estoque. Se houver shadow ledger implementado futuramente, ele deve ser somente observacional.
- Flag ligada: aceite valida saldo, cria movimento `ORDER_ACCEPT_OUT` e bloqueia quando faltar saldo.
- Mudança de flag exige registro de responsável, horário e motivo.

Fonte de verdade operacional: novo módulo para aceite da distribuidora piloto com flag ligada.

Risco principal: ativação global acidental bloquear pedidos de distribuidoras sem carga inicial.

Mitigação: flag por distribuidora com default desligado e preflight obrigatório.

### Fase 7 - Ativar Conciliação Nova

Objetivo: validar conciliação física por sessão sem cortar a rotina legada antes da hora.

Passos:

- Ativar `inventory_reconciliation_enabled` para a distribuidora piloto.
- Abrir sessão, capturar snapshot e fechar contagem sem divergência.
- Fechar contagem com divergência justificada e validar movimento `RECONCILIATION_ADJUSTMENT`.
- Comparar resultado com conciliação legada no mesmo período.

Fonte de verdade operacional: definida por operação no piloto; recomendação inicial é legado como referência e novo como comparação, até aprovação formal.

Risco principal: sessão aberta por muito tempo gerar snapshot defasado.

Mitigação: limite operacional de sessão aberta e fechamento no mesmo ciclo de contagem.

### Fase 8 - Expandir Gradualmente

Objetivo: repetir o processo por grupos de distribuidoras.

Ordem sugerida:

1. Distribuidora piloto.
2. Distribuidoras com menor volume e equipe treinada.
3. Distribuidoras com maior volume.
4. Todas as distribuidoras ativas.

Critério para cada nova distribuidora:

- Catálogo validado.
- Saldo inicial aprovado.
- Treinamento registrado.
- Leitura OPS validada.
- Bloqueio por estoque ativado explicitamente.
- Conciliação nova ativada após primeiro ciclo estável.

Fonte de verdade operacional: por distribuidora, conforme flags e fase.

Risco principal: operação ficar em estados diferentes sem clareza.

Mitigação: matriz pública de fase por distribuidora.

### Fase 9 - Decidir Destino da Conciliação Legada

Objetivo: escolher o corte definitivo ou preservação histórica da conciliação antiga.

Opções:

- Manter legado somente como histórico read-only.
- Redirecionar a navegação para a conciliação nova e deixar legado acessível por rota administrativa temporária.
- Remover telas legadas em release posterior, mantendo dados no banco por retenção.

Condição para corte:

- Todas as distribuidoras no escopo usam novo ledger sem incidentes críticos recentes.
- OPS audita saldos e sessões no novo módulo.
- Operação aprovou formalmente o novo processo.
- Produto decidiu política de retenção e comunicação.

---

## 4. Checklist Executável de Deploy

| Item | Responsável sugerido | Evidência esperada | Condição de aprovação |
| --- | --- | --- | --- |
| Congelar janela de deploy e comunicar operação | Produto + Operação | Mensagem enviada com data, impacto e canal de incidente | Operação confirma ciência |
| Aplicar migrations de inventory | Engenharia | Log de migration aplicada no ambiente alvo | Migration concluída sem erro |
| Gerar Prisma Client | Engenharia | Build/deploy usando client compatível | API sobe sem erro de schema |
| Rodar validações técnicas | Engenharia | Resultado de `shared:check`, `enums:check`, `typecheck:api`, testes | Todos passam ou há exceção aprovada |
| Validar RBAC de rotas distributor | Engenharia | Teste com `distributor_admin`, `ops`, `support` | Apenas distribuidor autorizado acessa rotas próprias |
| Validar RBAC de rotas OPS | Engenharia | Teste com `ops`, `support`, `distributor_admin` | Apenas OPS acessa leitura global |
| Cadastrar catálogo do piloto | Operação + Engenharia | Lista de `InventoryItem` com product_id, tipo e status | Todos os produtos vendáveis do piloto mapeados |
| Conferir duplicidade Product -> InventoryItem | Engenharia | Relatório/preflight sem duplicidade ativa | Zero duplicidade bloqueante |
| Criar item de retornável vazio | Operação + Engenharia | Item `RETURNABLE_EMPTY` ativo | Item existe ou reversa fica fora do piloto |
| Registrar saldo inicial | Distribuidora + Operação | Movimentos `INITIAL_LOAD` e saldos visíveis | Operação aprova contagem inicial |
| Liberar leitura OPS | Engenharia + OPS | Tela OPS lista saldos e movimentos | OPS valida sem permissão de escrita |
| Ativar leitura para distribuidora piloto | Engenharia + Operação | Tela distribuidora mostra saldos próprios | Distribuidora confirma acesso |
| Treinar distribuidora piloto | Operação | Registro de treinamento | Usuários sabem consultar saldo e registrar conciliação |
| Ativar bloqueio por estoque no piloto | Engenharia + Produto | Flag ligada para distribuidora piloto | Preflight e saldo inicial aprovados |
| Validar aceite com saldo | Engenharia + Operação | Pedido aceito e movimento `ORDER_ACCEPT_OUT` único | Status e saldo corretos |
| Validar aceite sem saldo | Engenharia + Produto | Pedido não aceito e erro claro | Sem baixa parcial |
| Ativar conciliação nova no piloto | Engenharia + Operação | Flag ligada e sessão aberta/fechada | Sessão fecha com metadata e ajuste quando aplicável |
| Manter legado durante dual-run | Produto + Engenharia | Navegação/rota legada ainda acessível conforme fase | Legado preservado até decisão formal |

---

## 5. Checklist Executável de Pós-Deploy

| Item | Responsável sugerido | Evidência esperada | Condição de aprovação |
| --- | --- | --- | --- |
| Monitorar erros de aceite por estoque | Engenharia | Logs/erros `STOCK_UNAVAILABLE`, `INVENTORY_ITEM_NOT_FOUND`, `IDEMPOTENCY_CONFLICT` | Sem pico inesperado após ativação |
| Monitorar pedidos bloqueados | Operação + Produto | Lista diária de pedidos bloqueados e motivo | Bloqueios são explicáveis por saldo real |
| Conferir saldo após pedidos aceitos | Operação | Amostra de pedidos aceitos comparada ao extrato | Saldo baixa uma vez por pedido |
| Conferir cancelamentos pós-aceite | Operação + Engenharia | Amostra com retorno ou sem retorno físico | Sem devolução duplicada |
| Conferir falha de entrega | Operação | Amostra com `return_to_stock`/retorno físico | Saldo só retorna quando fisicamente confirmado |
| Fechar primeira conciliação sem divergência | Distribuidora + Operação | Sessão fechada sem ajuste | Sem movimento de ajuste indevido |
| Fechar primeira conciliação com divergência | Distribuidora + Operação | Sessão fechada com justificativa e movimento de ajuste | Divergência auditável |
| Comparar novo saldo com legado | OPS + Operação | Planilha ou relatório de divergência | Divergência dentro do limite aprovado |
| Revisar feedback da distribuidora | Operação + Produto | Registro de dúvidas/incidentes | Nenhum bloqueador aberto |
| Decidir expansão ou pausa | Produto + Operação + Engenharia | Ata ou decisão registrada | Critérios do piloto atingidos ou rollback acionado |

---

## 6. Responsabilidades por Papel

| Papel | Responsabilidades no rollout | Não deve fazer no MVP |
| --- | --- | --- |
| Produto | Aprovar escopo, mensagens, piloto, critérios de sucesso e corte do legado | Ativar bloqueio sem aceite operacional |
| Operação | Escolher piloto, treinar distribuidora, validar contagem, monitorar divergências | Corrigir saldo editando banco diretamente |
| Engenharia | Aplicar migration, validar deploy, implementar/operar flags, monitorar erros | Apagar movimentos ou reescrever ledger |
| OPS | Auditar saldos, movimentos, sessões e divergências globais | Ajustar saldo ou fechar conciliação no MVP |
| Distribuidor | Registrar carga inicial, consultar saldo, abrir/fechar conciliação própria | Informar `distributor_id` manualmente ou operar estoque de terceiros |
| Support | Apoiar comunicação fora do módulo, quando necessário | Acessar inventory ou executar ações de estoque |

---

## 7. Critérios de Sucesso do Piloto

O piloto pode ser considerado bem-sucedido quando todos os critérios abaixo forem atendidos por um período definido por produto/operação.

- 100% dos produtos vendáveis do piloto possuem `InventoryItem` ativo e único.
- 100% dos itens controlados têm saldo inicial aprovado.
- Distribuidora piloto consegue consultar saldo e extrato sem suporte técnico recorrente.
- OPS consegue auditar saldos e sessões sem permissão de escrita.
- Pedidos com saldo suficiente são aceitos sem baixa duplicada.
- Pedidos sem saldo são bloqueados com mensagem operacional compreensível.
- Cancelamento pós-aceite não gera devolução duplicada.
- Falha de entrega só devolve saldo quando há retorno físico confirmado.
- A primeira conciliação sem divergência fecha sem ajuste.
- A primeira conciliação com divergência fecha com justificativa e movimento auditável.
- Nenhum vazamento multi-tenant é identificado.
- Divergência física acumulada fica dentro do limite aprovado.
- Operação aprova formalmente expansão para a próxima distribuidora.

Métrica temporal sugerida: pelo menos 5 dias úteis ou 50 pedidos aceitos no piloto, o que acontecer primeiro, sem incidente crítico. Esta métrica depende de aprovação de produto e operação.

---

## 8. Métricas de Divergência e Observabilidade

Métricas mínimas do piloto:

- Quantidade de pedidos bloqueados por `STOCK_UNAVAILABLE` por dia e por distribuidora.
- Quantidade de bloqueios por `INVENTORY_ITEM_NOT_FOUND` ou mapeamento ausente.
- Percentual de pedidos aceitos com movimento de estoque criado.
- Quantidade de movimentos idempotentes/replay por referência.
- Diferença absoluta e percentual entre saldo sistêmico e contagem física por item.
- Número de sessões de conciliação abertas por mais tempo que o limite operacional.
- Número de conciliações com divergência e média de `delta` por item.
- Número de ajustes de conciliação por distribuidora.
- Quantidade de cancelamentos/falhas com retorno ao estoque.
- Tempo médio de resolução de incidente operacional.

Eventos ou logs recomendados:

- Aceite bloqueado por estoque.
- Produto sem item de estoque ativo.
- Produto com item de estoque duplicado.
- Carga inicial registrada.
- Movimento idempotente reaproveitado.
- Sessão de conciliação aberta/fechada.
- Ajuste de conciliação aplicado.
- Feature flag alterada.

---

## 9. Comunicação para Operação

Mensagem mínima antes do piloto:

- O novo módulo controla estoque físico por distribuidora.
- O pedido continuará passando por pagamento e envio para distribuidora como antes.
- A mudança crítica acontece no aceite: se não houver saldo cadastrado, o aceite pode ser bloqueado.
- A distribuidora piloto deve registrar saldo inicial antes da ativação do bloqueio.
- Durante o dual-run, a conciliação legada continua disponível até decisão formal.
- Divergências devem ser reportadas no canal definido, com pedido, item, distribuidora e print/timestamp quando possível.

Comunicação durante incidente:

- Informar se o bloqueio está ativo para a distribuidora afetada.
- Informar se o incidente é de catálogo, saldo inicial, saldo físico real, bug técnico ou uso incorreto.
- Informar ação tomada: correção auditável, pausa de flag, treinamento, ou investigação técnica.

---

## 10. Checklist de Rollback e Pausa

Rollback preferencial no MVP significa pausar o comportamento operacional novo, não apagar dados do ledger.

| Situação | Ação de pausa/rollback | Responsável | Evidência |
| --- | --- | --- | --- |
| Bloqueio indevido de aceite | Desligar `inventory_order_accept_blocking_enabled` da distribuidora afetada | Engenharia + Produto | Flag alterada e operação comunicada |
| Catálogo incompleto | Manter bloqueio desligado, corrigir catálogo e repetir preflight | Engenharia + Operação | Preflight sem pendência |
| Saldo inicial incorreto | Registrar ajuste auditável ou nova conciliação; não editar saldo direto | Operação + Engenharia | Movimento corretivo rastreável |
| Baixa duplicada | Pausar flag, abrir incidente técnico, corrigir por movimento auditável | Engenharia | Referências e movimentos analisados |
| Devolução duplicada | Pausar fluxo afetado se necessário e corrigir por movimento auditável | Engenharia + Operação | Extrato corrigido por novo movimento |
| Conciliação nova com divergência inexplicável | Manter legado como fonte, pausar nova conciliação na distribuidora | Operação + Produto | Sessão/relatório revisado |
| OPS com permissão indevida | Revogar acesso, auditar logs e corrigir RBAC | Engenharia | 403 validado para role indevida |
| Falha de deploy | Reverter release da aplicação se necessário; não dropar tabelas com movimentos | Engenharia | Aplicação estável e dados preservados |

Regras de rollback:

- Nunca apagar `InventoryMovement` em produção para resolver incidente operacional.
- Nunca editar `quantity_on_hand` manualmente sem movimento correspondente.
- Nunca cortar a conciliação legada enquanto houver incidente aberto no piloto.
- Toda pausa de flag deve ser comunicada para operação e registrada com motivo.

---

## 11. Ajustes Preventivos Aceitáveis no MVP

Estes ajustes são aceitáveis antes de expandir o rollout porque reduzem risco sem aumentar demais o escopo.

- Feature flag por distribuidora para bloqueio de aceite por estoque.
- Preflight de catálogo: produtos ativos sem item, produtos com item duplicado e ausência de retornável vazio.
- Tela ou relatório simples de fase por distribuidora: read-only, bloqueio ativo, conciliação nova ativa, legado ativo.
- Logs estruturados para bloqueio de aceite, ajuste de conciliação e alteração de flag.
- Limite operacional para sessão de conciliação aberta.
- Checklist de saldo inicial assinado/aprovado pela operação.
- Mensagens de erro mais claras para `STOCK_UNAVAILABLE` e `INVENTORY_ITEM_NOT_FOUND`.

---

## 12. Fora do MVP Explicitamente

Estes itens não devem ser implementados dentro do fechamento do MVP. Devem virar épicos ou ADRs separados.

- Transferência entre distribuidoras.
- Aprovação formal de ajuste por OPS.
- Importação CSV em lote.
- Alertas ativos de baixo estoque por push/e-mail/WhatsApp.
- Forecasting de demanda.
- Integração com ERP.
- Reprocessamento automático de histórico legado para popular ledger.
- Edição manual direta de saldo por OPS.
- Saldo negativo controlado.
- Múltiplos itens vendáveis ativos para o mesmo produto sem regra técnica aprovada.

---

## 13. Revisão de Riscos Operacionais

| Risco | Impacto | Mitigação | Decisão pendente |
| --- | --- | --- | --- |
| Bloqueio antes da carga inicial | Pedidos pagos/enviados podem não ser aceitos | Flag por distribuidora com default desligado e preflight obrigatório | Engenharia deve decidir mecanismo da flag |
| Catálogo incompleto | Aceite falha por item não encontrado | Checklist e relatório preflight | Operação/produto validam lista de produtos controlados |
| Ausência de rollback operacional | Time tenta corrigir banco manualmente | Playbook de pausa e correção por movimento | Engenharia define quem pode operar flags |
| Corte prematuro do legado | Operação perde referência histórica | Legado ativo até aceite formal | Produto decide destino final do legado |
| Falta de treinamento | Uso incorreto de carga/conciliação | Treinamento curto e evidência registrada | Operação define agenda e responsáveis |
| Pouca observabilidade no piloto | Incidentes demoram a ser diagnosticados | Logs, métricas e acompanhamento diário | Engenharia define dashboard/consulta mínima |
| Sessão aberta por muito tempo | Snapshot fica defasado e confunde ajuste | Limite operacional de sessão | Produto/operação definem tempo máximo |
| Divergência sem justificativa clara | Ajuste perde valor auditável | Fechamento exige justificativa quando há delta | Operação define padrão de justificativas |
| Múltiplas fontes de verdade | Time usa legado e novo de forma contraditória | Matriz de fonte de verdade por fase | Produto/operação aprovam matriz |

---

## 14. Extensões Futuras de Escalabilidade

As extensões abaixo devem respeitar o ledger append-only. Nenhuma delas deve editar movimentos antigos ou saldo direto. Cada uma deve virar épico separado; integrações externas e mudanças de invariantes devem virar ADR.

### 14.1 Transferência Entre Distribuidoras

Objetivo: permitir movimentar estoque físico de uma distribuidora para outra com rastreabilidade.

Gatilho de negócio: operação passa a remanejar estoque entre bases para cobrir demanda ou evitar ruptura.

Dependências técnicas:

- Novos tipos de movimento: saída de transferência e entrada de transferência.
- Referência comum de transferência para vincular os dois movimentos.
- Validação de saldo na origem e idempotência por transferência.

Riscos:

- Baixar origem sem creditar destino.
- Transferência física não concluída mas já creditada.
- Transferências concorrentes gerarem saldo negativo.

Mudanças prováveis no modelo:

- Tabela `InventoryTransfer` com origem, destino, status, itens e timestamps.
- Movement types `TRANSFER_OUT` e `TRANSFER_IN`.

Como se preparar agora:

- Manter `reference_type/reference_id` genéricos e idempotentes.
- Não assumir que todo movimento pertence a pedido ou conciliação.
- Preservar locks por saldo no `applyMovement`.

Classificação: épico + ADR se houver status de transferência em duas fases.

### 14.2 Aprovação de Ajuste por OPS

Objetivo: permitir que ajustes relevantes passem por aprovação de OPS antes de impactar saldo.

Gatilho de negócio: divergências frequentes ou ajustes de alto valor exigirem governança central.

Dependências técnicas:

- Workflow de solicitação, aprovação e rejeição.
- RBAC para OPS aprovar, distribuidor solicitar.
- Auditoria de aprovador e motivo.

Riscos:

- OPS virar operador de saldo sem trilha clara.
- Ajustes pendentes acumularem e deixarem saldo incorreto.
- Aprovação duplicada.

Mudanças prováveis no modelo:

- Tabela `InventoryAdjustmentRequest` com status `PENDING`, `APPROVED`, `REJECTED`, `APPLIED`.
- Movimento só criado no momento de aprovação/aplicação.

Como se preparar agora:

- Não criar endpoint de ajuste OPS no MVP.
- Manter justificativa e metadata suficientes nos ajustes de conciliação.
- Separar leitura OPS de escrita de estoque.

Classificação: épico + ADR de governança de ajuste.

### 14.3 Importação CSV em Lote

Objetivo: acelerar carga inicial ou atualização operacional a partir de planilhas.

Gatilho de negócio: muitas distribuidoras/itens tornando entrada manual lenta.

Dependências técnicas:

- Parser CSV robusto.
- Validação por lote antes de aplicar.
- Idempotência por `batch_id` e hash do conteúdo.
- Relatório de erros por linha.

Riscos:

- Importar item errado por código ambíguo.
- Duplicar carga inicial.
- Aplicar lote parcialmente sem clareza.

Mudanças prováveis no modelo:

- Tabela `InventoryImportBatch` com status, hash, arquivo, autor e resultado.
- Metadata de movimento com `batch_id`, `line_number` e `source_file`.

Como se preparar agora:

- Manter `code` de `InventoryItem` estável.
- Preservar `batch_id` e `batch_hash` em carga inicial.
- Evitar regras que dependam de ordem manual da UI.

Classificação: épico. ADR apenas se o arquivo virar integração recorrente.

### 14.4 Alertas Ativos de Baixo Estoque

Objetivo: notificar operação/distribuidor antes da ruptura.

Gatilho de negócio: baixo estoque exigir ação antes do pedido falhar no aceite.

Dependências técnicas:

- Limiar por item/distribuidora ou item global.
- Job periódico ou evento após movimento.
- Canal de notificação: in-app, e-mail, WhatsApp ou push.
- Controle de deduplicação de alerta.

Riscos:

- Alertas repetitivos gerarem fadiga.
- Limiar global não representar realidade por distribuidora.
- Notificar antes do saldo inicial estar confiável.

Mudanças prováveis no modelo:

- Tabela de `InventoryAlert` ou `InventoryNotificationState`.
- Configuração por distribuidora e item.

Como se preparar agora:

- Manter `low_stock_threshold` exposto nos saldos.
- Registrar `last_movement_at` e facilitar consultas por baixo estoque.
- Não acoplar alerta à tela atual.

Classificação: épico separado.

### 14.5 Forecasting de Demanda

Objetivo: prever necessidade de reposição por distribuidora, item e período.

Gatilho de negócio: volume crescer e rupturas passarem a ser previsíveis por histórico.

Dependências técnicas:

- Histórico confiável de pedidos aceitos, cancelados, falhas e movimentos.
- Eventos de sazonalidade, dia da semana e cobertura por zona.
- Pipeline analítico ou job de agregação.

Riscos:

- Previsão baseada em dados de rollout ainda instáveis.
- Confundir capacidade de entrega com demanda física.
- Recomendação automática sem aprovação operacional.

Mudanças prováveis no modelo:

- Tabelas agregadas por item/distribuidora/dia.
- Eventual tabela de recomendação de reposição.

Como se preparar agora:

- Preservar ledger append-only com `occurred_at` confiável.
- Evitar apagar movimentos ou sobrescrever histórico.
- Manter produto, item e distribuidora bem identificados nos movimentos.

Classificação: épico + ADR se houver recomendação automatizada afetando operação.

### 14.6 Integração com ERP

Objetivo: sincronizar estoque, catálogo ou movimentos com sistema externo.

Gatilho de negócio: financeiro/operação exigir conciliação com sistema contábil ou gestão central.

Dependências técnicas:

- Mapeamento de códigos entre XUA e ERP.
- Idempotência de eventos enviados/recebidos.
- Webhooks, jobs ou filas.
- Estratégia de conflito e fonte de verdade.

Riscos:

- ERP e XUA competirem como fonte de verdade.
- Duplicidade de movimentos por reenvio.
- Latência externa bloquear aceite de pedidos.

Mudanças prováveis no modelo:

- Tabela de integração/event outbox.
- Campos externos por item, distribuidora e movimento.
- Status de sincronização e erro.

Como se preparar agora:

- Manter `reference_type/reference_id` e metadata extensíveis.
- Não depender de chamadas síncronas externas no `applyMovement`.
- Preservar códigos operacionais estáveis.

Classificação: ADR obrigatório + épico técnico.

---

## 15. Decisões que Ainda Dependem do Time

Produto:

- Métrica final de sucesso do piloto.
- Mensagem exata exibida quando aceite é bloqueado por estoque.
- Destino da conciliação legada: histórico, redirect ou remoção posterior.
- Critério de expansão por grupos de distribuidoras.

Operação:

- Distribuidora piloto e responsáveis.
- Processo de contagem física inicial.
- Tempo máximo de sessão de conciliação aberta.
- Padrão de justificativa para divergência.
- Responsável por aprovar correção de saldo inicial.

Engenharia:

- Mecanismo concreto de feature flag por distribuidora.
- Consulta ou script de preflight de catálogo/saldo.
- Dashboard/logs mínimos do piloto.
- Política de rollback de release sem apagar dados de inventory.
- Se a regra de um item vendável ativo por produto será constraint técnica ou validação de serviço.

---

## 16. Condição de Pronto para Expansão

O rollout pode sair do piloto quando:

- Deploy técnico está validado.
- Distribuidora piloto concluiu carga inicial.
- Bloqueio por estoque ficou ativo no piloto sem incidente crítico.
- Conciliação nova foi usada com e sem divergência.
- OPS consegue auditar o fluxo pelo novo módulo.
- Produto, operação e engenharia aprovaram métricas do piloto.
- Existe decisão registrada sobre próxima distribuidora ou grupo de distribuidoras.

O corte da conciliação legada só deve acontecer depois da expansão bem-sucedida e de uma decisão formal de produto/operação.