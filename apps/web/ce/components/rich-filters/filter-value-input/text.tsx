/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterConditionNodeForDisplay, TFilterProperty, TTextFilterFieldConfig } from "@plane/types";
import { Input } from "@plane/ui";

type TTextFilterValueInputProps<P extends TFilterProperty> = {
  config: TTextFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string) => void;
};

export const TextFilterValueInput = observer(function TextFilterValueInput<P extends TFilterProperty>(
  props: TTextFilterValueInputProps<P>
) {
  const { config, condition, isDisabled = false, onChange } = props;
  const [localValue, setLocalValue] = useState(typeof condition.value === "string" ? condition.value : "");
  const [prevConditionValue, setPrevConditionValue] = useState(condition.value);
  if (condition.value !== prevConditionValue) {
    setPrevConditionValue(condition.value);
    setLocalValue(typeof condition.value === "string" ? condition.value : "");
  }

  const commitValue = () => {
    const trimmed = localValue.trim();
    if (trimmed !== (typeof condition.value === "string" ? condition.value : "")) {
      onChange(trimmed);
    }
  };

  return (
    <Input
      type={config.inputType ?? "text"}
      value={localValue}
      disabled={isDisabled}
      placeholder={config.placeholder ?? "Enter value"}
      className="h-full min-w-28 border-0 bg-transparent px-2 text-13 font-regular focus:outline-none"
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={commitValue}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
        }
      }}
    />
  );
});
