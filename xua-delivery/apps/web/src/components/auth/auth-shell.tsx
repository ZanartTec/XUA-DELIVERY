import Image from "next/image";
import Link from "next/link";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Rodapé do card (ex.: "Novo no Xuá? Criar conta"). */
  footer?: React.ReactNode;
}

/**
 * Layout único das telas de acesso (login, cadastro, esqueci/redefinir senha).
 * Mobile: foto de fundo + card translúcido com o formulário na zona do polegar.
 * Desktop: tela dividida (formulário à esquerda, foto e mensagem à direita).
 * Antes cada tela tinha um visual próprio e o fundo do cadastro sumia (A-01).
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-dvh bg-background lg:grid lg:grid-cols-12">
      {/* Foto: fundo no mobile, painel à direita no desktop */}
      <div className="fixed inset-0 lg:relative lg:order-2 lg:col-span-7 lg:h-dvh xl:col-span-8">
        <Image
          src="/woman-water2.webp"
          alt=""
          aria-hidden
          fill
          priority
          quality={75}
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover object-top"
        />
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-transparent via-white/20 to-white/60 lg:bg-linear-to-br lg:from-primary/45 lg:via-transparent lg:to-cta/20" />
        <div className="absolute inset-x-12 bottom-12 hidden max-w-lg space-y-3 rounded-2xl border border-white/10 bg-black/15 p-8 text-white backdrop-blur-md lg:block">
          <p className="font-heading text-3xl leading-tight font-extrabold xl:text-4xl">Água mineral na sua porta, no dia certo.</p>
          <p className="text-white/90">Peça em poucos toques e acompanhe a entrega até a sua casa ou empresa.</p>
        </div>
      </div>

      {/* Formulário */}
      <main className="relative z-10 flex min-h-dvh flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:order-1 lg:col-span-5 lg:bg-card lg:px-12 lg:py-10 lg:shadow-[4px_0_24px_rgba(0,0,0,0.05)] xl:col-span-4 xl:px-16">
        <Link href="/login" className="mx-auto shrink-0 lg:mx-0" aria-label="Xuá — página inicial">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-transparent.png"
            alt="Xuá Água Mineral"
            className="h-20 w-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.25)] lg:h-16 lg:drop-shadow-none"
          />
        </Link>

        <div className="mx-auto mt-auto w-full max-w-sm rounded-3xl bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur-md lg:my-auto lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
          <h1 className="font-heading text-2xl leading-tight font-extrabold text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-5">{children}</div>
          {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
