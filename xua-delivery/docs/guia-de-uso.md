# Guia de Uso — Agentes e Documentação do Xuá Delivery

> Manual prático de como trabalhar neste projeto com o Claude Code: quando usar cada agente, como pedir tasks, e como manter a documentação viva. Última atualização: 07/07/2026.

---

## 1. Visão geral do que você tem

| Recurso | Onde está | Para quê |
|---|---|---|
| **12 agentes especializados** | `.claude/agents/` (nucleo/, camadas/, dominios/) | Especialistas permanentes que conhecem as regras do projeto |
| **Árvore de contexto** | `xua-delivery/docs/doc_contexto/` (01→04) | Resumo consolidado e verificado do sistema |
| **Docs do sistema** | `xua-delivery/docs/doc_sistema/` | Detalhe profundo (schema, fluxos, guia técnico) |
| **Docs de desenvolvimento** | `xua-delivery/docs/doc_desenvolvimento/` | Histórico de features (caução, assinaturas, filas) |

Os agentes **leem sozinhos** a documentação e o código — você não precisa colar contexto na conversa.

---

## 2. As 3 formas de usar os agentes

### Forma 1 — Citar o agente (recomendado para tasks importantes)

Escreva o nome do agente no pedido:

```
Use o xua-pedidos: quero adicionar um campo de observação
do cliente que o motorista vê na entrega
```

```
xua-qualidade, revise o diff da branch atual
```

```
Peça ao xua-banco-dados para criar uma tabela de cupons de desconto
```

### Forma 2 — Pedir normalmente (delegação automática)

Descreva a task; o Claude identifica o agente certo pela descrição:

```
O webhook do Mercado Pago está processando duas vezes o mesmo pagamento
```
→ roteia sozinho para o `xua-pagamentos`.

### Forma 3 — Feature completa (orquestração em sequência)

Para algo que atravessa vários domínios, peça o fluxo inteiro:

```
Implemente cupom de desconto no checkout seguindo o fluxo dos agentes:
arquiteto valida → banco cria a migration → backend implementa →
frontend faz a tela → qualidade revisa → docs atualiza
```

Ou simplesmente: *"Implemente a feature X seguindo o fluxo padrão dos agentes"* — a sequência está no [README dos agentes](../../.claude/agents/README.md).

---

### Forma 4 — `/nova-task` (o "gem" do projeto)

Digite `/nova-task` + o pedido em linguagem natural:

```
/nova-task preciso criar uma função que aplique desconto progressivo
por quantidade de garrafões no carrinho
```

O comando faz o trabalho de engenharia de prompt por você:
1. **Situa o pedido** no `04-active-state.md` (já está no backlog? conflita com decisão registrada?)
2. **Gera o prompt estruturado** com dados reais: agentes na ordem certa, escopo, restrições da arquitetura que se aplicam, verificação
3. **Registra a task na §2 do 04-active-state** (nada se perde) e pergunta: executar agora ou só entregar o prompt?

Use quando o pedido é maior que um ajuste e você quer o prompt "profissional" sem escrevê-lo manualmente. Definição em `.claude/commands/nova-task.md`.

## 3. Qual agente usar? (tabela de roteamento)

| Sua task envolve... | Chame |
|---|---|
| "Como estruturar isso?" / módulo novo / trade-off | `xua-arquiteto` |
| Endpoint, service, middleware, validação | `xua-backend` |
| Tela, componente, store, PWA, UX | `xua-frontend` |
| Tabela, campo, enum, migration, índice | `xua-banco-dados` |
| Pedido: criar, aceitar, despachar, entregar, OTP | `xua-pedidos` |
| Cobrança, webhook, refund, config Mercado Pago | `xua-pagamentos` |
| Planos, contratação, geração automática de pedidos | `xua-assinaturas` |
| Vasilhames, caução, estoque, reconciliação | `xua-estoque-caucao` |
| Login, senha, permissões, segredos, LGPD | `xua-seguranca` |
| Revisar código, escrever testes, refatorar, lentidão | `xua-qualidade` |
| Deploy, fila, job agendado, Redis, logs | `xua-devops` |
| Atualizar documentação | `xua-docs` |

**Na dúvida entre dois:** comece pelo agente de **domínio** (pedidos/pagamentos/assinaturas/estoque) se a task tem regra de negócio; pelo de **camada** (backend/frontend/banco) se é puramente técnica.

---

## 4. Receitas prontas (copie e adapte)

### Corrigir um bug
```
xua-pedidos: pedidos rejeitados pelo distribuidor não estão
aparecendo com o motivo na tela do consumidor. Investigue e corrija.
```

### Criar uma feature pequena (1 domínio)
```
xua-assinaturas: quero permitir que o cliente adie todas as
entregas futuras da assinatura em 7 dias de uma vez.
```

### Criar uma feature grande (vários domínios)
```
Quero implementar cupom de desconto. Comece pelo xua-arquiteto
para validar a abordagem e siga o fluxo padrão até o xua-docs.
```

### Revisar antes de commitar
```
xua-qualidade: revise minhas alterações locais antes do commit.
```

### Revisão de segurança
```
xua-seguranca: revise o endpoint novo de exportação de dados
que criei em apps/api/src/modules/ops.
```

### Depois de terminar qualquer entrega
```
xua-docs: atualize a documentação com o que foi entregue hoje.
```

### Investigar sem mexer em nada
```
xua-arquiteto: explique como funciona hoje o fluxo de compensação
de assinaturas e onde ele poderia falhar. Só análise, não altere nada.
```

---

## 5. O fluxo padrão de uma feature (do zero ao commit)

```
1. PLANEJAR    xua-arquiteto valida a abordagem (só para mudanças estruturais)
2. BANCO       xua-banco-dados cria migration (só se precisar de tabela/campo)
3. IMPLEMENTAR agente de domínio (regra de negócio) e/ou
               xua-backend (API) + xua-frontend (tela)
4. SEGURANÇA   xua-seguranca revisa SE: endpoint sensível, segredo, pagamento
5. QUALIDADE   xua-qualidade revisa o diff e garante testes verdes
6. DOCS        xua-docs atualiza doc_contexto/04-active-state.md e docs afetados
7. COMMIT      você revisa e commita
```

Etapas 1, 2 e 4 são condicionais — task pequena pula direto para a 3.

**Dica:** use o modo Plan (Shift+Tab no Claude Code) para features grandes — o Claude explora e apresenta o plano antes de tocar em qualquer arquivo.

---

## 6. Como usar a documentação

### Ordem de leitura para (re)entrar no projeto
1. `doc_contexto/01-blueprint.md` — o que é o sistema e quem usa
2. `doc_contexto/02-tech-stack.md` — stack e regras de arquitetura
3. `doc_contexto/03-domain-data.md` — banco, estados do pedido, rotas
4. `doc_contexto/04-active-state.md` — o que está pronto, o que falta, débitos

### Quando precisar de profundidade
- Todos os campos de uma tabela → `doc_sistema/banco-de-dados.md`
- Jornada de uma persona / rota de tela → `doc_sistema/fluxo-usuarios.md`
- Por que a caução funciona assim → `doc_desenvolvimento/caucao-vasilhames.md`
- História da correção das assinaturas → `doc_desenvolvimento/assinaturas-fases-1-2.md`

### Regra de ouro
**A doc segue o código.** Se encontrar divergência, o código vence — peça ao `xua-docs` para corrigir a doc, nunca "corrija" o código para bater com a doc.

---

## 7. Onde entra a qualidade do código

A qualidade atua em **três camadas** — não é uma etapa isolada no fim:

### Camada 1 — Preventiva (dentro de cada agente)
Todos os 12 agentes carregam "Princípios obrigatórios" (Clean Code, SOLID, DRY, KISS, YAGNI, sem dead code, sem gambiarras) e a regra de **imitar o código vizinho** antes de criar algo novo. O `xua-backend` já escreve no padrão do módulo ao lado; o `xua-pedidos` já entrega o teste da transição alterada. A maior parte da qualidade acontece na escrita.

### Camada 2 — Verificação (o portão do `xua-qualidade`)
Antes do commit, ele aplica o checklist de 7 itens na ordem:
correção → contratos → padrões do projeto → segurança → qualidade → testes (`npx vitest run` no módulo) → performance (N+1 do Prisma, índices, queries de auditoria sem filtro de período).

### Camada 3 — Ferramentas nativas do Claude Code
Comandos que funcionam independentemente dos agentes:
- `/code-review` — revisão do diff da branch, achados verificados
- `/simplify` — limpeza do código alterado (reuso, simplificação)
- `/security-review` — revisão de segurança das mudanças pendentes

**Na prática:** task pequena → a camada 1 basta · antes de commitar algo relevante → `xua-qualidade` ou `/code-review` · manutenção periódica → `/simplify`.

---

## 8. Como trabalhar com o `04-active-state.md`

É o **quadro Kanban do projeto em Markdown** — o único arquivo de doc pensado para mudar toda semana. Estrutura: §1 implementado · §2 próximos passos · §3 débitos técnicos.

### O ciclo

```
INÍCIO DA SESSÃO           DURANTE A SESSÃO              FIM DA ENTREGA
Leio a §2 para saber       Ideia/débito novo surge   →   xua-docs move o item
o que fazer a seguir       registro na hora (1 linha)    da §2 para a §1 + data
```

### Os 3 movimentos

**Puxar trabalho** — use o arquivo como backlog:
```
Pegue o próximo item da seção 2 do 04-active-state e implemente.
```

**Registrar sem interromper** — notou algo no meio de outra task:
```
Adicione ao 04-active-state: o endpoint de exportação está sem rate limit.
```

**Fechar entrega** — ao final de qualquer trabalho:
```
xua-docs: atualize o 04-active-state com o que foi entregue hoje.
```

### Regras do arquivo

1. **Se não está no 04, não existe.** Decisão de negócio tomada em conversa, débito aceito, item despriorizado — tudo vira linha, senão se perde entre sessões.
2. **Itens concluídos ganham data e referência** (commit/migration) — é o que torna a §1 confiável como histórico.
3. **Débito registrado ≠ débito aceito para sempre.** Revise a §3 periodicamente: peça *"quais débitos do 04 valem atacar agora?"*.
4. **Não vira diário.** Uma linha objetiva por item; detalhes moram no doc da feature em `doc_desenvolvimento/`.

---

## 9. Manutenção do sistema de agentes

### Criar um agente novo
1. Escolha a categoria: `nucleo/` (transversal), `camadas/` (camada técnica) ou `dominios/` (regra de negócio).
2. Crie `.claude/agents/<categoria>/xua-<nome>.md` seguindo o template de 9 seções descrito no [README dos agentes](../../.claude/agents/README.md).
3. Adicione a linha na tabela de roteamento do README.

Atalho: peça ao Claude — *"Crie um agente xua-roteirizacao seguindo o padrão dos existentes"*.

### Atualizar um agente existente
Quando uma regra de negócio mudar (ex.: política de retry das assinaturas), atualize o agente dono da regra no mesmo PR. O agente desatualizado é pior que nenhum agente.

### O que NÃO fazer
- Não duplique conhecimento entre agentes — cada regra tem um dono; os outros referenciam.
- Não crie agente para task pontual — agente é para conhecimento permanente.
- Não edite as seções "Nunca deve modificar" para contornar uma restrição — elas existem porque algo já quebrou ou pode quebrar (ex.: a atomicidade da geração de assinaturas corrige uma falha crítica real).

---

## 10. Perguntas frequentes

**Preciso citar o agente sempre?**
Não. Para tasks rotineiras, descreva o problema e a delegação é automática. Cite quando quiser garantir o especialista certo em mudanças críticas (pagamento, estados do pedido, schema).

**Vejo agentes que não criei (Explore, Plan, general-purpose)...**
São ferramentas embutidas do Claude Code, não arquivos seus. Convivem com os `xua-*` sem conflito: os embutidos fazem mecânica (explorar, planejar), os seus carregam o conhecimento do projeto.

**Posso usar dois agentes ao mesmo tempo?**
Sim — peça, por exemplo: *"xua-backend implementa o endpoint enquanto o xua-frontend prepara a tela"*. Para dependências (migration antes do service), o fluxo é sequencial.

**O agente pode recusar algo que pedi?**
Ele vai sinalizar quando o pedido violar uma regra inviolável (ex.: editar saldo de caução sem movimento) e propor o caminho correto ou escalar a decisão para você. Isso é o comportamento desejado.

**Como sei se a documentação está atualizada?**
Todo doc tem rodapé "Última atualização". O `04-active-state.md` deve refletir a última entrega; se não refletir, rode o `xua-docs`.
