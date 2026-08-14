/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { cn } from "@plane/utils";
import { getFileIcon } from "@/components/icons";

type Props = {
  fileURL: string;
  fileExtension: string;
  size: number;
  canPreview: boolean;
};

export function AttachmentThumbnail(props: Props) {
  const { fileURL, fileExtension, size, canPreview } = props;
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [fileURL]);

  const fileIcon = getFileIcon(fileExtension, size);
  const sizeClass = size === 28 ? "size-7" : "size-6";

  if (!canPreview || hasError || !fileURL) {
    return <div className={cn("flex shrink-0 items-center justify-center", sizeClass)}>{fileIcon}</div>;
  }

  return (
    <img
      src={fileURL}
      alt=""
      className={cn("shrink-0 rounded border border-subtle bg-surface-2 object-cover", sizeClass)}
      onError={() => setHasError(true)}
    />
  );
}
