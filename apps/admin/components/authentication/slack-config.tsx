/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getButtonStyling } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { useInstance } from "@/hooks/store";

export const SlackConfiguration = observer(function SlackConfiguration() {
  const { formattedConfig } = useInstance();
  const isConfigured = Boolean(formattedConfig?.SLACK_CLIENT_ID && formattedConfig?.SLACK_CLIENT_SECRET);

  return isConfigured ? (
    <Link href="/authentication/slack" className={cn(getButtonStyling("link", "base"), "font-medium")}>
      Edit
    </Link>
  ) : (
    <Link href="/authentication/slack" className={cn(getButtonStyling("secondary", "base"), "text-tertiary")}>
      <Settings2 className="h-4 w-4 p-0.5 text-tertiary" />
      Configure
    </Link>
  );
});
