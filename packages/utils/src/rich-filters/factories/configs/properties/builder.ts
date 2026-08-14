/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  IUserLite,
  TCustomPropertyFilterProperty,
  TFilterConfig,
  TIssueProperty,
  TIssuePropertyOption,
} from "@plane/types";
// local imports
import type { TCreateFilterConfigParams } from "../shared";
import { getBooleanPropertyFilterConfig } from "./boolean";
import { getDatePropertyFilterConfig } from "./date";
import { getDropdownPropertyFilterConfig } from "./dropdown";
import { getMemberPickerPropertyFilterConfig } from "./member-picker";
import { getTextPropertyFilterConfig } from "./text";

export const getCustomPropertyFilterKey = (propertyId: string): TCustomPropertyFilterProperty =>
  `customproperty_${propertyId}`;

export type TBuildCustomPropertyFilterConfigParams = TCreateFilterConfigParams & {
  property: TIssueProperty;
  members?: IUserLite[];
  getMemberOptionIcon?: (member: IUserLite) => React.ReactNode;
  getDropdownOptionIcon?: (option: TIssuePropertyOption) => React.ReactNode;
  filterIcon?: React.FC<React.SVGAttributes<SVGElement>>;
};

/**
 * Build a rich-filter config for a single custom work-item property.
 */
export const buildCustomPropertyFilterConfig = (
  params: TBuildCustomPropertyFilterConfigParams
): TFilterConfig<TCustomPropertyFilterProperty> | null => {
  const { property, members = [], getMemberOptionIcon, getDropdownOptionIcon, filterIcon, ...baseParams } = params;
  if (!property.is_active) return null;

  const key = getCustomPropertyFilterKey(property.id);
  const shared = {
    ...baseParams,
    isEnabled: true,
    propertyDisplayName: property.name,
    filterIcon,
  };

  switch (property.property_type) {
    case "TEXT":
      return getTextPropertyFilterConfig(key)({
        ...shared,
        placeholder: "Enter text",
        inputType: "text",
      });
    case "URL":
      return getTextPropertyFilterConfig(key)({
        ...shared,
        placeholder: "Enter URL",
        inputType: "url",
      });
    case "NUMBER":
      return getTextPropertyFilterConfig(key)({
        ...shared,
        placeholder: "Enter number",
        inputType: "number",
      });
    case "BOOLEAN":
      return getBooleanPropertyFilterConfig(key)(shared);
    case "DATE":
      return getDatePropertyFilterConfig(key)(shared);
    case "DROPDOWN":
      return getDropdownPropertyFilterConfig(key)({
        ...shared,
        options: (property.options || []).filter((option) => option.is_active),
        getOptionIcon: getDropdownOptionIcon,
      });
    case "MEMBER":
      return getMemberPickerPropertyFilterConfig(key)({
        ...shared,
        members,
        getOptionIcon: getMemberOptionIcon,
      });
    default:
      return null;
  }
};
