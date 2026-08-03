import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const rows = await prisma.consumer.findMany({
  select: { id: true, name: true, email: true, role: true, distributor_id: true, is_active: true },
  orderBy: { role: "asc" },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
