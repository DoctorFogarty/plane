/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty, TIssuePropertyOption } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
// local imports
import { getMultiSelectConfig } from "../core";
import type { IFilterIconConfig, TCreateFilterConfig, TCreateFilterConfigParams } from "../shared";
import { createFilterConfig, createOperatorConfigEntry } from "../shared";
import type { TCustomPropertyFilterParams } from "./shared";

/**
 * Dropdown property filter specific params
 */
export type TCreateDropdownPropertyFilterParams = TCustomPropertyFilterParams<TIssuePropertyOption> &
  TCreateFilterConfigParams &
  IFilterIconConfig<TIssuePropertyOption> & {
    options: TIssuePropertyOption[];
  };

/**
 * Get the dropdown property filter config
 */
export const getDropdownPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateDropdownPropertyFilterParams> =>
  (params: TCreateDropdownPropertyFilterParams) =>
    createFilterConfig({
      id: key,
      ...params,
      label: params.propertyDisplayName,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getMultiSelectConfig<TIssuePropertyOption, string, TIssuePropertyOption>(
            {
              items: updatedParams.options,
              getId: (option) => option.id,
              getLabel: (option) => option.name,
              getValue: (option) => option.id,
              getIconData: (option) => option,
            },
            {
              singleValueOperator: EQUALITY_OPERATOR.EXACT,
              ...updatedParams,
            },
            {
              getOptionIcon: updatedParams.getOptionIcon,
            }
          )
        ),
      ]),
    });
