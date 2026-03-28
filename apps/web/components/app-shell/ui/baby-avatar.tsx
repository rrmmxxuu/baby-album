"use client";

import { useEffect, useState } from "react";
import { getBabyAvatarUrl } from "../../../lib/api";
import { babyAvatarText } from "../model/format";

interface BabyAvatarProps {
  baby?: { id: string; name: string; hasAvatar?: boolean; avatarUpdatedAt?: string; createdAt?: string } | null;
  albumId: string;
  token: string;
  className: string;
  previewFile?: File | null;
}

export function BabyAvatar({ baby, albumId, token, className, previewFile }: BabyAvatarProps) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(previewFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [previewFile]);

  const avatarVersion = baby?.avatarUpdatedAt ?? baby?.createdAt;
  const avatarUrl = previewUrl || (baby?.hasAvatar ? getBabyAvatarUrl(baby.id, albumId, token, avatarVersion) : "");
  if (avatarUrl) {
    return <img alt={baby?.name ?? "宝宝头像"} className={className} src={avatarUrl} />;
  }
  return <div aria-hidden="true" className={className}>{babyAvatarText(baby?.name)}</div>;
}
