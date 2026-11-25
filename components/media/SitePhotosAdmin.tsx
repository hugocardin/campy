"use client";

import {
  removeSitePhotoAction,
  uploadSitePhotoAction,
} from "@/app/actions/park-media";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PARK_MEDIA_ALLOWED_MIME,
  PARK_MEDIA_MAX_BYTES,
  PARK_MEDIA_MAX_SITE_PHOTOS,
  parkMediaMaxMb,
} from "@/lib/park-media";
import {
  MediaErrorCode,
  translateErrorCode,
  withErrorReference,
} from "@/lib/errors";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

type Props = {
  campgroundId: string;
  siteId: string;
  photos: string[];
};

export default function SitePhotosAdmin({
  campgroundId,
  siteId,
  photos,
}: Props) {
  const t = useTranslations("sites.media");
  const tc = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const atLimit = photos.length >= PARK_MEDIA_MAX_SITE_PHOTOS;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (file.size > PARK_MEDIA_MAX_BYTES) {
      setError(
        translateErrorCode(
          MediaErrorCode.MEDIA_FILE_TOO_LARGE,
          tErrors,
          tc("error"),
          { mb: parkMediaMaxMb() },
        ),
      );
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadSitePhotoAction(
        campgroundId,
        siteId,
        formData,
      );
      if (!result.success) {
        setError(
          withErrorReference(
            translateErrorCode(
              result.errorCode,
              tErrors,
              tc("error"),
              result.details,
            ),
            result.details,
            (errorId) => tc("errorReference", { errorId }),
          ),
        );
        return;
      }
      router.refresh();
    });
  };

  const onRemove = (photoUrl: string) => {
    if (!confirm(t("removeConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await removeSitePhotoAction(
        campgroundId,
        siteId,
        photoUrl,
      );
      if (!result.success) {
        setError(
          withErrorReference(
            translateErrorCode(
              result.errorCode,
              tErrors,
              tc("error"),
              result.details,
            ),
            result.details,
            (errorId) => tc("errorReference", { errorId }),
          ),
        );
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((url) => (
              <li key={url} className="space-y-2">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  <Image
                    src={url}
                    alt={t("photoAlt")}
                    fill
                    className="object-cover"
                    sizes="160px"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => onRemove(url)}
                >
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={PARK_MEDIA_ALLOWED_MIME.join(",")}
            className="sr-only"
            onChange={onFileChange}
            disabled={isPending || atLimit}
          />
          <Button
            type="button"
            disabled={isPending || atLimit}
            onClick={() => inputRef.current?.click()}
          >
            {t("upload")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("count", {
              current: photos.length,
              max: PARK_MEDIA_MAX_SITE_PHOTOS,
            })}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("fileConstraints", {
            mb: parkMediaMaxMb(),
          })}
        </p>

        <ErrorAlert errorMsg={error} />
      </CardContent>
    </Card>
  );
}
