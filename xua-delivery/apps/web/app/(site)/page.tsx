import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DistributorForm } from "./_components/distributor-form";
import { DripDrop } from "./_components/drip-drop";
import { FloatingActions } from "./_components/floating-actions";
import { HeroDrops } from "./_components/hero-drops";
import { HydrationCalc } from "./_components/hydration-calc";
import {
  ArrowIcon,
  CheckIcon,
  DropIcon,
  InstagramIcon,
  PhoneIcon,
  SmartphoneIcon,
  TruckIcon,
  WhatsAppIcon,
} from "./_components/icons";
import { ScrollEffects } from "./_components/scroll-effects";
import { Sprout } from "./_components/sprout";
import { SiteHeader } from "./_components/site-header";
import { CONTACT, DISTRIBUIDOR_MSG, whatsappUrl } from "./_lib/site-config";
import { SITE_URL } from "./_lib/site-url";

const DESCRIPTION =
  "Água Mineral Natural Xuá, de Juiz de Fora/MG. Galão retornável de 20 litros, hidratação consciente e menos plástico descartável. Peça pelo app ou seja um distribuidor.";

// A imagem de compartilhamento vem de ./opengraph-image.tsx (arquivo tem prioridade).
export const metadata: Metadata = {
  title: "Água Mineral Xuá · A pureza que te move em cada gota",
  description: DESCRIPTION,
  // "/institucional" reaproveita esta página: os dois endereços apontam para "/" como oficial.
  alternates: { canonical: "/" },
  openGraph: {
    title: "Água Mineral Xuá",
    description: "A pureza que te move em cada gota. Galão retornável de 20 L direto da Fonte Estância São Luiz.",
    url: "/",
    siteName: "Água Mineral Xuá",
    locale: "pt_BR",
    type: "website",
  },
};

/** Dados estruturados (schema.org) para o Google entender quem é a empresa. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Água Mineral Xuá",
      legalName: "São Luiz Empresa de Mineração e Águas Imp. Exp. Ltda.",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/site/logo.svg`,
      slogan: "A pureza que te move em cada gota",
      description: DESCRIPTION,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Juiz de Fora",
        addressRegion: "MG",
        addressCountry: "BR",
      },
      areaServed: { "@type": "City", name: "Juiz de Fora" },
      sameAs: [CONTACT.instagramUrl],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer service",
          telephone: CONTACT.phoneFonte,
          areaServed: "BR",
          availableLanguage: "Portuguese",
        },
        {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: `+${CONTACT.whatsappDistribuidor}`,
          areaServed: "BR",
          availableLanguage: "Portuguese",
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      url: `${SITE_URL}/`,
      name: "Água Mineral Xuá",
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

const d = (i: number) => ({ "--d": i }) as React.CSSProperties;

// Onda periódica (período = metade da largura): deslizar -50% fecha o loop sem emenda.
const WAVE_LOOP = "M0 60C240 20 480 20 720 60S1200 100 1440 60S1920 20 2160 60S2640 100 2880 60V120H0z";

/** Três camadas de onda deslizando em velocidades e sentidos diferentes (só translateX). */
function WaveLayers({ className }: { className: string }) {
  return (
    <div className={`xs-waves ${className}`} aria-hidden>
      {["c", "b", "a"].map((k) => (
        <svg key={k} className={`is-${k}`} viewBox="0 0 2880 120" preserveAspectRatio="none">
          <path d={WAVE_LOOP} />
        </svg>
      ))}
    </div>
  );
}

const MARQUEE = [
  "Água mineral natural",
  "Sem gás",
  "Galão retornável de 20 L",
  "Fonte Estância São Luiz",
  "Juiz de Fora · MG",
  "Menos plástico descartável",
  "Todo mundo pede, todo mundo bebe",
];

const GALLERY = [
  { src: "/site/fonte.jpg", alt: "Casa de proteção da nascente da Fonte Estância São Luiz, cercada de mata", cap: "Fonte Estância São Luiz", cls: "g1" },
  { src: "/site/envase-galoes.jpg", alt: "Galões Xuá na máquina de envase", cap: "Envase dos galões", cls: "g2" },
  { src: "/site/reservatorios.jpg", alt: "Reservatórios de aço inox", cap: "Reservatórios inox", cls: "g3" },
  { src: "/site/laboratorio.jpg", alt: "Técnico analisando amostras no laboratório interno", cap: "Laboratório interno", cls: "g4" },
  { src: "/site/envase-linha.jpg", alt: "Linha de envase de garrafas com operador", cap: "Linha de envase", cls: "g5" },
  { src: "/site/fabrica.jpg", alt: "Vista do complexo industrial entre áreas verdes", cap: "Complexo industrial", cls: "g6" },
  { src: "/site/expedicao.jpg", alt: "Equipe carregando galões Xuá no caminhão", cap: "Expedição", cls: "g7" },
];

export default function InstitutionalPage() {
  return (
    <div className="xs-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <noscript>
        <style>{"html .xs [data-play]:not(.is-in) *{animation-play-state:running!important}"}</style>
      </noscript>
      <ScrollEffects />
      <SiteHeader />

      <main>
        {/* HERO */}
        <section className="xs-hero" id="inicio" aria-labelledby="h-hero" data-live>
          <div className="xs-blob xs-blob-a" aria-hidden />
          <div className="xs-blob xs-blob-b" aria-hidden />
          <div className="xs-wrap xs-hero-in">
            <div className="xs-hero-copy">
              <span className="xs-eyebrow xs-anim" style={d(0)}>
                Água mineral natural · Sem gás
              </span>
              <h1 id="h-hero" className="xs-hero-title">
                <span className="xs-line"><span style={d(1)}>A pureza que</span></span>{" "}
                <span className="xs-line"><span style={d(2)}>te move em</span></span>{" "}
                <span className="xs-line"><span style={d(3)}><em>cada gota.</em></span></span>
              </h1>
              <p className="xs-lede xs-anim" style={d(4)}>
                Água mineral natural da Fonte Estância São Luiz, em Juiz de Fora. No galão retornável de 20 litros, para
                você encher a sua garrafa todos os dias e deixar o plástico descartável para trás.
              </p>
              <div className="xs-hero-ctas xs-anim" style={d(5)}>
                <Link className="xs-btn xs-btn-primary xs-btn-lg" href={CONTACT.appRegister} prefetch={false}>
                  <DripDrop />
                  Quero meu galão
                </Link>
                <a className="xs-btn xs-btn-ghost xs-btn-lg" href="#distribuidor">
                  Seja um distribuidor
                  <ArrowIcon />
                </a>
              </div>
              <div className="xs-hero-facts xs-anim" style={d(6)}>
                <div>
                  <b>1990</b>
                  portaria de lavra da fonte
                </div>
                <div>
                  <b>
                    <span data-count="3">3</span> captações
                  </b>
                  nascente e dois poços
                </div>
                <div>
                  <b>
                    <span data-count="20">20</span> L
                  </b>
                  galão retornável e higienizado
                </div>
              </div>
            </div>

            {/* Palco do galão: as animações esperam o bloco aparecer (data-play). */}
            <div className="xs-hero-visual" data-play>
              <HeroDrops />
              <div className="xs-pool" aria-hidden>
                <span className="xs-pool-wave" />
                <span className="xs-pool-wave is-b" />
              </div>
              <div className="xs-galao">
                <div className="xs-galao-px" data-parallax style={{ "--pl": 26 } as React.CSSProperties}>
                  <Image
                    src="/site/galao.png"
                    alt="Galão de 20 litros da Água Mineral Natural Xuá, sem gás"
                    width={750}
                    height={1000}
                    priority
                    sizes="(max-width: 900px) 80vw, 420px"
                  />
                </div>
              </div>
              <span className="xs-splash" aria-hidden />
              <span className="xs-splash is-b" aria-hidden />
              <div className="xs-tag xs-tag-a">
                <b data-count="40">40</b>garrafinhas de 500 ml cabem em um galão Xuá
              </div>
              <div className="xs-tag xs-tag-b">
                <span className="xs-tag-dot" />
                <span className="xs-tag-txt">Sem tratamento químico</span>
              </div>
            </div>
          </div>
          <WaveLayers className="xs-hero-waves" />
        </section>

        {/* FAIXA */}
        <div className="xs-marquee" aria-hidden data-live>
          <div className="xs-marquee-track">
            {[0, 1].map((k) => (
              <div key={k} className="xs-marquee-group">
                {MARQUEE.map((m) => (
                  <span key={m}>
                    {m}
                    <DropIcon />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* PERFIS — o funil */}
        <section className="xs-paths" aria-labelledby="h-paths">
          <div className="xs-wrap">
            <div className="xs-paths-intro" data-reveal>
              <span className="xs-eyebrow is-lime">Comece por aqui</span>
              <h2 id="h-paths">Como podemos te atender?</h2>
              <p>Escolha o seu perfil e fale direto com quem resolve.</p>
            </div>
            <div className="xs-path-list">
              <article className="xs-path" data-reveal data-tilt style={d(0)}>
                <span className="xs-path-ico"><SmartphoneIcon /></span>
                <span className="xs-who">Para sua casa</span>
                <h3>Receba Xuá em casa</h3>
                <p>Peça pelo aplicativo em poucos toques ou ligue para a fonte: a central indica o distribuidor do seu bairro.</p>
                <Link className="xs-go" href={CONTACT.appRegister} prefetch={false}>
                  Pedir pelo app <ArrowIcon />
                </Link>
              </article>
              <article className="xs-path" data-reveal data-tilt style={d(1)}>
                <span className="xs-path-ico"><PhoneIcon /></span>
                <span className="xs-who">Empresas e escritórios</span>
                <h3>Água para a sua equipe</h3>
                <p>Escritórios, lojas e empresas recebem galões com regularidade pelo distribuidor mais próximo.</p>
                <a className="xs-go" href={`tel:${CONTACT.phoneFonte}`}>
                  Ligar {CONTACT.phoneFonteLabel} <ArrowIcon />
                </a>
              </article>
              <article className="xs-path is-feature" data-reveal data-tilt style={d(2)}>
                <span className="xs-path-ico"><WhatsAppIcon /></span>
                <span className="xs-who">Negócios</span>
                <h3>Seja um distribuidor</h3>
                <p>Quer revender ou distribuir Água Mineral Xuá na sua região? Fale com o comercial pelo WhatsApp.</p>
                <a className="xs-go" href="#distribuidor">
                  Quero distribuir <ArrowIcon />
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* HIDRATAÇÃO CONSCIENTE */}
        <section className="xs-section xs-conscious" id="consciente" aria-labelledby="h-consc" data-live>
          <div className="xs-wrap xs-two">
            <div data-reveal="left">
              <span className="xs-eyebrow">Hidratação consciente</span>
              <h2 id="h-consc">Um galão. A sua garrafa. Menos plástico no mundo.</h2>
              <p className="xs-lede">
                Cada garrafinha descartável vira lixo depois de alguns goles. O galão Xuá volta para a fonte, é lavado,
                higienizado e enchido de novo. Você só precisa de uma boa garrafa.
              </p>
              <ol className="xs-steps">
                <li>
                  <b>Tenha seu galão Xuá de 20 litros</b>
                  <span>Em casa, no escritório ou na loja.</span>
                </li>
                <li>
                  <b>Abasteça a sua própria garrafa</b>
                  <span>Leve para o trabalho, a academia, a faculdade. Encha quantas vezes quiser.</span>
                </li>
                <li>
                  <b>Devolva o vazio, receba o cheio</b>
                  <span>O galão retornável é reaproveitado e passa por lavagem e higienização antes de cada envase.</span>
                </li>
              </ol>
            </div>
            <HydrationCalc />
          </div>
        </section>

        {/* A ÁGUA */}
        <section className="xs-section xs-water" id="agua" aria-labelledby="h-water">
          <div className="xs-wrap">
            <div className="xs-water-head" data-reveal>
              <div>
                <span className="xs-eyebrow">Conheça a sua água</span>
                <h2 id="h-water">Água mineral natural não é o mesmo que água potável.</h2>
              </div>
              <p className="xs-lede">
                As duas podem ser bebidas com segurança. A diferença está na origem, no tratamento e no que vem dentro de
                cada gota.
              </p>
            </div>

            <div className="xs-compare" role="table" aria-label="Comparação entre água mineral natural e água potável" data-reveal="scale">
              <div className="xs-crow xs-chead" role="row">
                <div className="xs-blank" role="columnheader" />
                <div className="xs-cx" role="columnheader">
                  <DropIcon /> Água mineral natural Xuá
                </div>
                <div className="xs-cp" role="columnheader">Água potável</div>
              </div>
              {[
                ["De onde vem", "De fonte natural e poços subterrâneos protegidos. A Xuá vem da Fonte Estância São Luiz, em Juiz de Fora.", "De rios, represas ou poços, levada para estações de tratamento."],
                ["Tratamento", "Não recebe tratamento químico. Chega ao galão como sai da fonte.", "Recebe cloro e outros processos para se tornar segura para o consumo."],
                ["Composição", "Estável, com sais minerais da própria rocha. A análise vem impressa no rótulo.", "Varia conforme a origem e o tratamento aplicado."],
                ["Quem fiscaliza", "Lavra autorizada pela Agência Nacional de Mineração (antigo DNPM) e envase sob as normas da Anvisa.", "Padrões de potabilidade do Ministério da Saúde."],
              ].map(([k, x, p], r) => (
                <div className="xs-crow" role="row" key={k} style={{ "--r": r } as React.CSSProperties}>
                  <div className="xs-k" role="rowheader">{k}</div>
                  <div className="xs-xv" role="cell">{x}</div>
                  <div className="xs-pv" role="cell">{p}</div>
                </div>
              ))}
            </div>

            <div className="xs-minerals">
              {[
                ["Ca", "2+", "Cálcio", "Participa da formação e manutenção de ossos e dentes."],
                ["Mg", "2+", "Magnésio", "Ajuda no funcionamento dos músculos e do sistema nervoso."],
                ["K", "+", "Potássio", "Contribui para o equilíbrio de líquidos no corpo."],
                ["HCO₃", "−", "Bicarbonato", "Comum nas águas minerais, participa do equilíbrio do pH."],
              ].map(([sym, ch, name, txt], i) => (
                <div className="xs-mineral" key={name} data-reveal="flip" style={d(i)}>
                  <div className="xs-sym">
                    {sym}
                    <sup>{ch}</sup>
                  </div>
                  <h3>{name}</h3>
                  <p>{txt}</p>
                </div>
              ))}
            </div>
            <div className="xs-minerals-foot" data-reveal>
              <span>Os sais minerais se dissolvem na água enquanto ela percorre as camadas de rocha, por anos, até chegar à fonte.</span>
              <b>A composição completa da Xuá está no rótulo de cada galão.</b>
            </div>
          </div>
        </section>

        {/* BENEFÍCIOS */}
        <section className="xs-section xs-benefits" aria-labelledby="h-ben">
          <div className="xs-wrap xs-benefits-in">
            <div className="xs-quote" data-reveal="left">
              <div className="xs-quote-q">
                O que torna a sua vida <span>saudável?</span>
              </div>
              <p>
                A Água Mineral Xuá representa o que te faz bem. Queremos jovens, adultos e idosos cada vez mais saudáveis
                e com vontade de viver. Beba 2 litros de água por dia, pratique uma atividade física e sinta a vida.
              </p>
              {/* a gota enche de água conforme a rolagem */}
              <span className="xs-quote-drop" aria-hidden>
                <span className="xs-quote-water" />
              </span>
            </div>
            <div>
              <div data-reveal>
                <span className="xs-eyebrow">Boa hidratação</span>
                <h2 id="h-ben">Água é o primeiro hábito de uma vida saudável.</h2>
              </div>
              <div className="xs-benefit-list">
                {[
                  ["Mais disposição e foco", "Mesmo uma desidratação leve pode trazer cansaço e dificuldade de concentração.", <path key="a" d="M12 3a6 6 0 0 0-6 6c0 2.5 1.5 3.6 2 5.5h8c.5-1.9 2-3 2-5.5a6 6 0 0 0-6-6zM9 18h6M10 21h4" />],
                  ["Corpo em equilíbrio", "A água ajuda a regular a temperatura do corpo e o funcionamento dos rins e do intestino.", <path key="b" d="M3 12h4l3-8 4 16 3-8h4" />],
                  ["Parceira do esporte", "Repõe o que se perde no suor e acompanha quem treina, corre e pedala.", <path key="c" d="M13 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 21l3-6 3 2v4M10 15l1-5 4 3h3M6 11l3-3h3" />],
                  ["Bem-estar todo dia", "Com a garrafa sempre cheia por perto, fica mais fácil lembrar de beber água.", <path key="d" d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />],
                ].map(([title, txt, icon], i) => (
                  <div className="xs-benefit" key={title as string} data-reveal style={d(i)}>
                    <div className="xs-ico">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {icon}
                      </svg>
                    </div>
                    <h3>{title}</h3>
                    <p>{txt}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* DA FONTE ATÉ VOCÊ */}
        <section className="xs-section xs-source" id="qualidade" aria-labelledby="h-src" data-live data-glow>
          <WaveLayers className="xs-waves-light is-flip" />
          <span className="xs-glow" aria-hidden />
          <div className="xs-wrap">
            <div className="xs-source-top" data-reveal>
              <div>
                <span className="xs-eyebrow is-sky">Controle e garantia de qualidade</span>
                <h2 id="h-src">Da fonte até a sua garrafa.</h2>
              </div>
              <p className="xs-lede">
                Tecnologia de envase que preserva as características físico-químicas e microbiológicas da água, do jeito
                que ela sai da fonte.
              </p>
            </div>

            <ol className="xs-flow" data-reveal>
              {[
                ["Captação", "Uma nascente e dois poços tubulares da Fonte Estância São Luiz."],
                ["Reservatórios", "Tanques de aço inox armazenam a água protegida."],
                ["Operações autorizadas", "Somente os processos permitidos pela legislação."],
                ["Envase", "Cada galão é lavado e higienizado antes de ser enchido."],
                ["Armazenamento", "Galões lacrados e guardados em local limpo e seco."],
                ["Distribuição", "A rede de distribuidores leva a Xuá até você."],
              ].map(([t, p], i) => (
                <li key={t} style={d(i)}>
                  <div className="xs-dot">{i + 1}</div>
                  <div>
                    <h3>{t}</h3>
                    <p>{p}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="xs-gallery">
              {GALLERY.map((g, i) => (
                <figure className={g.cls} key={g.src} data-reveal="wipe" style={d(i)}>
                  <Image src={g.src} alt={g.alt} fill sizes="(max-width: 860px) 50vw, 33vw" />
                  <figcaption>{g.cap}</figcaption>
                </figure>
              ))}
            </div>

            <div className="xs-quality">
              {[
                ["Laboratório próprio e UFJF", "Análises no laboratório interno e parceria com o Laboratório de Farmácia e Bioquímica da Universidade Federal de Juiz de Fora."],
                ["Boas Práticas de Fabricação", "Manual de Boas Práticas e Procedimentos Operacionais Padrão (POPs) seguidos em todo o processo industrial."],
                ["Normas ANM e Anvisa", "Envase de acordo com as especificações técnicas da Agência Nacional de Mineração e da Agência Nacional de Vigilância Sanitária."],
              ].map(([t, p], i) => (
                <div key={t} data-reveal style={d(i)}>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </div>
              ))}
            </div>
          </div>
          <WaveLayers className="xs-waves-light" />
        </section>

        {/* HISTÓRIA */}
        <section className="xs-section xs-history" id="historia" aria-labelledby="h-hist">
          <div className="xs-wrap xs-history-in">
            <div className="xs-history-body" data-reveal="left">
              <span className="xs-eyebrow">Nossa história</span>
              <h2 id="h-hist">Tradição de Juiz de Fora desde os anos 90.</h2>
              <p className="xs-lede">
                Uma marca que cresceu junto com a cidade, presente nas corridas, nas trilhas, nos campos e nos grandes
                eventos da região.
              </p>
              <p>
                A São Luiz Empresa de Mineração e Águas iniciou a extração, o envase e a comercialização de água mineral
                em Juiz de Fora, Minas Gerais, na década de 90. Ao longo dos anos, a marca Água Mineral Xuá conquistou
                grande destaque no segmento.
              </p>
              <p>
                Sempre com profissionais especializados e tecnologia de ponta, a empresa investe em qualidade, marketing e
                logística de distribuição, e acredita no conceito de agregar valor à água mineral. Hoje se prepara para
                atender a demanda por novos pontos de distribuição, com uma gestão autossustentada e em harmonia com o meio
                ambiente.
              </p>
              <div className="xs-mv">
                <div>
                  <h3>Missão</h3>
                  <p>
                    Extrair, envasar e distribuir Água Mineral Natural com um controle de qualidade que preserve as suas
                    características físico-químicas, oferecendo produtos que tragam mais qualidade à vida das pessoas.
                  </p>
                </div>
                <div>
                  <h3>Valores</h3>
                  <ul>
                    <li>Ética</li>
                    <li>Transparência</li>
                    <li>Produzir com carinho e trabalhar com amor</li>
                    <li>Responsabilidade social e com o meio ambiente</li>
                  </ul>
                </div>
              </div>
            </div>
            <ol className="xs-timeline">
              <li data-reveal>
                <div className="xs-when">1990</div>
                <p>Portaria de Lavra nº 821, de 05/10/1990, concede o direito de exploração da Fonte Estância São Luiz.</p>
              </li>
              <li data-reveal>
                <div className="xs-when">Anos 90</div>
                <p>Começam a extração, o envase e a venda da Água Mineral Xuá em Juiz de Fora.</p>
                <div className="xs-tl-img is-truck">
                  <Image src="/site/caminhao.jpg" alt="Caminhão de entrega com a marca Xuá" fill sizes="(max-width: 900px) 90vw, 520px" />
                </div>
              </li>
              <li data-reveal>
                <div className="xs-when">No esporte</div>
                <p>A Xuá acredita no esporte como veículo de promoção humana: mountain bike, corridas, triatlo, travessias e futebol.</p>
                <div className="xs-tl-img">
                  <Image src="/site/evento-mtb.jpg" alt="Garrafa inflável da Xuá em evento de mountain bike" fill sizes="(max-width: 900px) 90vw, 520px" />
                </div>
              </li>
              <li data-reveal>
                <div className="xs-when">Na cultura e nos negócios</div>
                <p>Água oficial em festivais gastronômicos, semanas de moda e feiras da região, com parceiros como:</p>
                <div className="xs-partners">
                  {["APEX Brasil", "FIEMG", "SEBRAE", "ABRASEL/JF", "Duetto Produções"].map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
              </li>
              <li className="is-now" data-reveal>
                <div className="xs-when">Hoje</div>
                <p>Nova identidade, aplicativo de pedidos e uma rede de distribuidores em expansão. Sinta a vida.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* SOCIOAMBIENTAL */}
        <section className="xs-section xs-eco" id="socioambiental" aria-labelledby="h-eco">
          <div className="xs-wrap">
            <div className="xs-eco-head" data-reveal>
              <span className="xs-eyebrow is-green">Responsabilidade socioambiental</span>
              <h2 id="h-eco">Cuidar da água é cuidar de onde ela nasce.</h2>
              <p className="xs-lede">
                A gestão ambiental da fábrica, os projetos com a comunidade e o galão retornável fazem parte do mesmo
                compromisso.
              </p>
            </div>
            <div className="xs-eco-grid">
              <div className="xs-eco-card is-big" data-reveal="left">
                <div className="xs-eco-img">
                  <Image src="/site/coleta-seletiva.jpg" alt="Tambores coloridos de coleta seletiva na fábrica" fill sizes="(max-width: 900px) 90vw, 360px" />
                </div>
                <div className="xs-eco-txt">
                  <h3>Gestão ambiental na fábrica</h3>
                  <p>Resíduos separados, efluentes tratados e água reaproveitada.</p>
                  <ul className="xs-eco-list">
                    {[
                      "Coleta seletiva de resíduos",
                      "Gerenciamento de resíduos sólidos",
                      "Tratamento de efluentes sanitários e industriais",
                      "Reuso da água",
                      "Estudos ambientais e áreas de proteção da fonte",
                    ].map((t) => (
                      <li key={t}>
                        <CheckIcon />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="xs-eco-side">
                <div className="xs-eco-card" data-reveal="right">
                  <div className="xs-eco-txt">
                    <div className="xs-big-num">
                      <span data-count="9000">9.000</span>
                      <Sprout />
                    </div>
                    <h3>mudas nativas</h3>
                    <p>
                      Projeto Estruturador com o Instituto Estadual de Florestas (IEF) para reconstituição da flora, com
                      regeneração, enriquecimento e implantação de árvores nativas.
                    </p>
                  </div>
                </div>
                <div className="xs-eco-card" data-reveal="right" style={d(1)}>
                  <div className="xs-eco-img is-short">
                    <Image src="/site/pequeno-jardineiro.jpg" alt="Jovens trabalhando em viveiro de mudas" fill sizes="(max-width: 900px) 90vw, 360px" />
                  </div>
                  <div className="xs-eco-txt">
                    <h3>Casa do Pequeno Jardineiro</h3>
                    <p>Aprendizado e profissionalização em Educação Ambiental para jovens em situação socioeconômica desfavorável.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* APP */}
        <section className="xs-app" id="app" aria-labelledby="h-app" data-live>
          <div className="xs-wrap">
            <div className="xs-app-band" data-reveal="scale">
              <div className="xs-app-copy">
                <span className="xs-eyebrow is-lime">Aplicativo Xuá</span>
                <h2 id="h-app">Todo mundo pede. Todo mundo bebe.</h2>
                <p className="xs-lede">
                  Peça o seu galão pelo aplicativo em poucos toques e receba do distribuidor do seu bairro. Prefere ligar?
                  A nossa central atende e encaminha o seu pedido.
                </p>
                <div className="xs-app-ctas">
                  <Link className="xs-btn xs-btn-lime xs-btn-lg" href={CONTACT.appRegister} prefetch={false}>
                    <SmartphoneIcon />
                    Criar minha conta
                  </Link>
                  <a className="xs-btn xs-btn-white xs-btn-lg" href={`tel:${CONTACT.phoneFonte}`}>
                    <PhoneIcon />
                    {CONTACT.phoneFonteLabel}
                  </a>
                </div>
                <p className="xs-app-login">
                  Já tem conta? <Link href={CONTACT.appLogin} prefetch={false}>Entrar no app</Link>
                </p>
              </div>
              <div className="xs-app-visual" aria-hidden data-play>
                <div className="xs-ring" />
                <div className="xs-ring is-b" />
                {/* o celular gira em 3D preso à rolagem; as telas se alternam: pedir → confirmado → a caminho */}
                <div className="xs-phone-3d">
                  <div className="xs-phone">
                    <div className="xs-phone-screen">
                      <div className="xs-ph-scr is-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="xs-ph-logo" src="/site/logo.svg" alt="" />
                        <div className="xs-ph-t">Olá! Vamos pedir a sua água?</div>
                        <div className="xs-ph-item">
                          <Image src="/site/galao.png" alt="" width={34} height={45} />
                          <div>
                            Galão Xuá 20 L<small>Água mineral natural</small>
                          </div>
                        </div>
                        <div className="xs-ph-item is-dim">
                          <span className="xs-ph-re">⟳</span>
                          <div>
                            Pedir de novo<small>Seu último pedido</small>
                          </div>
                        </div>
                        <div className="xs-ph-btn">Pedir agora</div>
                      </div>
                      <div className="xs-ph-scr is-2">
                        <span className="xs-ph-ok">
                          <CheckIcon />
                        </span>
                        <div className="xs-ph-t">Pedido confirmado!</div>
                        <p className="xs-ph-sub">O distribuidor do seu bairro já recebeu o seu pedido.</p>
                        <div className="xs-ph-item">
                          <Image src="/site/galao.png" alt="" width={34} height={45} />
                          <div>
                            1 × Galão Xuá 20 L<small>Troca do galão vazio</small>
                          </div>
                        </div>
                      </div>
                      <div className="xs-ph-scr is-3">
                        <div className="xs-ph-t">A caminho</div>
                        <p className="xs-ph-sub">O seu galão já saiu para entrega.</p>
                        <div className="xs-ph-route">
                          <span className="xs-ph-pin is-a" />
                          <span className="xs-ph-truck">
                            <TruckIcon />
                          </span>
                          <span className="xs-ph-pin is-b">
                            <DropIcon />
                          </span>
                        </div>
                        <div className="xs-ph-btn is-ghost">Acompanhar pedido</div>
                      </div>
                    </div>
                  </div>
                  <div className="xs-ph-toast">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/site/logo.svg" alt="" />
                    <div>
                      <b>Xuá</b>Seu pedido saiu para entrega
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DISTRIBUIDOR */}
        <section className="xs-section xs-dist" id="distribuidor" aria-labelledby="h-dist">
          <div className="xs-wrap xs-two">
            <div data-reveal="left">
              <span className="xs-eyebrow">Distribuição e revenda</span>
              <h2 id="h-dist">Seja um distribuidor da Água Mineral Xuá.</h2>
              <p className="xs-lede">
                Leve uma marca tradicional de Juiz de Fora para a sua região. O comercial atende pelo WhatsApp e apresenta
                as condições para distribuidores e revendedores.
              </p>
              <div className="xs-perks">
                {[
                  ["Excelência", "Água mineral natural com controle de qualidade da fonte ao galão.", <path key="a" pathLength={1} d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9.3l7-.8z" />],
                  ["Frescor", "Produção própria em Juiz de Fora e logística de distribuição estruturada.", <path key="b" pathLength={1} d="M12 2.5c3 4.3 7 7.5 7 11.5a7 7 0 0 1-14 0c0-4 4-7.2 7-11.5z" />],
                  ["Bons negócios", "Produto de giro constante para casas, escritórios, lojas e empresas.", <path key="c" pathLength={1} d="M3 17l6-6 4 4 8-8M15 7h6v6" />],
                  ["Pedidos pelo app", "Os pedidos dos consumidores da sua região chegam organizados no painel do distribuidor.", <path key="d" pathLength={1} d="M6 2h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM8 8h8M8 12h8M8 16h5" />],
                ].map(([t, p, icon], i) => (
                  <div className="xs-perk" key={t as string} style={{ "--p": i } as React.CSSProperties}>
                    <div className="xs-ico is-green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {icon}
                      </svg>
                    </div>
                    <div>
                      <b>{t}</b>
                      <span>{p}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DistributorForm />
          </div>
        </section>

        {/* CONTATO */}
        <section className="xs-section xs-contact" id="contato" aria-labelledby="h-cont">
          <div className="xs-wrap">
            <div data-reveal>
              <span className="xs-eyebrow">Contato</span>
              <h2 id="h-cont">Fale com a Xuá.</h2>
            </div>
            <div className="xs-contact-grid">
              <div className="xs-ccard is-dark" data-reveal style={d(0)}>
                <span className="xs-who">Consumidor final</span>
                <div className="xs-num">{CONTACT.phoneFonteLabel}</div>
                <p>Ligue para a fonte. A nossa central indica o distribuidor que atende o seu bairro.</p>
                <a className="xs-btn xs-btn-lime" href={`tel:${CONTACT.phoneFonte}`}>
                  <PhoneIcon /> Ligar agora
                </a>
              </div>
              <div className="xs-ccard" data-reveal style={d(1)}>
                <span className="xs-who">Distribuidores e revendedores</span>
                <div className="xs-num">{CONTACT.whatsappDistribuidorLabel}</div>
                <p>WhatsApp do comercial para condições de distribuição e revenda.</p>
                <a className="xs-btn xs-btn-primary" href={whatsappUrl(DISTRIBUIDOR_MSG)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon /> Abrir WhatsApp
                </a>
              </div>
              <div className="xs-ccard" data-reveal style={d(2)}>
                <span className="xs-who">Redes sociais</span>
                <div className="xs-num">{CONTACT.instagramHandle}</div>
                <p>Acompanhe novidades, dicas de hidratação e promoções no Instagram.</p>
                <a className="xs-btn xs-btn-ghost" href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer">
                  <InstagramIcon /> Seguir no Instagram
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="xs-footer">
        <WaveLayers className="xs-waves-mist is-flip" />
        <div className="xs-wrap xs-footer-in">
          <div className="xs-footer-brand" data-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/site/logo.svg" alt="Água Mineral Xuá" width={92} height={92} />
            <div className="xs-slogan">
              Todo mundo pede,
              <br />
              todo mundo bebe.
            </div>
          </div>
          <div>
            <h4>Navegue</h4>
            <ul>
              <li><a href="#agua">A água</a></li>
              <li><a href="#consciente">Hidratação consciente</a></li>
              <li><a href="#qualidade">Qualidade</a></li>
              <li><a href="#historia">Nossa história</a></li>
              <li><a href="#socioambiental">Socioambiental</a></li>
            </ul>
          </div>
          <div>
            <h4>Atendimento</h4>
            <ul>
              <li><a href={`tel:${CONTACT.phoneFonte}`}>Consumidor: {CONTACT.phoneFonteLabel}</a></li>
              <li><a href={whatsappUrl(DISTRIBUIDOR_MSG)} target="_blank" rel="noopener noreferrer">Distribuidores: {CONTACT.whatsappDistribuidorLabel}</a></li>
              <li><a href="#distribuidor">Seja um distribuidor</a></li>
              <li><Link href={CONTACT.appLogin} prefetch={false}>Entrar no app</Link></li>
            </ul>
          </div>
          <div>
            <h4>A fonte</h4>
            <ul>
              <li>Fonte Estância São Luiz</li>
              <li>Juiz de Fora · Minas Gerais</li>
              <li><a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a></li>
              <li><Link href="/links">Todos os links</Link></li>
            </ul>
          </div>
          <div className="xs-legal">
            <span>© {new Date().getFullYear()} São Luiz Empresa de Mineração e Águas Imp. Exp. Ltda. · Água Mineral Xuá</span>
            <span>Água mineral natural sem gás</span>
          </div>
        </div>
      </footer>

      <FloatingActions />
    </div>
  );
}
