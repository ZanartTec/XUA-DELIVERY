# Site institucional: plano de animações e performance

Status: **implementado em 05/11/2026** (commits `b266e98` Fase 0, `02e1765` Fase 1, `901e464` Fase 2 e o de QA da Fase 3).
Os resultados medidos e os pontos em que a execução mudou o plano estão na **seção 9**.
Escopo: `/` e `/institucional` (mesma página) e `/links`. Código em `apps/web/app/(site)/`.

---

## 1. Diagnóstico: por que o site parecia estático

Quase tudo o que você pediu nas duas primeiras telas **já existe** no código:
- as ondas giram;
- o galão sobe e flutua;
- a faixa de texto rola;
- o título entra linha a linha e o sublinhado é desenhado.

Você viu tudo parado porque o navegador estava com **`prefers-reduced-motion: reduce`** ativo. Isso acontece quando *Configurações → Acessibilidade → Efeitos visuais → Efeitos de animação* está desligado no Windows. No celular, o equivalente é "Reduzir movimento" no iOS ou "Remover animações" no Android. O CSS atual zera **todas** as animações nesse caso. Confirmei no navegador interno: o modo estava ativo e, ao remover a regra, tudo voltou a mexer.

**Decisão necessária:** muita gente desliga isso por desempenho ou por padrão da empresa, não por sensibilidade a movimento. Proposta de política em três níveis:

| Modo | O que roda |
|---|---|
| Normal | Tudo: entradas, loops (ondas, faixa, gotas) e efeitos ligados à rolagem. |
| Movimento reduzido | Entradas viram fades curtos de 200 ms, só opacidade e sem deslocamento. Ondas e faixa ficam paradas. Sem parallax e sem nada preso à rolagem. A gota do botão aparece já parada. |
| Modo leve (aparelho fraco ou economia de dados) | Entradas completas, porém sem loops contínuos e sem o canvas de gotas. |

Assim, quem pede menos movimento continua vendo um site "vivo" (os elementos surgem), e quem é sensível não recebe parallax nem movimento grande.

---

## 2. Como o navegador do celular renderiza, e o que isso decide

Cada quadro passa por **Estilo → Layout → Pintura → Composição**. Para 60 fps sobram cerca de 16 ms por quadro. Num Android de entrada, o JS do Next/React já consome boa parte disso na hidratação.

| Propriedade animada | Custo | Uso |
|---|---|---|
| `transform`, `opacity` | Só composição. Roda na GPU, **fora da thread principal**, e não trava mesmo com JS ocupado. | Base de tudo |
| `clip-path`, `filter` | Pinta a camada, mas é barato em elementos pequenos. | Só em elementos pequenos (balão, tags) |
| `width`, `height`, `top`, `margin`, `d` do SVG, `box-shadow` | Refaz layout e/ou pintura a cada quadro. | **Não usar** em animação |

Regras que saem disso:
1. **Animar só `transform` e `opacity`.** As ondas "2D" são camadas SVG deslocadas com `translateX`, nunca um `path` que muda de forma.
2. **Animação nativa do navegador antes de JS.** CSS keyframes e Scroll-driven Animations (`animation-timeline: view()`) rodam no compositor. Um `onscroll` em JS roda na thread principal e disputa com o React.
3. **`will-change` só durante a animação.** Cada camada promovida vira uma textura na memória de vídeo. O galão em PNG num celular de tela 3x é uma textura de vários MB. Muitas camadas permanentes fazem o iOS descartar ou recarregar a página.
4. **Pausar o que está fora da tela.** Loops infinitos em seções invisíveis gastam bateria e CPU à toa.
5. **Não sequestrar o scroll.** Nada de "smooth scroll" por JS (Lenis e similares). No celular, a rolagem nativa é a mais fluida e a única que o usuário conhece.

---

## 3. Tecnologia e bibliotecas

**Recomendação: zero dependências novas.** Tudo dá para fazer com o que o navegador já tem.

| Necessidade | Escolha | Peso | Por quê |
|---|---|---|---|
| Entradas, loops, 3D simples | CSS keyframes + `perspective` / `rotateX/Y` | 0 kB de JS | Compositor e cache do CSS |
| Efeitos ligados à rolagem (linha que se desenha, galão subindo, celular girando) | **CSS Scroll-driven Animations** (`animation-timeline: view()`), com fallback no IntersectionObserver que já temos | 0 kB | Chrome, Edge e Safari 26 já suportam. Onde não houver suporte, o `@supports` cai no gatilho por classe atual. |
| Sequências disparadas por JS (gota pingando no hover, números) | Web Animations API (`el.animate()`) | 0 kB | É nativa, e o GSAP ou o Motion seriam só uma camada em cima dela |
| "3D" da gota e do galão | SVG com gradiente e brilho especular + squash/stretch em CSS | ~1 kB de SVG | Parece 3D por sombreamento, sem WebGL |

**Descartadas, e por quê:**

| Lib | Peso aprox. (gzip) | Motivo |
|---|---|---|
| Three.js / React Three Fiber | ~150 kB+ | Contexto WebGL custa memória de GPU, drena bateria e é perdido em segundo plano no iOS. É exagero para uma gota. Se um dia quisermos uma superfície de água 3D de verdade no hero, a opção é **OGL** (~10 kB), carregada por `import()` dinâmico só em aparelhos capazes. |
| GSAP + ScrollTrigger | ~35 kB | Hoje é gratuito e excelente, mas o ScrollTrigger lê o layout na thread principal. A versão nativa em CSS faz o mesmo de graça. |
| Motion (Framer Motion) | ~30 kB+ (versão React) | Exige componentes client. Hoje a página é quase toda server component, e é isso que a deixa leve. |
| Lottie | ~60 kB + JSON | Pesado para o ganho, e os arquivos de animação ainda precisariam ser produzidos. |
| Lenis (smooth scroll) | ~4 kB | Ver regra 5 da seção 2. |

---

## 4. Ganhos de arquitetura (antes de qualquer animação nova)

Um orçamento de performance só vale se a base for leve. Encontrei quatro pontos.

### 4.1 O site carrega o "app" inteiro sem precisar
`app/layout.tsx` é o layout raiz de **todas** as rotas, inclusive do site. Por isso o site institucional baixa e executa:
- TanStack Query;
- Zustand (auth);
- Toaster (sonner);
- PwaProvider e registro do service worker;
- um `fetch /api/auth/me` (o 500 que aparece no console);
- as fontes **Inter + Manrope**, que o site não usa.

**Proposta:** usar *múltiplos layouts raiz* do Next.
- `git mv` dos grupos `(auth) (consumer) (distributor) (driver) (ops)` para dentro de um novo grupo `app/(app)/`, junto com o `layout.tsx` e o `providers.tsx` atuais.
- `app/(site)/layout.tsx` passa a ter o próprio `<html>`.
- As URLs não mudam, e nenhum arquivo importa `providers` ou `globals.css` por caminho relativo (conferi), então é só mover.
- Efeito colateral: ir do site para `/register` vira um carregamento completo de página. Para o funil, isso é aceitável.

Ganho estimado: algumas dezenas de kB de JS a menos, uma requisição de API a menos e duas famílias de fonte a menos. Meço o número exato com `next build` na Fase 0.

### 4.2 Fontes: 159 kB
A Bricolage Grotesque variável traz os eixos `opsz` e `wdth` inteiros. A proposta é fixar só os pesos usados (700/800 na Bricolage, 400/600 na Figtree) e o subset `latin`. Expectativa: cair para menos da metade.

### 4.3 Canvas de gotas do hero (`_components/hero-drops.tsx`)
Hoje:
- roda `requestAnimationFrame` **para sempre**, mesmo com o hero fora da tela ou a aba em segundo plano;
- usa o `devicePixelRatio` cheio (num celular 3x, são 9 vezes mais pixels).

Correções: pausar com IntersectionObserver e `visibilitychange`, limitar o DPR a 2 e usar 22 gotas no normal ou 10 no modo leve.

### 4.4 Parallax em JS (`_components/scroll-effects.tsx`)
Hoje usa `onscroll` → `getBoundingClientRect` por elemento a cada quadro. A proposta é migrar para `animation-timeline: view()` onde houver suporte e deixar o JS só como fallback.

### Extras
- `content-visibility: auto` nas seções abaixo da dobra: o navegador pula layout e pintura do que não está visível. É um ganho grande em aparelho fraco.
- **Classe de desempenho** em `<html>`, decidida uma vez no carregamento: `data-perf="lite"` quando `saveData`, `deviceMemory ≤ 4` ou `hardwareConcurrency ≤ 4`. O CSS desliga os loops com um único seletor.
- **Pausa fora da tela:** um único IntersectionObserver marca seções com `.is-off`, e o CSS aplica `animation-play-state: paused`.

---

## 5. Mapa de animações, seção por seção

Legenda: **[C]** só CSS · **[S]** ligada à rolagem (scroll-driven, com fallback) · **[J]** precisa de JS mínimo · 📱 mobile · 🖥 desktop.

### 5.1 Hero, primeira dobra (você pediu)
| Elemento | Animação | Tipo |
|---|---|---|
| Selo "Água mineral natural" | Fade + leve subida, em 0 ms | C |
| Título | Cada linha sobe de dentro de uma máscara, 120 ms entre elas | C |
| Sublinhado lime | **Por último** (depois do título e do parágrafo, ~1,1 s): é desenhado da esquerda para a direita, com uma ondulação líquida na ponta | C |
| Parágrafo e botões | Fade-up em sequência | C |
| **Gota do botão "Quero meu galão"** | Gota em SVG com gradiente e brilho, simulando volume. Ciclo de ~1,2 s: a gota estica (squash/stretch), desprende, cai 6 px e faz um anel de "splash" no fundo. Roda 2 vezes ao carregar e depois só no hover/foco, sem ficar em loop eterno chamando atenção nem gastando bateria. | C + J (hover) |
| Números 1990 · 3 · 20 L | Contagem do "3" e do "20" ao aparecer (o 1990 fica fixo, porque é ano) | J (já existe) |

### 5.2 Palco do galão (você pediu): segunda dobra no 📱, coluna direita no 🖥
| Elemento | Animação | Tipo |
|---|---|---|
| Arco azul ("portão") | Abre de baixo para cima (`scaleY` 0→1 com origem embaixo e cantos que se arredondam no fim) | C/S |
| **Galão** | **Sai de dentro do portão.** Começa recortado pela forma do arco (`clip-path` na moldura), sobe com um pequeno overshoot e passa da borda do arco. Depois disso, o recorte é removido e entra a flutuação suave. No 📱 dispara ao entrar na tela; no 🖥 dispara no carregamento. | C + S |
| Azul-claro de baixo | 3 camadas de onda SVG largas, deslizando com `translateX` em velocidades e sentidos diferentes, mais um leve sobe-e-desce. Fica com profundidade de mar 2D sem redesenhar o path. | C |
| Faixa "Água mineral natural · Sem gás…" | Outdoor infinito, já existe. Ganha bordas com fade, velocidade proporcional à largura da tela e **pausa ao tocar ou passar o mouse** (exigência de acessibilidade para movimento contínuo). | C |
| Balão "Sem tratamento químico" | Primeiro o ponto verde dá um "pop", depois o balão **abre da esquerda para a direita** (`clip-path: inset()` com cantos arredondados) e o texto aparece por último | C |
| Card "40 garrafinhas" | Pop com leve rotação 3D (`rotateX`) e contagem de 0 a 40 | C + J |
| Gotas de fundo (canvas) | Já existem; recebem as correções da seção 4.3 | J |

### 5.3 "Como podemos te atender?" (3 caminhos)
- 📱 **Cartões empilhados com `position: sticky`**: ao rolar, cada cartão desliza por cima do anterior, que encolhe levemente e escurece. É moderno, só CSS **[C/S]** e funciona sem JS.
- 🖥 Os 3 cartões sobem em sequência. No hover, há uma inclinação 3D suave que segue o mouse (só com `pointer: fine`, usando variáveis CSS atualizadas em `rAF`) **[J]**, e o ícone faz uma micro-animação (o telefone vibra, o caminhão anda) **[C]**.

### 5.4 Hidratação consciente + simulador
- Passos 1-2-3: uma linha vertical se desenha conforme a rolagem e acende cada número quando chega nele **[S]**.
- Resultados (240 L, 12 galões, 5.760 garrafinhas): o número transita suavemente ao mexer no slider, em vez de pular **[J, WAAPI]**.
- Fileira de garrafinhas: já anima. As que "saem" ao aumentar pessoas caem e somem **[C]**.
- **Líquido balançando dentro das garrafinhas** (pedido em 05/11), depois da animação de entrada:
  - **Técnica leve:** em vez de 40 animações (uma por garrafa), a fileira inteira tem **uma única camada de água** com a superfície ondulada (SVG largo deslizando com `translateX`). As garrafinhas funcionam como "janelas" por cima dela (`mask-image` com a silhueta da garrafa repetida). Uma camada só na GPU dá a impressão de uma onda passando por dentro de todas as garrafas. **[C]**
  - Cada garrafa ganha um leve desencontro de fase (`--i`), para não parecer um bloco só.
  - **Reage ao slider:** ao mudar o número de pessoas, a água chacoalha mais forte por ~1 s e volta a balançar suave, via WAAPI na amplitude (`scaleY` da camada). **[J]**
  - Pausa fora da tela; parado no movimento reduzido e no modo leve (água em nível fixo).

### 5.5 Água mineral × potável
- Tabela: as linhas entram uma a uma e uma faixa de destaque desliza até a coluna "Mineral" **[C/S]**.
- Cards de minerais (Ca, Mg, …): **viram em 3D** (`rotateX` com `perspective`) em sequência, como peças da tabela periódica. No hover, bolhas sobem dentro do card **[C]**.

### 5.6 "O que torna a sua vida saudável?"
- A gota do card **enche de água** conforme a rolagem: uma onda interna sobe dentro da gota recortada **[S]**. É o detalhe-assinatura da seção.

### 5.7 Fonte e qualidade (seção escura)
- Onda do topo: camadas em movimento, como no hero **[C]**.
- Fluxo de 6 etapas: a linha se desenha **presa à rolagem** (hoje é por gatilho), e cada círculo acende ao ser alcançado **[S]**.
- Galeria: cada foto entra com um "wipe" em `clip-path` mais um zoom de 1.1 para 1 (Ken Burns curto) **[C]**. No 🖥, o hover aproxima a foto e mostra a legenda.
- 🖥 Um brilho suave segue o cursor sobre o fundo escuro, feito com uma div desfocada movida por `transform` e não com um gradiente repintado **[J]**.

### 5.8 História
- Linha do tempo: a linha e os pontos se desenham com a rolagem **[S]**.
- Fotos: no 🖥 entram alternando esquerda e direita; no 📱, sobem com máscara **[C]**.
- **Caminhão:** anda ~24 px para a direita enquanto você rola, um parallax horizontal sutil **[S]**.

### 5.9 Socioambiental
- Contador de 9.000 mudas (já existe) mais uma **muda em SVG que brota**: o caule se desenha (`stroke-dashoffset`) e as folhas abrem com `scale` **[C]**.
- Fotos com o mesmo "wipe" da galeria.

### 5.10 Faixa do app
- O celular entra **girando em 3D** (`rotateY` de −14° para 0°, com `perspective`) preso à rolagem **[S]**.
- A tela do mockup alterna entre catálogo, carrinho e "pedido a caminho", com crossfade **[C]**.
- Uma notificação "Seu pedido saiu para entrega 🚚" aparece no meio. É o que vende o app.

### 5.11 Seja um distribuidor
- Ícones dos benefícios se desenham por traço, em sequência **[C]**.
- O botão do WhatsApp dá **um** pulso quando o formulário fica visível, nunca em loop **[C]**.

### 5.12 Contato e rodapé
- Ondas animadas no topo do rodapé **[C]** e a gota do logo quica uma vez ao aparecer.

### 5.13 Página `/links`
- Já tem bolhas e ondas, que também estão desligadas pelo movimento reduzido e passam a seguir a nova política.
- A gota-splash do botão "Peça pelo app" reaproveita o componente do hero.

---

## 6. Onde mexer

| Arquivo | O que muda |
|---|---|
| `app/layout.tsx` → `app/(app)/layout.tsx` (+ mover os 5 grupos) | Separação de layout raiz (4.1) |
| `app/(site)/layout.tsx` | Vira layout raiz com `<html>` próprio; fontes enxutas (4.2) |
| `app/(site)/site.css` | Política de movimento, `data-perf`, `.is-off`, keyframes novos, `@supports (animation-timeline: view())` |
| `app/(site)/_components/scroll-effects.tsx` | Classe de desempenho, pausa fora da tela, fallback das animações de rolagem, contadores com WAAPI |
| `app/(site)/_components/hero-drops.tsx` | Pausar fora da tela, limite de DPR, quantidade por tier |
| **Novo** `_components/drip-drop.tsx` | Gota 3D em SVG (server component, sem JS) usada no hero, nos CTAs e no `/links` |
| **Novo** `_components/sprout.tsx` | Muda que brota (SVG) |
| `app/(site)/page.tsx` | Atributos `data-*`, markup do arco e máscara do galão, camadas de onda, cartões sticky, telas do mockup |
| `app/(site)/links/page.tsx` | Reaproveitar a gota |

---

## 7. Orçamento e como vamos medir

| Métrica | Meta |
|---|---|
| JS novo do site | **≤ 3 kB gzip** (deps novas: 0) |
| CSS novo | ≤ 3 kB gzip |
| LCP (Android médio, 4G simulado) | < 2,5 s |
| INP | < 200 ms |
| CLS | < 0,05 (toda animação parte de posições já reservadas) |
| Rolagem | 60 fps com CPU 4x mais lenta no DevTools; sem "long tasks" > 50 ms ao rolar |
| Camadas compostas simultâneas | ≤ ~15 na viewport (painel *Layers* do DevTools) |

Testes:
- Chrome DevTools: *Performance*, *Rendering → Paint flashing* e *Layers*.
- Lighthouse mobile.
- Um Android de entrada real via depuração remota.
- Safari iOS.
- Firefox, para conferir o caminho de fallback.
- Os três modos: normal, movimento reduzido e modo leve.

---

## 8. Fases sugeridas

1. **Fase 0, base:** layout raiz separado, fontes, política de movimento, modo leve, pausa fora da tela e correções do canvas e do parallax. Mede o antes e o depois com `next build`.
2. **Fase 1, as duas dobras que você desenhou:** hero (sequência do título, sublinhado por último, gota pingando) e palco do galão (portão, galão saindo, ondas em camadas, faixa, balão abrindo).
3. **Fase 2, restante das seções** (5.3 a 5.13).
4. **Fase 3, QA de performance** nos aparelhos e modos acima.

Cada fase vira um commit separado na `develop`, para você poder revisar no navegador entre uma e outra.

---

## 9. Resultado (medido em build de produção, `next build` + `next start`)

### Peso por página (gzip)
| | JS (sem polyfill `noModule`) | CSS | Fontes pré-carregadas |
|---|---|---|---|
| Site (`/`) | **156 kB** | 14 kB | 2 (Bricolage + Figtree) |
| `/links` | 148 kB | 14 kB | 2 |
| App (`/login`), para comparar | 257 kB | 22 kB | 2 (Inter + Manrope) |

- **~100 kB de JS a menos no site.** É o ganho da separação de layout (4.1). O que sobra é o piso do Next/React (React DOM ~69 kB, roteador ~38 kB). Todo o código próprio do site (cabeçalho, efeitos, simulador, formulário, canvas) cabe num pedaço de **13,7 kB**.
- **CSS:** o site passou de 10 para 14 kB. Ficou ~1 kB acima do orçamento de 3 kB, por causa das três telas do celular do app.
- **JS novo das animações:** ~2 kB (níveis de movimento, pausa fora da tela, inclinação, brilho e contagem do simulador). **Nenhuma dependência nova.**

### Rolagem e estabilidade (página inteira rolada em 8 s)
| | Quadros/s | p95 do quadro | Quadros > 33 ms | Tarefas longas durante a rolagem | CLS |
|---|---|---|---|---|---|
| Celular 375×812 | 58 | 16,8 ms | 0 (repetição) | 0 | 0 |
| Desktop 1440×900 | 60 | 17,0 ms | 0 | 0 | 0 |

A primeira passada no celular teve 3 quadros lentos no início, na decodificação das fotos. Na repetição, nenhum.

**Limite desta medição:** o navegador de teste não permite simular CPU lenta. O teste em Android de entrada real e em Safari iOS (seção 7) continua pendente.

### Onde a execução mudou o plano
- **Fontes (4.2):** o ganho real não veio de enxugar a Bricolage. Ele veio de o site deixar de pré-carregar Inter e Manrope (~70 kB), que só o app usa.
- **Garrafinhas (5.4):** em vez de uma camada única de água mascarada, cada garrafa tem o próprio líquido num `::before`. A máscara única não se encaixa numa grade fluida de 40 garrafas recortadas por `clip-path`. São 40 camadas de ~12×30 px que animam só `transform`/`translate`/`rotate`, com custo desprezível.
- **Galeria:** a revelação por `clip-path` na própria figura impedia o `IntersectionObserver` do Chrome de enxergá-la, então as fotos nunca apareciam. Virou uma "cortina" `::before` com `scaleY`, que também é mais barata.
- **Prefetch:** os links para `/register` e `/login` faziam o Next pré-baixar o CSS e as fontes do app. Como o app tem outro layout raiz e a navegação vira um recarregamento completo, esse prefetch era desperdício. Agora é `prefetch={false}`, via o helper `isAppRoute`.
- **Imagens lazy:** no navegador interno de teste, as fotos aparecem baixando cedo. Num iframe com o mesmo HTML e os mesmos scripts, o `loading="lazy"` funciona normalmente. É um efeito da emulação de viewport desse navegador, não da página.

### Como testar os modos
- `/?motion=reduced`: como fica para quem desliga as animações no sistema.
- `/?motion=lite`: aparelho fraco ou economia de dados.
- `/?motion=full`: força tudo, mesmo com animações desligadas no sistema.
