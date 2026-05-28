# Contrato Funcional - Estoque e Conciliação

Status: contrato funcional para validação antes da implementação técnica.
Data: 26/05/2026.
Escopo: regras de negócio, papéis, rollout e convivência com a conciliação legada do XUA Delivery.
Documentos relacionados: `docs/estoque-conciliacao/plano-features-modulos.md` e `docs/estoque-conciliacao/fechamento-operacional-rollout.md`.

---

## 1. Objetivo

Este documento formaliza como o novo módulo de estoque e conciliação deve se comportar do ponto de vista de produto, operação e engenharia antes da implementação técnica.

O módulo deve permitir que cada distribuidora controle seu estoque físico de itens vendáveis, retornáveis e insumos operacionais, com rastreabilidade por movimento, saldo atual confiável e conciliação física por sessão. A operação deve ter visão global para acompanhamento e auditoria, mas sem permissão para ajustar saldos no MVP.

A implementação deve entrar em produção de forma gradual, mantendo a conciliação legada ativa durante o período de validação.

---

## 2. Conceitos de Negócio

### 2.1 Estoque

Estoque representa a quantidade física disponível de um item sob responsabilidade de uma distribuidora.

Exemplos:

- Produto vendável disponível para entrega.
- Garrafão cheio retornável.
- Garrafão vazio coletado.
- Insumo operacional controlado pela distribuidora.

Regras principais:

- Estoque sempre pertence a uma distribuidora.
- Estoque é controlado por item de estoque, não apenas por produto comercial.
- Produto comercial e item de estoque são conceitos relacionados, mas não equivalentes.
- Toda alteração de estoque deve ser registrada como movimento.
- O saldo atual é consequência dos movimentos, não um número editado livremente.

### 2.1.1 Relacao Entre Product e InventoryItem no MVP

No MVP, `Product` continua sendo o catalogo comercial usado para venda, checkout e pedido. `InventoryItem` passa a ser o catalogo operacional usado para controle de estoque.

Regras principais:

- `product_id` em `InventoryItem` e opcional.
- Itens operacionais sem `Product` associado sao permitidos.
- Um `Product` ativo pode ter, no maximo, um `InventoryItem` do tipo `SELLABLE_PRODUCT` no MVP.
- Retornaveis e insumos operacionais podem existir sem vinculo com `Product`.
- O campo `code` de `InventoryItem` deve ser tratado como identificador operacional estavel e case-insensitive.
- Para evitar duplicidade semantica, o `code` deve ser normalizado em uppercase nos fluxos de entrada do sistema.

### 2.2 Capacidade de Entrega

Capacidade de entrega representa o limite operacional para atender pedidos em uma zona, data, janela ou horário.

Exemplos:

- Quantos pedidos a distribuidora consegue atender em uma manhã.
- Quantas entregas cabem em um horário específico.
- Limite operacional de agenda por zona.

Regras principais:

- Capacidade limita agenda e evita overbooking operacional.
- Capacidade não garante existência física de produto.
- Um pedido pode caber na capacidade e ainda assim não poder ser aceito por falta de estoque.
- Um pedido pode ter estoque suficiente e ainda assim não poder ser criado se não houver capacidade.

### 2.3 Diferença Prática Entre Estoque e Capacidade

| Tema | Estoque | Capacidade de entrega |
| --- | --- | --- |
| Pergunta respondida | Existe item físico disponível? | Existe janela operacional para atender? |
| Ownership | Distribuidora | Zona, data, janela e distribuidora |
| Momento crítico | Aceite da distribuidora | Criação/agendamento do pedido |
| Exemplo de bloqueio | Sem garrafão cheio disponível | Agenda lotada para a manhã |
| Fonte do saldo/limite | Movimentos de estoque | Configuração e reservas de capacidade |

Regra de produto: estoque e capacidade devem ser validados em momentos diferentes e não devem substituir um ao outro.

---

## 3. Ownership por Distribuidora

Todo saldo, movimento e sessão de conciliação deve estar associado a uma distribuidora dona do estoque.

### 3.1 Regras de Ownership

- Uma distribuidora só pode operar o próprio estoque.
- Um usuário `distributor_admin` herda o escopo da distribuidora vinculada ao seu usuário.
- O cliente não deve escolher livremente o `distributor_id` para operações de escrita.
- OPS pode consultar dados de todas as distribuidoras no MVP.
- Support não acessa o módulo de estoque no MVP.
- Transferência entre distribuidoras fica fora do MVP.

### 3.2 Exemplos

- Se a Distribuidora A aceita um pedido, a baixa acontece no estoque da Distribuidora A.
- Se a Distribuidora B coleta garrafões vazios, a entrada de retornáveis acontece no estoque da Distribuidora B.
- OPS pode visualizar saldos da Distribuidora A e B, mas não pode ajustar nenhum deles no MVP.

---

## 4. Momento de Compromisso do Estoque

O estoque é comprometido no aceite da distribuidora.

### 4.1 Por Que no Aceite

O pedido pode ser criado antes da distribuidora confirmar disponibilidade física. A reserva de capacidade já limita a agenda, mas a baixa de estoque só deve ocorrer quando a distribuidora assume o pedido.

### 4.2 Regra Principal

Quando a distribuidora aceita um pedido:

1. O sistema identifica os itens do pedido.
2. O sistema mapeia os produtos para itens de estoque.
3. O sistema valida saldo suficiente para todos os itens.
4. Se houver saldo suficiente, cria movimentos de saída e atualiza o saldo.
5. Se faltar saldo em qualquer item, o aceite falha e o pedido não muda para status aceito.

### 4.3 Regras de Consistência

- A baixa de estoque e a mudança de status do pedido devem ocorrer como uma operação única.
- Pedido com múltiplos itens não pode gerar baixa parcial se um item estiver sem saldo.
- Chamada repetida do mesmo aceite não pode duplicar baixa.
- O erro esperado para falta de estoque deve ser claro para operação e frontend, por exemplo `STOCK_UNAVAILABLE`.

---

## 5. Comportamento por Evento de Pedido

### 5.1 Pedido Criado

Regra:

- Não movimenta estoque.
- Pode reservar capacidade, conforme fluxo atual do sistema.
- Continua elegível para pagamento, confirmação e envio à distribuidora conforme regras existentes.

Motivo:

- O estoque físico ainda não foi assumido pela distribuidora.

### 5.2 Pedido Enviado para Distribuidora

Regra:

- Não movimenta estoque.
- Serve como etapa de decisão operacional da distribuidora.

Motivo:

- A distribuidora ainda pode rejeitar o pedido.

### 5.3 Rejeição pela Distribuidora

Regra:

- Rejeição antes do aceite não movimenta estoque.
- O motivo `out_of_stock` pode ser registrado no pedido, mas não gera ajuste automático no estoque.

Motivo:

- Como não houve aceite, nenhum item foi baixado.
- Rejeição por falta de estoque sinaliza indisponibilidade operacional, mas não prova saldo sistêmico incorreto.

### 5.4 Aceite pela Distribuidora

Regra:

- Movimenta estoque com saída dos itens vendáveis.
- Deve validar saldo suficiente antes de aceitar.
- Deve bloquear o aceite quando faltar saldo.

Movimento esperado:

- Tipo funcional: saída por aceite do pedido.
- Referência: pedido aceito.
- Actor: usuário distribuidor ou sistema, conforme origem da ação.

### 5.5 Cancelamento Antes do Aceite

Regra:

- Não movimenta estoque.

Motivo:

- Nenhum item foi comprometido.

### 5.6 Cancelamento Depois do Aceite

Regra:

- Deve devolver saldo quando o item físico ainda retorna ou permanece disponível para a distribuidora.
- Não deve devolver saldo se a operação confirmar que o item não retorna fisicamente ao estoque.
- A devolução não pode ocorrer mais de uma vez para o mesmo pedido/evento.

Movimento esperado quando houver retorno:

- Tipo funcional: retorno por cancelamento pós-aceite.
- Referência: pedido cancelado.
- Metadata recomendada: status anterior, motivo de cancelamento e origem da decisão.

Ponto de atenção:

- Produto já despachado e produto ainda na base podem exigir regras operacionais diferentes.

### 5.7 Despacho e Pedido em Rota

Regra:

- Não gera nova baixa de estoque se a baixa já aconteceu no aceite.
- Pode registrar eventos operacionais de auditoria, mas não altera saldo do item vendável por si só.

Motivo:

- A saída física já foi comprometida no aceite para evitar dupla baixa.

### 5.8 Entrega Concluída

Regra:

- Não gera nova saída de produto vendável se a baixa já aconteceu no aceite.
- Pode gerar entrada de retornáveis quando houver coleta física confirmada.
- Deve preservar os campos legados de troca/coleta enquanto telas antigas dependerem deles.

### 5.9 Falha de Entrega

Regra:

- Falha de entrega só devolve saldo quando houver retorno físico confirmado para a distribuidora.
- Se o produto não voltou fisicamente, o sistema não deve devolver saldo automaticamente.
- A regra operacional deve indicar se a falha representa retorno imediato, tentativa futura, perda ou situação pendente.

Movimento esperado quando houver retorno físico:

- Tipo funcional: retorno por falha de entrega.
- Referência: pedido com falha.
- Metadata recomendada: motivo da falha, status final esperado e indicador de retorno físico.

Ponto de atenção:

- Devolver saldo automaticamente em toda falha pode mascarar perda, extravio ou produto ainda em rota.

### 5.10 Reentrega

Regra:

- Se o produto permaneceu com o motorista ou em rota, não deve haver nova baixa no reagendamento.
- Se houve retorno físico ao estoque e depois nova tentativa, a nova saída deve seguir uma regra explícita de reprocessamento.
- A regra de reentrega deve ser validada antes da implementação do fluxo completo.

Decisão MVP:

- Tratar retorno por falha apenas quando a operação confirmar retorno físico.
- Evitar automatizar reentrega complexa até que o fluxo operacional esteja validado.

---

## 6. Logística Reversa

Logística reversa cobre eventos em que itens retornáveis entram ou deixam de entrar no controle físico da distribuidora.

### 6.1 Coleta de Garrafão Vazio

Regra:

- Quando a entrega registra coleta de vazio, o estoque de retornáveis vazios deve aumentar se o item correspondente existir no catálogo.
- A quantidade coletada deve ser inteira e não negativa.
- A entrada deve referenciar o pedido e o responsável pelo registro.

Metadata recomendada:

- Condição do garrafão.
- Motorista responsável, quando aplicável.
- Origem do registro.
- Observação operacional.

### 6.2 Garrafão Não Coletado

Regra:

- Quando o vazio não é coletado, não deve haver entrada de retornável no estoque.
- O motivo da não coleta deve continuar registrado no pedido conforme fluxo legado.
- O evento pode gerar auditoria, mas não entrada física.

### 6.3 Garrafão Danificado, Sujo ou Inadequado

Regra:

- A condição deve ser registrada para auditoria.
- A entrada em estoque normal ou estoque separado de avaria depende de decisão operacional futura.
- No MVP, se não houver item específico para avaria, registrar a condição em metadata e manter a regra conservadora definida pela operação.

### 6.4 Compatibilidade com Campos Legados

Regra:

- Campos legados de troca e coleta continuam sendo atualizados enquanto telas, relatórios ou rotinas atuais dependerem deles.
- O novo ledger não deve apagar nem reinterpretar histórico legado automaticamente.
- Durante o dual-run, divergências entre legado e novo devem ser analisadas antes de qualquer corte.

---

## 7. Conciliação Física

A conciliação física compara o saldo sistêmico com a contagem real da distribuidora.

### 7.1 Regras Gerais

- A conciliação acontece por sessão.
- Cada sessão pertence a uma distribuidora.
- Ao abrir a sessão, o sistema captura um snapshot do saldo sistêmico por item.
- A contagem física deve informar quantidade inteira e não negativa.
- Divergência exige justificativa.
- Ajuste de saldo só ocorre no fechamento da sessão.
- Sessão fechada não pode ser editada.

### 7.2 Ajustes

Regra:

- Ajustes de conciliação são movimentos de estoque.
- Ajustes não devem editar movimentos anteriores.
- Ajustes devem referenciar a sessão de conciliação.
- OPS visualiza a sessão e os ajustes, mas não fecha ou altera sessões no MVP.

### 7.3 Sessão Aberta

Regra:

- Deve existir no máximo uma sessão aberta por distribuidora.
- Se houver sessão aberta, nova abertura deve ser bloqueada.
- Sessão aberta por tempo excessivo deve ser tratada operacionalmente antes do corte do legado.

---

## 8. Matriz de Papéis

| Papel | Pode consultar próprio estoque | Pode consultar estoque global | Pode carregar saldo inicial | Pode abrir conciliação | Pode fechar conciliação | Pode ajustar saldo diretamente | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `distributor_admin` | Sim | Não | Sim, no escopo da própria distribuidora | Sim | Sim | Não | Opera estoque da própria distribuidora. Ajustes ocorrem por carga inicial ou conciliação. |
| `ops` | Sim, via visão global | Sim | Não no MVP | Não no MVP | Não no MVP | Não | Acompanha, audita e compara distribuidoras. Não altera saldo no MVP. |
| `support` | Não | Não | Não | Não | Não | Não | Não recebe acesso ao módulo de estoque no MVP. |

### 8.1 Regras de Acesso

- `distributor_admin` não pode consultar ou alterar estoque de outra distribuidora.
- `ops` pode visualizar todas as distribuidoras em modo leitura.
- `support` deve receber acesso negado nas rotas e não deve ter item de navegação para estoque.
- A UI pode ocultar ações por papel, mas a segurança real deve ser garantida no backend.

---

## 9. Estratégia de Dual-Run com a Conciliação Legada

Dual-run significa manter o fluxo legado funcionando enquanto o novo módulo coleta dados reais e é validado operacionalmente.

### 9.1 Objetivos do Dual-Run

- Reduzir risco de corte abrupto.
- Comparar resultados entre legado e novo módulo.
- Treinar distribuidoras e OPS no novo fluxo.
- Detectar divergências de regra antes de bloquear a operação.
- Permitir rollback operacional no início do rollout.

### 9.2 O Que Permanece Legado Durante o Dual-Run

- Tela atual de conciliação da distribuidora.
- Campos legados de pedido usados por relatórios ou telas existentes.
- Serviço legado de conciliação enquanto houver dependência operacional.

### 9.3 O Que Entra no Novo Módulo Durante o Dual-Run

- Cadastro de itens de estoque.
- Carga inicial por distribuidora piloto.
- Registro de movimentos derivados de aceite, cancelamento e logística reversa conforme ativação.
- Consulta de saldos pela distribuidora piloto.
- Visão global de OPS.
- Sessões de conciliação novas em ambiente controlado.

### 9.4 Regras de Convivência

- O legado não deve ser apagado no início do rollout.
- O novo módulo não deve tentar reprocessar automaticamente todo o histórico antigo.
- Saldo inicial do novo módulo deve ser informado manualmente e validado pela operação.
- Divergências entre legado e novo devem virar análise operacional, não correção automática.
- Uma distribuidora só deve ter bloqueio por estoque ativado após saldo inicial validado.

---

## 10. Critérios para Ativar Piloto

O piloto deve começar com uma ou poucas distribuidoras controladas.

### 10.1 Pré-Requisitos de Produto e Operação

- Distribuidora piloto escolhida e comunicada.
- Responsável operacional definido.
- Lista de itens controlados validada.
- Saldo físico inicial contado e aprovado.
- Treinamento básico realizado com distribuidor e OPS.
- Canal de suporte definido para incidentes do piloto.

### 10.2 Pré-Requisitos Técnicos

- Migration aplicada com sucesso no ambiente alvo.
- Prisma Client gerado e backend implantado.
- Rotas de distribuidora protegidas por role.
- Rotas OPS em modo leitura protegidas por role.
- Saldo inicial registrado via fluxo auditável.
- Aceite com saldo suficiente validado.
- Aceite sem saldo validado.
- Conciliação nova validada em cenário sem divergência e com divergência.
- Logs e auditoria mínimos disponíveis para investigação.

### 10.3 Critérios de Aprovação do Piloto

- Distribuidora piloto consegue consultar saldo atual.
- OPS consegue visualizar saldos e movimentos da distribuidora piloto.
- Pedidos com saldo suficiente são aceitos sem regressão operacional.
- Pedidos sem saldo são bloqueados de forma clara.
- Cancelamento pós-aceite não duplica devolução de saldo.
- Logística reversa não gera entrada indevida quando não há coleta.
- Conciliação nova fecha sessão e registra ajuste rastreável.
- Nenhum vazamento de dados entre distribuidoras é identificado.

### 10.4 Critérios de Pausa ou Rollback do Piloto

- Saldo inicial incorreto sem correção auditável.
- Bloqueio indevido de pedidos com saldo físico disponível.
- Baixa duplicada de estoque em aceite repetido.
- Devolução duplicada em cancelamento ou falha.
- OPS ou support com permissão indevida.
- Divergência recorrente sem explicação operacional.
- Impacto relevante no fluxo de pedidos da distribuidora piloto.

---

## 11. Critérios para Cortar o Legado

O corte do legado só deve acontecer depois de estabilidade operacional do novo módulo.

### 11.1 Critérios Mínimos

- Todas as distribuidoras no escopo têm saldo inicial validado.
- O novo ledger registra movimentos dos fluxos críticos sem duplicidade conhecida.
- A conciliação por sessão foi usada com sucesso por distribuidoras piloto.
- OPS consegue auditar saldos, movimentos e sessões sem depender do legado.
- Relatórios ou telas que dependiam de campos legados foram migrados ou aceitos como históricos.
- Time de operação aprovou o fluxo novo.
- Existe plano de suporte para divergências pós-corte.

### 11.2 Opções de Corte

| Opção | Descrição | Quando usar |
| --- | --- | --- |
| Legado como histórico | Mantém telas antigas apenas para consulta | Quando ainda há necessidade de referência passada |
| Redirect gradual | Encaminha usuários para a nova tela, preservando acesso controlado ao legado | Quando o novo fluxo já cobre operação diária |
| Remoção posterior | Remove fluxo legado em release futura | Quando não há dependência técnica ou operacional |

### 11.3 O Que Não Fazer no Corte

- Não apagar dados legados sem política de retenção.
- Não inferir saldo novo a partir de histórico antigo sem validação manual.
- Não liberar ajuste direto de saldo para OPS como atalho de correção.
- Não cortar legado se a distribuidora ainda não usa conciliação nova com segurança.

---

## 12. Decisões Confirmadas

- Estoque é diferente de capacidade de entrega.
- Estoque pertence sempre a uma distribuidora.
- O compromisso de estoque acontece no aceite da distribuidora.
- Rejeição antes do aceite não movimenta estoque.
- Cancelamento pós-aceite pode devolver saldo quando houver retorno físico ou disponibilidade preservada.
- Falha de entrega só devolve saldo quando houver retorno físico confirmado.
- Logística reversa registra entrada apenas quando houver coleta física aplicável.
- `distributor_admin` opera o próprio estoque.
- `ops` tem visão global read-only no MVP.
- `support` não acessa estoque no MVP.
- O legado permanece ativo durante dual-run.
- O saldo inicial do novo módulo deve ser manual e auditável.

---

## 13. Pontos que Exigem Confirmação Operacional

Algumas decisões podem afetar regras futuras e devem ser validadas antes de escalar o módulo.

- Em quais casos exatos uma falha de entrega significa retorno físico imediato?
- Como tratar produto que fica com motorista para reentrega no mesmo dia?
- Garrafão danificado entra como retornável normal, avaria separada ou apenas metadata no MVP?
- Quem na operação aprova correção de saldo inicial incorreto?
- Por quanto tempo uma sessão de conciliação pode ficar aberta?
- Qual métrica define estabilidade suficiente para cortar o legado?

---

## 14. Checklist de Aceite Funcional

- Estoque e capacidade estão descritos como conceitos separados.
- Ownership por distribuidora está definido.
- Momento de compromisso no aceite está definido.
- Rejeição antes do aceite não movimenta estoque.
- Cancelamento pós-aceite tem regra de devolução documentada.
- Falha de entrega tem regra conservadora baseada em retorno físico.
- Logística reversa diferencia coleta e não coleta.
- Matriz de papéis cobre `distributor_admin`, `ops` e `support`.
- Dual-run com legado está definido.
- Critérios de piloto estão definidos.
- Critérios de pausa/rollback do piloto estão definidos.
- Critérios para cortar legado estão definidos.
- Pontos que exigem confirmação operacional estão destacados.

---

## 15. Fora do Escopo do MVP

- Transferência entre distribuidoras.
- Aprovação de ajuste por OPS.
- Edição direta de saldo.
- Reprocessamento automático de histórico legado.
- Forecast de demanda.
- Alertas ativos por push, e-mail ou WhatsApp.
- Integração com ERP externo.
