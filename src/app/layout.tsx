import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";

import { TelegramAutoAuth } from "@/components/auth/telegram-auto-auth";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { getCurrentUser } from "@/lib/auth/session";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: { default: "Рядом — помощь здесь и сейчас", template: "%s · Рядом" },
    description: "Гиперлокальные микрозадачи и помощь рядом с вами.",
    applicationName: "Рядом",
    manifest: "/manifest.webmanifest",
    formatDetection: { telephone: false },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      title: "Рядом — помощь за углом",
      description: "Срочные небольшие дела и подработка в нескольких минутах от вас.",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Рядом — помощь за углом" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Рядом — помощь за углом",
      description: "Срочные небольшие дела и подработка рядом.",
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#064e3b",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            const stored = localStorage.getItem("ryadom-theme");
            const dark = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.style.colorScheme = dark ? "dark" : "light";
          } catch {}
        `}</Script>
        <Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" />
        <RegisterServiceWorker />
        <TelegramAutoAuth />
        {user && <OnboardingModal shouldOpen={!user.onboardingPassed} />}
        {children}
        <BottomNavigation />
      </body>
    </html>
  );
}
