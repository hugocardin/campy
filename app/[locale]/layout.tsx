import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { routing } from "@/i18n/routing";

import "@fontsource/geist-sans";
import "@fontsource/geist-mono";

import "./globals.css";
import Header from "@/components/layout/header";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "Campy – Campground Booking",
    template: "%s | Campy",
  },
  description:
    "Find and book your perfect campground — RV sites, tent spots, and more.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale (prevents invalid /abc/ routes)
  if (!routing.locales.includes(locale as never)) {
    notFound();
  }

  // Load messages for this locale (from your messages/ folder)
  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    notFound();
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased scroll-smooth",
        "selection:bg-primary/20 selection:text-primary-foreground",
      )}
    >
      <body className="h-screen bg-background text-foreground flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* 
            This provider makes useLocale(), useTranslations(), etc. work in ALL Client Components below 
            (Header, LocaleSwitcher, any form/button/etc. using next-intl hooks)
          */}
          <NextIntlClientProvider locale={locale} messages={messages}>
            <Header />

            <main className="flex-1 flex flex-col overflow-hidden">
              {children}
            </main>

            <Toaster
              richColors
              position="top-right"
              closeButton
              toastOptions={{
                duration: 5000,
                className: "border-border",
              }}
            />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
