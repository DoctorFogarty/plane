/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";

export type TDateAlertProps = {
  date: string;
  workItem: TIssue;
  projectId: string;
};
export function DateAlert(_props: TDateAlertProps) {
  return <></>;
}
