/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Checkbox } from "@plane/ui";
import type { IIssueLabel, IState, TIssueProperty, TIssueType } from "@plane/types";
import { toggleListValue } from "@plane/utils";

export { toggleListValue };

export const DEFAULT_CHANNEL_EVENTS = ["create", "state", "assignee", "comment"];
export const DEFAULT_DM_EVENTS = ["create", "state", "assignee", "comment", "mention"];
export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"] as const;

export const CHANNEL_EVENT_OPTIONS = [
  "create",
  "state",
  "assignee",
  "comment",
  "priority",
  "labels",
  "name",
  "start_date",
  "target_date",
  "type",
] as const;

export const DM_EVENT_OPTIONS = [...CHANNEL_EVENT_OPTIONS, "mention"] as const;

export type TSlackFilterPayload = {
  priority?: string[];
  state?: string[];
  type?: string[];
  labels?: string[];
  custom_properties?: Record<string, string[]>;
};

type EventOptionListProps = {
  events: string[];
  options: readonly string[];
  labels: Record<string, string>;
  onChange: (events: string[]) => void;
  idPrefix?: string;
};

export function SlackEventOptionList(props: EventOptionListProps) {
  const { events, options, labels, onChange, idPrefix = "slack-event" } = props;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map((event) => (
        <label key={event} className="flex items-center gap-1.5 text-13 text-primary">
          <Checkbox
            id={`${idPrefix}-${event}`}
            checked={events.includes(event)}
            onChange={() => onChange(toggleListValue(events, event))}
          />
          {labels[event] || event}
        </label>
      ))}
    </div>
  );
}

type CustomPropertyListProps = {
  properties: TIssueProperty[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  idPrefix?: string;
};

export function SlackCustomPropertyList(props: CustomPropertyListProps) {
  const { properties, selectedIds, onChange, idPrefix = "slack-custom" } = props;
  if (properties.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {properties.map((property) => (
        <label key={property.id} className="flex items-center gap-1.5 text-13 text-primary">
          <Checkbox
            id={`${idPrefix}-${property.id}`}
            checked={selectedIds.includes(property.id)}
            onChange={() => onChange(toggleListValue(selectedIds, property.id))}
          />
          {property.name}
        </label>
      ))}
    </div>
  );
}

type PriorityFilterProps = {
  values: string[] | undefined;
  onChange: (values: string[]) => void;
  allLabel: string;
};

export function SlackPriorityFilter(props: PriorityFilterProps) {
  const { values, onChange, allLabel } = props;
  return (
    <select
      className="rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
      value={values?.[0] || ""}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
    >
      <option value="">{allLabel}</option>
      {PRIORITY_OPTIONS.map((priority) => (
        <option key={priority} value={priority}>
          {priority.charAt(0).toUpperCase() + priority.slice(1)}
        </option>
      ))}
    </select>
  );
}

type ProjectMatchFiltersProps = {
  filter: TSlackFilterPayload;
  onChange: (filter: TSlackFilterPayload) => void;
  states: IState[] | undefined;
  labels: IIssueLabel[] | undefined;
  types: TIssueType[];
  properties: TIssueProperty[];
  labelsMap: Record<string, string>;
};

export function SlackProjectMatchFilters(props: ProjectMatchFiltersProps) {
  const { filter, onChange, states, labels, types, properties, labelsMap } = props;

  const update = (patch: Partial<TSlackFilterPayload>) => {
    onChange({ ...filter, ...patch });
  };

  const updateCustom = (propertyId: string, values: string[]) => {
    const custom = { ...filter.custom_properties };
    if (values.length === 0) {
      delete custom[propertyId];
    } else {
      custom[propertyId] = values;
    }
    update({ custom_properties: Object.keys(custom).length ? custom : undefined });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SlackPriorityFilter
          values={filter.priority}
          onChange={(priority) => update({ priority: priority.length ? priority : undefined })}
          allLabel={labelsMap.all_priorities}
        />
        {states && states.length > 0 ? (
          <select
            className="max-w-40 rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            value={filter.state?.[0] || ""}
            onChange={(e) => update({ state: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">{labelsMap.all_states}</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        ) : null}
        {types.length > 0 ? (
          <select
            className="max-w-40 rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            value={filter.type?.[0] || ""}
            onChange={(e) => update({ type: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">{labelsMap.all_types}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        ) : null}
        {labels && labels.length > 0 ? (
          <select
            className="max-w-40 rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            value={filter.labels?.[0] || ""}
            onChange={(e) => update({ labels: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">{labelsMap.all_labels}</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {properties
        .filter((property) => property.property_type === "DROPDOWN" && (property.options || []).length > 0)
        .map((property) => (
          <label key={property.id} className="flex flex-wrap items-center gap-2 text-13 text-secondary">
            <span className="shrink-0">{property.name}</span>
            <select
              className="max-w-48 rounded border border-subtle bg-surface-1 px-2 py-1 text-13 text-primary"
              value={filter.custom_properties?.[property.id]?.[0] || ""}
              onChange={(e) => updateCustom(property.id, e.target.value ? [e.target.value] : [])}
            >
              <option value="">{labelsMap.any_value}</option>
              {(property.options || [])
                .filter((option) => option.is_active)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
    </div>
  );
}
