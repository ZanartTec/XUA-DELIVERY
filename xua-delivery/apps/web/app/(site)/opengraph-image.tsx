import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Imagem de compartilhamento (WhatsApp, Instagram, Google, X), gerada no build.
// Mantida abaixo de ~300 kB: o WhatsApp ignora prévias maiores que isso.
export const alt = "Água Mineral Xuá · A pureza que te move em cada gota";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "A pureza que te move em cada gota.";
const EYEBROW = "ÁGUA MINERAL NATURAL · JUIZ DE FORA";
const SUB = "Galão retornável de 20 litros";

async function asDataUri(file: string, mime: string): Promise<string> {
  const buf = await readFile(join(process.cwd(), "public", "site", file));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Bricolage Grotesque em TTF (o gerador não lê woff2), só com as letras usadas.
 * Sem rede no build, cai na fonte padrão em vez de quebrar.
 */
async function loadFont(weight: 500 | 800, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [logo, galao, bold, regular] = await Promise.all([
    asDataUri("logo.svg", "image/svg+xml"),
    asDataUri("galao.png", "image/png"),
    loadFont(800, HEADLINE),
    loadFont(500, EYEBROW + SUB),
  ]);
  const fonts = bold && regular;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#1c3a80",
          color: "#fff",
          position: "relative",
          fontFamily: fonts ? "Bricolage" : undefined,
          fontWeight: 500,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 80,
            bottom: -140,
            width: 500,
            height: 620,
            borderRadius: "250px 250px 0 0",
            background: "#2a4c98",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", padding: "62px 0 0 72px", width: 720 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={112} height={112} alt="" />
          <div style={{ fontSize: 24, color: "#a6ce39", marginTop: 44, letterSpacing: 5 }}>{EYEBROW}</div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1,
              marginTop: 20,
              letterSpacing: -3,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ fontSize: 28, color: "#c8d6f2", marginTop: 28 }}>{SUB}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={galao} alt="" width={345} height={460} style={{ position: "absolute", right: 157, bottom: 0 }} />
      </div>
    ),
    {
      ...size,
      fonts:
        bold && regular
        ? [
            { name: "Bricolage", data: bold, weight: 800, style: "normal" },
            { name: "Bricolage", data: regular, weight: 500, style: "normal" },
          ]
        : undefined,
    },
  );
}
