/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import type { TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { CustomPropertiesFields } from "@/plane-web/components/issues/issue-properties/custom-properties-fields";
import { buildDefaultPropertyValues } from "@/plane-web/components/issues/issue-properties/property-values";

export type TInboxCustomPropertiesProps = {
  workspaceSlug: string;
  projectId: string;
  typeId: string | null | undefined;
  onTypeChange: (typeId: string) => void;
  values: TIssuePropertyValues;
  errors: TIssuePropertyValueErrors;
  onValuesChange: (values: TIssuePropertyValues) => void;
  onErrorsChange: (errors: TIssuePropertyValueErrors) => void;
};

export const InboxCustomProperties = observer(function InboxCustomProperties(props: TInboxCustomPropertiesProps) {
  const { workspaceSlug, projectId, typeId, onTypeChange, values, errors, onValuesChange, onErrorsChange } = props;
  const issueTypeStore = useIssueType();
  const previousTypeIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!issueTypeStore.fetchedMap[projectId]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
    }
  }, [workspaceSlug, projectId, issueTypeStore]);

  const enabled = issueTypeStore.isIssueTypeEnabled(projectId);
  const types = enabled ? issueTypeStore.getActiveProjectIssueTypes(projectId) : [];
  const effectiveTypeId = typeId || issueTypeStore.getDefaultIssueTypeId(projectId);

  // Apply defaults when type changes or first loads
  useEffect(() => {
    if (!enabled || !effectiveTypeId) return;
    if (previousTypeIdRef.current === effectiveTypeId) return;
    previousTypeIdRef.current = effectiveTypeId;
    const properties = issueTypeStore.getActivePropertiesForType(projectId, effectiveTypeId);
    onValuesChange(buildDefaultPropertyValues(properties));
    onErrorsChange({});
    if (!typeId && effectiveTypeId) {
      onTypeChange(effectiveTypeId);
    }
  }, [enabled, effectiveTypeId, typeId, projectId, issueTypeStore, onValuesChange, onErrorsChange, onTypeChange]);

  if (!enabled) return null;

  const properties = issueTypeStore.getActivePropertiesForType(projectId, effectiveTypeId);
  const selected = types.find((type) => type.id === effectiveTypeId);

  return (
    <div className="space-y-3">
      {types.length > 0 && (
        <div className="flex items-center gap-2">
          <CustomSelect
            value={effectiveTypeId}
            label={selected?.name || "Type"}
            onChange={(val: string) => onTypeChange(val)}
            maxHeight="lg"
            buttonClassName="text-xs"
          >
            {types.map((type) => (
              <CustomSelect.Option key={type.id} value={type.id}>
                {type.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
      )}
      <CustomPropertiesFields
        projectId={projectId}
        properties={properties}
        values={values}
        errors={errors}
        className="space-y-3 py-1"
        onChange={(propertyId, value) => {
          onValuesChange({
            ...values,
            [propertyId]: value,
          });
          if (errors[propertyId]) {
            const next = { ...errors };
            delete next[propertyId];
            onErrorsChange(next);
          }
        }}
      />
    </div>
  );
});
