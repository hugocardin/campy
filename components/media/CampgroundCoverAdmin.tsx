"use client";

import {
  clearCampgroundCoverAction,
  commitCampgroundCoverAction,
} from "@/app/actions/park-media";
import { uploadCampgroundCoverFile } from "@/components/media/uploadParkMediaFile";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PARK_MEDIA_ALLOWED_MIME,
  PARK_MEDIA_MAX_BYTES,
  parkMediaMaxMb,
  resolveCampgroundCoverSrc,
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
  coverPhoto: string | null;
};

export default function CampgroundCoverAdmin({
  campgroundId,
  coverPhoto,
}: Props) {
  const t = useTranslations("campgrounds.media");
  const tc = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasCover = Boolean(coverPhoto);
  const src = resolveCampgroundCoverSrc(coverPhoto);

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

    startTransition(async () => {
      const uploaded = await uploadCampgroundCoverFile(campgroundId, file);
      if (!uploaded.ok) {
        setError(
          translateErrorCode(
            uploaded.errorCode,
            tErrors,
            tc("error"),
            uploaded.details,
          ),
        );
        return;
      }

      const result = await commitCampgroundCoverAction(
        campgroundId,
        uploaded.publicUrl,
        coverPhoto,
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

  const onClear = () => {
    if (!hasCover) return;
    if (!confirm(t("coverClearConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await clearCampgroundCoverAction(campgroundId, coverPhoto);
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
        <CardTitle>{t("coverTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("coverHint")}</p>

        <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-md bg-muted">
          <Image
            src={src}
            alt={t("coverAlt")}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 36rem"
          />
        </div>

        {!hasCover ? (
          <p className="text-sm text-muted-foreground italic">
            {t("coverEmpty")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={PARK_MEDIA_ALLOWED_MIME.join(",")}
            className="sr-only"
            onChange={onFileChange}
            disabled={isPending}
          />
          <Button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {hasCover ? t("coverReplace") : t("coverUpload")}
          </Button>
          {hasCover ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClear}
            >
              {t("coverClear")}
            </Button>
          ) : null}
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
