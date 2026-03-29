import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { notFound } from "next/navigation";

import "@fontsource/geist-mono";
import "@fontsource/geist-sans";

import Header from "@/components/layout/header";
import { getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import "./globals.css";

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

  const messages = await getMessages();

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
