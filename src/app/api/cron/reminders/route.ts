import { runReminders } from "@/services/reminder.service";

// Un servicio externo (cron-job.org, GitHub Actions, pg_cron…) llama aquí cada 15–30 min:
//   GET /api/cron/reminders   con el header   Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runReminders();
  return Response.json(result);
}
