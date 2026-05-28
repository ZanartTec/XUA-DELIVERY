# Checklist de Aceite Funcional - Estoque e Conciliação

Status: checklist para validação de produto, operação e engenharia antes da implementação e do rollout.
Data: 26/05/2026.
Documento base: `docs/estoque-conciliacao/contrato-funcional-rollout.md`.

---

## Como Usar

Marque um item somente quando existir evidência objetiva. Se a evidência depender de decisão de produto ou operação ainda pendente, mantenha o item desmarcado e registre a decisão na seção final.

Legenda de responsáveis sugeridos:

- Produto: valida regra de negócio e experiência esperada.
- Operação: valida processo físico, rotina da distribuidora e corte operacional.
- Engenharia: valida viabilidade técnica, segurança, transação, logs e critérios testáveis.

---

## 1. Regras de Negócio Fundamentais

- [ ] Estoque e capacidade de entrega estão documentados como conceitos separados.
  - Evidência esperada: seção funcional explica que capacidade limita agenda e estoque limita disponibilidade física.
  - Responsável sugerido: Produto + Operação.

- [ ] O momento crítico de capacidade está definido como criação/agendamento do pedido.
  - Evidência esperada: regra deixa claro que reserva de capacidade não baixa estoque.
  - Responsável sugerido: Produto + Engenharia.

- [ ] O momento crítico de estoque está definido como aceite da distribuidora.
  - Evidência esperada: regra deixa claro que baixa de estoque ocorre no aceite, não na criação do pedido.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Pedido criado não movimenta estoque.
  - Evidência esperada: cenário `pedido criado` documentado com resultado esperado `sem movimento de estoque`.
  - Responsável sugerido: Produto.

- [ ] Pedido enviado para distribuidora não movimenta estoque.
  - Evidência esperada: cenário `enviado para distribuidora` documentado com resultado esperado `sem movimento de estoque`.
  - Responsável sugerido: Produto.

- [ ] Rejeição antes do aceite não movimenta estoque.
  - Evidência esperada: cenário `rejeição antes do aceite` documentado com resultado esperado `sem movimento de estoque`, inclusive quando o motivo for `out_of_stock`.
  - Responsável sugerido: Produto + Operação.

- [ ] Aceite com saldo suficiente movimenta estoque uma única vez.
  - Evidência esperada: cenário `aceite com saldo` documentado com saída do item vendável e referência ao pedido.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Aceite sem saldo suficiente bloqueia a aceitação do pedido.
  - Evidência esperada: cenário documentado com erro esperado, como `STOCK_UNAVAILABLE`, sem mudança de status e sem baixa parcial.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Pedido com múltiplos itens não permite baixa parcial se um item estiver sem saldo.
  - Evidência esperada: regra documenta validação de todos os itens antes de qualquer movimento.
  - Responsável sugerido: Engenharia.

- [ ] Despacho e pedido em rota não geram nova baixa se a baixa já ocorreu no aceite.
  - Evidência esperada: cenário `despacho` documentado com resultado esperado `sem nova baixa`.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Entrega concluída não gera nova saída de produto vendável quando a saída já ocorreu no aceite.
  - Evidência esperada: cenário `entrega concluída` documentado com resultado esperado `sem nova saída de vendável`.
  - Responsável sugerido: Produto + Engenharia.

---

## 2. Ownership por Distribuidora

- [ ] Todo saldo pertence explicitamente a uma distribuidora.
  - Evidência esperada: regra funcional menciona `distributor_id` como ownership obrigatório do saldo.
  - Responsável sugerido: Engenharia.

- [ ] Todo movimento de estoque pertence explicitamente a uma distribuidora.
  - Evidência esperada: regra funcional menciona que movimento deve carregar distribuidora dona do estoque.
  - Responsável sugerido: Engenharia.

- [ ] Toda sessão de conciliação pertence explicitamente a uma distribuidora.
  - Evidência esperada: regra funcional menciona sessão de conciliação por distribuidora.
  - Responsável sugerido: Engenharia.

- [ ] `distributor_admin` opera apenas a própria distribuidora.
  - Evidência esperada: matriz de papéis e regra de acesso impedem consulta ou escrita em outra distribuidora.
  - Responsável sugerido: Produto + Engenharia.

- [ ] O cliente não pode enviar `distributor_id` livremente para operações de escrita.
  - Evidência esperada: regra funcional exige resolver distribuidora a partir do usuário autenticado.
  - Responsável sugerido: Engenharia.

- [ ] Transferência entre distribuidoras está explicitamente fora do MVP.
  - Evidência esperada: fora de escopo lista transferência entre distribuidoras.
  - Responsável sugerido: Produto.

---

## 2.1 Catalogo Operacional e Relacao com Product

- [ ] `Product` e `InventoryItem` estão documentados como conceitos diferentes.
  - Evidência esperada: contrato funcional distingue catálogo comercial de catálogo operacional.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `product_id` em `InventoryItem` está definido como opcional.
  - Evidência esperada: contrato funcional permite item operacional sem `Product` vinculado.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Um `Product` ativo pode ter no máximo um `InventoryItem` do tipo `SELLABLE_PRODUCT` no MVP.
  - Evidência esperada: regra funcional aprovada para evitar ambiguidade no mapeamento de pedido para estoque.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Retornáveis e insumos podem existir sem vínculo com `Product`.
  - Evidência esperada: contrato funcional descreve retornáveis e itens operacionais independentes do catálogo comercial.
  - Responsável sugerido: Produto.

- [ ] O `code` de `InventoryItem` é tratado como identificador case-insensitive.
  - Evidência esperada: contrato funcional e schema de entrada definem normalização em uppercase.
  - Responsável sugerido: Produto + Engenharia.

---

## 3. Cancelamento Pós-Aceite

- [ ] Cancelamento antes do aceite não movimenta estoque.
  - Evidência esperada: cenário documentado com resultado esperado `sem movimento`.
  - Responsável sugerido: Produto.

- [ ] Cancelamento depois do aceite devolve saldo somente quando o item físico retorna ou permanece disponível.
  - Evidência esperada: regra funcional diferencia retorno físico/disponibilidade preservada de item não retornado.
  - Responsável sugerido: Produto + Operação.

- [ ] Cancelamento pós-aceite não devolve saldo quando a operação confirma que o item não retorna ao estoque.
  - Evidência esperada: cenário documentado com resultado esperado `sem movimento de retorno`.
  - Responsável sugerido: Operação.

- [ ] Devolução por cancelamento não pode ocorrer mais de uma vez para o mesmo pedido/evento.
  - Evidência esperada: regra de idempotência funcional para cancelamento pós-aceite.
  - Responsável sugerido: Engenharia.

- [ ] Existe matriz de decisão para cancelamento pós-aceite por estado operacional.
  - Evidência esperada: tabela aprovada indicando comportamento para pedido aceito na base, despachado, em rota, com retorno confirmado e sem retorno confirmado.
  - Responsável sugerido: Produto + Operação + Engenharia.
  - Status: pendente de detalhamento no contrato atual.

---

## 4. Falha de Entrega e Reentrega

- [ ] `DELIVERY_FAILED` isolado não devolve estoque automaticamente.
  - Evidência esperada: regra funcional deixa explícito que falha de entrega exige confirmação de retorno físico.
  - Responsável sugerido: Produto + Engenharia.

- [ ] A fonte de confirmação de retorno físico está definida.
  - Evidência esperada: regra aprovada indicando se a confirmação vem do motorista, distribuidor, OPS ou evento operacional específico.
  - Responsável sugerido: Produto + Operação.
  - Status: pendente de decisão.

- [ ] Falha de entrega com retorno físico confirmado gera retorno de estoque.
  - Evidência esperada: cenário documentado com movimento esperado de retorno e referência ao pedido.
  - Responsável sugerido: Produto + Operação.

- [ ] Falha de entrega sem retorno físico confirmado não gera retorno de estoque.
  - Evidência esperada: cenário documentado com resultado esperado `sem movimento de retorno`.
  - Responsável sugerido: Produto + Operação.

- [ ] Produto mantido com motorista para reentrega no mesmo dia não gera nova baixa automática.
  - Evidência esperada: regra aprovada para produto em posse do motorista ou em rota.
  - Responsável sugerido: Operação + Produto.
  - Status: pendente de decisão operacional.

- [ ] Reentrega após retorno físico ao estoque tem regra própria de nova saída.
  - Evidência esperada: cenário aprovado para retorno ao estoque seguido de nova tentativa.
  - Responsável sugerido: Produto + Engenharia.
  - Status: pendente para fluxo completo de reentrega.

---

## 5. Logística Reversa

- [ ] Coleta de garrafão vazio aumenta estoque de retornável vazio quando houver item correspondente.
  - Evidência esperada: cenário `coleta de vazio` documentado com entrada de retornável e referência ao pedido.
  - Responsável sugerido: Produto + Operação.

- [ ] Garrafão não coletado não gera entrada de retornável.
  - Evidência esperada: cenário `não coleta` documentado com resultado esperado `sem movimento de entrada`.
  - Responsável sugerido: Produto + Operação.

- [ ] Motivo de não coleta continua registrado no pedido legado.
  - Evidência esperada: regra funcional preserva campos legados enquanto telas antigas dependerem deles.
  - Responsável sugerido: Produto + Engenharia.

- [ ] A condição do garrafão é registrada para auditoria.
  - Evidência esperada: regra menciona metadata ou campo equivalente com condição do garrafão.
  - Responsável sugerido: Operação + Engenharia.

- [ ] Garrafão danificado/sujo tem comportamento definido no MVP.
  - Evidência esperada: decisão aprovada indicando se entra como retornável normal, avaria separada ou apenas metadata.
  - Responsável sugerido: Operação + Produto.
  - Status: pendente de decisão.

---

## 6. Carga Inicial

- [ ] Saldo inicial é manual e auditável.
  - Evidência esperada: regra funcional proíbe inferir saldo novo a partir de histórico antigo e exige registro auditável.
  - Responsável sugerido: Operação + Engenharia.

- [ ] Distribuidora piloto tem saldo físico inicial contado e aprovado antes da ativação.
  - Evidência esperada: registro operacional da contagem inicial e aprovação do responsável.
  - Responsável sugerido: Operação.

- [ ] Carga inicial não pode ser reaplicada livremente para corrigir saldo.
  - Evidência esperada: regra aprovada indicando que `INITIAL_LOAD` é evento inicial e correções posteriores usam ajuste de conciliação ou correção auditável.
  - Responsável sugerido: Produto + Engenharia.
  - Status: pendente de detalhamento no contrato atual.

- [ ] Existe responsável pela aprovação de correção de saldo inicial incorreto.
  - Evidência esperada: papel ou pessoa responsável definido para aprovar correções.
  - Responsável sugerido: Operação.
  - Status: pendente de decisão.

- [ ] Carga inicial só pode ocorrer no escopo da própria distribuidora quando feita por `distributor_admin`.
  - Evidência esperada: matriz de papéis e regra de ownership aprovadas.
  - Responsável sugerido: Engenharia.

---

## 7. Conciliação Física e Ajustes

- [ ] Conciliação acontece por sessão e por distribuidora.
  - Evidência esperada: regra funcional define sessão vinculada à distribuidora.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Abertura da sessão captura snapshot do saldo sistêmico por item.
  - Evidência esperada: regra funcional menciona snapshot na abertura.
  - Responsável sugerido: Engenharia.

- [ ] Deve existir no máximo uma sessão aberta por distribuidora.
  - Evidência esperada: regra funcional bloqueia segunda sessão aberta.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Contagem física aceita apenas quantidade inteira e não negativa.
  - Evidência esperada: regra funcional define validação de quantidade.
  - Responsável sugerido: Engenharia.

- [ ] Divergência entre sistema e contagem exige justificativa.
  - Evidência esperada: regra funcional define justificativa obrigatória para delta diferente de zero.
  - Responsável sugerido: Produto + Operação.

- [ ] Ajuste de saldo ocorre somente no fechamento da sessão.
  - Evidência esperada: regra funcional proíbe ajuste antes do fechamento.
  - Responsável sugerido: Engenharia.

- [ ] Ajuste de conciliação é movimento novo, sem editar movimentos anteriores.
  - Evidência esperada: regra funcional define append-only para ajustes.
  - Responsável sugerido: Engenharia.

- [ ] Sessão fechada não pode ser editada.
  - Evidência esperada: regra funcional define imutabilidade após fechamento.
  - Responsável sugerido: Engenharia.

- [ ] Regra para movimentos que ocorrem durante sessão aberta está definida.
  - Evidência esperada: decisão aprovada entre bloquear movimentos, considerar movimentos pós-snapshot no fechamento ou recalcular saldo esperado.
  - Responsável sugerido: Produto + Operação + Engenharia.
  - Status: pendente de decisão.

- [ ] Tempo máximo de sessão aberta está definido.
  - Evidência esperada: SLA operacional aprovado para sessão aberta e ação quando ultrapassar o limite.
  - Responsável sugerido: Operação.
  - Status: pendente de decisão.

---

## 8. Permissões e Segurança

- [ ] `distributor_admin` pode consultar o próprio estoque.
  - Evidência esperada: matriz de papéis aprovada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `distributor_admin` pode carregar saldo inicial apenas no próprio escopo.
  - Evidência esperada: matriz de papéis aprovada e regra de ownership documentada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `distributor_admin` pode abrir e fechar conciliação apenas da própria distribuidora.
  - Evidência esperada: matriz de papéis aprovada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `ops` pode consultar estoque global em modo read-only.
  - Evidência esperada: matriz de papéis aprovada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `ops` não pode carregar saldo inicial no MVP.
  - Evidência esperada: matriz de papéis marca carga inicial como `Não no MVP`.
  - Responsável sugerido: Produto.

- [ ] `ops` não pode abrir nem fechar conciliação no MVP.
  - Evidência esperada: matriz de papéis marca abertura e fechamento como `Não no MVP`.
  - Responsável sugerido: Produto.

- [ ] `ops` não pode ajustar saldo diretamente no MVP.
  - Evidência esperada: matriz de papéis e fora de escopo proíbem ajuste direto.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `support` não pode consultar estoque.
  - Evidência esperada: matriz de papéis marca consulta como `Não`.
  - Responsável sugerido: Produto + Engenharia.

- [ ] `support` não pode carregar saldo, abrir conciliação, fechar conciliação ou ajustar saldo.
  - Evidência esperada: matriz de papéis marca todas as ações como `Não`.
  - Responsável sugerido: Produto + Engenharia.

- [ ] A navegação do produto não exibe Estoque para `support`.
  - Evidência esperada: critério funcional de navegação aprovado.
  - Responsável sugerido: Produto + Engenharia.

- [ ] O termo `suporte` no rollout não concede permissão à role `support`.
  - Evidência esperada: texto operacional usa `canal de atendimento operacional` ou explicita que a role `support` não acessa estoque.
  - Responsável sugerido: Produto.
  - Status: pendente de ajuste textual recomendado.

---

## 9. Dual-Run com Conciliação Legada

- [ ] A conciliação legada permanece ativa no início do rollout.
  - Evidência esperada: regra funcional proíbe apagar legado no início.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Tela legada de conciliação continua disponível durante validação.
  - Evidência esperada: regra de dual-run lista tela atual como legado preservado.
  - Responsável sugerido: Produto.

- [ ] Campos legados de pedido continuam preservados durante dual-run.
  - Evidência esperada: regra funcional preserva campos usados por telas ou relatórios antigos.
  - Responsável sugerido: Engenharia.

- [ ] O novo módulo não reprocessa automaticamente histórico antigo.
  - Evidência esperada: regra de convivência proíbe reprocessamento automático de histórico.
  - Responsável sugerido: Engenharia.

- [ ] Divergência entre legado e novo vira análise operacional, não correção automática.
  - Evidência esperada: regra de convivência aprovada.
  - Responsável sugerido: Operação + Produto.

- [ ] A fase de ativação por distribuidora está definida.
  - Evidência esperada: tabela aprovada de fases, como `read_only`, `ledger_shadow`, `stock_blocking_enabled`, `new_reconciliation_enabled`, `legacy_disabled`.
  - Responsável sugerido: Produto + Operação + Engenharia.
  - Status: pendente de decisão.

- [ ] A fonte de verdade por fase está definida.
  - Evidência esperada: para cada fase, documento indica se legado ou novo módulo é fonte de verdade para operação diária.
  - Responsável sugerido: Produto + Operação.
  - Status: pendente de decisão.

- [ ] Uma distribuidora só ativa bloqueio por estoque após saldo inicial validado.
  - Evidência esperada: regra de convivência aprovada.
  - Responsável sugerido: Operação + Engenharia.

---

## 10. Critérios para Ativar Piloto

### Produto e Operação

- [ ] Distribuidora piloto escolhida.
  - Evidência esperada: nome/id da distribuidora piloto registrado.
  - Responsável sugerido: Operação.

- [ ] Distribuidora piloto comunicada sobre o fluxo novo.
  - Evidência esperada: registro de comunicação ou aceite operacional.
  - Responsável sugerido: Operação.

- [ ] Responsável operacional do piloto definido.
  - Evidência esperada: nome ou função responsável registrado.
  - Responsável sugerido: Operação.

- [ ] Lista de itens controlados validada.
  - Evidência esperada: lista de itens do piloto aprovada por operação e produto.
  - Responsável sugerido: Produto + Operação.

- [ ] Saldo físico inicial contado.
  - Evidência esperada: planilha, formulário ou registro de contagem física.
  - Responsável sugerido: Operação.

- [ ] Saldo físico inicial aprovado.
  - Evidência esperada: aprovação registrada pelo responsável operacional.
  - Responsável sugerido: Operação.

- [ ] Treinamento básico realizado com distribuidor.
  - Evidência esperada: registro de treinamento ou aceite da distribuidora.
  - Responsável sugerido: Operação.

- [ ] Treinamento básico realizado com OPS.
  - Evidência esperada: registro de treinamento ou aceite da equipe OPS.
  - Responsável sugerido: Operação.

- [ ] Canal de atendimento operacional para incidentes definido.
  - Evidência esperada: canal, horário e responsável registrados.
  - Responsável sugerido: Operação.

### Engenharia

- [ ] Migration aplicada no ambiente alvo.
  - Evidência esperada: registro de deploy ou migration aplicada com sucesso.
  - Responsável sugerido: Engenharia.

- [ ] Prisma Client gerado no ambiente da aplicação.
  - Evidência esperada: build/deploy usando client compatível com schema.
  - Responsável sugerido: Engenharia.

- [ ] Backend implantado com rotas de inventory.
  - Evidência esperada: release/deploy identificado.
  - Responsável sugerido: Engenharia.

- [ ] Rotas de distribuidora protegidas por role.
  - Evidência esperada: teste ou validação de acesso com `distributor_admin` e roles indevidas.
  - Responsável sugerido: Engenharia.

- [ ] Rotas OPS protegidas por role e read-only.
  - Evidência esperada: teste ou validação de acesso com `ops`, `support` e roles indevidas.
  - Responsável sugerido: Engenharia.

- [ ] Saldo inicial registrado via fluxo auditável.
  - Evidência esperada: movimento de carga inicial visível no extrato.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Aceite com saldo suficiente validado.
  - Evidência esperada: pedido aceito e movimento de saída criado uma única vez.
  - Responsável sugerido: Engenharia + Produto.

- [ ] Aceite sem saldo validado.
  - Evidência esperada: pedido não aceito, erro claro e ausência de baixa parcial.
  - Responsável sugerido: Engenharia + Produto.

- [ ] Cancelamento pós-aceite validado.
  - Evidência esperada: cenário validado sem devolução duplicada.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Conciliação sem divergência validada.
  - Evidência esperada: sessão fechada sem movimento de ajuste.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Conciliação com divergência validada.
  - Evidência esperada: sessão fechada com justificativa e movimento de ajuste rastreável.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Logs e auditoria mínimos disponíveis.
  - Evidência esperada: eventos ou logs para baixa, retorno, ajuste, saldo insuficiente e fechamento de conciliação.
  - Responsável sugerido: Engenharia.

---

## 11. Critérios de Aprovação do Piloto

- [ ] Distribuidora piloto consulta saldo atual sem ver dados de outra distribuidora.
  - Evidência esperada: validação com usuário da distribuidora piloto.
  - Responsável sugerido: Engenharia + Operação.

- [ ] OPS consulta saldos e movimentos da distribuidora piloto em visão global.
  - Evidência esperada: validação com usuário OPS.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Pedidos com saldo suficiente são aceitos sem regressão operacional.
  - Evidência esperada: amostra de pedidos aceitos no piloto sem incidente de estoque.
  - Responsável sugerido: Operação + Produto.

- [ ] Pedidos sem saldo são bloqueados com mensagem clara.
  - Evidência esperada: teste ou ocorrência controlada com mensagem validada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Cancelamento pós-aceite não duplica devolução de saldo.
  - Evidência esperada: teste ou auditoria do extrato para pedido cancelado.
  - Responsável sugerido: Engenharia.

- [ ] Falha de entrega não devolve saldo sem confirmação física.
  - Evidência esperada: teste ou ocorrência controlada de falha sem retorno físico.
  - Responsável sugerido: Operação + Engenharia.

- [ ] Logística reversa não gera entrada quando não há coleta.
  - Evidência esperada: teste de não coleta sem movimento de entrada.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Conciliação nova fecha sessão e registra ajuste rastreável quando houver divergência.
  - Evidência esperada: sessão de conciliação fechada com movimento de ajuste referenciado.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Nenhum vazamento de dados entre distribuidoras foi identificado.
  - Evidência esperada: validação de acesso cruzado negada.
  - Responsável sugerido: Engenharia.

- [ ] Métrica de estabilidade do piloto foi atingida.
  - Evidência esperada: métrica definida e apurada, por exemplo dias sem incidente, pedidos processados ou divergência máxima aceitável.
  - Responsável sugerido: Produto + Operação.
  - Status: pendente de decisão sobre métrica.

---

## 12. Critérios de Pausa ou Rollback

Marque estes itens quando a resposta operacional estiver definida, não quando o problema ocorrer.

- [ ] Existe procedimento para pausar bloqueio por estoque da distribuidora piloto.
  - Evidência esperada: instrução operacional ou feature flag definida.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Existe procedimento para lidar com saldo inicial incorreto.
  - Evidência esperada: fluxo aprovado de correção auditável e responsável definido.
  - Responsável sugerido: Operação + Engenharia.

- [ ] Existe procedimento para bloqueio indevido de pedido com saldo físico disponível.
  - Evidência esperada: playbook de incidente com triagem, correção e comunicação.
  - Responsável sugerido: Operação + Produto.

- [ ] Existe procedimento para baixa duplicada no aceite.
  - Evidência esperada: playbook de correção via movimento auditável e investigação técnica.
  - Responsável sugerido: Engenharia.

- [ ] Existe procedimento para devolução duplicada em cancelamento ou falha.
  - Evidência esperada: playbook de correção via movimento auditável e bloqueio de recorrência.
  - Responsável sugerido: Engenharia + Operação.

- [ ] Existe procedimento se OPS ou support receber permissão indevida.
  - Evidência esperada: playbook de revogação, auditoria de acesso e correção de role.
  - Responsável sugerido: Engenharia.

- [ ] Existe procedimento para divergência recorrente sem explicação operacional.
  - Evidência esperada: critério de pausa do piloto e análise conjunta produto/operação/engenharia.
  - Responsável sugerido: Operação + Produto.

- [ ] Existe procedimento para impacto relevante no fluxo de pedidos.
  - Evidência esperada: critério de rollback e comunicação para distribuidora piloto.
  - Responsável sugerido: Produto + Operação.

---

## 13. Definição de Pronto para Cortar a Conciliação Legada

- [ ] Todas as distribuidoras no escopo têm saldo inicial validado.
  - Evidência esperada: registro de saldo inicial aprovado por distribuidora.
  - Responsável sugerido: Operação.

- [ ] Novo ledger registra movimentos dos fluxos críticos sem duplicidade conhecida.
  - Evidência esperada: validação de aceite, cancelamento, falha com retorno e logística reversa.
  - Responsável sugerido: Engenharia.

- [ ] Conciliação por sessão foi usada com sucesso por distribuidoras piloto.
  - Evidência esperada: sessões fechadas com e sem divergência.
  - Responsável sugerido: Operação + Engenharia.

- [ ] OPS consegue auditar saldos, movimentos e sessões sem depender da conciliação legada.
  - Evidência esperada: validação da visão global de OPS.
  - Responsável sugerido: Operação + Engenharia.

- [ ] Relatórios ou telas que dependiam de campos legados foram migrados ou aceitos como históricos.
  - Evidência esperada: lista de dependências revisada e aprovada.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Destino da tela legada foi escolhido.
  - Evidência esperada: decisão entre `legado como histórico`, `redirect gradual` ou `remoção posterior`.
  - Responsável sugerido: Produto.

- [ ] Política de retenção dos dados legados foi definida.
  - Evidência esperada: regra aprovada para manter, arquivar ou remover dados em release futura.
  - Responsável sugerido: Produto + Engenharia.

- [ ] Operação aprovou formalmente o fluxo novo.
  - Evidência esperada: aceite operacional registrado.
  - Responsável sugerido: Operação.

- [ ] Existe plano de suporte para divergências pós-corte.
  - Evidência esperada: canal, responsável e playbook definidos.
  - Responsável sugerido: Operação.

- [ ] Não há pendências críticas abertas nas decisões abaixo.
  - Evidência esperada: seção de decisões pendentes revisada e sem itens bloqueantes.
  - Responsável sugerido: Produto + Operação + Engenharia.

---

## 14. Decisões Pendentes Bloqueantes ou Relevantes

### Alta prioridade

- [ ] Definir fonte de confirmação de retorno físico em falha de entrega.
  - Opções a decidir: motorista, distribuidor, OPS, evento específico do backend ou combinação.
  - Impacto se ficar aberto: implementação pode devolver saldo em momentos diferentes.

- [ ] Definir matriz de cancelamento pós-aceite por estado operacional.
  - Opções a decidir: aceito na base, despachado, em rota, retorno confirmado, sem retorno confirmado.
  - Impacto se ficar aberto: devolução de saldo pode ser automática demais ou conservadora demais.

- [ ] Definir regra de movimentos durante sessão de conciliação aberta.
  - Opções a decidir: bloquear movimentos, permitir e listar movimentos pós-snapshot, ou recalcular saldo esperado no fechamento.
  - Impacto se ficar aberto: divergências podem refletir operação normal e não erro físico.

- [ ] Definir fases do dual-run e fonte de verdade por fase.
  - Opções sugeridas: `read_only`, `ledger_shadow`, `stock_blocking_enabled`, `new_reconciliation_enabled`, `legacy_disabled`.
  - Impacto se ficar aberto: rollout pode ativar bloqueio ou conciliação nova sem controle por distribuidora.

### Média prioridade

- [ ] Definir política de reaplicação ou bloqueio de `INITIAL_LOAD`.
  - Opções a decidir: uma vez por item/distribuidora, uma vez por lote inicial, ou reaplicável com lote idempotente.
  - Impacto se ficar aberto: risco de inflar saldo com carga inicial repetida.

- [ ] Definir quem aprova correção de saldo inicial incorreto.
  - Opções a decidir: responsável OPS, líder operacional, distribuidor piloto com validação OPS, ou produto/operação em conjunto.
  - Impacto se ficar aberto: correções podem acontecer sem governança.

- [ ] Definir tratamento de garrafão danificado, sujo ou inadequado no MVP.
  - Opções a decidir: entra como retornável normal, entra em item de avaria, ou fica apenas em metadata.
  - Impacto se ficar aberto: saldo de retornáveis pode ser superestimado.

- [ ] Definir tempo máximo de sessão de conciliação aberta.
  - Opções a decidir: limite em horas, fechamento no mesmo dia, ou regra operacional por distribuidora.
  - Impacto se ficar aberto: snapshot pode ficar antigo e gerar ajuste incorreto.

- [ ] Definir métrica de estabilidade para aprovar piloto e cortar legado.
  - Opções a decidir: dias sem incidente, número mínimo de pedidos, divergência máxima, ou aprovação manual combinada.
  - Impacto se ficar aberto: corte do legado vira decisão subjetiva.

### Baixa prioridade

- [ ] Definir semântica exata dos itens controlados no MVP.
  - Opções a decidir: produto vendável e garrafão cheio como mesmo item ou itens separados; retornável vazio como item próprio; avaria como item futuro.
  - Impacto se ficar aberto: mapeamento `Product -> InventoryItem` pode variar entre implementações.

- [ ] Definir se a regra de "um `Product` ativo para no máximo um `InventoryItem` vendável" será apenas de negócio ou também técnica.
  - Opções a decidir: validação apenas em service, índice parcial em banco numa etapa futura, ou ambos.
  - Impacto se ficar aberto: duplicidade de itens vendáveis vinculados ao mesmo produto pode passar despercebida.

- [ ] Ajustar linguagem de `canal de suporte` para evitar confusão com role `support`.
  - Opções a decidir: usar `canal de atendimento operacional` ou manter texto com ressalva explícita.
  - Impacto se ficar aberto: entendimento equivocado de permissão para support.

---

## 15. Resumo de Aceite Final

O contrato funcional pode ser considerado pronto para orientar implementação quando:

- [ ] Todos os itens obrigatórios de regras de negócio estiverem marcados.
- [ ] Todos os itens obrigatórios de permissões estiverem marcados.
- [ ] A estratégia de dual-run tiver fases e fonte de verdade definidas.
- [ ] Os critérios de piloto tiverem evidências e responsáveis.
- [ ] Os procedimentos de pausa ou rollback estiverem definidos.
- [ ] A definição de pronto para cortar o legado estiver aprovada por produto, operação e engenharia.
- [ ] Nenhuma decisão pendente de alta prioridade estiver aberta.
