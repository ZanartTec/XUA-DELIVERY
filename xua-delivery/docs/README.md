# Documentação — Xuá Delivery

Organizada em três camadas, da visão consolidada ao registro detalhado. Última reorganização: 07/07/2026.

```
docs/
├── README.md                  # este índice
├── doc_contexto/              # ÁRVORE DE CONTEXTO — porta de entrada (leia primeiro)
│   ├── 01-blueprint.md        #   escopo, público, papéis e entidades (raiz)
│   ├── 02-tech-stack.md       #   stack, arquitetura, convenções, deploy (tronco)
│   ├── 03-domain-data.md      #   schema, máquina de estados, rotas, integrações (galhos)
│   └── 04-active-state.md     #   DINÂMICO: implementado / a fazer / débitos (folhas)
├── doc_sistema/               # DOCUMENTAÇÃO DETALHADA do sistema (estável)
│   ├── especificacao-funcional.md  # spec histórica de produto (banners [ESTADO ATUAL])
│   ├── guia-tecnico.md             # arquitetura, banco e stack em profundidade
│   ├── banco-de-dados.md           # referência tabela a tabela do schema Prisma
│   ├── fluxo-pedidos.md            # auditoria funcional do fluxo de pedidos
│   └── fluxo-usuarios.md           # jornadas das 4 personas + mapa de rotas web
└── doc_desenvolvimento/       # REGISTROS DE FEATURES e evoluções pontuais
    ├── caucao-vasilhames.md         # arquitetura da caução v2 (settlement)
    ├── assinaturas-fases-1-2.md     # correção crítica + fases das assinaturas
    ├── assinatura-edicao-datas.md   # edição de datas de entrega da assinatura
    ├── fluxo-telas.html             # protótipo navegável
    └── redis-bullmq/                # filas: fundação, plano de escala, avanços
        ├── fundacao-bullmq.md
        ├── plano-escalabilidade.md
        └── 2026-05-19/avanco-fluxos-reais.md
```

## Como usar

- **Começando uma sessão de desenvolvimento?** Leia `doc_contexto/` na ordem 01 → 04. É o resumo consolidado e verificado contra o código.
- **Precisa de profundidade** (todos os campos de uma tabela, todos os guardrails de uma transição)? Vá a `doc_sistema/`.
- **Quer o histórico de uma feature** (por que a caução é assim, o que a Fase 2 corrigiu)? Vá a `doc_desenvolvimento/`.

## Regras de manutenção

1. **A doc segue o código.** Divergiu? O código vence; corrija a doc. Fontes de verdade: `prisma/schema.prisma`, `apps/api/src/http/routes.ts`, `apps/web/app/`.
2. **`04-active-state.md` é atualizado a cada entrega** (agente `xua-docs` fecha o ciclo).
3. **Nomenclatura:** kebab-case, sem sufixos redundantes. Feature nova documentada = novo arquivo em `doc_desenvolvimento/`.
4. **`especificacao-funcional.md` não se reescreve** — divergências são corrigidas via banners `[ESTADO ATUAL — mês/ano]`.
5. **Sem invenção:** informação não verificável vira `[A DEFINIR]`.
6. Todo doc alterado ganha rodapé "Última atualização" com data absoluta.

## Agentes relacionados

Os agentes de desenvolvimento (em `.claude/agents/`) usam esta documentação como contexto permanente. O agente `xua-docs` é o guardião desta pasta.
