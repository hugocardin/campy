// components/campgrounds/CampgroundListControls.tsx
"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CampgroundListControls() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-4 md:space-y-0 md:flex md:items-end md:gap-4 lg:gap-6">
      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, location, park..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Sort */}
      <Select defaultValue="newest">
        <SelectTrigger className="w-45">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="popular">Most popular</SelectItem>
          <SelectItem value="rating">Highest rated</SelectItem>
          <SelectItem value="price-low">Price: low to high</SelectItem>
          <SelectItem value="price-high">Price: high to low</SelectItem>
        </SelectContent>
      </Select>

      {/* Filters button (can open sheet/drawer later) */}
      <Button variant="outline" className="gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Filters
      </Button>

      {/* Result count (will be dynamic later) */}
      <div className="text-sm text-muted-foreground md:ml-auto">
        Showing <strong>124</strong> campgrounds
      </div>
    </div>
  );
}
