import { NextRequest, NextResponse } from "next/server";
import { subscriptionService } from "@/src/services/subscription-service";
import { subscriptionUpdateSchema } from "@/src/schemas/order";
import { withErrorHandling } from "@/src/lib/api-handler";

export const PATCH = withErrorHandling(async (req: NextRequest, ctx) => {
  const userId = req.headers.get("x-user-id")!;
  const { id } = await ctx!.params;

  const body = await req.json();
  const parsed = subscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { action } = parsed.data;

  let result;
  switch (action) {
    case "pause":
      result = await subscriptionService.pause(id, userId);
      break;
    case "resume":
      result = await subscriptionService.resume(id, userId);
      break;
    case "cancel":
      result = await subscriptionService.cancel(id, userId);
      break;
  }

  return NextResponse.json(result);
});
