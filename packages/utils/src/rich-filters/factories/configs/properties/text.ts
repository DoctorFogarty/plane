/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty, TFilterValue } from "@plane/types";
import { EQUALITY_OPERATOR, FILTER_FIELD_TYPE } from "@plane/types";
// local imports
import type { TCreateFilterConfig } from "../shared";
import { createFilterConfig, createFilterFieldConfig, createOperatorConfigEntry } from "../shared";
import type { TCustomPropertyFilterParams } from "./shared";

/**
 * Text / URL / number property filter specific params
 */
export type TCreateTextPropertyFilterParams = TCustomPropertyFilterParams<undefined> & {
  placeholder?: string;
  inputType?: "text" | "number" | "url";
};

/**
 * Get the text property filter config (also used for URL and NUMBER)
 */
export const getTextPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateTextPropertyFilterParams> =>
  (params: TCreateTextPropertyFilterParams) =>
    createFilterConfig({
      id: key,
      ...params,
      label: params.propertyDisplayName,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
          createFilterFieldConfig<typeof FILTER_FIELD_TYPE.TEXT, TFilterValue>({
            type: FILTER_FIELD_TYPE.TEXT,
            isOperatorEnabled: updatedParams.allowedOperators.has(EQUALITY_OPERATOR.EXACT),
            placeholder: updatedParams.placeholder,
            inputType: updatedParams.inputType ?? "text",
          })
        ),
      ]),
    });
