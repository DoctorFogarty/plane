/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR } from "@plane/types";
// local imports
import { getSingleSelectConfig } from "../core";
import type { TCreateFilterConfig } from "../shared";
import { createFilterConfig, createOperatorConfigEntry } from "../shared";
import type { TCustomPropertyFilterParams } from "./shared";

type TBooleanOption = {
  id: string;
  label: string;
  value: string;
};

const BOOLEAN_OPTIONS: TBooleanOption[] = [
  { id: "true", label: "True", value: "true" },
  { id: "false", label: "False", value: "false" },
];

/**
 * Boolean property filter specific params
 */
export type TCreateBooleanPropertyFilterParams = TCustomPropertyFilterParams<undefined>;

/**
 * Get the boolean property filter config
 */
export const getBooleanPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateBooleanPropertyFilterParams> =>
  (params: TCreateBooleanPropertyFilterParams) =>
    createFilterConfig({
      id: key,
      ...params,
      label: params.propertyDisplayName,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
          getSingleSelectConfig<TBooleanOption, string>(
            {
              items: BOOLEAN_OPTIONS,
              getId: (item) => item.id,
              getLabel: (item) => item.label,
              getValue: (item) => item.value,
            },
            updatedParams
          )
        ),
      ]),
    });
