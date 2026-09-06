/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TStateOperationsCallbacks } from "@plane/types";
import { cn } from "@plane/utils";

type TStateMarksAsDefault = {
  stateId: string;
  isDefault: boolean;
  color?: string;
  markStateAsDefaultCallback: TStateOperationsCallbacks["markStateAsDefault"];
};

export const StateMarksAsDefault = observer(function StateMarksAsDefault(props: TStateMarksAsDefault) {
  const { stateId, isDefault, color, markStateAsDefaultCallback } = props;
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleMarkAsDefault = async () => {
    if (!stateId || isDefault) return;
    setIsLoading(true);

    try {
      await markStateAsDefaultCallback(stateId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "text-11 whitespace-nowrap transition-colors",
        isDefault ? "text-tertiary" : "text-secondary hover:text-primary"
      )}
      style={
        isDefault ? { textDecoration: "underline", textDecorationColor: color, textUnderlineOffset: "3px" } : undefined
      }
      disabled={isDefault || isLoading}
      onClick={handleMarkAsDefault}
    >
      {isLoading
        ? t("project_settings.states.marking_as_default")
        : isDefault
          ? t("project_settings.states.default")
          : t("project_settings.states.mark_as_default")}
    </button>
  );
});
