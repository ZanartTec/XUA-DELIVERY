import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTOR_TYPE_VALUES,
  ActorType,
  AUDIT_EVENT_TYPE_VALUES,
  AuditEventType,
  BANNER_TYPE_VALUES,
  BannerType,
  CONSUMER_ROLE_VALUES,
  ConsumerRole,
  DELIVERY_DATE_STATUS_VALUES,
  DeliveryDateStatus,
  DELIVERY_WINDOW_VALUES,
  DeliveryWindow,
  DEPOSIT_STATUS_VALUES,
  DepositStatus,
  IDEMPOTENCY_STATUS_VALUES,
  IdempotencyStatus,
  ORDER_STATUS_VALUES,
  OrderStatus,
  OTP_STATUS_VALUES,
  OtpStatus,
  PAYMENT_KIND_VALUES,
  PaymentKind,
  PAYMENT_STATUS_VALUES,
  PaymentStatus,
  SOURCE_APP_VALUES,
  SourceApp,
  USER_SUBSCRIPTION_STATUS_VALUES,
  UserSubscriptionStatus,
} from "../packages/shared/src/enums/index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");

const EXPECTED_ENUMS = {
  DeliveryWindow: { values: DELIVERY_WINDOW_VALUES, object: DeliveryWindow },
  OrderStatus: { values: ORDER_STATUS_VALUES, object: OrderStatus },
  OtpStatus: { values: OTP_STATUS_VALUES, object: OtpStatus },
  PaymentKind: { values: PAYMENT_KIND_VALUES, object: PaymentKind },
  PaymentStatus: { values: PAYMENT_STATUS_VALUES, object: PaymentStatus },
  DepositStatus: { values: DEPOSIT_STATUS_VALUES, object: DepositStatus },
  ActorType: { values: ACTOR_TYPE_VALUES, object: ActorType },
  ConsumerRole: { values: CONSUMER_ROLE_VALUES, object: ConsumerRole },
  SourceApp: { values: SOURCE_APP_VALUES, object: SourceApp },
  AuditEventType: { values: AUDIT_EVENT_TYPE_VALUES, object: AuditEventType },
  IdempotencyStatus: { values: IDEMPOTENCY_STATUS_VALUES, object: IdempotencyStatus },
  UserSubscriptionStatus: {
    values: USER_SUBSCRIPTION_STATUS_VALUES,
    object: UserSubscriptionStatus,
  },
  DeliveryDateStatus: { values: DELIVERY_DATE_STATUS_VALUES, object: DeliveryDateStatus },
  BannerType: { values: BANNER_TYPE_VALUES, object: BannerType },
} satisfies Record<string, { values: readonly string[]; object: Record<string, string> }>;

function parsePrismaEnums(schema: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const enumBlocks = schema.matchAll(/enum\s+(\w+)\s+\{([\s\S]*?)\}/g);

  for (const [, enumName, body] of enumBlocks) {
    const values = body
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line.length > 0 && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0])
      .filter((value): value is string => Boolean(value));

    enums.set(enumName, values);
  }

  return enums;
}

function formatList(values: readonly string[]): string {
  return `[${values.join(", ")}]`;
}

const schema = readFileSync(schemaPath, "utf8");
const prismaEnums = parsePrismaEnums(schema);
const failures: string[] = [];

for (const [enumName, expected] of Object.entries(EXPECTED_ENUMS)) {
  const expectedValues = [...expected.values];
  const sharedObjectKeys = Object.keys(expected.object);
  const sharedObjectValues = Object.values(expected.object);

  if (formatList(sharedObjectKeys) !== formatList(expectedValues)) {
    failures.push(
      `${enumName}: shared object keys ${formatList(sharedObjectKeys)} != shared values ${formatList(expectedValues)}`
    );
  }

  if (formatList(sharedObjectValues) !== formatList(expectedValues)) {
    failures.push(
      `${enumName}: shared object values ${formatList(sharedObjectValues)} != shared values ${formatList(expectedValues)}`
    );
  }

  const prismaValues = prismaEnums.get(enumName);
  if (!prismaValues) {
    failures.push(`${enumName}: enum ausente no prisma/schema.prisma`);
    continue;
  }

  if (formatList(prismaValues) !== formatList(expectedValues)) {
    failures.push(
      `${enumName}: Prisma ${formatList(prismaValues)} != shared ${formatList(expectedValues)}`
    );
  }
}

for (const enumName of prismaEnums.keys()) {
  if (!(enumName in EXPECTED_ENUMS)) {
    failures.push(`${enumName}: enum existe no Prisma, mas nao foi registrado em shared/enums`);
  }
}

if (failures.length > 0) {
  console.error("Enum parity check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Enum parity check passed (${Object.keys(EXPECTED_ENUMS).length} enums).`);