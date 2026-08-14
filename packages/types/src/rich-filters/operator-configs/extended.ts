/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TTextFilterFieldConfig } from "../field-types/extended";

// ----------------------------- EXACT Operator -----------------------------
export type TExtendedExactOperatorConfigs = TTextFilterFieldConfig<TFilterValue>;

// ----------------------------- IN Operator -----------------------------
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
export type TExtendedRangeOperatorConfigs = never;

// ----------------------------- Extended Operator Specific Configs -----------------------------
// Keep as unknown so intersecting with core operator maps does not collapse values to never.
export type TExtendedOperatorSpecificConfigs = unknown;
