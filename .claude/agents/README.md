# Agentes do Xuá Delivery

Agentes especializados de desenvolvimento, organizados em **3 categorias**. O Claude Code descobre todos automaticamente (busca recursiva). Última reorganização: 07/07/2026.

## Estrutura

```
.claude/agents/
├── README.md            # este índice
├── nucleo/              # transversais e reutilizáveis — atuam em QUALQUER task
│   ├── xua-arquiteto.md    # decisões estruturais, trade-offs, conformidade
│   ├── xua-qualidade.md    # revisão de código, testes, refatoração, performance
│   ├── xua-seguranca.md    # auth, RBAC, segredos, revisão de segurança
│   └── xua-docs.md         # documentação fiel ao código (fecha toda entrega)
├── camadas/             # plataforma técnica — donos de uma camada do sistema
│   ├── xua-backend.md      # API Express (apps/api) — 16 módulos
│   ├── xua-frontend.md     # Web Next.js (apps/web) — 4 personas, 46 páginas
│   ├── xua-banco-dados.md  # ÚNICO autorizado a tocar prisma/schema.prisma
│   └── xua-devops.md       # deploy, filas BullMQ, Redis, observabilidade
└── dominios/            # negócio — donos de regras de um domínio
    ├── xua-pedidos.md        # máquina de estados (14), OTP, visibilidade
    ├── xua-pagamentos.md     # Mercado Pago multi-distribuidora, webhooks
    ├── xua-assinaturas.md    # planos, geração atômica, compensação
    └── xua-estoque-caucao.md # settlement, caução v2, inventário
```

## Roteamento rápido (que agente usar?)

| A task envolve... | Agente |
|---|---|
| Decidir COMO estruturar algo novo | `xua-arquiteto` |
| Endpoint/service/middleware genérico | `xua-backend` |
| Tela, componente, store, PWA | `xua-frontend` |
| Tabela, campo, enum, migration, índice | `xua-banco-dados` |
| Ciclo de vida do pedido (criar→entregar) | `xua-pedidos` |
| Cobrança, webhook, refund, config MP | `xua-pagamentos` |
| Planos, geração de pedidos de assinatura | `xua-assinaturas` |
| Vasilhames, settlement, estoque, reconciliação | `xua-estoque-caucao` |
| Login, senha, permissões, segredos | `xua-seguranca` |
| Revisar diff, escrever testes, refatorar | `xua-qualidade` |
| Deploy, fila, job, monitoramento | `xua-devops` |
| Atualizar documentação pós-entrega | `xua-docs` |

## Fluxo padrão de uma feature

```
xua-arquiteto (valida abordagem, se estrutural)
  → xua-banco-dados (migration, se precisar)
  → agente de domínio OU xua-backend/xua-frontend (implementa)
  → xua-seguranca (revisão, se endpoint sensível/segredo/pagamento)
  → xua-qualidade (revisão final + testes)
  → xua-docs (atualiza doc_contexto/04-active-state.md e docs afetados)
```

## Padrão de um agente (para criar novos)

Todo agente segue este template de seções, nesta ordem:

1. **Frontmatter**: `name` (kebab-case, prefixo `xua-`), `description` (quando usar — é o que roteia a delegação automática)
2. **Objetivo** — uma frase
3. **Conhecimento do domínio** — regras, caminhos reais, invariantes (específico, não genérico)
4. **Quando usar este agente**
5. **Pode modificar** / **Nunca deve modificar** — fronteiras explícitas com os outros agentes
6. **Princípios obrigatórios** — Clean Code, SOLID, DRY, KISS, YAGNI + os do domínio
7. **Configuração** — categoria, contexto mínimo de entrada, saída esperada
8. **Fluxo de trabalho** — passos numerados de como o agente executa
9. **Colaboração (handoffs)** — recebe de / entrega para / escala para

Novo agente: criar o arquivo na categoria certa (`nucleo/` se transversal, `camadas/` se camada técnica, `dominios/` se regra de negócio), seguir o template e adicionar a linha na tabela de roteamento acima.

## Documentação de referência dos agentes

- Árvore de contexto: `xua-delivery/docs/doc_contexto/` (01-blueprint → 04-active-state)
- Docs do sistema: `xua-delivery/docs/doc_sistema/`
- Docs de desenvolvimento/features: `xua-delivery/docs/doc_desenvolvimento/`
