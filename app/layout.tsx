import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AlgoSensei — Your AI Competitive Programming Coach",
  description:
    "Analyze your weaknesses. Get personalized practice. Level up your Codeforces rating with AI-powered coaching.",
  keywords: ["competitive programming", "codeforces", "AI coach", "algorithms"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen antialiased",
          inter.variable,
          jetbrainsMono.variable,
          "font-sans"
        )}
      >
        {/* Apply saved theme before React hydration to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('algosensei_theme')||'dark';document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
