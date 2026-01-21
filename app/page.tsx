import Image from "next/image";
import Link from "next/link"; // ← added for proper navigation (instead of <a>)

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <main className="w-full max-w-4xl px-6 py-16 md:py-24 flex flex-col items-center text-center">
        {/* Logo / Brand */}
        <div className="mb-12">
          <Image
            src="/logo.png"
            alt="Campy Logo"
            width={180}
            height={60}
            priority
            className="h-16 w-auto mx-auto"
          />
          <h1 className="mt-6 text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            Welcome to Campy
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Find and book your perfect campground easily — from RV sites to tent
            spots, all in one place.
          </p>
        </div>

        {/* Call to action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link
            href="/search"
            className="
              inline-flex items-center justify-center 
              px-8 py-4 text-lg font-medium 
              bg-primary text-primary-foreground 
              rounded-full 
              hover:bg-primary-hover 
              transition-colors 
              shadow-md hover:shadow-lg 
              focus-visible:outline-none focus-visible:ring-2 
              focus-visible:ring-primary focus-visible:ring-offset-2 
              focus-visible:ring-offset-background
            "
          >
            Search Campgrounds
          </Link>

          <Link
            href="/about"
            className="
              inline-flex items-center justify-center 
              px-8 py-4 text-lg font-medium 
              border-2 border-primary text-primary 
              rounded-full 
              hover:bg-primary/10 
              transition-colors 
              focus-visible:outline-none focus-visible:ring-2 
              focus-visible:ring-primary focus-visible:ring-offset-2 
              focus-visible:ring-offset-background
            "
          >
            Learn More
          </Link>
        </div>

        <p className="mt-16 text-sm text-muted-foreground">
          Powered by Next.js • Built for adventurers
        </p>
      </main>
    </div>
  );
}
