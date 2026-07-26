import { z } from "zod";
import {
  BOTTLE_CONDITION_VALUES,
  CHECKOUT_PAYMENT_METHOD_VALUES,
  DELIVERY_WINDOW_INPUT_VALUES,
  NON_COLLECTION_REASON_VALUES,
  OrderStatus,
  REJECT_ORDER_REASON_VALUES,
} from "../enums";
import { DEFAULT_CHECKOUT_PAYMENT_METHOD, isCashPaymentMethod } from "../mappers/payment";

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const dateQuery = z
  .string()
  .trim()
  .regex(YYYY_MM_DD, "Data inválida (YYYY-MM-DD)")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Data inválida");

const optionalDateQuery = z.preprocess(emptyStringToUndefined, dateQuery.optional());
const pageQuery = z.preprocess(
  emptyStringToUndefined,
  z.coerce
    .number()
    .int("page deve ser inteiro")
    .min(1, "page deve ser maior que zero")
    .default(1)
);
const limitQuery = z.preprocess(
  emptyStringToUndefined,
  z.coerce
    .number()
    .int("limit deve ser inteiro")
    .min(1, "limit deve ser maior que zero")
    .max(50, "limit deve ser no máximo 50")
    .default(20)
);

export const CONSUMER_ORDERS_STATUS_GROUP_VALUES = ["all", "active", "delivered", "cancelled"] as const;

// Sem .strict(): a mesma rota GET /api/orders também atende ops/driver via
// req.query.status (não relacionado a este schema) — validamos só os campos
// relevantes à listagem paginada do consumer, sem rejeitar a query inteira.
export const consumerOrdersQuerySchema = z.object({
  statusGroup: z.preprocess(
    emptyStringToUndefined,
    z.enum(CONSUMER_ORDERS_STATUS_GROUP_VALUES).default("all")
  ),
  page: pageQuery,
  limit: limitQuery,
});
export type ConsumerOrdersQueryInput = z.infer<typeof consumerOrdersQuerySchema>;

export const DISTRIBUTOR_QUEUE_STAGE_VALUES = ["all", "incoming", "preparation", "route"] as const;
export const DISTRIBUTOR_QUEUE_ORIGIN_VALUES = ["all", "cart", "subscription"] as const;
export const DISTRIBUTOR_QUEUE_SORT_VALUES = ["created_desc", "delivery_asc", "sla_asc"] as const;
export const DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES = [
  OrderStatus.SENT_TO_DISTRIBUTOR,
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
] as const;

export const distributorQueueQuerySchema = z
  .object({
    scope: z.literal("distributor"),
    stage: z.preprocess(
      emptyStringToUndefined,
      z.enum(DISTRIBUTOR_QUEUE_STAGE_VALUES).default("all")
    ),
    status: z.preprocess(
      emptyStringToUndefined,
      z.enum(DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES).optional()
    ),
    q: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(2, "Busca deve ter ao menos 2 caracteres").max(120).optional()
    ),
    origin: z.preprocess(
      emptyStringToUndefined,
      z.enum(DISTRIBUTOR_QUEUE_ORIGIN_VALUES).default("all")
    ),
    deliveryDate: optionalDateQuery,
    start: optionalDateQuery,
    end: optionalDateQuery,
    driverId: z.preprocess(
      emptyStringToUndefined,
      z.union([z.string().uuid("Motorista inválido"), z.literal("unassigned")]).optional()
    ),
    sort: z.preprocess(
      emptyStringToUndefined,
      z.enum(DISTRIBUTOR_QUEUE_SORT_VALUES).default("created_desc")
    ),
    page: pageQuery,
    limit: limitQuery,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.deliveryDate && (data.start || data.end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryDate"],
        message: "deliveryDate não pode ser combinado com start/end",
      });
    }

    if (!data.start || !data.end) return;

    const start = Date.parse(`${data.start}T00:00:00.000Z`);
    const end = Date.parse(`${data.end}T00:00:00.000Z`);
    if (start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "end deve ser posterior ou igual a start",
      });
    }

    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (end - start > maxRangeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Intervalo máximo para a fila é de 31 dias",
      });
    }
  });
export type DistributorQueueQueryInput = z.infer<typeof distributorQueueQuerySchema>;
export type DistributorQueueStageInput = (typeof DISTRIBUTOR_QUEUE_STAGE_VALUES)[number];
export type DistributorQueueOriginInput = (typeof DISTRIBUTOR_QUEUE_ORIGIN_VALUES)[number];
export type DistributorQueueSortInput = (typeof DISTRIBUTOR_QUEUE_SORT_VALUES)[number];
export type DistributorQueueActiveStatusInput = (typeof DISTRIBUTOR_QUEUE_ACTIVE_STATUS_VALUES)[number];

export const createOrderSchema = z.object({
  address_id: z.string().uuid("Endereço inválido"),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  delivery_window: z.enum(DELIVERY_WINDOW_INPUT_VALUES),
  distributor_id: z.string().uuid("Distribuidora inválida"),
  time_slot_id: z.string().uuid("Horário inválido").optional(),
  delivery_instructions: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().max(280, "Instruções devem ter no máximo 280 caracteres").optional()
  ),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Produto inválido"),
        quantity: z.number().int().min(1, "Quantidade mínima: 1"),
      })
    )
    .min(1, "Adicione ao menos um item"),
  // Vazios para troca, por tipo de vasilhame (settlement de caução).
  empty_bottles: z
    .array(
      z.object({
        bottle_product_id: z.string().uuid("Vasilhame inválido"),
        quantity: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
  payment_method: z.enum(CHECKOUT_PAYMENT_METHOD_VALUES).default(DEFAULT_CHECKOUT_PAYMENT_METHOD),
  cash_change_for_cents: z.number().int().min(0).nullable().optional(),
}).superRefine((data, ctx) => {
  if (!isCashPaymentMethod(data.payment_method) && data.cash_change_for_cents != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cash_change_for_cents"],
      message: "Troco só pode ser informado para pagamento em dinheiro",
    });
  }
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RatingInput = z.infer<typeof ratingSchema>;

export const bottleExchangeSchema = z.object({
  driver_id: z.string().uuid(),
  // Vazios efetivamente coletados do consumidor na entrega (settlement de caução).
  // Quando ausente, assume-se igual a returned_empty_qty (compat retroativa).
  collected_empty_qty: z.number().int().min(0, "Quantidade inválida").optional(),
  // Vazios devolvidos ao estoque da distribuidora (RETURNABLE_EMPTY in).
  returned_empty_qty: z.number().int().min(0, "Quantidade inválida"),
  bottle_condition: z.enum(BOTTLE_CONDITION_VALUES),
});
export type BottleExchangeInput = z.infer<typeof bottleExchangeSchema>;

export const nonCollectionSchema = z.object({
  driver_id: z.string().uuid(),
  reason: z.enum(NON_COLLECTION_REASON_VALUES),
  notes: z.string().trim().min(10, "Detalhe deve ter ao menos 10 caracteres").optional(),
}).superRefine((data, ctx) => {
  if (data.reason === "other" && (!data.notes || data.notes.length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["notes"],
      message: "Detalhe deve ter ao menos 10 caracteres",
    });
  }
});
export type NonCollectionInput = z.infer<typeof nonCollectionSchema>;

export const rejectOrderSchema = z.object({
  reason: z.enum(REJECT_ORDER_REASON_VALUES),
  details: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.reason === "other" && (!data.details || data.details.length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["details"],
      message: "Detalhe deve ter ao menos 10 caracteres para 'Outro'",
    });
  }
});
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;

export const reconciliationSchema = z.object({
  items: z.array(
    z.object({
      order_id: z.string().uuid(),
      returned_empty_qty: z.number().int().min(0),
    })
  ).min(1),
  justification: z.string().trim().min(5, "Justificativa deve ter ao menos 5 caracteres").optional(),
});
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;

export const rescheduleSchema = z.object({
  new_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  new_delivery_window: z.enum(DELIVERY_WINDOW_INPUT_VALUES),
  reason: z.string().min(5, "Motivo deve ter ao menos 5 caracteres"),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

// --- Schemas das sub-rotas PATCH /orders/:id/* (uma ação por rota) ---

const driverIdSchema = z.object({
  driver_id: z.string().uuid("ID do motorista obrigatório"),
});

export const assignDriverSchema = driverIdSchema;
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;

export const dispatchSchema = driverIdSchema;
export type DispatchInput = z.infer<typeof dispatchSchema>;

export const dispatchWithChecklistSchema = driverIdSchema;
export type DispatchWithChecklistInput = z.infer<typeof dispatchWithChecklistSchema>;

export const verifyOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Código OTP deve ter 6 dígitos"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const otpOverrideSchema = z.object({
  reason: z.string().trim().min(1, "Motivo obrigatório para override"),
});
export type OtpOverrideInput = z.infer<typeof otpOverrideSchema>;

// Aceita os três aliases legados do boolean de retorno físico ao estoque
// (return_to_stock / returned_to_stock / physical_return_confirmed) — a
// resolução de qual prevalece é feita em `stockReturnOptions()` no controller.
const stockReturnFields = {
  return_to_stock: z.boolean().optional(),
  returned_to_stock: z.boolean().optional(),
  physical_return_confirmed: z.boolean().optional(),
};

export const cancelOrderSchema = z.object({
  reason: z.string().trim().optional(),
  ...stockReturnFields,
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const deliveryFailedSchema = z.object({
  reason: z.string().trim().min(1, "Motivo obrigatório"),
  ...stockReturnFields,
});
export type DeliveryFailedInput = z.infer<typeof deliveryFailedSchema>;

export const scheduleRedeliverySchema = z.object({
  new_date: z
    .string()
    .trim()
    .min(1, "Nova data obrigatória")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Nova data inválida"),
});
export type ScheduleRedeliveryInput = z.infer<typeof scheduleRedeliverySchema>;

