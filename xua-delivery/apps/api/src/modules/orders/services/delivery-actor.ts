import { ActorType, SourceApp } from "@xua/shared/enums";

/**
 * Quem está concluindo a entrega.
 *
 * A conclusão tem dois caminhos legítimos: o motorista validando o código do
 * cliente, e ops/suporte liberando a entrega via override. Antes o ator era
 * fixo (DRIVER/DRIVER_WEB), então um override de ops era gravado na auditoria
 * como se o motorista tivesse feito — com o id do usuário de ops no campo do
 * motorista. A trilha apontava para a pessoa errada justamente no caminho
 * excepcional, que é o que mais precisa de rastreio.
 *
 * Mora num módulo próprio, sem dependência de infra, para que controllers
 * possam montar o ator sem carregar o serviço de entrega inteiro.
 */
export type DeliveryActor = {
  type: ActorType;
  id: string;
  sourceApp: SourceApp;
};

export function driverDeliveryActor(driverId: string): DeliveryActor {
  return { type: ActorType.DRIVER, id: driverId, sourceApp: SourceApp.DRIVER_WEB };
}

/** Ops e suporte usam o mesmo console; o tipo do ator segue o papel real. */
export function opsDeliveryActor(userId: string, role: string): DeliveryActor {
  return {
    type: role === "ops" ? ActorType.OPS : ActorType.SUPPORT,
    id: userId,
    sourceApp: SourceApp.OPS_CONSOLE,
  };
}
