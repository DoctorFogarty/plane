/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { EInboxIssueSource } from "@plane/types";

export type TInboxSourcePill = {
  source: EInboxIssueSource;
};

export function isIntakeFormSource(source?: EInboxIssueSource) {
  return source === EInboxIssueSource.FORM || source === EInboxIssueSource.FORMS;
}

export function InboxSourcePill(props: TInboxSourcePill) {
  const { source } = props;
  const { t } = useTranslation();
  if (!isIntakeFormSource(source)) return null;
  return (
    <span className="rounded-sm border border-subtle px-1.5 py-0.5 text-11 font-medium text-tertiary">
      {t("inbox_issue.source.form")}
    </span>
  );
}
