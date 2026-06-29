# Assinaturas XUA — O que mudou (Fases 1 e 2)

> Documento de divulgação. Resume o que foi corrigido na feature de Assinaturas,
> como o fluxo funciona hoje de ponta a ponta, por quais componentes passa e como
> evoluem os status. Linguagem acessível para produto, operação e engenharia.
>
> Data: 28/06/2026 · Escopo: Fases 1 e 2 (fluxo do consumidor completo)

---

## 1. O problema que tínhamos

A assinatura permite ao cliente **pré-pagar** um plano com várias entregas agendadas
(ex.: 10 galões de água, uma entrega por semana). Cada entrega agendada deveria virar
um pedido real, na data certa, e seguir o fluxo normal até a casa do cliente.

Na auditoria, encontramos uma falha **crítica** e várias consequências:

- **O pedido gerado pela assinatura nunca chegava ao distribuidor.** Ele nascia num
  estado intermediário (`CREATED`) e parava ali — invisível para a distribuidora. Ou
  seja: o cliente pagava, a assinatura "consumia" a entrega, mas **nada era entregue**.
- **A entrega era marcada como "entregue" no momento em que o pedido era gerado**, não
  quando realmente chegava ao cliente — mascarando o problema acima.
- **Risco de pedidos duplicados** (a criação do pedido e a baixa do saldo não eram
  atômicas — uma falha no meio gerava o pedido duas vezes).
- **Risco de data errada**: pedidos atrasados eram gerados com a data de "hoje", não a
  data agendada.
- **Assinaturas presas**: uma assinatura não paga ficava "aguardando pagamento" para
  sempre, sem expirar.
- **Sem volta**: se o distribuidor rejeitasse ou a entrega falhasse, o cliente perdia a
  entrega paga — não havia recrédito nem nova tentativa.

---

## 2. O que foi feito

### Fase 1 — Fazer o fluxo funcionar de ponta a ponta
- **O pedido agora nasce confirmado e é enviado ao distribuidor** automaticamente.
  (Corrige a falha crítica.)
- **Geração atômica e idempotente**: criar o pedido, vincular à entrega e dar baixa no
  saldo acontecem numa **única transação**, com trava (lock) para evitar duplicação.
  Reexecuções nunca geram o pedido duas vezes.
- **Data correta**: o pedido usa a data agendada; entregas atrasadas são **reagendadas
  para a próxima data válida** (nunca geradas no passado).
- **Expiração de assinatura não paga**: assinatura que não é paga dentro do prazo é
  cancelada automaticamente (fila dedicada), liberando o estado "preso".
- **Recuperação automática**: se o envio ao distribuidor falhar no último passo, o
  sistema reenvia o pedido sozinho na próxima varredura (sem duplicar).
- **Cancelamento de assinatura descontinuado** (decisão de negócio): o único caminho
  para "cancelada" agora é a expiração do pagamento.

### Fase 2 — Fechar o ciclo de vida e dar resiliência
- **Estado real da entrega**: a entrega só é marcada como **entregue** quando o pedido
  é **de fato entregue** ao cliente (antes ficava "ORDER_CREATED", em andamento).
- **Compensação automática**: se o pedido é rejeitado pelo distribuidor ou cancelado,
  o **saldo é recreditado** e a entrega volta para a fila para **nova tentativa**.
- **Teto de tentativas**: após **3 tentativas** sem sucesso, a entrega é marcada como
  `FAILED`, o saldo segue creditado e **Operação e cliente são avisados**.
- **Geração imediata na ativação**: assim que o pagamento é confirmado, a geração do
  primeiro pedido é disparada **por evento** — sem esperar o horário do cron.

---

## 3. Como isso corrige o problema

| Antes | Agora |
|---|---|
| Pedido parava em `CREATED`, invisível | Nasce `CONFIRMED` e vai para `SENT_TO_DISTRIBUTOR` |
| Entrega marcada "entregue" na geração | Marcada "entregue" só na entrega real |
| Risco de pedido duplicado | Transação única + trava + idempotência |
| Pedido atrasado com data errada | Usa a data agendada; vencidos são reagendados |
| Assinatura não paga ficava presa | Expira e cancela automaticamente |
| Falha = cliente perde a entrega paga | Recrédito + nova tentativa (até 3) + aviso |
| Só geração por cron (3x/dia) | Geração por evento na ativação + cron de segurança |

---

## 4. System Design atual (visão geral)

A assinatura é **pré-paga** (pagamento único via Mercado Pago, na conta da distribuidora)
e **orientada a eventos**, com um cron como rede de segurança. Princípios:

1. **Pré-pago** — paga-se uma vez, na ativação. Os pedidos gerados têm valor 0 (já pagos).
2. **Atômico e idempotente** — gerar pedido + baixar saldo é indivisível e seguro para repetir.
3. **Orientado a eventos** — a ativação dispara a geração; o cron só cobre o que escapar.
4. **Ciclo fechado** — o resultado do pedido (entregue / rejeitado / falho) volta a refletir
   no estado da assinatura.

**Componentes e papéis:**

| Componente | Responsabilidade |
|---|---|
| API de Assinaturas | Criar assinatura, retomar pagamento, pausar/retomar, editar entrega |
| Mercado Pago + Webhook | Processa o pagamento; ativa a assinatura na confirmação |
| Serviço de Geração | Cria o pedido pré-pago de cada entrega (atômico, idempotente) |
| Serviço de Compensação | Reflete o resultado do pedido de volta na assinatura |
| Worker de Expiração | Cancela assinaturas não pagas no prazo |
| Fila BullMQ (Redis) | Orquestra geração, expiração e webhooks de forma assíncrona |
| Distribuidor | Recebe, aceita, prepara e entrega o pedido (fluxo normal) |

---

## 5. Fluxo do início ao fim

```
1. CLIENTE cria a assinatura
   → escolhe plano, distribuidora, endereço e as datas de entrega
   → assinatura nasce "AGUARDANDO PAGAMENTO"; entregas ficam "PENDENTES"
   → é gerado o checkout do Mercado Pago (na conta da distribuidora)
   → agenda-se a expiração (caso não pague no prazo)

2. CLIENTE paga no Mercado Pago

3. WEBHOOK de pagamento (assíncrono)
   → confirma o pagamento ("CAPTURADO")
   → ativa a assinatura: "AGUARDANDO PAGAMENTO" → "ATIVA"
   → dispara, por evento, a geração dos pedidos das entregas já elegíveis

4. GERAÇÃO DO PEDIDO (por evento na ativação, e por cron como segurança)
   para cada entrega com data <= hoje, numa transação única:
   → cria o PEDIDO já "CONFIRMADO" (valor 0, pré-pago, na data agendada)
   → marca a entrega como "PEDIDO CRIADO" e dá baixa no saldo da assinatura
   → envia o pedido ao DISTRIBUIDOR ("ENVIADO AO DISTRIBUIDOR")

5. DISTRIBUIDOR (fluxo de pedido normal)
   → vê o pedido na fila, ACEITA, separa, despacha e sai para ENTREGA

6. ENTREGA NA CASA DO CLIENTE
   → pedido "ENTREGUE"
   → a entrega da assinatura passa a "ENTREGUE" (ciclo fechado)

   (Se o pedido for REJEITADO ou CANCELADO: o saldo é recreditado e a entrega
    volta para nova tentativa; após 3 falhas vira "FALHA" e avisa Operação/cliente.)

7. Quando todas as entregas são concluídas → assinatura "CONCLUÍDA"
```

---

## 6. Por onde passa (componentes e filas)

```
CONSUMIDOR ─HTTP→ API Assinaturas ─→ Banco (assinatura + entregas + pagamento)
                                   └→ Mercado Pago (checkout)

Mercado Pago ─webhook→ Fila "payment-webhooks" ─→ Worker
                                                  ├─ ativa assinatura (ATIVA)
                                                  └─ Fila "internal-jobs" (geração direcionada)

Fila "internal-jobs" ─→ Worker de Geração
   ├─ cria pedido CONFIRMADO + baixa saldo (transação única)
   └─ envia ao distribuidor (SENT_TO_DISTRIBUTOR)
   (também acionado pelo CRON: 00h, 05h e 16h — rede de segurança)

Fila "subscription-expiration" ─→ Worker de Expiração
   └─ cancela assinatura não paga no prazo

Ciclo do pedido (entregue/rejeitado/cancelado) ─→ Serviço de Compensação
   └─ atualiza a entrega e o saldo da assinatura
```

Tudo o que é assíncrono passa por **filas BullMQ sobre Redis**, processadas pelo
**worker** — nada trava a resposta ao cliente, e jobs com falha são re-tentados
automaticamente.

---

## 7. Fluxo de status

### Status da assinatura
```
AGUARDANDO_PAGAMENTO ──(pagamento confirmado)──► ATIVA ──(saldo zera)──► CONCLUÍDA
        │                                          │
        │                                          └──(pausar/retomar)──► PAUSADA ⇄ ATIVA
        └──(não paga no prazo)──► CANCELADA
```
- `CANCELADA` só acontece por **expiração de pagamento** (cancelamento manual foi descontinuado).
- Nunca regride de `ATIVA` para `AGUARDANDO_PAGAMENTO`.

### Status de cada entrega da assinatura
```
PENDENTE ──(pedido gerado)──► PEDIDO_CRIADO ──(entrega real)──► ENTREGUE
   ▲                               │
   │                               ├──(pedido rejeitado/cancelado, < 3 tentativas)──► volta a PENDENTE
   │                               │        (saldo recreditado, nova tentativa)
   └───────────────────────────────┘
                                   └──(após 3 tentativas)──► FALHA  (saldo creditado + avisa ops/cliente)
```

### Status do pedido (fluxo normal, igual a um pedido de carrinho)
```
CONFIRMADO ──► ENVIADO_AO_DISTRIBUIDOR ──► ACEITO ──► PRONTO_P/_DESPACHO
   ──► EM_ROTA ──► ENTREGUE
              └──► (rejeitado / cancelado / falha de entrega → caminhos próprios)
```

---

## 8. O que ainda não está no escopo (Fase 3 — opcional)

A Fase 3 é **somente ferramenta de Operação** (painel para visualizar assinaturas e
reprocessar manualmente uma entrega em `FALHA`). **Ela não faz parte do caminho
funcional** — a assinatura funciona do início ao fim sem ela. Fica para quando se quiser
dar autonomia operacional ao time de suporte.

---

## 9. Resumo executivo

Antes, a assinatura **não entregava**: o pedido nascia e morria invisível. Hoje, o
fluxo está **completo, atômico, idempotente e resiliente** — o pedido chega ao
distribuidor, é entregue ao cliente, e qualquer falha é recreditada e re-tentada
automaticamente, com a Operação avisada nos casos persistentes. O sistema é orientado
a eventos (resposta imediata na ativação) com um cron de segurança, tudo sobre filas
assíncronas que se auto-recuperam.
