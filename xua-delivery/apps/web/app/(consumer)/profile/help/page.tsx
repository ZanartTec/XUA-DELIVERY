"use client";

import Link from "next/link";
import { MessageCircle, ReceiptText } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/src/components/ui/accordion";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { PageHeader } from "@/src/components/shared/page-header";
import { whatsappHref } from "@/src/lib/format";

const SUPPORT_WHATSAPP = whatsappHref(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP);
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

const FAQ: { q: string; a: string }[] = [
  {
    q: "Preciso devolver o vasilhame vazio?",
    a: "Na água refil, sim: para cada unidade, entregue ao entregador 1 vasilhame vazio do mesmo tipo, em bom estado e dentro da validade (3 anos). Sem o vazio, ele cobra o vasilhame na entrega ou entrega só as unidades com troca. Produtos com vasilhame incluso não exigem troca.",
  },
  {
    q: "Quais formas de pagamento posso usar?",
    a: "Depende da distribuidora: Pix e cartão de crédito pelo Mercado Pago, ou dinheiro e cartão na maquininha do entregador. As opções disponíveis aparecem na etapa de pagamento.",
  },
  {
    q: "Posso cancelar um pedido?",
    a: "Sim, enquanto a distribuidora ainda não aceitou o pedido. Abra o pedido em Pedidos e toque em Cancelar pedido. Depois do aceite, fale com a distribuidora.",
  },
  {
    q: "Para que serve o código de entrega?",
    a: "Quando o pedido sai para entrega, aparece um código no detalhe do pedido. Mostre-o ao entregador: é assim que ele confirma que a água chegou à pessoa certa.",
  },
  {
    q: "Como mudo o endereço de entrega?",
    a: "Toque em “Entregar em” no topo do app ou vá em Perfil › Meus endereços para cadastrar, editar ou excluir endereços.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/profile" title="Ajuda" description="Respostas rápidas e como falar com a gente." />

      <div className="space-y-6 px-4 pb-6">
        <Card className="flex flex-col gap-3 rounded-2xl border-hairline p-4">
          <p className="font-heading font-semibold text-foreground">Problema com um pedido?</p>
          <p className="text-sm text-muted-foreground">
            Abra o pedido para ver o andamento, ligar ou mandar mensagem para a distribuidora responsável.
          </p>
          <Button asChild variant="soft" size="xl">
            <Link href="/orders">
              <ReceiptText /> Ver meus pedidos
            </Link>
          </Button>
          {SUPPORT_WHATSAPP ? (
            <Button asChild variant="outline" size="xl">
              <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer">
                <MessageCircle /> Falar com o suporte Xuá
              </a>
            </Button>
          ) : null}
        </Card>

        <section aria-labelledby="faq" className="space-y-2">
          <h2 id="faq" className="text-sm font-semibold text-foreground">
            Perguntas frequentes
          </h2>
          <Accordion type="single" collapsible className="rounded-2xl border border-hairline bg-card px-4">
            {FAQ.map((item, i) => (
              <AccordionItem key={item.q} value={`q${i}`} className={i === FAQ.length - 1 ? "border-b-0" : undefined}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section id="sobre" aria-labelledby="sobre-title" className="space-y-2">
          <h2 id="sobre-title" className="text-sm font-semibold text-foreground">
            Sobre o Xuá
          </h2>
          <Card className="flex flex-col gap-1 rounded-2xl border-hairline p-4 text-sm text-muted-foreground">
            <p>Água mineral entregue em casa pelas distribuidoras parceiras da sua região.</p>
            {APP_VERSION ? <p className="text-xs">Versão {APP_VERSION}</p> : null}
          </Card>
        </section>
      </div>
    </div>
  );
}
