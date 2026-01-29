// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // Clone the request headers/cookies into the response so Supabase can write back
  const res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Read cookies from the incoming request
          return req.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll(cookiesToSet) {
          // Write cookies onto the outgoing response
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Trigger session refresh/attachment
  try {
    await supabase.auth.getUser();
  } catch (error) {
    // Non-fatal in middleware; log if needed
    console.error("[middleware] supabase.auth.getUser error:", error);
  }

  return res;
}

export const config = {
  matcher: [
    // Apply to all routes except:
    // - _next/static, _next/image
    // - favicon.ico
    // - common image extensions
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff)).*)",
  ],
};