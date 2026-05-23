import { NextResponse, type NextRequest } from "next/server";

// Vicu pausado desde 2026-04-20. Cualquier ruta de UI redirige a la home de despedida.
// Se preservan /api/* (webhooks/cron endpoints siguen respondiendo aunque no envían nada)
// y los assets estáticos vía el matcher de abajo.
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
