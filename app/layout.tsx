import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { PATHNAME_HEADER, SESSION_COOKIE } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ColdCaller — AI Sales Call Training",
  description:
    "Practice outbound cold calls against AI-simulated prospects. Get scored and improve your pitch.",
};

// The header reads the session cookie, so nothing under this layout can be
// rendered statically. Declaring it here rather than letting Next discover it
// matters: the try/catch below would otherwise swallow the DYNAMIC_SERVER_USAGE
// error Next throws to opt a route in, and the build would log it as a failure.
export const dynamic = "force-dynamic";

// Never let a database hiccup take out /login — without this, a bad
// DATABASE_URL would 500 every page including the one you'd use to sign in.
async function currentUserOrNull() {
  try {
    return await getCurrentUser();
  } catch (err) {
    console.error("Layout: could not resolve current user:", err);
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUserOrNull();

  // proxy.ts gates on the claims signed into the cookie, which stay valid until
  // the token expires — so a deactivated rep would otherwise still get the page
  // shell (empty, since every fetch inside it 401s). This lookup already
  // happened for the header above, so catching it here is free: a cookie that
  // verifies but resolves to no active user means the account is gone.
  const path = (await headers()).get(PATHNAME_HEADER) ?? "";
  const hasCookie = (await cookies()).has(SESSION_COOKIE);
  if (!user && hasCookie && path !== "/login") {
    redirect("/login");
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold hover:text-primary transition-colors">
              ColdCaller
            </Link>
            {user && (
              <div className="ml-auto flex items-center gap-4">
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <span className="text-xs text-muted-foreground">
                  {user.displayName}
                </span>
                <LogoutButton />
              </div>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
