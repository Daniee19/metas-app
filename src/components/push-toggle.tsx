"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "loading">("loading");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported" as const;
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      return (await reg.pushManager.getSubscription()) ? ("on" as const) : ("off" as const);
    })().then(setState);
  }, []);

  async function enable() {
    setState("loading");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setState("on");
  }

  if (state === "unsupported" || state === "on") return null;
  return (
    <button
      onClick={enable}
      disabled={state === "loading"}
      className="w-full rounded-2xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm text-violet-200"
    >
      🔔 Activar notificaciones en este dispositivo
    </button>
  );
}
