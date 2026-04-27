import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
});

export const metadata: Metadata = {
  title: "ColdCaller — AI Sales Call Training",
  description:
    "Practice outbound cold calls against AI-simulated prospects. Get scored and improve your pitch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center">
            <a href="/" className="text-sm font-semibold hover:text-primary transition-colors">
              ColdCaller
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
