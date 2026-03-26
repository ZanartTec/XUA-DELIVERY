import { NextRequest, NextResponse } from "next/server";
import { notificationService } from "@/src/services/consumer/notification-service";
import { withErrorHandling } from "@/src/lib/api-handler";
import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const token = await notificationService.subscribe(userId, parsed.data);
  return NextResponse.json({ id: token.id }, { status: 201 });
});
