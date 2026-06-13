import { z } from "zod";
import { USER_SUBSCRIPTION_PAYMENT_METHOD_VALUES } from "../enums";

const UUID = z.string().uuid("ID inválido");
const DATE_ISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Data inválida (YYYY-MM-DD)");

export const userSubscriptionDeliveryDateSchema = z.object({
  date: DATE_ISO,
  time_slot_id: UUID,
  quantity: z.number().int("Quantidade deve ser inteira").positive("Quantidade deve ser positiva"),
});
export type UserSubscriptionDeliveryDateInput = z.infer<
  typeof userSubscriptionDeliveryDateSchema
>;

export const userSubscriptionPaymentMethodSchema = z.enum(USER_SUBSCRIPTION_PAYMENT_METHOD_VALUES);
export type UserSubscriptionPaymentMethod = z.infer<
  typeof userSubscriptionPaymentMethodSchema
>;

export const userSubscriptionCreateSchema = z.object({
  plan_id: UUID,
  distributor_id: UUID,
  address_id: UUID,
  payment_method: userSubscriptionPaymentMethodSchema,
  delivery_dates: z
    .array(userSubscriptionDeliveryDateSchema)
    .min(1, "Informe ao menos uma data de entrega"),
});
export type UserSubscriptionCreateInput = z.infer<typeof userSubscriptionCreateSchema>;

export const userSubscriptionPaymentRetrySchema = z.object({
  payment_method: userSubscriptionPaymentMethodSchema.optional(),
});
export type UserSubscriptionPaymentRetryInput = z.infer<
  typeof userSubscriptionPaymentRetrySchema
>;

export const userSubscriptionDeliveryDateEditSchema = z.object({
  date: DATE_ISO,
  time_slot_id: UUID,
});
export type UserSubscriptionDeliveryDateEditInput = z.infer<
  typeof userSubscriptionDeliveryDateEditSchema
>;
