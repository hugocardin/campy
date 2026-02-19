import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function generatePageMetadata(
  namespace: string,
  titleKey = "meta.title",
  descriptionKey = "meta.description",
): Promise<Metadata> {
  const t = await getTranslations(namespace);
  return {
    title: t(titleKey),
    description: t(descriptionKey),
  };
}
