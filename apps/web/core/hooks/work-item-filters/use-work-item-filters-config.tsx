/* eslint-disable no-shadow, no-unused-expressions, promise/always-return, unicorn/no-array-sort */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { AtSign, Briefcase } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import {
  BooleanPropertyIcon,
  CalendarLayoutIcon,
  CycleGroupIcon,
  CycleIcon,
  DropdownPropertyIcon,
  DueDatePropertyIcon,
  HashPropertyIcon,
  LabelPropertyIcon,
  MembersPropertyIcon,
  ModuleIcon,
  PriorityIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  StateGroupIcon,
  StatePropertyIcon,
  UserCirclePropertyIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
import type {
  ICycle,
  IState,
  IUserLite,
  TFilterConfig,
  IIssueLabel,
  IModule,
  IProject,
  TIssueProperty,
  TLogoProps,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  buildCustomPropertyFilterConfig,
  getAssigneeFilterConfig,
  getCreatedAtFilterConfig,
  getCreatedByFilterConfig,
  getCycleFilterConfig,
  getFileURL,
  getIssueTypeFilterConfig,
  getLabelFilterConfig,
  getMentionFilterConfig,
  getModuleFilterConfig,
  getPriorityFilterConfig,
  getProjectFilterConfig,
  getStartDateFilterConfig,
  getStateFilterConfig,
  getStateGroupFilterConfig,
  getSubscriberFilterConfig,
  getTargetDateFilterConfig,
  getUpdatedAtFilterConfig,
  isLoaderReady,
} from "@plane/utils";
// store hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web imports
import { useFiltersOperatorConfigs } from "@/hooks/rich-filters/use-filters-operator-configs";

export type TWorkItemFiltersEntityProps = {
  workspaceSlug: string;
  cycleIds?: string[];
  labelIds?: string[];
  memberIds?: string[];
  moduleIds?: string[];
  projectId?: string;
  projectIds?: string[];
  stateIds?: string[];
};

export type TUseWorkItemFiltersConfigProps = {
  allowedFilters: TWorkItemFilterProperty[];
} & TWorkItemFiltersEntityProps;

export type TWorkItemFiltersConfig = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TWorkItemFilterProperty>[];
  configMap: Partial<Record<TWorkItemFilterProperty, TFilterConfig<TWorkItemFilterProperty>>>;
  isFilterEnabled: (key: TWorkItemFilterProperty) => boolean;
  members: IUserLite[];
};

export const useWorkItemFiltersConfig = (props: TUseWorkItemFiltersConfigProps): TWorkItemFiltersConfig => {
  const { allowedFilters, cycleIds, labelIds, memberIds, moduleIds, projectId, projectIds, stateIds, workspaceSlug } =
    props;
  // store hooks
  const { loader: projectLoader, getProjectById } = useProject();
  const { getCycleById } = useCycle();
  const { getLabelById } = useLabel();
  const { getModuleById } = useModule();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  const issueTypeStore = useIssueType();
  // derived values
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const filtersToShow = useMemo(() => new Set(allowedFilters), [allowedFilters]);
  const project = useMemo(() => getProjectById(projectId), [projectId, getProjectById]);
  const members: IUserLite[] | undefined = useMemo(
    () =>
      memberIds
        ? (memberIds.flatMap((memberId) => {
            const member = getUserDetails(memberId);
            return member ? [member] : [];
          }) as IUserLite[])
        : undefined,
    [memberIds, getUserDetails]
  );
  const workItemStates: IState[] | undefined = useMemo(
    () =>
      stateIds
        ? (stateIds.flatMap((stateId) => {
            const state = getStateById(stateId);
            return state ? [state] : [];
          }) as IState[])
        : undefined,
    [stateIds, getStateById]
  );
  const workItemLabels: IIssueLabel[] | undefined = useMemo(
    () =>
      labelIds
        ? (labelIds.flatMap((labelId) => {
            const label = getLabelById(labelId);
            return label ? [label] : [];
          }) as IIssueLabel[])
        : undefined,
    [labelIds, getLabelById]
  );
  const cycles = useMemo(
    () =>
      cycleIds
        ? (cycleIds.flatMap((cycleId) => {
            const cycle = getCycleById(cycleId);
            return cycle ? [cycle] : [];
          }) as ICycle[])
        : [],
    [cycleIds, getCycleById]
  );
  const modules = useMemo(
    () =>
      moduleIds
        ? (moduleIds.flatMap((moduleId) => {
            const module = getModuleById(moduleId);
            return module ? [module] : [];
          }) as IModule[])
        : [],
    [moduleIds, getModuleById]
  );
  const projects = useMemo(
    () =>
      projectIds
        ? (projectIds.flatMap((projectId) => {
            const project = getProjectById(projectId);
            return project ? [project] : [];
          }) as IProject[])
        : [],
    [projectIds, getProjectById]
  );
  const scopedProjectIds = useMemo(() => {
    if (projectId) return [projectId];
    return projectIds ?? [];
  }, [projectId, projectIds]);

  const areIssueTypesFetched =
    scopedProjectIds.length > 0 && scopedProjectIds.every((id) => !!issueTypeStore.fetchedMap[id]);
  const areIssueTypesEnabled = projectId
    ? issueTypeStore.isIssueTypeEnabled(projectId)
    : scopedProjectIds.some((id) => issueTypeStore.isIssueTypeEnabled(id));
  const projectTypeRevisionKey = scopedProjectIds
    .map((scopedProjectId) => `${scopedProjectId}:${issueTypeStore.projectRevisionMap[scopedProjectId] ?? 0}`)
    .join("|");
  const issueTypes = useMemo(
    () => (projectId ? issueTypeStore.getActiveProjectIssueTypes(projectId) : []),
    // projectTypeRevisionKey tracks atomic project-scoped type/property snapshot replacements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, issueTypeStore, areIssueTypesFetched, projectTypeRevisionKey]
  );
  const activeCustomProperties = useMemo(() => {
    const propertyMap = new Map<string, TIssueProperty>();
    for (const scopedProjectId of scopedProjectIds) {
      if (!issueTypeStore.isIssueTypeEnabled(scopedProjectId)) continue;
      for (const property of issueTypeStore.getActiveProjectProperties(scopedProjectId)) {
        if (!propertyMap.has(property.id)) {
          propertyMap.set(property.id, property);
        }
      }
    }
    return [...propertyMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    // projectTypeRevisionKey tracks atomic project-scoped type/property snapshot replacements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedProjectIds, issueTypeStore, areIssueTypesFetched, projectTypeRevisionKey]);
  const areAllConfigsInitialized = useMemo(() => isLoaderReady(projectLoader), [projectLoader]);

  /**
   * Checks if a filter is enabled based on the filters to show.
   * @param key - The filter key.
   * @param level - The level of the filter.
   * @returns True if the filter is enabled, false otherwise.
   */
  const isFilterEnabled = useCallback((key: TWorkItemFilterProperty) => filtersToShow.has(key), [filtersToShow]);

  useEffect(() => {
    if (!workspaceSlug || scopedProjectIds.length === 0) return;
    for (const scopedProjectId of scopedProjectIds) {
      if (issueTypeStore.fetchedMap[scopedProjectId]) continue;
      const projectDetails = getProjectById(scopedProjectId);
      // Skip fetch when we already know issue types are disabled for the project
      if (projectDetails?.is_issue_type_enabled === false) continue;
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, scopedProjectId);
    }
  }, [workspaceSlug, scopedProjectIds, issueTypeStore, getProjectById]);

  // state group filter config
  const stateGroupFilterConfig = useMemo(
    () =>
      getStateGroupFilterConfig<TWorkItemFilterProperty>("state_group")({
        isEnabled: isFilterEnabled("state_group"),
        filterIcon: StatePropertyIcon,
        getOptionIcon: (stateGroupKey) => <StateGroupIcon stateGroup={stateGroupKey} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, operatorConfigs]
  );

  // state filter config
  const stateFilterConfig = useMemo(
    () =>
      getStateFilterConfig<TWorkItemFilterProperty>("state_id")({
        isEnabled: isFilterEnabled("state_id") && workItemStates !== undefined,
        filterIcon: StatePropertyIcon,
        getOptionIcon: (state) => <StateGroupIcon stateGroup={state.group} color={state.color} />,
        states: workItemStates ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, workItemStates, operatorConfigs]
  );

  // label filter config
  const labelFilterConfig = useMemo(
    () =>
      getLabelFilterConfig<TWorkItemFilterProperty>("label_id")({
        isEnabled: isFilterEnabled("label_id") && workItemLabels !== undefined,
        filterIcon: LabelPropertyIcon,
        labels: workItemLabels ?? [],
        getOptionIcon: (color) => (
          <span className="flex size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, workItemLabels, operatorConfigs]
  );

  // cycle filter config
  const cycleFilterConfig = useMemo(
    () =>
      getCycleFilterConfig<TWorkItemFilterProperty>("cycle_id")({
        isEnabled: isFilterEnabled("cycle_id") && project?.cycle_view === true && cycles !== undefined,
        filterIcon: CycleIcon,
        getOptionIcon: (cycleGroup) => <CycleGroupIcon cycleGroup={cycleGroup} className="h-3.5 w-3.5 flex-shrink-0" />,
        cycles: cycles ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, project?.cycle_view, cycles, operatorConfigs]
  );

  // module filter config
  const moduleFilterConfig = useMemo(
    () =>
      getModuleFilterConfig<TWorkItemFilterProperty>("module_id")({
        isEnabled: isFilterEnabled("module_id") && project?.module_view === true && modules !== undefined,
        filterIcon: ModuleIcon,
        getOptionIcon: () => <ModuleIcon className="h-3 w-3 flex-shrink-0" />,
        modules: modules ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, project?.module_view, modules, operatorConfigs]
  );

  // work item type filter config
  const issueTypeFilterConfig = useMemo(
    () =>
      getIssueTypeFilterConfig<TWorkItemFilterProperty>("type_id")({
        isEnabled: isFilterEnabled("type_id") && areIssueTypesEnabled && areIssueTypesFetched,
        filterIcon: WorkItemsIcon,
        issueTypes,
        getOptionIcon: (issueType) =>
          issueType.logo_props ? (
            <Logo logo={issueType.logo_props as TLogoProps} size={12} />
          ) : (
            <WorkItemsIcon className="h-3 w-3 flex-shrink-0" />
          ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, areIssueTypesEnabled, areIssueTypesFetched, issueTypes, operatorConfigs]
  );

  // assignee filter config
  const assigneeFilterConfig = useMemo(
    () =>
      getAssigneeFilterConfig<TWorkItemFilterProperty>("assignee_id")({
        isEnabled: isFilterEnabled("assignee_id") && members !== undefined,
        filterIcon: MembersPropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // mention filter config
  const mentionFilterConfig = useMemo(
    () =>
      getMentionFilterConfig<TWorkItemFilterProperty>("mention_id")({
        isEnabled: isFilterEnabled("mention_id") && members !== undefined,
        filterIcon: AtSign,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // created by filter config
  const createdByFilterConfig = useMemo(
    () =>
      getCreatedByFilterConfig<TWorkItemFilterProperty>("created_by_id")({
        isEnabled: isFilterEnabled("created_by_id") && members !== undefined,
        filterIcon: UserCirclePropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // subscriber filter config
  const subscriberFilterConfig = useMemo(
    () =>
      getSubscriberFilterConfig<TWorkItemFilterProperty>("subscriber_id")({
        isEnabled: isFilterEnabled("subscriber_id") && members !== undefined,
        filterIcon: MembersPropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // priority filter config
  const priorityFilterConfig = useMemo(
    () =>
      getPriorityFilterConfig<TWorkItemFilterProperty>("priority")({
        isEnabled: isFilterEnabled("priority"),
        filterIcon: PriorityPropertyIcon,
        getOptionIcon: (priority) => <PriorityIcon priority={priority} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, operatorConfigs]
  );

  // start date filter config
  const startDateFilterConfig = useMemo(
    () =>
      getStartDateFilterConfig<TWorkItemFilterProperty>("start_date")({
        isEnabled: true,
        filterIcon: StartDatePropertyIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // target date filter config
  const targetDateFilterConfig = useMemo(
    () =>
      getTargetDateFilterConfig<TWorkItemFilterProperty>("target_date")({
        isEnabled: true,
        filterIcon: DueDatePropertyIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // created at filter config
  const createdAtFilterConfig = useMemo(
    () =>
      getCreatedAtFilterConfig<TWorkItemFilterProperty>("created_at")({
        isEnabled: true,
        filterIcon: CalendarLayoutIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // updated at filter config
  const updatedAtFilterConfig = useMemo(
    () =>
      getUpdatedAtFilterConfig<TWorkItemFilterProperty>("updated_at")({
        isEnabled: true,
        filterIcon: CalendarLayoutIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // project filter config
  const projectFilterConfig = useMemo(
    () =>
      getProjectFilterConfig<TWorkItemFilterProperty>("project_id")({
        isEnabled: isFilterEnabled("project_id") && projects !== undefined,
        filterIcon: Briefcase,
        projects: projects,
        getOptionIcon: (project) => <Logo logo={project.logo_props} size={12} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, projects, operatorConfigs]
  );

  const getCustomPropertyFilterIcon = useCallback((property: TIssueProperty) => {
    switch (property.property_type) {
      case "BOOLEAN":
        return BooleanPropertyIcon;
      case "DROPDOWN":
        return DropdownPropertyIcon;
      case "DATE":
        return DueDatePropertyIcon;
      case "MEMBER":
        return MembersPropertyIcon;
      case "NUMBER":
        return HashPropertyIcon;
      case "URL":
      case "TEXT":
      default:
        return LabelPropertyIcon;
    }
  }, []);

  // custom property filter configs (always enabled when properties exist)
  const customPropertyFilterConfigs = useMemo((): TFilterConfig<TWorkItemFilterProperty>[] => {
    if (!areIssueTypesEnabled || !areIssueTypesFetched) return [];
    const configs: TFilterConfig<TWorkItemFilterProperty>[] = [];
    for (const property of activeCustomProperties) {
      const config = buildCustomPropertyFilterConfig({
        property,
        members: members ?? [],
        filterIcon: getCustomPropertyFilterIcon(property),
        getMemberOptionIcon: (memberDetails: IUserLite) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        isEnabled: true,
        ...operatorConfigs,
      });
      if (config) {
        configs.push(config as TFilterConfig<TWorkItemFilterProperty>);
      }
    }
    return configs;
  }, [
    activeCustomProperties,
    areIssueTypesEnabled,
    areIssueTypesFetched,
    getCustomPropertyFilterIcon,
    members,
    operatorConfigs,
  ]);

  const customPropertyConfigMap = useMemo(() => {
    const map: Partial<Record<TWorkItemFilterProperty, TFilterConfig<TWorkItemFilterProperty>>> = {};
    for (const config of customPropertyFilterConfigs) {
      map[config.id] = config;
    }
    return map;
  }, [customPropertyFilterConfigs]);

  return {
    areAllConfigsInitialized,
    configs: [
      stateFilterConfig,
      stateGroupFilterConfig,
      assigneeFilterConfig,
      priorityFilterConfig,
      projectFilterConfig,
      mentionFilterConfig,
      labelFilterConfig,
      cycleFilterConfig,
      moduleFilterConfig,
      issueTypeFilterConfig,
      ...customPropertyFilterConfigs,
      startDateFilterConfig,
      targetDateFilterConfig,
      createdAtFilterConfig,
      updatedAtFilterConfig,
      createdByFilterConfig,
      subscriberFilterConfig,
    ],
    configMap: {
      project_id: projectFilterConfig,
      state_group: stateGroupFilterConfig,
      state_id: stateFilterConfig,
      label_id: labelFilterConfig,
      cycle_id: cycleFilterConfig,
      module_id: moduleFilterConfig,
      type_id: issueTypeFilterConfig,
      assignee_id: assigneeFilterConfig,
      mention_id: mentionFilterConfig,
      created_by_id: createdByFilterConfig,
      subscriber_id: subscriberFilterConfig,
      priority: priorityFilterConfig,
      start_date: startDateFilterConfig,
      target_date: targetDateFilterConfig,
      created_at: createdAtFilterConfig,
      updated_at: updatedAtFilterConfig,
      ...customPropertyConfigMap,
    },
    isFilterEnabled,
    members: members ?? [],
  };
};
