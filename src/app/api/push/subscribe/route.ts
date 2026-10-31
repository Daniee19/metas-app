import { z } from "zod";
import { saveSubscription } from "@/services/notification.service";

const SubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  const parsed = SubscriptionSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  await saveSubscription(parsed.data);
  return Response.json({ ok: true });
}
