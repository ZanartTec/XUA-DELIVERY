import { redirect } from "next/navigation";

/** A escolha da distribuidora agora faz parte da etapa "Entrega". */
export default function CheckoutDistributorPage() {
  redirect("/checkout/schedule");
}
