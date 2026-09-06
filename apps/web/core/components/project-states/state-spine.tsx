/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

type TStateSpine = {
  color?: string;
  dashed?: boolean;
};

export function StateSpine(props: TStateSpine) {
  const { color, dashed = false } = props;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-0.5",
        dashed && "border-l-2 border-dashed border-subtle"
      )}
      style={dashed ? undefined : { backgroundColor: color }}
    />
  );
}
