/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TIssueProperty, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
import { IssuePropertyInput } from "@/plane-web/components/issues/issue-properties/property-input";

export type TCustomPropertiesFieldsProps = {
  projectId: string;
  properties: TIssueProperty[];
  values: TIssuePropertyValues;
  errors?: TIssuePropertyValueErrors;
  onChange: (propertyId: string, value: unknown) => void;
  className?: string;
};

export const CustomPropertiesFields = observer(function CustomPropertiesFields(props: TCustomPropertiesFieldsProps) {
  const { projectId, properties, values, errors = {}, onChange, className } = props;

  if (!properties.length) return null;

  return (
    <div className={className ?? "space-y-3 px-5 py-3"}>
      <div className="text-caption-sm-medium text-secondary">Custom properties</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {properties.map((property) => {
          const isFullWidth =
            property.property_type === "TEXT" &&
            ((property.settings?.display_format || property.settings?.format) === "multi_line" ||
              (property.settings?.display_format || property.settings?.format) === "readonly");

          return (
            <div key={property.id} className={isFullWidth ? "sm:col-span-2" : undefined}>
              <IssuePropertyInput
                property={property}
                projectId={projectId}
                value={values[property.id]}
                error={errors[property.id]}
                onChange={(value) => onChange(property.id, value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
