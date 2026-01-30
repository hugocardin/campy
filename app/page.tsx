import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-[calc(100vh-var(--spacing-16)*2)] flex items-center justify-center bg-background px-6 py-16 md:py-24 lg:py-32">
      <main className="w-full max-w-4xl flex flex-col items-center text-center">
        {/* Logo & Brand */}
        <div className="mb-10 md:mb-16">
          <div className="relative mx-auto mb-6 w-48 md:w-64">
            <Image
              src="/logo.png"
              alt="Campy Logo"
              fill
              priority
              className="object-contain"
            />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground">
            Welcome to Campy
          </h1>

          <p className="mt-5 md:mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Find and book your perfect campground — from quiet tent spots to
            full RV hookups, all in one simple place.
          </p>
        </div>

        {/* Call-to-action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 mt-8 md:mt-12">
          <Button size="lg" className="min-w-55 text-lg" asChild>
            <Link href="/search">Search Campgrounds</Link>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="min-w-55 text-lg"
            asChild
          >
            <Link href="/about">Learn More</Link>
          </Button>
        </div>

        {/* Footer note */}
        <p className="mt-16 md:mt-24 text-sm text-muted-foreground">
          Powered by Next.js • Built for adventurers
        </p>
      </main>
    </div>
  );
}
