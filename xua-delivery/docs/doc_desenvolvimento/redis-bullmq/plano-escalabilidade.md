# Plano logico de evolucao para Redis, filas e escala

## Objetivo

Este documento nao e um plano passo a passo. Ele descreve a logica de evolucao da arquitetura atual para um nivel de escala mais seguro, previsivel e sustentavel, usando Redis como infraestrutura de coordenacao e performance, sem transformar Redis em fonte primaria de verdade de negocio.

O alvo e manter o sistema atual como um monolito bem organizado, com capacidade de crescer por fases, sem reescrita ampla e sem migracao prematura para microservicos.

## Leitura do estado atual

> **Revisado em 13/07/2026** — a leitura original (rate limiter desconectado, jobs internos no mesmo processo, cache só em products/banners, Fase 3 futura) ficou obsoleta e foi substituída pelo estado abaixo.

Estado verificado no código em 13/07/2026:

- **duas instâncias Redis com responsabilidades isoladas** (implementado em 13/07/2026): cache best-effort (`CACHE_REDIS_URL`, singleton em apps/api/src/infra/redis/client.ts) e fila BullMQ (`QUEUE_REDIS_URL`, factory em apps/api/src/infra/queue/connection.ts); resolução de URL com fallback `REDIS_URL` em apps/api/src/infra/redis/config.ts
- cache em products, banners **e categories** (apps/api/src/modules/{products,banners,categories}/services)
- blacklist JWT em apps/api/src/infra/auth/blacklist.ts
- rate limiter **conectado e em uso** (apps/api/src/infra/rate-limit/limiter.ts, fail-open em falha de Redis) — middleware aplicado nas rotas de auth, orders, payments, products, categories e banners
- **worker separado** (`xua-worker` no render.yaml) com 5 filas ativas: internal-jobs, payment-webhooks, payments, payment-refunds, subscription-expiration; jobs recorrentes via BullMQ Job Schedulers em apps/api/src/worker/register-repeatable-jobs.ts (crons do Render substituídos)
- **Fase 3 deste plano (pagamentos e webhooks fora do caminho síncrono) já implementada**: webhook grava, deduplica e enfileira; worker processa pagamento, expiração e reembolso com retry e idempotência
- gateway Socket.IO ainda sem adapter Redis em apps/api/src/infra/socket/gateway.ts (Fase 4, pendente)

Esse estado permite evoluir sem trocar a base inteira.

## Principios arquiteturais

1. PostgreSQL continua sendo a fonte primaria de verdade para pedidos, pagamentos, auditoria e estado de negocio.
2. Redis nao deve ser a verdade do dominio. Ele deve servir para cache, fila, locks, rate limit e coordenacao.
3. Cache deve ser best effort. Se Redis de cache falhar, a API deve continuar funcional com degradacao controlada.
4. Fila deve ser usada apenas para trabalho assincrono, lento, externo ou sujeito a retry.
5. Processo web e processo worker devem ser separados, mesmo que morem no mesmo repositorio.
6. Pagamento, webhook, notificacao e integracoes externas devem sair do caminho sincrono do request principal.
7. Escala horizontal so deve ser aberta depois que fila, idempotencia e observabilidade estiverem maduras.
8. Redis de cache e Redis de fila nao devem ser tratados como a mesma preocupacao operacional.

## Anti-objetivos

1. Nao transformar o sistema em microservicos agora.
2. Nao mover estado definitivo de pedido ou pagamento para Redis.
3. Nao misturar fila critica com cache descartavel na mesma politica operacional sem controle.
4. Nao espalhar BullMQ pela camada de dominio. A fila deve ficar atras de uma camada de orquestracao.
5. Nao usar Redis para esconder gargalos de modelagem ou de query sem antes identificar onde esta o custo real.

## Estrutura ideal de fases

A evolucao ideal para o codigo atual cabe em 6 fases logicas. O modo plan deve quebrar cada fase em poucos planos executaveis, mantendo escopo controlado e validacao objetiva.

### Fase 0 - Guardrails de arquitetura

#### Foco logico

Definir contratos e limites antes de introduzir fila de verdade. Esta fase existe para impedir que Redis e BullMQ entrem no sistema como dependencia difusa.

#### Resultado esperado

- separacao conceitual entre Redis de cache e Redis de fila
- contratos claros de produtor, consumidor, idempotencia e retry
- naming de chaves e naming de filas por ambiente
- readiness e health com semantica correta para cache versus fila

#### Quantidade ideal de planos para o modo plan

2 planos.

#### Macrofrentes desta fase

- contrato de conexoes Redis e politica por ambiente
- contrato de observabilidade, naming, erro e fallback

#### Criterios de saida

- o sistema sabe diferenciar o que e cache opcional do que e fila operacional
- as futuras mudancas ja tem um envelope arquitetural definido

### Fase 1 - Redis como camada de performance opcional

#### Foco logico

Transformar o uso atual de Redis em algo seguro para producao, sem deixar cache e estado efemero derrubarem a API principal.

#### Resultado esperado

- cache com fallback para banco nas leituras quentes
- chaves prefixadas por ambiente e contexto
- dependencia de cache removida do caminho critico quando possivel
- comportamento de falha de Redis conhecido e controlado

#### Quantidade ideal de planos para o modo plan

3 planos.

#### Macrofrentes desta fase

- endurecimento do cliente Redis atual e separacao por finalidade
- revisao de products, banners, OTP e readiness para degradacao segura
- telemetria minima de hit, miss, falha e latencia de cache

#### Criterios de saida

- Redis de cache pode falhar sem parar o fluxo principal de leitura
- a API continua funcional mesmo com indisponibilidade parcial do cache

### Fase 2 - Camada assincrona com BullMQ e worker dedicado

#### Foco logico

Introduzir fila de verdade sem alterar ainda o coracao do dominio. O objetivo e criar a fundacao operacional para processar trabalho fora do request/response.

#### Resultado esperado

- um processo worker separado do processo web
- camada de enfileiramento desacoplada da regra de negocio
- retries, backoff e filas falhas modelados desde o inicio
- primeiros jobs de baixo risco rodando em worker

#### Quantidade ideal de planos para o modo plan

3 planos.

#### Macrofrentes desta fase

- infraestrutura BullMQ e contrato de enfileiramento
- worker process e deploy separado
- migracao inicial de jobs internos simples para fila

#### Criterios de saida

- existe um caminho padrao para criar job, processar job e observar job
- o sistema deixa de depender apenas de cron e processo web para trabalho assincrono

### Fase 3 - Pagamentos e webhooks fora do caminho sincrono

#### Foco logico

Mover o fluxo financeiro e de integracao externa para o modelo inbox + fila + worker + idempotencia. Esta e a fase que realmente altera o perfil de escalabilidade do backend.

#### Resultado esperado

- webhook grava, confirma recebimento e enfileira rapido
- worker processa pagamentos e webhooks com retry e dedupe
- conciliacao fica desacoplada do request HTTP
- operacoes externas deixam de bloquear o node web

#### Quantidade ideal de planos para o modo plan

4 planos.

#### Macrofrentes desta fase

- inbox de webhooks e semantica de reprocessamento
- fila de pagamentos, fila de webhook e fila de conciliacao
- politicas de idempotencia, retry, DLQ e replay manual
- observabilidade financeira e operacao assistida

#### Criterios de saida

- nenhum webhook critico depende de processamento pesado dentro da rota HTTP
- pagamentos possuem protecao contra duplicidade, reorder e timeout do provedor

### Fase 4 - Escala horizontal, realtime e isolamento operacional

#### Foco logico

Abrir o sistema para mais de uma instancia web sem quebrar Socket.IO, jobs ou semantica de estado.

#### Resultado esperado

- API pode ser replicada horizontalmente
- eventos realtime funcionam entre multiplas instancias
- concorrencia de workers pode ser afinada por fila
- operacao ja tem visibilidade de throughput, atraso e falha

#### Quantidade ideal de planos para o modo plan

3 planos.

#### Macrofrentes desta fase

- adapter Redis para Socket.IO e politica de sessao
- tuning de concorrencia do worker por fila e por tipo de job
- readiness, deploy e rollback para multiplas instancias

#### Criterios de saida

- duas ou mais instancias web entregam o mesmo comportamento funcional
- filas e eventos nao dependem de um unico processo vivo

### Fase 5 - Otimizacao governada por evidencia

#### Foco logico

Apenas depois de tudo acima, otimizar o que realmente doer. Esta fase evita que Redis vire resposta generica para qualquer problema de performance.

#### Resultado esperado

- cache adicional somente para consultas comprovadamente caras
- locks distribuidos apenas onde houver disputa real
- particionamento por fila e por prioridade baseado em volume real
- decisoes de escala sustentadas por metrica, nao por intuicao

#### Quantidade ideal de planos para o modo plan

2 planos.

#### Macrofrentes desta fase

- otimizacao de leituras e hotspots reais
- refinamento operacional de filas, limites e prioridades

#### Criterios de saida

- cada uso novo de Redis existe por necessidade medida
- a arquitetura evolui sem entropia operacional

## Implementacao BullMQ por partes

Esta secao existe para deixar explicito o que significa implementar BullMQ de forma completa e correta no contexto deste sistema. O objetivo nao e listar comandos ou ordem exata de edicao, e sim garantir que o modo plan enxergue todas as partes obrigatorias da solucao, sem reduzir BullMQ a apenas instalar biblioteca e subir um worker.

### Parte 1 - Fundacao de conexao e isolamento de responsabilidade

#### Escopo logico

- conexao BullMQ separada da conexao de cache
- definicao de QUEUE_REDIS_URL, prefixo por ambiente e politica de naming
- modulo unico de bootstrap de fila
- convencao de nomes de filas, jobs e payloads

#### O que precisa existir

- um modulo de conexao para fila distinto do cliente Redis de cache
- uma camada central que saiba instanciar Queue, Worker e QueueEvents
- nomenclatura padronizada para todas as filas do sistema

#### O que nao deve acontecer

- services de dominio criando Queue diretamente
- uso ad hoc de conexao Redis de cache para processamento de fila
- nomes de fila e job espalhados em controllers e services

#### Validacao desta parte

- o sistema consegue subir conexao de fila independentemente do cache
- existe um ponto unico para definir prefixo, filas e opcoes padrao

### Parte 2 - Contrato de jobs e borda de enfileiramento

#### Escopo logico

- definicao tipada dos payloads de job
- fronteira clara entre dominio e orquestracao assincrona
- produtores de job encapsulados em modulo proprio

#### O que precisa existir

- contratos de payload por fila
- metadados minimos por job, como job name, correlation id, source e tenant ou ambiente quando necessario
- uma API interna de enfileiramento usada pela aplicacao

#### O que nao deve acontecer

- controllers montando payload arbitrario de job sem contrato
- BullMQ acoplado diretamente ao dominio de pedido, pagamento ou auth

#### Validacao desta parte

- a camada de negocio consegue pedir enfileiramento sem conhecer detalhes de BullMQ
- payload invalido e rejeitado antes de chegar ao Redis

### Parte 3 - Processo worker separado e ciclo de vida operacional

#### Escopo logico

- criacao de processo worker separado do processo web
- bootstrap proprio, graceful shutdown, logs e sinais de vida
- deploy separado no mesmo repositorio

#### O que precisa existir

- entrypoint dedicado de worker
- registro dos processors no boot do worker
- encerramento limpo ao receber sinal de parada
- readiness e health especificos do worker

#### O que nao deve acontecer

- processamento de fila dentro do mesmo processo que atende HTTP como regra geral
- worker sem shutdown limpo ou sem fechamento de conexoes

#### Validacao desta parte

- web sobe sem worker
- worker sobe sem servidor HTTP
- job produzido pela aplicacao e consumido por processo separado

### Parte 4 - Processors, orquestracao e idempotencia

#### Escopo logico

- implementacao dos consumers reais
- leitura do job, execucao da regra aplicavel e persistencia correta
- idempotencia e lock onde o efeito colateral exigir

#### O que precisa existir

- processors por fila ou por tipo de job
- adaptadores para chamar services de dominio sem duplicar regra
- estrategia de idempotencia por payment, webhook ou operacao critica
- separacao entre erro transitorio e erro terminal

#### O que nao deve acontecer

- processor com regra de negocio duplicada do service principal
- processamento sem chave de dedupe em operacoes financeiras
- mistura de multiplos efeitos colaterais sem fronteira transacional clara

#### Validacao desta parte

- mesmo job reenviado nao duplica efeito de negocio
- falha no meio do processor nao deixa estado irreconciliavel silenciosamente

### Parte 5 - Retry, backoff, fila de falha e replay

#### Escopo logico

- tratamento operacional de falhas normais de integracao
- retries automaticos com limites claros
- destino explicito para erro terminal
- caminho de replay e reprocessamento assistido

#### O que precisa existir

- configuracao por fila para attempts, backoff e remocao de jobs concluidos
- tratamento de jobs falhos com observabilidade suficiente
- estrategia de DLQ ou fila de falha equivalente
- contrato de replay manual para operacao e suporte

#### O que nao deve acontecer

- retry infinito
- erro fatal sendo mascarado como sucesso parcial
- perda de job falho sem trilha operacional

#### Validacao desta parte

- falha transitoria volta a funcionar sem reprocesso manual
- erro terminal fica visivel e reexecutavel com seguranca

### Parte 6 - Observabilidade de fila e operacao diaria

#### Escopo logico

- visibilidade do que entra, do que sai e do que trava
- metricas para backlog, throughput, tempo de espera e falha
- logs e correlacao entre request, job e efeito persistido

#### O que precisa existir

- logs estruturados com correlation id e nome do job
- metricas de fila por tipo de workload
- evento ou trilha de status do job relevante para suporte e depuracao

#### O que nao deve acontecer

- fila operando como caixa preta
- time sem saber diferenciar worker parado de provider lento

#### Validacao desta parte

- a equipe consegue responder qual fila esta atrasada, qual job falhou e por que
- existe base observavel para decidir concorrencia e prioridade

### Parte 7 - Integracao progressiva com o codigo atual

#### Escopo logico

Aplicar BullMQ no sistema em fatias de risco crescente, sem comecar pelo trecho mais delicado.

#### Ordem logica ideal de adocao

1. jobs internos e notificacoes
2. tarefas externas nao financeiras
3. webhook ingress e processamento assincrono
4. pagamentos, conciliacao e retentativas do provider

#### Justificativa

- o sistema aprende a operar worker antes de tocar fluxo financeiro
- o contrato de fila amadurece antes de virar parte do caminho critico de pagamento
- a equipe ganha observabilidade e confianca antes da fase mais sensivel

#### Validacao desta parte

- cada degrau novo de BullMQ entra com teste e operacao dominados na fatia anterior

### Parte 8 - Definicao do que e implementacao BullMQ completa

No contexto deste sistema, BullMQ so deve ser considerado implementado de forma completa quando todos os itens abaixo existirem de forma coerente:

1. conexao de fila separada da conexao de cache
2. contratos de job tipados e centralizados
3. produtores encapsulados atras de modulo proprio
4. processo worker separado e operavel
5. processors idempotentes e observaveis
6. retries, backoff e fila de falha configurados
7. metricas, logs e correlacao de job disponiveis
8. pelo menos um fluxo real de negocio fora do request HTTP, validado ponta a ponta

Se apenas Queue e Worker existirem, mas sem contrato, sem operacao e sem idempotencia, a implementacao ainda estara incompleta.

## Quantidade total ideal de planos executaveis

Para o codigo atual, o ideal e que o modo plan gere entre 15 e 17 planos executaveis ao todo, distribuidos entre as 6 fases.

Faixas seguras:

- menos de 12 planos tende a juntar mudanca demais por bloco
- mais de 18 planos tende a fragmentar demais e aumentar custo de coordenacao

Distribuicao recomendada:

- Fase 0: 2 planos
- Fase 1: 3 planos
- Fase 2: 3 planos
- Fase 3: 4 planos
- Fase 4: 3 planos
- Fase 5: 2 planos

Se for necessario comprimir, a Fase 5 pode ser absorvida pela Fase 4. Se for necessario expandir, a Fase 3 e a fase mais segura para receber subdivisao extra.

## Como o modo plan deve transformar este documento em execucao

O modo plan deve usar este documento como base e converter cada fase em planos executaveis com estas caracteristicas:

1. Cada plano deve alterar uma unica fatia coerente de comportamento.
2. Cada plano deve apontar os anchors de codigo provaveis antes de propor edicao.
3. Cada plano deve conter validacao executavel objetiva.
4. Cada plano deve explicitar risco de rollout e criterio de reversao.
5. Nenhum plano deve misturar cache, fila e pagamento se isso impedir validacao isolada.
6. Nenhuma fase deve avancar sem satisfazer os criterios de saida da fase anterior.

Formato ideal para o modo plan:

- objetivo do plano
- arquivos e modulos alvo
- comportamento esperado apos a mudanca
- validacao minima
- risco conhecido
- pre-condicao para o proximo plano

## Estrategia de testes

A evolucao so e segura se o teste acompanhar a arquitetura. O modo plan deve gerar trabalho com cobertura em cinco niveis.

### 1. Testes de contrato e unidade

Foco:

- idempotencia
- mapping de status
- contratos de produtor e consumidor
- serializacao de payload de job
- fallback de cache

O que deve provar:

- regras puras continuam corretas sem Redis real
- as interfaces de fila nao vazam detalhes de BullMQ para o dominio

### 2. Testes de integracao com Redis e banco

Foco:

- producer -> Redis -> worker -> persistencia
- retries e backoff
- dead letter path
- dedupe e lock

O que deve provar:

- o job sai da API, entra na fila e gera efeito persistido correto
- falha intermitente nao corrompe estado

### 3. Testes de falha controlada

Foco:

- Redis de cache fora do ar
- Redis de fila indisponivel
- worker parado
- worker reiniciado no meio do processamento
- webhook duplicado, fora de ordem ou replayado

O que deve provar:

- a API degrada com previsibilidade
- jobs nao geram efeitos duplicados de negocio
- o sistema tem comportamento observavel e recuperavel

### 4. Testes de smoke e carga leve

Foco:

- pico pequeno, mas realista, de operacoes simultaneas
- latencia do request com e sem cache
- backlog pequeno de fila
- tempo medio de processamento do worker

O que deve provar:

- o sistema continua responsivo sob carga moderada
- o worker absorve latencia externa sem bloquear o node web

### 5. Testes de operacao e rollout

Foco:

- deploy com worker separado
- rollback sem perda de estado critico
- filas pausadas, retomadas e reprocessadas
- leitura de metricas e inspecao de backlog

O que deve provar:

- a equipe consegue operar a arquitetura nova sem improviso

## Matriz de validacao por fase

### Fase 0

- validar naming de envs, chaves e filas
- validar semantica de health e readiness
- validar politicas de fallback e criticidade

### Fase 1

- simular Redis de cache indisponivel
- provar que catalogo e banners continuam respondendo
- medir hit rate e latencia apos cache

### Fase 2

- produzir job e observar consumo por worker real
- provar retry e fila de falha
- subir e derrubar worker sem perda silenciosa de job

### Fase 3

- replay de webhook
- webhook fora de ordem
- timeout do provedor
- reprocessamento manual e conciliacao

### Fase 4

- duas instancias web com mesmo Redis de fila e adaptador realtime
- emissao de evento Socket.IO cruzando instancias
- ajuste de concorrencia do worker sem quebrar idempotencia

### Fase 5

- decidir novas otimizacoes apenas com metrica em maos
- revisar se algum uso de Redis pode ser removido em vez de ampliado

## Decisoes operacionais recomendadas

1. Definir CACHE_REDIS_URL e QUEUE_REDIS_URL separadamente, mesmo que inicialmente apontem para o mesmo provedor. **✅ IMPLEMENTADA em 13/07/2026** — instâncias separadas no render.yaml (`xua-redis` volatile-lru para cache, `xua-queue-redis` noeviction para fila) e no docker-compose local (portas 6379/6380). Procedimento de migração em produção: `runbook-migracao-redis-separado.md` (mesma pasta).
2. Usar prefixo por ambiente em chaves Redis e em nomes de fila.
3. Manter BullMQ atras de um modulo proprio de fila, e nao direto nos services de dominio.
4. Tratar cache como opcional e fila como infraestrutura operacional.
5. Adotar dashboard de fila apenas apos o contrato de operacao estar claro.
6. Introduzir adapter Redis no Socket.IO apenas quando houver necessidade real de multiplas instancias web.

## Definicao de sucesso

O plano sera bem sucedido se, ao final, o sistema tiver estas propriedades:

- web responsiva mesmo com integracoes externas lentas
- cache acelerando leituras sem virar dependencia dura da API
- worker absorvendo tarefas assincronas e repetiveis
- pagamento e webhook protegidos por retry, dedupe e observabilidade
- possibilidade real de subir mais de uma instancia web sem quebrar realtime
- uso de Redis guiado por responsabilidade clara, e nao por improviso

---

**Última atualização: 13 de julho de 2026** (revisão da "Leitura do estado atual" e registro da decisão operacional 1 como implementada).
