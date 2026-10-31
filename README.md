# Metas — sistema personal de tareas con rachas y recordatorios

Web app (PWA) en Next.js 16 + bot de Telegram. Creas y completas tareas desde Telegram sin abrir nada,
te llegan recordatorios que suben de tono según la fecha límite y ganas XP, niveles y rachas.

## Estructura

```
src/
├─ app/
│  ├─ page.tsx                  Dashboard: nivel, racha, tareas, metas, mapa de calor
│  ├─ actions.ts                Server Actions (crear / completar desde la web)
│  ├─ manifest.ts               Manifest de la PWA
│  └─ api/
│     ├─ telegram/route.ts      Webhook del bot
│     ├─ cron/reminders/route.ts  Lo llama un cron externo cada 15–30 min
│     └─ push/subscribe/route.ts  Guarda la suscripción push del navegador
├─ bot/index.ts                 Comandos y botones del bot (grammY)
├─ services/                    Lógica de negocio (la usan la web y el bot por igual)
│  ├─ task.service.ts           Crear, completar, posponer, listar
│  ├─ reward.service.ts         XP, niveles, rachas, congeladores  ← reglas del juego
│  ├─ reminder.service.ts       Qué avisar y cuándo (estilo Duolingo)
│  └─ notification.service.ts   Envío por Telegram y Web Push
├─ db/schema.ts                 Tablas (Drizzle ORM)
├─ lib/dates.ts                 Zona horaria + fechas en español ("el viernes a las 5pm")
├─ lib/messages.ts              Textos del bot
├─ types/                       Tipos compartidos
└─ proxy.ts                     Usuario/contraseña para la web
public/sw.js                    Service worker (recibe las notificaciones push)
```

## Puesta en marcha

1. **Instala dependencias:** `npm install`
2. **Base de datos:** crea un proyecto en Supabase o Neon, copia `.env.example` a `.env.local` y pon tu `DATABASE_URL`.
   Luego crea las tablas con `npm run db:push`. La migración inicial también está en `drizzle/0000_init.sql`.
3. **Bot de Telegram:**
   - Habla con **@BotFather**, usa `/newbot` y copia el token en `TELEGRAM_BOT_TOKEN`.
   - Despliega la app y registra el webhook (cambia los valores):
     ```
     curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TU-APP.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
     ```
   - Escríbele `/start` al bot: te responde con tu chat ID. Ponlo en `TELEGRAM_OWNER_CHAT_ID` y vuelve a desplegar.
     A partir de ahí el bot solo te responde a ti.
4. **Notificaciones push:** ejecuta `npx web-push generate-vapid-keys` y pon las llaves en las variables `VAPID`.
   En el celular abre la web en Chrome → menú ⋮ → **Instalar app** → toca **Activar notificaciones**.
5. **Cron:** en [cron-job.org](https://cron-job.org) (gratis) crea un job cada 15 min hacia
   `https://TU-APP.vercel.app/api/cron/reminders` con el header `Authorization: Bearer <CRON_SECRET>`.
6. **Deploy:** sube el repo a Vercel y copia todas las variables de `.env.local`.

En local: `npm run dev`. Para ver la base de datos: `npm run db:studio`.

## Cómo se usa el bot

Escríbele cualquier cosa y se guarda como tarea:

- `Entregar informe Gobierno TIC el viernes` → vence el viernes a las 23:59
- `Terminar diagrama UPS #grande mañana a las 6pm` → dificultad L, mañana 18:00
- `Responder correo IEEE #rapida` → dificultad S, sin fecha

Comandos: `/hoy`, `/pendientes`, `/stats`. Cada recordatorio trae botones: ✅ Hecho · 🔥 Voy en eso · ⏰ +3 h · 🌙 Mañana.

## Reglas del juego (en `reward.service.ts`)

| | |
|---|---|
| XP por dificultad | S = 10 · M = 25 · L = 60 |
| Bonus de puntualidad | +50 % si terminas antes de la fecha límite |
| Niveles | N2 = 100 XP, N3 = 300, N4 = 600, N5 = 1000… |
| Racha | +1 por cada día en que completas al menos una tarea |
| Congeladores 🧊 | 1 nuevo por semana (máx. 2); salvan la racha si fallas un día |

## Recordatorios (en `reminder.service.ts`)

3 días antes → 1 día antes → el mismo día → vencida, cada uno una sola vez por tarea.
También avisa a partir de las 7 pm si tu racha está en riesgo, y si llevas 3 días o más sin actividad.
No te escribe entre las 23:00 y las 08:00 (`QUIET_HOURS_*`). Si pospones una tarea, los avisos se reinician.

## Siguientes pasos sugeridos

- Pantalla para crear y editar metas y asignarles tareas (por ahora las metas se crean en `db:studio`)
- Resumen semanal del domingo por Telegram
- Logros e insignias ("10 tareas L completadas", "racha de 30 días")
- Interpretar los mensajes con un LLM para entender cualquier frase y dividir metas grandes en tareas
