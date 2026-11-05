# Mapeamento UI/UX — Fase 1 (diagnóstico)

> Data: 04/11/2026 · Ambiente: local (web `:3001`, API, Postgres/Redis em Docker) · Viewport: mobile 375×812
> Objetivo: inventariar cada tela dos 4 módulos (Cliente, Distribuidora, Motorista, Operação), apontando
> componentes a trocar por shadcn/ui + Tailwind (mantendo tema Xuá), problemas de usabilidade, bugs e
> mudanças de fluxo. A Fase 2 executa módulo a módulo a partir deste documento.

---

## 0. Diretriz de layout mobile (zonas de alcance do polegar)

Baseado na referência "Usabilidade Mobile" (49% usam uma mão, 36% apoiado, 15% duas mãos):

| Zona | Altura da tela | O que vai aqui |
|---|---|---|
| **Topo (difícil)** | ~0–25% | Título da tela, voltar, filtros/segmentos, busca, contexto (endereço) — coisas lidas, raramente tocadas |
| **Meio (alcançável)** | ~25–65% | Conteúdo: listas, cards, detalhes, formulários |
| **Base (fácil)** | ~65–100% | **Ação primária da tela** (sticky), bottom nav, steppers de quantidade, FAB, confirmações |

Regras derivadas, aplicáveis a todos os módulos:

1. **Toda tela com ação principal tem um `StickyActionBar`** fixo acima do bottom nav (CTA primário + resumo curto, ex.: total).
2. **Ações destrutivas/secundárias nunca no topo direito**; vão para a base (sheet) ou menu `DropdownMenu`.
3. **Diálogos no mobile = `Drawer` (bottom sheet, vaul)**; no desktop = `Dialog`. Um componente `ResponsiveDialog` resolve.
4. **Filtros no topo como `Tabs`/chips roláveis**, sempre sticky junto ao título.
5. **Tabelas no mobile viram lista de cards** (`DataList`); `Table` só a partir de `md:`.
6. Alvos de toque ≥ 44px; botões só-ícone com `aria-label`.

---

## 1. Diagnóstico transversal (vale para todo o app)

### 1.1 Estado atual da stack de UI
- **shadcn/ui já está instalado** (`components.json`, estilo `radix-nova`, Tailwind v4, tokens Xuá em `app/globals.css`).
  Já existem em `src/components/ui/`: alert, avatar, badge, button, calendar, card, checkbox, dialog, drawer,
  dropdown-menu, input-otp, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet,
  skeleton, sonner, switch, tabs, textarea, tooltip.
- O problema **não é falta de biblioteca, é falta de uso consistente**: as telas reimplementam tudo com classes soltas.

Medição por módulo (código atual):

| Pasta | Linhas | Cores hex fixas `[#...]` | `<button>` cru vs `<Button>` | input/select cru vs shadcn | `<table>` cru |
|---|---|---|---|---|---|
| app/(auth) | 784 | 88 | 4 vs 0 | 0 vs 9 | 0 |
| app/(consumer) | 5.299 | **420** | **24 vs 19** | 3 vs 7 | 0 |
| app/(distributor) | 4.453 | 299 | 13 vs 44 | **16 vs 21** | 2 |
| app/(driver) | 870 | 63 | 2 vs 5 | 2 vs 2 | 0 |
| app/(ops) | 4.664 | 210 | 6 vs 53 | 6 vs 58 | 3 |
| src/components/consumer | 1.729 | 112 | 10 vs 6 | 1 vs 4 | 0 |
| src/components/distributor | 447 | 71 | 0 vs 1 | 0 | 0 |
| src/components/ops | 1.918 | 35 | 8 vs 19 | 1 vs 8 | 2 |
| src/components/shared | 1.201 | 40 | 9 vs 5 | 0 vs 1 | 0 |
| **Total** | | **~1.340** | | | |

### 1.2 Problemas transversais
- **Cores hardcoded** (`text-[#191c1d]`, `bg-[#00E0FF]`, `text-[#0d1b2f]`, `bg-[#e1e3e4]`...) em vez dos tokens
  (`text-foreground`, `bg-accent`, `bg-muted`...). Impede tema consistente/dark mode e gera variações de tom.
- **CTA primário com 2 cores diferentes**: ciano `#00E0FF` (catálogo, carrinho, checkout) vs azul `primary`
  (editar perfil, endereços, assinaturas). Definir: **ciano = CTA de conversão do consumidor**, azul = ações padrão.
  Virar variantes do `Button` (`variant="cta"`), não classes soltas.
- **Cabeçalho de página sem padrão**: 4 estilos diferentes (eyebrow+título; título simples; hero azul "ETAPA 0X/04";
  "Xuá" + seta + ícone raio). Criar `PageHeader` (voltar opcional, eyebrow, título, ação/filtros).
- **Botão voltar ausente** em subtelas (Endereços, Editar perfil).
- **Botões só-ícone sem nome acessível** (adicionar ao carrinho, seletor de endereço, lixeira).
- **Textos em inglês/termos técnicos** expostos: "SECURE CHECKOUT", "Payment created", "cash-on-delivery".
- **Datas/fuso**: o app usa UTC para "hoje" (ver bug C-05).
- Formulários sem máscara (telefone, CEP).
- Versão no rodapé do perfil "V1.0.0" vs `package.json` 1.1.0 (hardcoded).

### 1.3 Componentes compostos a criar (base da Fase 2)
| Componente | Substitui | Usado em |
|---|---|---|
| `PageHeader` | 4 variações de cabeçalho | todas as telas |
| `StickyActionBar` | CTAs soltos no fim do scroll | carrinho, checkout, formulários, ações do pedido |
| `ResponsiveDialog` (Drawer mobile / Dialog desktop) | modais e sheets ad-hoc | confirmações, formulários curtos |
| `StatusBadge` (sobre `Badge`) | `status-pill.tsx` + pílulas inline | pedidos, assinaturas, entregas |
| `OrderStepper` | stepper do pedido duplicado | cliente (lista + detalhe), motorista |
| `DataList` / `DataTable` | `<table>` cru e listas manuais | distribuidora, ops |
| `EmptyState` | blocos "Nenhum X" repetidos | todas as listas |
| `QuantityStepper` | stepper do carrinho | carrinho, catálogo, assinatura |
| `FormField` (sobre `Label`+`Input`+erro) | label uppercase + `<p>` de erro manual | auth, perfil, endereços, ops |
| `MaskedInput` (telefone/CEP/CPF) | inputs sem máscara | cadastro, endereços, perfil |
| `Button` variantes `cta`, `soft`, `destructive-soft` | classes de cor soltas | todo o app |

---

## 2. Autenticação

**Usuários de teste usados**: cliente novo cadastrado pela própria tela de registro (`cliente.ux@teste.local`)
e usuários do seed `prisma/seed.ts` para as demais roles (admin, admin2, driver, ops, support).

### 2.0 ⚠️ Bloqueador de ambiente encontrado
- `JWT_SECRET` de `apps/web/.env` estava **diferente** de `apps/api/.env` → o `proxy.ts` do Next rejeitava todo token
  emitido pela API e redirecionava para `/login` (login retornava 200, mas o usuário "voltava" pro login sem erro).
  Alinhei o valor do web com o da API (backup do `.env` original guardado fora do repo). Sugestão: no `proxy.ts`,
  logar em dev quando `jwtVerify` falhar, e documentar no README que os dois segredos precisam ser iguais.

### 2.1 `/login`
- **Tem**: logo, card glass sobre foto, e-mail, senha, "Esqueceu?", "Entrar", link "Registre-se".
- **Problemas**:
  - Placeholder da senha é `••••••••` → parece campo já preenchido.
  - Sem mostrar/ocultar senha; erro do servidor só em texto.
  - Labels em cinza claro `#9ba3af` com 10px — baixo contraste.
  - Cores todas hardcoded.
- **Trocar por**: `Card`, `FormField`, `Input` + botão olho (`InputGroup`), `Button variant="cta"`, `Alert` para erro.

### 2.2 `/register`
- **Tem**: nome, e-mail, telefone, senha, "Criar Conta", link "Entrar".
- **Bugs/Problemas**:
  - **A-01** A imagem de fundo não aparece (fica atrás do `bg-[#f8f9fa]`, `-z-20` + `fixed`) → tela branca com um
    vazio enorme entre logo e formulário; inconsistente com o login.
  - ~~A-02~~ Após cadastrar caía de volta no `/login`. **Revalidado após corrigir o 2.0: o cadastro loga e leva
    ao catálogo.** Era só o ambiente.
  - Telefone sem máscara; sem confirmação de senha / indicador de força; sem aceite de termos/LGPD.
  - Mensagem "Senha deve ter ao menos 8 caracteres" continua visível enquanto digita (só revalida no submit) —
    usar `mode: "onTouched"`.
- **Trocar por**: mesmos componentes do login + `MaskedInput` (telefone) + `Checkbox` termos.

### 2.3 `/forgot-password`, `/reset-password`
- **forgot**: logo, card "Esqueceu a senha?", e-mail, "Enviar link", "Lembrou a senha? Entrar". Sem foto de fundo
  (3º visual diferente entre as telas de auth).
- **reset** sem token: card "Link inválido" + "Solicitar novo link" (ok). Com token: nova senha + confirmação.
- **Proposta**: um `AuthLayout` único (foto + card glass no mobile, split no desktop) para as 4 telas.

---

## 3. Módulo Cliente (consumer)

Shell: header fixo com "Entregar em [endereço]" + logo; bottom nav com 5 itens (Catálogo, Carrinho c/ badge, Pedidos,
Assinatura, Perfil). **Já segue a zona de polegar na navegação — manter.**

### 3.1 `/catalog`
- **Tem**: seletor de endereço (sheet), busca, carrossel de banners, chips de categoria, "Destaques da Semana"
  (grid de produtos com paginação "carregar mais"), card de produto destaque (banner), barra flutuante do carrinho
  ("N itens · R$ X · Ir para o carrinho"), CTA de assinatura, prompt de instalação PWA.
- **Problemas**:
  - Só existe a seção "Destaques da Semana" — o título engana quando se filtra categoria/busca.
  - Card de produto só tem "+"; sem stepper (não dá pra tirar/ajustar quantidade sem ir ao carrinho), sem detalhe do produto.
  - Toast "adicionado ao carrinho" aparece no **topo** cobrindo o header; com barra flutuante + badge no nav o
    feedback fica triplicado.
  - Barra flutuante do carrinho cobre o último card do grid (falta `padding-bottom`).
  - Banner com badge vazio (retângulo cinza sem texto) quando o banner não tem label.
  - Imagens de produtos ausentes → placeholder em todos (dado de seed, mas o placeholder é pobre).
  - Banner "Assinatura 15%" e CTA "Saiba mais" promovem assinatura, mas **não há planos cadastrados** → fluxo morre em
    "Nenhum plano disponível".
- **Fluxo proposto**: busca + categorias sticky no topo; grid no meio; ao adicionar, o "+" vira `QuantityStepper`
  no próprio card; barra do carrinho sticky na base (único feedback, sem toast). Esconder CTA de assinatura se não
  houver plano ativo.
- **Componentes**: `Input` (busca), `Tabs`/`ToggleGroup` (categorias), `Card`, `QuantityStepper`, `Skeleton`, `Carousel`.

### 3.2 Seletor de endereço (sheet no header) + `/profile/addresses`
- **Tem**: lista de endereços, "Adicionar novo endereço" (CEP → busca → número/complemento).
- **Bugs/Problemas**:
  - **C-01** Ao cadastrar o primeiro endereço pela página de perfil, o header continua "Selecione um endereço"
    (não auto-seleciona o único/primeiro endereço) — só atualizou depois, ao trocar de página.
  - **C-02** Não existe editar, excluir nem "definir como padrão" — só adicionar.
  - Lógica de cadastro **duplicada** em `address-sheet.tsx` e `profile/addresses/page.tsx`.
  - CEP sem máscara e exige clicar "Buscar" (deveria buscar sozinho ao completar 8 dígitos).
  - Sem apelido (Casa/Trabalho) e sem ponto de referência.
  - Subtela sem botão voltar.
- **Componentes**: `ResponsiveDialog` com `AddressForm` único reutilizado; `RadioGroup` para escolher endereço;
  `DropdownMenu` (editar/excluir/padrão) por item.

### 3.3 `/cart`
- **Tem**: itens com imagem, preço unitário, lixeira, stepper (−/qtd/+; o "−" vira lixeira quando qtd=1),
  aviso "Troca de vasilhame", subtotal, total, botão "Continuar para Agendamento".
- **Problemas**:
  - **CTA não é sticky** — fica no fim do scroll, abaixo do aviso de vasilhame.
  - Rótulo "Continuar para Agendamento" mas o próximo passo é **Escolher Distribuidora**.
  - Duas lixeiras por item (ícone no topo + no stepper).
  - Mostra só preço unitário; falta total da linha.
  - Aviso de vasilhame fala só de 20L mesmo com item 10L no carrinho; e **não deixa o cliente informar se tem
    vasilhame para troca** (ver bug crítico C-03).
- **Componentes**: `Card`, `QuantityStepper`, `StickyActionBar` (total + "Continuar"), `Alert` para o aviso.

### 3.4 Checkout — `/checkout/distributor` (Etapa 2/4)
- **Tem**: hero azul "ETAPA 02/04 Escolha sua Distribuidora", endereço com "Alterar", lista de distribuidoras
  (nome + nota) com radio, botão "Continuar para Agendamento".
- **Problemas**:
  - Dois headers empilhados (header global com endereço **e** header "← Xuá ⚡"), mais o hero → ~40% da tela
    antes do conteúdo. Ícone de raio sem função clara.
  - Card da distribuidora sem informação de decisão (taxa, prazo/próxima janela, formas de pagamento aceitas).
  - Etapa 1/4 não existe visualmente (o carrinho seria a 1?).
  - Se só há 1 distribuidora atendendo, a etapa deveria ser pulada (auto-seleção) — já existe toggle
    "Distribuidora automática" no perfil, mas o fluxo não aproveita.
- **Componentes**: `PageHeader` + `Progress`/stepper compacto, `RadioGroup` com cards, `StickyActionBar`.

### 3.5 Checkout — `/checkout/schedule` (Etapa 3/4)
- **Tem**: endereço, carrossel horizontal de dias, janelas (Manhã/Tarde), instruções especiais (textarea),
  resumo "Selecionado: data, janela · R$ total" + "Continuar para Pagamento".
- **Bugs/Problemas**:
  - **C-05 Fuso horário**: às 21h29 de 04/11 (horário de Brasília) o calendário marcou **"HOJE = 5 Nov"** e
    desabilitou o dia 4. Cálculo de "hoje" está em UTC.
  - Skeleton mostra "Manhã 08:00–12:00" e depois carrega "07:00–12:00" (skeleton com dados fake divergentes).
  - Nome do dia "QUARTA-FEIRA" truncado nos chips.
  - O resumo com CTA é bom, mas não é sticky.
- **Componentes**: `ToggleGroup`/`RadioGroup` (janelas), chips de data roláveis (`ScrollArea`), `Textarea`,
  `StickyActionBar`.

### 3.6 Checkout — `/checkout/payment` (Etapa 4/4)
- **Tem**: "SECURE CHECKOUT", endereço c/ "Alterar", forma de pagamento (aqui só Dinheiro na entrega),
  troco (Valor exato / Preciso de troco), resumo dos itens, subtotal/total, aviso vasilhame, botão
  "Confirmar pedido de R$ X", aviso ABNT, aceite de termos.
- **Bugs/Problemas**:
  - **C-03 🔴 CRÍTICO — total divergente**: a tela mostrou e o botão confirmou **R$ 65,00**, mas o pedido foi
    gravado com **R$ 105,00** (2× "Vasilhame 20L" R$ 20 somados como compra). Causa: o store `cart.ts` tem
    `emptyBottlesByBottle`/`setEmptyBottlesForBottle`, mas **nenhuma tela chama esse setter** → o backend
    considera 0 vazios para troca e cobra todos os vasilhames; o front não inclui esse valor no total.
    **Solução decidida: ver seção 9 (regra de vasilhame por produto, cobrança ajustada na entrega).**
  - Layout diferente das etapas anteriores (sem "ETAPA 04/04").
  - Resumo não mostra **data/janela de entrega nem distribuidora** escolhidas.
  - Aviso de vasilhame aparece 3× no fluxo (carrinho, pagamento, ABNT) — consolidar em 1 bloco colapsável.
  - Texto de aceite de termos fica **abaixo** do botão de confirmar.
  - "SECURE CHECKOUT" em inglês.
- **Componentes**: `RadioGroup` (formas de pagamento), `ToggleGroup` (troco) + `Input` moeda, `Card` resumo,
  `Collapsible`/`Accordion` avisos, `StickyActionBar` ("Confirmar · R$ total").

### 3.7 `/checkout/confirmation`
- **Tem**: ícone check, "Pedido confirmado!", texto, `Pedido #<uuid completo>`, "Ver pedido", "Continuar comprando".
- **Problemas**: mostra o UUID inteiro (no resto do app usa `#8541694C`); não recapitula data/janela/total;
  CTAs no meio da tela (deveriam ir para a base).

### 3.8 `/orders`
- **Tem**: eyebrow "Acompanhamento", "Meus Pedidos", abas Todos/Ativos/Entregues/Cancelados com contador,
  seção "Em andamento" com card (nº, data, total, stepper), CTA "Assine e economize" → "Ver planos".
- **Bugs/Problemas**:
  - **C-06** "VER PLANOS" aponta para `/subscription` → **404** (rota não existe; deveria ser `/subscription/manage`
    ou `/subscription/create`).
  - **C-07** Stepper marca **"A CAMINHO"** como etapa atual com o pedido ainda "Enviado ao distribuidor".
  - Card de CTA preto destoa do tema (único elemento preto do app).
  - Sem ação rápida no card (repetir pedido, acompanhar).
- **Componentes**: `Tabs` sticky no topo, `Card`, `OrderStepper`, `StatusBadge`, `EmptyState`.

### 3.9 `/orders/[id]`
- **Tem**: cabeçalho (voltar, nº, status), card resumo c/ stepper, informações da entrega (realizado, data, janela),
  endereço, operação (distribuidora com contato, motorista), pagamento e vasilhames, itens, totais, timeline,
  card de OTP "Mostre este código ao motorista" (via socket), status do OTP, avaliação NPS pós-entrega,
  motivo de cancelamento.
- **Problemas**:
  - Mesmo bug do stepper (C-07).
  - Timeline com eventos em inglês/técnicos ("Payment created", "cash-on-delivery", "Sistema").
  - Pagamento exibido como "Pedido • Criado" (status técnico).
  - **Cliente não consegue cancelar** o pedido nem falar com a distribuidora (telefone aparece como texto, não
    link `tel:`/WhatsApp).
  - Informação mais importante (OTP quando em rota, status atual, previsão) deveria ficar no topo; itens/timeline
    podem ir para `Accordion`.
- **Fluxo proposto**: topo = status + OTP (quando houver) + previsão; meio = endereço/itens/pagamento em
  `Accordion`; base = `StickyActionBar` contextual (Cancelar / Ligar para distribuidora / Avaliar).

### 3.10 `/profile`
- **Tem**: avatar grande, nome, e-mail, telefone, "Próxima entrega" (atalho p/ pedidos), Endereços salvos,
  Editar perfil, toggle "Distribuidora automática", Ajuda e Suporte, Sobre Nós, lista de endereços + "Ver todos",
  Sair, versão.
- **Problemas**:
  - **C-08** "Ajuda e Suporte" e "Sobre Nós" **não têm link/ação** (itens mortos).
  - Avatar gigante ocupa ~25% da tela.
  - Endereços duplicados (item de menu + seção de lista).
  - Telefone sem formatação; versão fixa "V1.0.0".
  - Toggle customizado → trocar por `Switch` com `Label`.
- **Componentes**: `Avatar`, lista de `Item`/menu com `Separator`, `Switch`, `AlertDialog` para "Sair".

### 3.11 `/profile/edit`
- **Tem**: nome, e-mail, telefone, "Salvar alterações".
- **Problemas**: sem voltar; sem troca de senha; sem CPF (o seed tem `document`); botão azul (diferente do CTA ciano);
  inputs cinza preenchido diferentes do padrão branco do auth.

### 3.12 `/subscription/manage`
- **Tem**: "Recorrência / Assinaturas", botão "+ Nova", estado vazio com "Criar assinatura"; com dados: cards de
  assinatura com status, pausar/retomar, retomar pagamento, editar data de entrega (sheet), cancelar.
- **Problemas**: botão "+ Nova" no topo direito (zona difícil) duplicado com o CTA do estado vazio.

### 3.13 `/subscription/create` (wizard 5 passos: Plano → Distribuidor → Endereço → Datas → Pagamento)
- **Tem**: voltar, título do passo, indicador de pontos, CTA "Continuar" **sticky na base** ✅ (bom padrão — replicar
  no checkout avulso).
- **Problemas**: sem planos no ambiente → "Nenhum plano disponível no momento" com CTA desabilitado e nenhuma saída
  (deveria oferecer "Fazer pedido avulso"). Os passos Distribuidor/Endereço/Pagamento **reimplementam** o checkout
  avulso (componentes deveriam ser compartilhados).

---

## 4. Módulo Distribuidora (distributor_admin)

Usuário: `admin@xua.com.br` (Distribuidora Xuá JF). Fluxo testado ponta a ponta: pedido de teste do cliente →
**Aceitar** → checklist → atribuir motorista → **Despachar** (gerou comprovante nº 000003).

Shell: header com logo + badge "Distribuidor" + ícone sair; **bottom nav com 7 itens** (Pedidos, Concilia, Estoque,
Agenda, Pagamento, Motoristas, KPIs) também no desktop.
- **Problemas do shell**:
  - 7 itens no bottom nav em 375px → rótulos colam ("PagamentoMotoristas"), alvos < 44px.
  - **D-01** Em `/distributor/inventory/reconciliation` ficam **dois itens ativos** (Concilia e Estoque), porque o
    match de Estoque é o prefixo `/distributor/inventory`.
  - No desktop continua bottom nav (sem sidebar) — desperdiça a largura.
- **Proposta**: bottom nav com 4 itens fixos (**Pedidos, Estoque, Motoristas, Mais**) + "Mais" abre `Drawer` com
  Agenda, Pagamento, KPIs, Conciliação, Caução. Desktop (`lg:`) usa `Sidebar` do shadcn com os mesmos grupos.
  "Concilia" vira ação dentro de Estoque (já existe o botão "Conciliar" lá — hoje é duplicado).

### 4.1 `/distributor/queue` — Fila de pedidos (home)
- **Tem**: KPIs (Aceite, Preparo, Em rota, Atrasados), "Atualizado HH:MM", Atualizar; filtros (busca, data, motorista,
  ordenação, origem Todos/Carrinho/Assinatura, abas Todas/Aceite/Preparo/Em rota/Histórico); colunas kanban
  (Aceite / Preparo / Em rota) com cards (nº, há X min, cliente, "Amanhã/Atrasado", itens, total, bairro, data/janela,
  status, motorista, SLA timer, **Aceitar / Recusar** ou **Ver**); paginação; sheet lateral do pedido ao clicar.
- **Problemas**:
  - No mobile os filtros ocupam ~60% da primeira tela (6 controles empilhados) e o primeiro pedido só aparece após
    rolar. Selects de motorista/ordenação **só com ícone** (sem rótulo).
  - Dois níveis de filtro de etapa redundantes: abas (Todas/Aceite/...) **e** colunas kanban.
  - Colunas com altura mínima fixa → grandes áreas vazias ("Sem pedidos nesta etapa" ocupando meia tela).
  - Card apertado: nome do cliente truncado ("Cl..."), Aceitar/Recusar pequenos no canto superior direito.
  - Pedidos do seed aparecem como `#00000000` (prefixo do UUID) — numeração curta não é única/legível.
  - Textos sem acento: "OPERACAO", "Separacao", "pagina".
  - KPI "ATRASADOS" cortado no card.
- **Fluxo proposto (mobile)**: topo sticky = título + `Tabs` de etapa com contador (substituem KPIs e colunas) + botão
  "Filtros" que abre `Drawer` (busca, data, motorista, origem, ordenação). Meio = lista de cards da etapa.
  Card com ações **na base do card** em largura total (Aceitar primário / Recusar secundário).
  Desktop mantém kanban.
- **Componentes**: `Tabs`, `Drawer` (filtros), `Select` com label, `Card`, `Badge`, `Button`, `Pagination`, `EmptyState`.

### 4.2 Sheet de pedido (na fila) e `/distributor/orders/[id]`
- **Tem**: atribuir motorista (select + "Atribuir"), Ações rápidas (Checklist, Abrir tela completa), resumo
  (nº, status, total), cliente e entrega (endereço, data/janela, telefone, e-mail, motorista), itens, origem,
  total (subtotal, vasilhames, forma de pagamento + instrução de troco), status da entrega (stepper 5 etapas),
  histórico operacional, comprovante de venda ("Gerar comprovante").
- **Bugs/Problemas**:
  - **D-02** Stepper "Status da entrega" mostra etapa **1 Receb.** ativa com o pedido já **Aceito** (deveria ser 2).
  - Sheet abre pela **lateral direita** no mobile (deveria ser bottom `Drawer`); placeholder "Selecionar motorista"
    sobrepõe o botão "Atribuir".
  - Na tela completa a **ação principal ("Ir para checklist de despacho") fica no meio**, depois de itens e histórico;
    total/pagamento ficam no fim. Ordem proposta: status + ação → cliente/endereço → itens + total → histórico (Accordion).
  - "Motorista deve receber valor exato" com R$ 105, enquanto o cliente viu R$ 65 (consequência de C-03).
  - Histórico mostra atores técnicos: "consumer", "system", "distributor_user".
  - Telefone/e-mail do cliente não clicáveis (`tel:`/WhatsApp/`mailto:`).
  - Botão "Voltar para fila" é um card grande; usar `PageHeader` com seta.
- **Componentes**: `Drawer`/`Sheet side="bottom"`, `Select`, `OrderStepper`, `Accordion`, `StickyActionBar`
  (Checklist/Despachar/Recusar conforme status).

### 4.3 `/distributor/orders/[id]/checklist`
- **Tem**: barra de progresso (0/3), 3 verificações fixas (itens separados, vasilhames preparados, endereço
  confirmado), select de motorista, "Despachar pedido" → volta à fila com toast "Pedido despachado • Comprovante Nº X
  gerado [Imprimir]".
- **Problemas**:
  - Título com **UUID inteiro** ("Checklist — Pedido #8541694c-5acc-...").
  - Sem botão voltar; `<select>` nativo; checkboxes customizados (trocar por `Checkbox`).
  - Checklist genérico — não lista os itens do pedido para conferência (ex.: "2× Galão 20L ☐").
  - CTA "Despachar" no meio da tela, não sticky.
- **Componentes**: `PageHeader`, `Progress`, `Checkbox` + `Label`, `Select`, `StickyActionBar`.

### 4.4 `/distributor/routes/[id]`
- Página existe (consulta `/api/distributor/routes/:id`, comprovantes em PDF) mas **nenhum link no app leva até ela**
  — tela órfã. Decidir: integrar (link a partir do motorista/despacho) ou remover.

### 4.5 `/distributor/inventory` — Estoque
- **Tem**: "Conciliar", 3 KPIs (itens com saldo, quantidade total, baixo estoque), busca + filtros tipo/status,
  **tabela** (item, tipo, saldo, limite, status, último movimento) com paginação, extrato recente (filtro por item,
  entradas/saídas), "Carga inicial" (quantidade por item + observação + "Registrar carga").
- **Problemas**:
  - **Tabela de 6 colunas no mobile** → só Item e Tipo visíveis; **o saldo (informação principal) fica fora da tela**.
  - 3 KPIs em cards de largura total empilhados (~45% da primeira tela).
  - "Carga inicial" sempre visível no fim da página, mesmo após a carga — deveria ser ação "Entrada de estoque"
    (sheet) disponível a qualquer momento.
- **Componentes**: KPIs em grid 3 colunas compacto, `DataList` no mobile (item + saldo + `StatusBadge`), `DataTable`
  no desktop, `Select`, `Drawer` p/ entrada de estoque, `Pagination`.

### 4.6 `/distributor/inventory/reconciliation` — Conciliação física
- **Tem**: voltar "← Estoque", "Abrir sessão", estado vazio "Nenhuma sessão aberta" (contagem física vs sistema).
- `/distributor/reconciliation` é só um `redirect` legado para esta rota.
- **Problemas**: CTA no topo; estado vazio sem explicação do que é conciliação/quando usar.

### 4.7 `/distributor/schedule` — Agenda
- **Tem**: dias operacionais (toggle + "lead time (h)" por dia) + Salvar; datas bloqueadas (data + motivo + Bloquear,
  lista); horários de entrega (faixas com toggle, excluir, "+ Adicionar").
- **Bugs/Problemas**:
  - **D-03 Layout quebrado**: o toggle sobrepõe o nome do dia ("Segunda-\nreira") e o início do horário
    ("07:00" cortado) nas faixas.
  - "LEAD TIME (H)" — jargão em inglês; usar "Antecedência mínima (horas)".
  - Botão "Salvar" pequeno no topo direito do card (zona difícil); salva só os dias, enquanto bloqueios e horários
    salvam na hora → modelos de salvamento misturados.
  - Input de data nativo `dd/mm/aaaa`.
- **Componentes**: `Switch` + `Label`, `Input type=number` com sufixo, `Calendar` em `Popover`, `StickyActionBar`
  (Salvar), `ResponsiveDialog` p/ nova faixa.

### 4.8 `/distributor/payment-config` — Pagamento
- **Tem**: métodos aceitos (Pix no app, Crédito no app — Mercado Pago; Dinheiro na entrega; Cartão na entrega);
  ao marcar métodos online pede credenciais do Mercado Pago (access token, public key, webhook secret);
  "Salvar configuração".
- **Problemas**: seleção múltipla com visual de **radio** (círculo) — usar `Checkbox`/`Switch`; subtítulo fala em
  "conecte sua conta" mas a seção só aparece ao marcar online (sem pista); status da conexão MP pouco visível.

### 4.9 `/distributor/drivers` — Motoristas
- **Tem**: "+ Novo", cards (nome, e-mail, telefone, status), Editar, Desativar/Ativar.
- **Problemas**: "Desativar" **sem confirmação**; "+ Novo" no topo direito; sem ver entregas/desempenho do motorista.
- **Componentes**: `Card`/`Item`, `Badge`, `AlertDialog` (desativar), `ResponsiveDialog` (form), FAB/StickyActionBar "Novo motorista".

### 4.10 `/distributor/kpis`
- **Tem**: período (Hoje/7/30/90 dias), 3 KPIs com meta e semáforo (SLA de aceite, Taxa de aceite, Taxa de
  reentrega), 3 gráficos de linha com linha de meta.
- **Bugs/Problemas**:
  - **D-04 "Taxa de aceite = 200,0%"** (cálculo errado; > 100%).
  - **D-05** SLA de aceite 0% "Crítico" mesmo com o pedido aceito em 3 min — revisar cálculo.
  - Eixo X termina em 05/11 (mesmo problema de fuso C-05); rótulo "Meta" cortado ("Me").
  - Faltam KPIs de negócio para a distribuidora: pedidos, faturamento, ticket médio, entregas por motorista.
- **Componentes**: `ToggleGroup` (período), `Card` KPI, `chart` do shadcn (Recharts).

### 4.11 `/distributor/deposit-program` — Programa de Caução (oculto do menu)
- **Tem**: habilitar consumidor por CPF/CNPJ (busca), consumidores habilitados (limite editável + status),
  vasilhames em caução em aberto.
- **Problemas**: acessível só por URL (intencional, feature B2B futura); input de limite sem rótulo; botão de busca
  só ícone.

---

## 5. Módulo Motorista (driver)

Usuário: `driver@xua.com.br` (Carlos, Xuá JF). Recebeu o pedido de teste despachado na seção 4.

Shell: header com logo + badge "Motorista" + sair; bottom nav com 2 itens (Entregas, Histórico). O app do motorista
é o que **mais** precisa de uso com uma mão (dirigindo/carregando galão).

### 5.1 `/driver/deliveries` — Minhas entregas
- **Tem**: hero azul (título + "Confirme cada entrega com o código OTP"), contadores Pendentes/Concluídas,
  "Em rota · Aguardando entrega" (cards numerados com cliente, endereço, qtd, telefone, janela, alerta
  "Cobrar R$ X em dinheiro · Valor exato"), "Histórico do dia · Concluídas".
- **Bugs/Problemas**:
  - **M-01 Plural quebrado: "2 garrafãoões"** (`garrafão` + `"ões"` em `deliveries/page.tsx:176,237`).
  - **M-02** A quantidade soma todos os itens como "garrafões" (5 = 2 galões 20L + 1 garrafão 10L + 2 vasilhames).
  - **M-03** "Cobrar R$ 105,00 · valor exato" — cliente foi informado de R$ 65 (consequência direta de C-03).
  - Hero ocupa ~45% da primeira tela; a 1ª entrega só aparece pela metade.
  - Endereço truncado em 1 linha; telefone quebra em 3 linhas.
  - **Não há "Abrir no mapa" (Google Maps/Waze) nem "Ligar"/WhatsApp** — essenciais para o motorista.
  - Tocar no card vai **direto para a tela de OTP** (não existe tela de detalhe da entrega: itens, observações do
    cliente "deixar na portaria", forma de pagamento/troco).
- **Fluxo proposto**: topo = resumo compacto (Pendentes · Concluídas · valor a receber em dinheiro); meio = lista
  ordenada de paradas; card com 3 botões grandes na base (**Mapa · Ligar · Entregar**). Nova tela de detalhe da
  entrega com `StickyActionBar` "Concluir entrega" / "Não consegui entregar".

### 5.2 `/driver/deliveries/[id]/otp` — Concluir entrega
- **Tem**: título, pedido, alerta de cobrança, "Garrafões vazios coletados" (0–5+), código do cliente (6 dígitos,
  liberado após informar vazios), "Não foi possível concluir a entrega", "Ver comprovante de venda", "Voltar".
- **Bugs/Problemas**:
  - Os 6 campos de OTP **estouram a largura do card** no 375px (último campo cortado).
  - UUID completo no texto ("Pedido #8541694c-5acc-...").
  - Botão "Não foi possível concluir a entrega" em vermelho claro parece **mensagem de erro**, não ação.
  - Ordem: o CTA de confirmar só aparece após OTP; ações secundárias ficam onde o polegar alcança e a primária não.
  - Telefone de suporte fixo em código (`tel:+5511990011005`, DDD 11).
- **Componentes**: `InputOTP` (já existe em `ui/`, usar com slots responsivos), `ToggleGroup` (vazios),
  `Alert` (cobrança), `StickyActionBar` (Confirmar entrega), `Button variant="ghost"` para "Não consegui entregar".

### 5.3 `/driver/deliveries/[id]/failure` — Registrar falha
- **Tem**: motivo (select: cliente ausente, sem acesso, endereço incorreto, local inseguro, outro), detalhes
  (opcional), "Registrar falha", "Voltar".
- **Problemas**: `<select>` nativo (usar `RadioGroup` com os 5 motivos em botões grandes — 1 toque); sem foto
  de comprovação; UUID inteiro no texto.

### 5.4 `/driver/history`
- **Tem**: "Historico de entregas" (sem acento), contador, cards (cliente, data · hora · janela, status, endereço,
  qtd, telefone).
- **Problemas**: hora "00:00" (campo de hora não preenchido/fuso); sem filtro de período; sem total recebido no dia.

---

## 6. Módulo Operação (ops) e Suporte (support)

Usuários: `ops@xua.com.br` e `support@xua.com.br` (seed).

Shell ops: **bottom nav com 11 itens** (KPIs, Zonas, Estoque, Produtos, Banners, Planos, Distribuidoras, Motoristas,
Suporte, OTP, Auditoria) — rótulos sobrepostos ("ProdutosBannersPlanosDistribuidoras..."), inutilizável no mobile
e mantido no desktop. Badge "Operacoes" sem acento. Suporte tem 2 itens (Suporte, OTP).
- **Proposta**: ops é uso majoritariamente **desktop** → `Sidebar` do shadcn agrupada:
  *Visão geral* (KPIs) · *Rede* (Distribuidoras, Zonas, Motoristas) · *Catálogo* (Produtos, Planos, Banners) ·
  *Operação* (Estoque, Conciliações, Suporte, Override OTP) · *Compliance* (Auditoria).
  No mobile: bottom nav com 4 (KPIs, Suporte, Estoque, Menu) + `Drawer` com o resto.

### Padrões repetidos em todas as telas de ops
- CRUDs com formulário **inline** expandindo dentro da lista (produto, banner, plano, distribuidora, motorista)
  → usar `ResponsiveDialog`/`Sheet` com `Form`.
- **Nenhuma ação destrutiva tem confirmação** em todo o app (Desativar distribuidora/motorista/zona/produto,
  **Remover banner** — exclusão definitiva). Não existe `AlertDialog` em `src/components/ui/` — adicionar.
- Botões `h-7` (28px) nos cards — abaixo do alvo de toque mínimo.
- Telas de ops usam `useState + fetch` manual; o consumidor usa hooks TanStack Query → padronizar (cache, loading, erro).
- `<select>` nativo em quase todas as telas (planos, banners, distribuidoras, motoristas, OTP, auditoria).
- Tabelas largas no mobile escondem colunas de ação (zonas: Renomear/Transferir/Desativar fora da tela).

### 6.1 `/ops/kpis`
- **Tem**: filtro distribuidora, período, KPIs (SLA de aceite, taxa de aceite, reentrega, volume, melhor/pior
  distribuidora), tabela resumo por distribuidora, gráficos: evolução, ranking, funil operacional, tempo até aceite,
  volume de pedidos, NPS médio.
- **Bugs**: **D-04 repetido: "Taxa de aceite 200,0%"**; **O-01** SLA da Xuá JF = 100% aqui e 0% na tela da própria
  distribuidora (cálculos divergentes entre as duas telas); tabela de 7 colunas cortada no mobile.

### 6.2 `/ops/zones`
- **Tem**: seleção de distribuidora (drill-down com voltar), busca de zona, "Que zona atende [CEP]?", "Nova zona",
  filtro Ativas/Inativas/Todas, tabela expansível (zona, cobertura, endereços, pedidos, status, ações Renomear/
  Transferir/Desativar), dentro da zona: bairros/CEPs (chips removíveis), "+ Adicionar bairro/CEP", "Importar lista".
- **Problemas**: busca por CEP cortada na largura; ações fora da tela no mobile; remover CEP (×) sem confirmação.

### 6.3 `/ops/inventory` e `/ops/inventory/reconciliations`
- **Tem**: "Conciliações", KPIs (saldos filtrados, distribuidoras, alertas), 4 filtros (distribuidora, item, tipo,
  alerta) **sem rótulo** ("Todas", "Todos"...), tabela (distribuidora, item, tipo, saldo, limite, alerta), movimentos
  do período. Conciliações: filtros (distribuidora, status, datas), lista de sessões + "Detalhe da sessão".
- **Problemas**: mesmos da 4.5 (tabela larga, KPIs empilhados); paginação mostra **"1-0 de 0"**; master-detail
  lado a lado vira duas caixas empilhadas no mobile (detalhe deveria abrir em `Sheet`).

### 6.4 `/ops/products`
- **Tem**: "+ Novo produto", cards (imagem, nome, descrição, preço, status, Editar, Desativar).
- **Problemas**: sem busca/filtro/categoria visível no card; sem preview/upload de imagem claro; ação "Novo" no topo.

### 6.5 `/ops/banners`
- **Tem**: "+ Novo", cards (título, posição carrossel/destaque, ordem, tag, subtítulo, CTA, Editar, Desativar,
  **Remover**).
- **Problemas**:
  - **O-02** Banners ativos prometem **cupom "XUAFRESH" (R$ 10 OFF)** e **"Frete grátis acima de R$ 50"**, mas o
    checkout **não tem campo de cupom nem frete** → promessa sem funcionalidade para o cliente.
  - "Remover" sem confirmação; ordem editada por número (sem arrastar); sem preview do banner como o cliente vê.

### 6.6 `/ops/subscription-plans`
- **Tem**: "+ Novo plano", estado vazio, formulário inline (nome, produto, descrição, qtd total, desconto %, preço
  por produto c/ desconto, válido de/até, distribuidores vinculados, "Criar plano").
- **Problemas**:
  - **O-03** "Distribuidores vinculados: Nenhum distribuidor disponível" — por regra só aparecem distribuidoras com
    Mercado Pago conectado, mas **a tela não explica** → é por isso que não existe nenhum plano e a assinatura do
    cliente está morta (3.13). Mensagem deve dizer "Conecte o Mercado Pago em Distribuidora > Pagamento".
  - Desconto % e "preço c/ desconto" são campos independentes (podem ficar incoerentes) — calcular um a partir do outro.

### 6.7 `/ops/distributors`
- **Tem**: "+ Nova", cards (nome, status, alerta "Dados do emitente incompletos", Editar, Desativar).
- **Problemas**: card não mostra cidade/zonas/admin/MP conectado; "Desativar" vermelho sem confirmação.

### 6.8 `/ops/drivers`
- **Tem**: "+ Novo", cards (nome, e-mail, telefone, distribuidora, status, Editar, Desativar). Sem filtro por distribuidora.

### 6.9 `/support` (ops e support)
- **Tem**: campo "Buscar por telefone, e-mail ou ID do pedido" + "Buscar"; resultados.
- **Bugs**:
  - **S-01 🔴** Busca por **e-mail, telefone, nome ou nº curto (8541694c) retorna HTTP 500** em
    `/api/orders?scope=support&q=` — só o UUID completo funciona. A tela **mascara o erro** como
    "Nenhum resultado encontrado".
  - Tela inicial vazia: deveria listar a fila de atenção (falhas de entrega, atrasados, pagamentos pendentes).

### 6.10 `/support/[id]`
- **Bug S-02 🔴** A página **quebra** (Runtime TypeError: `order.audit_events` undefined em
  `app/(ops)/support/[id]/page.tsx:82`). Detalhe do pedido no suporte está inacessível.

### 6.11 `/ops/otp-override`
- **Tem**: busca de pedidos em rota por nome, telefone, e-mail, CPF, ID, data; resultados; confirmar sem OTP
  com motivo (textarea).
- **Problemas**: 6 campos onde 1 busca única resolveria; **placeholders parecem valores preenchidos**
  ("Maria Silva", "(11) 91234-5678"); CTA no fim do formulário.

### 6.12 `/ops/audit-export`
- **Tem**: data início/fim, tipo de evento (select com ~45 enums crus `ORDER_CREATED`...), "Baixar CSV".
- **Problemas**: enums sem tradução; sem preview/contagem antes de baixar; inputs de data nativos.

---

## 7. Consolidado de bugs (priorizado)

| ID | Sev. | Módulo | Bug | Onde |
|---|---|---|---|---|
| ENV | 🔴 | todos | `JWT_SECRET` web ≠ api → login "volta" pro login | `apps/web/.env` (corrigido localmente) |
| C-03 | ✅ | cliente/motorista | ~~Total do checkout ≠ total cobrado~~ — resolvido pela regra de vasilhame na entrega (seção 9) | — |
| S-02 | 🔴 | suporte | `/support/[id]` quebra (TypeError `audit_events`) | `support/[id]/page.tsx:82` |
| S-01 | 🔴 | suporte | Busca retorna 500 para e-mail/telefone/nº curto; UI mostra "nenhum resultado" | `GET /api/orders?scope=support` |
| C-05 | ✅/🟠 | cliente/KPIs | ~~"Hoje" em UTC~~ no agendamento do cliente (`lib/datetime.ts`); gráficos/KPIs ainda pendentes | gráficos |
| D-04 | 🟠 | dist./ops | Taxa de aceite 200% | KPIs |
| O-01/D-05 | 🟠 | dist./ops | SLA de aceite diverge (0% vs 100%) | KPIs |
| C-06 | ✅ | cliente | ~~"Ver planos" → 404~~ — aponta para `/subscription/create` e só aparece com plano ativo | — |
| O-02 | 🟠 | cliente | Banners prometem cupom e frete grátis inexistentes | banners × checkout |
| O-03 | 🟠 | ops/cliente | Sem plano possível sem MP; tela não explica → assinatura morta | `subscription-plans` |
| C-07/D-02 | ✅/🟡 | cliente/dist. | ~~Stepper errado~~ no cliente (`OrderStepper`); distribuidora (D-02) pendente | dist. |
| M-01/M-02 | 🟡 | motorista | "garrafãoões"; contagem soma vasilhames e 10L como garrafões | `driver/deliveries/page.tsx` |
| D-03 | 🟡 | dist. | Agenda: switches sobrepõem textos | `distributor/schedule` |
| D-01 | ✅ | dist. | ~~Dois itens ativos no bottom nav~~ — ativo = prefixo mais longo | — |
| C-01/C-02 | ✅ | cliente | ~~Endereço não auto-seleciona; sem editar/excluir~~ — PATCH/DELETE (arquiva) + 1º endereço principal | — |
| C-08 | ✅ | cliente | ~~"Ajuda e Suporte"/"Sobre Nós" sem ação~~ — `/profile/help` (FAQ + sobre + versão real) | — |
| A-01 | 🟡 | auth | Foto de fundo do cadastro não aparece | `register/page.tsx` |
| — | 🟡 | todos | Nenhuma confirmação em ações destrutivas | ops, dist. |
| — | ⚪ | todos | Textos sem acento / em inglês / enums crus | vários |

---

## 8. Plano da Fase 2 (módulo a módulo)

**Etapa 0 — Fundação (antes de qualquer módulo)**
1. Tokens: mapear os ~1.340 hex para tokens existentes (`foreground`, `muted`, `accent`, `primary`, `surface-*`);
   adicionar `--cta`/`--cta-foreground` (ciano) e variantes de `Button` (`cta`, `soft`, `destructive-soft`).
2. Adicionar componentes shadcn faltantes: `alert-dialog`, `accordion`, `collapsible`, `toggle-group`, `form`,
   `sidebar`, `table`, `pagination`, `breadcrumb`, `carousel`, `chart`, `command` (busca).
3. Criar compostos: `PageHeader`, `StickyActionBar`, `ResponsiveDialog`, `StatusBadge`, `OrderStepper`, `EmptyState`,
   `DataList`/`DataTable`, `QuantityStepper`, `FormField`, `MaskedInput`, `ConfirmAction` (AlertDialog).
4. `RoleAppShell`: bottom nav máx. 5 itens + "Mais" (Drawer); `Sidebar` no desktop; corrigir match de ativo.
5. Util de datas com fuso `America/Sao_Paulo` + util de plural/formatadores (telefone, nº do pedido curto).

**Etapa 1 — Cliente** (maior impacto em receita): auth → catálogo → carrinho → checkout (3 etapas: Entrega
[endereço + distribuidora auto + data/janela] → Pagamento [+ vasilhames para troca] → Confirmação) → pedidos →
perfil/endereços → assinatura. Corrigir C-03, C-05, C-06, C-07, C-01/02, C-08 no caminho.

**Etapa 2 — Motorista**: lista com Mapa/Ligar/Entregar, tela de detalhe da entrega, OTP com `InputOTP` responsivo,
falha em 1 toque. Corrigir M-01..03.

**Etapa 3 — Distribuidora**: shell enxuto, fila mobile por abas + Drawer de filtros, detalhe com ação no topo/
sticky, checklist com itens reais, estoque em `DataList`, agenda corrigida. Corrigir D-01..05.

**Etapa 4 — Operação/Suporte**: Sidebar, CRUDs em Dialog/Sheet com `Form`, `DataTable`, confirmações, suporte com
fila de atenção. Corrigir S-01, S-02, O-01..03.

Cada etapa: branch própria, PR por módulo, validação navegando de novo com os mesmos usuários de teste.

### Andamento (05/11/2026)
- **Etapa 0 — feita**: tokens `cta`/`ink`/`hairline`/`sky`/`*-foreground` (codemod trocou ~1.217 hex no app todo;
  `accent` virou realce suave e o ciano é só `cta`); `Button` `cta`/`soft`/`destructive-soft` + tamanhos `xl`/`icon-touch`;
  shadcn `alert-dialog`, `accordion`, `collapsible`, `toggle-group`; compostos em `src/components/shared`
  (`PageHeader`, `StickyActionBar`, `ResponsiveDialog`, `ConfirmAction`, `StatusBadge`, `OrderStepper`, `EmptyState`,
  `QuantityStepper`, `FormField`, `MaskedInput`); `lib/datetime.ts`, `lib/format.ts`, `lib/order-status.ts`;
  `RoleAppShell` com bottom nav ≤5 + "Mais" e sidebar no desktop (vale para os 4 módulos).
  Pendente da Etapa 0: `DataList`/`DataTable`, `sidebar`/`table`/`chart`/`command` do shadcn (entram com Distribuidora/Ops).
- **Etapa 1 — Cliente feita**: catálogo, carrinho, checkout em 3 etapas (Entrega = endereço + distribuidora + data;
  `/checkout/distributor` redireciona), pagamento, confirmação, pedidos (lista/detalhe com cancelar, ligar/WhatsApp,
  acordeão, histórico traduzido), perfil, endereços, dados pessoais, ajuda, assinaturas (gerenciar/criar com saída sem plano).
  Auth (login/cadastro) ainda não foi refeita.
- Achados no caminho: header "sticky" não grudava (`overflow-x-hidden` na raiz → `overflow-x-clip`); apelido do endereço
  era descartado pela API; e-mail na edição de perfil não era salvo (schema não aceita) → agora somente leitura.

---

## 9. Regra de vasilhame (redesenho de C-03) — decidido em 04/11/2026

### Regra de negócio
- **Água (refil)**: preço só da água. Para cada unidade, o cliente devolve 1 vasilhame vazio na entrega; se não
  devolver, paga o vasilhame na porta. Ex.: água R$ 20, Água+Vasilhame R$ 50 → vasilhame R$ 30.
  2 águas = R$ 40 com 2 vazios · R$ 70 com 1 · R$ 100 com 0 · ou entrega parcial/cancelamento.
- **Água + Vasilhame (combo)**: preço já inclui o galão; nada a devolver nem cobrar na entrega.

### Estado atual (código)
- `Product.kind` (WATER/BOTTLE/OTHER) + `bottle_product_id` já existem (regra por produto, não hardcoded), mas:
  - `create-order.service` cobra o vasilhame **na criação** (assume 0 vazios, pois o front nunca envia
    `emptyBottles`) e o estoque do vasilhame sai no aceite.
  - Na entrega, `collected_empty_qty` só alimenta estoque/caução — **o valor do pedido não é recalculado**.
  - Seed inconsistente: Garrafão 10L é "retornável" mas sem `bottle_product_id`; "Vasilhame 20L" vendido avulso.

### Decisões
| Tema | Decisão |
|---|---|
| Configuração | No cadastro de produto: switch **"Exige vasilhame vazio na entrega"** + seleção do produto vasilhame (preço/estoque vêm dele). Combo Água+Vasilhame: switch desligado, baixa 1 água + 1 vasilhame. |
| Checkout | **Só avisar**: total = águas; aviso "Tenha N vazios; sem eles + R$ X por galão (até R$ Y)". Sem pergunta prévia. |
| Pedido pago online sem vazio | **Cobrar na porta** (dinheiro/maquininha); app registra o valor extra. |
| Cliente sem vazio e não quer pagar | **Motorista escolhe**: entrega parcial (só as águas com vazio; total recalculado; restante volta ao estoque) **ou** cancelar com motivo "sem vasilhame para troca". |
| Caução | Clientes habilitados no programa: falta vira empréstimo (comportamento atual mantido). |

### Impacto por camada
- **Banco** (`xua-banco-dados`): `Product.requires_empty_return Boolean`, flag de combo (ou `includes_bottle`);
  em `Order`: `bottles_charged_at_delivery`, `delivery_extra_cents`, `final_total_cents`; itens com
  `delivered_qty` para entrega parcial. Migração do seed (10L vinculado; produto combo).
- **Backend** (`xua-pedidos`/`xua-estoque-caucao`): criação do pedido **não** cobra vasilhame (só registra o máximo
  possível); estoque do vasilhame vendido baixa **na entrega**; `deliver-order` recalcula total a partir dos vazios
  recolhidos, suporta entrega parcial; novos eventos de auditoria (`BOTTLE_SOLD_AT_DELIVERY`, `PARTIAL_DELIVERY`);
  falha com motivo `NO_EMPTY_FOR_EXCHANGE`.
- **Front**:
  - Ops > Produtos: switch + select do vasilhame + preview "cliente paga R$ X se não devolver".
  - Cliente: aviso único no carrinho/checkout/detalhe; detalhe mostra valor final após entrega.
  - Motorista: stepper de vazios recolhidos → valor a cobrar ao vivo; ações "Cobrar e concluir" · "Entregar parcial" ·
    "Cancelar (sem vasilhame)".
  - Distribuidora/comprovante: "Valor base R$ 40 · até + R$ 60 se não houver vasilhames"; após entrega, valor final.
  - Ops: KPIs "vasilhames vendidos na porta", "entregas parciais/canceladas por falta de vasilhame".

### Status: ✅ implementado (branch `feat/regra-vasilhame-entrega`, 04/11/2026)
- Migrations: `20261104220000_bottle_rule_on_delivery` (campos de produto/pedido/item) e
  `20261104230000_inventory_movement_bottle_sale` (movimentos `BOTTLE_SALE_OUT` e `PARTIAL_DELIVERY_RETURN`).
- Combo implementado com `Product.base_product_id` (sem estoque próprio: baixa água-base + vasilhame no aceite).
- Pedidos anteriores à regra (`max_bottle_charge_cents = 0`) não são recobrados.
- OTP passou a ser consumido só **depois** da entrega concluir (antes, uma conclusão recusada queimava o código).
- Pré-checagem do passo de vasilhame antes de validar o código.
- Comprovante (PDF) ganhou a seção "Troca de vasilhame" (vazios a recolher, valor por vasilhame, teto).
- Também corrigido: **"Cartão na entrega" ficava preso aguardando o Mercado Pago** — agora nasce confirmado e vai
  direto para a distribuidora; motorista vê "Cobrar R$ X no cartão"; captura na entrega.
- Validado na tela com os usuários de teste (dev): pedido em dinheiro 2 refil + 1 combo (R$ 95 → 1 vazio, cobrou
  vasilhame → R$ 115 capturado); pedido no cartão 2 refil (1 vazio, entrega parcial → R$ 25); pedido 1 refil sem
  vazio → "cancelar entrega" com motivo pré-selecionado → `DELIVERY_FAILED`.
- Pendências conhecidas: entrega parcial bloqueada para pedido pago online (exigiria estorno); Garrafão 10L do seed
  segue sem regra (descrição diz "Retornável") — decidir se é refil.

---

## Apêndice — Massa de teste criada nesta análise
- Cliente `cliente.ux@teste.local` (cadastro pela UI) e `cliente.ux2@teste.local` (cadastro via API, revalidação A-02);
  senha de teste definida na sessão de análise (não versionada).
- Endereço Rua Halfeld, 100 — Centro, Juiz de Fora (CEP 36010-000).
- Pedido `8541694c-5acc-4ca0-bd04-3880b5fea2bf`: criado (dinheiro), aceito pela Xuá JF, despachado para Carlos
  (status **Em rota**, não concluído).
