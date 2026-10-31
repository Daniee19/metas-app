import { NextResponse, type NextRequest } from "next/server";

/**
 * Protege la web con usuario/contraseña (Basic Auth). Como la app es solo para ti, basta.
 * Las rutas del bot y del cron tienen su propio secreto, así que se excluyen.
 */
export function proxy(request: NextRequest) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return NextResponse.next(); // sin configurar = abierto (solo en local)

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Metas"' },
  });
}

export const config = {
  matcher: ["/((?!api/telegram|api/cron|_next/static|_next/image|sw.js|manifest.webmanifest|icon|favicon.ico).*)"],
};
