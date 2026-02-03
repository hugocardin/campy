import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";

import "@fontsource/geist-sans"; // 400, 500, 600, 700, etc.
import "@fontsource/geist-mono"; // mono variant

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased scroll-smooth", // Geist Sans as default
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
        </ThemeProvider>
      </body>
    </html>
  );
}
