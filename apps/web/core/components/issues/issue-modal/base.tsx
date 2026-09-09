/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable no-shadow */

import { useEffect, useRef, useState } from "react";
import { isEqual, xor } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "react-router";
// Plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TBaseIssue, TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// local imports
import type { TPendingAttachment } from "@/helpers/create-issue-attachments";
import { addPendingAttachments } from "@/helpers/create-issue-attachments";
import { createWorkItem } from "@/helpers/create-work-item";
import { CreateIssueToastActionItems } from "../create-issue-toast-action-items";
import { DraftIssueLayout } from "./draft-issue-layout";
import { IssueFormRoot } from "./form";
import type { IssueFormProps } from "./form";
import type { IssuesModalProps } from "./modal";

export const CreateUpdateIssueModalBase = observer(function CreateUpdateIssueModalBase(props: IssuesModalProps) {
  const {
    data,
    isOpen,
    onClose,
    onSubmit,
    withDraftIssueWrapper = true,
    storeType: issueStoreFromProps,
    isDraft = false,
    fetchIssueDetails = true,
    moveToIssue = false,
    modalTitle,
    primaryButtonText,
    isProjectSelectionDisabled = false,
    showActionItemsOnUpdate = false,
  } = props;
  const issueStoreType = useIssueStoreType();

  let storeType = issueStoreFromProps ?? issueStoreType;
  // Fallback to project store if epic store is used in issue modal.
  if (storeType === EIssuesStoreType.EPIC) {
    storeType = EIssuesStoreType.PROJECT;
  }
  // ref
  const issueTitleRef = useRef<HTMLInputElement>(null);
  // states
  const [changesMade, setChangesMade] = useState<Partial<TIssue> | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState<string | undefined>(undefined);
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<TPendingAttachment[]>([]);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  // store hooks
  const { t } = useTranslation();
  const { workspaceSlug, projectId: routerProjectId, cycleId, moduleId, workItem } = useParams();
  const { fetchCycleDetails } = useCycle();
  const { issues } = useIssues(storeType);
  const { issues: draftIssues } = useIssues(EIssuesStoreType.WORKSPACE_DRAFT);
  const { fetchIssue } = useIssueDetail();
  const { allowedProjectIds, handleCreateUpdatePropertyValues, handleCreateSubWorkItem, issuePropertyValues } =
    useIssueModal();
  const { getProjectByIdentifier } = useProject();
  // current store details
  const { createIssue, updateIssue } = useIssuesActions(storeType);
  // derived values
  const routerProjectIdentifier = workItem?.toString().split("-")[0];
  const projectIdFromRouter = routerProjectIdentifier ? getProjectByIdentifier(routerProjectIdentifier)?.id : undefined;
  const projectId = data?.project_id ?? routerProjectId?.toString() ?? projectIdFromRouter;

  const fetchIssueDetail = async (issueId: string | undefined) => {
    setDescription(undefined);
    if (!workspaceSlug) return;

    if (!projectId || issueId === undefined || !fetchIssueDetails) {
      // Set description to the issue description from the props if available
      setDescription(data?.description_html || "<p></p>");
      return;
    }
    const response = await fetchIssue(workspaceSlug.toString(), projectId.toString(), issueId);
    if (response) setDescription(response?.description_html || "<p></p>");
  };

  useEffect(() => {
    // fetching issue details
    if (isOpen) fetchIssueDetail(data?.id ?? data?.sourceIssueId);

    // if modal is closed, reset active project to null
    // and return to avoid activeProjectId being set to some other project
    if (!isOpen) {
      setActiveProjectId(null);
      setPendingAttachments([]);
      return;
    }

    // Edit existing work item: always prefer the issue's project.
    if (data?.id && data.project_id) {
      setActiveProjectId(data.project_id);
      return;
    }

    // Create mode: sync to the viewed/resolved project on every open / route change.
    // Prefer explicit data.project_id, then router project — never stick to a previous
    // activeProjectId or fall back to allowedProjectIds[0] while a project route exists.
    const resolvedCreateProjectId =
      data?.project_id ?? routerProjectId?.toString() ?? projectIdFromRouter ?? allowedProjectIds?.[0] ?? null;
    if (resolvedCreateProjectId && resolvedCreateProjectId !== activeProjectId) {
      setActiveProjectId(resolvedCreateProjectId);
    }

    // clearing up the description state when we leave the component
    return () => setDescription(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data?.project_id,
    data?.id,
    data?.sourceIssueId,
    projectId,
    routerProjectId,
    projectIdFromRouter,
    isOpen,
    activeProjectId,
    allowedProjectIds,
  ]);

  const addIssueToCycle = async (issue: TIssue, cycleId: string) => {
    if (!workspaceSlug || !issue.project_id) return;

    await issues.addIssueToCycle(workspaceSlug.toString(), issue.project_id, cycleId, [issue.id]);
    fetchCycleDetails(workspaceSlug.toString(), issue.project_id, cycleId);
  };

  const handleCreateMoreToggleChange = (value: boolean) => {
    setCreateMore(value);
  };

  const handleClose = async (saveAsDraft?: boolean) => {
    if (changesMade && saveAsDraft && !data) {
      await handleCreateIssue(changesMade, true);
    }

    setActiveProjectId(null);
    setChangesMade(null);
    setPendingAttachments([]);
    onClose();
    handleDuplicateIssueModal(false);
  };

  const handleCreateIssue = async (
    payload: Partial<TIssue>,
    is_draft_issue: boolean = false
  ): Promise<TIssue | undefined> => {
    if (!workspaceSlug || !payload.project_id) return;

    try {
      const { issue: response, failedAttachmentCount } = await createWorkItem({
        workspaceSlug: workspaceSlug.toString(),
        payload,
        isDraft: is_draft_issue,
        uploadedAssetIds,
        pendingAttachments,
        issuePropertyValues,
        handleCreateUpdatePropertyValues,
        handleCreateSubWorkItem,
        createIssue: is_draft_issue ? undefined : createIssue,
      });
      setUploadedAssetIds([]);
      setPendingAttachments([]);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: `${is_draft_issue ? t("draft_created") : t("issue_created_successfully")} `,
        actionItems: !is_draft_issue && response?.project_id && (
          <CreateIssueToastActionItems
            workspaceSlug={workspaceSlug.toString()}
            projectId={response?.project_id}
            issueId={response.id}
          />
        ),
      });
      if (failedAttachmentCount > 0) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: t("error"),
          message: t("attachment.upload_partial", { count: failedAttachmentCount }),
        });
      }
      if (!createMore) handleClose();
      if (createMore && issueTitleRef) issueTitleRef?.current?.focus();
      setDescription("<p></p>");
      setChangesMade(null);
      return response;
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t(is_draft_issue ? "draft_creation_failed" : "issue_creation_failed"),
      });
      throw error;
    }
  };

  const handleCycleChange = async (data: Partial<TIssue> | undefined, payload: Partial<TIssue>) => {
    if (!workspaceSlug || !data?.project_id || !data?.id) return;
    // return if user is not trying to change the cycle, i.e
    // - cycle_id is not present in payload
    // - cycle_id is the same as the current cycle id
    if (!("cycle_id" in payload) || isEqual(data?.cycle_id, payload.cycle_id)) return;

    const slug = workspaceSlug.toString();

    // Removing the cycle
    const currentCycleId = data?.cycle_id;
    if (currentCycleId && payload.cycle_id === null) {
      await issues.removeIssueFromCycle(slug, data.project_id, currentCycleId, data.id);
      fetchCycleDetails(slug, data.project_id, currentCycleId).catch((error) => {
        console.error(error);
      });
    }

    // Adding the cycle
    const newCycleId = payload.cycle_id;
    if (newCycleId && newCycleId !== "" && (payload.cycle_id !== cycleId || storeType !== EIssuesStoreType.CYCLE)) {
      await addIssueToCycle(data as TBaseIssue, newCycleId);
    }
  };

  const handleModuleChange = async (data: Partial<TIssue>, payload: Partial<TIssue>) => {
    if (!workspaceSlug || !data?.project_id || !data?.id) return;
    // return if user is not trying to change the module, i.e
    // - module_ids is not present in payload
    // - module_ids is not an array
    // - module_ids is the same as the current module ids
    if (
      !("module_ids" in payload) ||
      !Array.isArray(payload.module_ids) ||
      isEqual(data?.module_ids, payload.module_ids)
    )
      return;

    const updatedModuleIds = xor(data.module_ids, payload.module_ids);
    const modulesToAdd: string[] = [];
    const modulesToRemove: string[] = [];

    for (const moduleId of updatedModuleIds) {
      if (data.module_ids?.includes(moduleId)) {
        modulesToRemove.push(moduleId);
      } else {
        modulesToAdd.push(moduleId);
      }
    }
    // update modules if there are modules to add or remove
    if (modulesToAdd.length > 0 || modulesToRemove.length > 0) {
      await issues.changeModulesInIssue(
        workspaceSlug.toString(),
        data.project_id,
        data.id,
        modulesToAdd,
        modulesToRemove
      );
    }
  };

  const handleUpdateIssue = async (payload: Partial<TIssue>): Promise<TIssue | undefined> => {
    if (!workspaceSlug || !payload.project_id || !data?.id) return;

    try {
      if (isDraft) await draftIssues.updateIssue(workspaceSlug.toString(), data.id, payload);
      else if (updateIssue) await updateIssue(payload.project_id, data.id, payload);

      await Promise.all([
        handleCycleChange(data, payload),
        handleModuleChange(data, payload),
        handleCreateUpdatePropertyValues({
          issueId: data.id,
          issueTypeId: payload.type_id,
          projectId: payload.project_id,
          workspaceSlug: workspaceSlug?.toString(),
          isDraft: isDraft,
        }),
      ]);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("issue_updated_successfully"),
        actionItems:
          showActionItemsOnUpdate && payload.project_id ? (
            <CreateIssueToastActionItems
              workspaceSlug={workspaceSlug.toString()}
              projectId={payload.project_id}
              issueId={data.id}
            />
          ) : undefined,
      });
      handleClose();
    } catch (error: any) {
      console.error(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("issue_could_not_be_updated"),
      });
    }
  };

  const handleFormSubmit = async (payload: Partial<TIssue>, is_draft_issue: boolean = false) => {
    if (!workspaceSlug || !payload.project_id || !storeType) return;
    // remove sourceIssueId from payload since it is not needed
    if (data?.sourceIssueId) delete data.sourceIssueId;

    let response: TIssue | undefined = undefined;

    try {
      if (!data?.id) response = await handleCreateIssue(payload, is_draft_issue);
      else response = await handleUpdateIssue(payload);
    } finally {
      if (response != undefined && onSubmit) await onSubmit(response);
    }
  };

  const handleFormChange = (formData: Partial<TIssue> | null) => setChangesMade(formData);

  const handleUpdateUploadedAssetIds = (assetId: string) => setUploadedAssetIds((prev) => [...prev, assetId]);

  const handleAddPendingAttachments = (files: File[]) => {
    setPendingAttachments((current) => addPendingAttachments(current, files).next);
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((current) => current.filter((item) => item.id !== id));
  };

  const handleDuplicateIssueModal = (value: boolean) => setIsDuplicateModalOpen(value);

  // don't open the modal if there are no projects
  if (!allowedProjectIds || allowedProjectIds.length === 0 || !activeProjectId) return null;

  const commonIssueModalProps: IssueFormProps = {
    issueTitleRef: issueTitleRef,
    data: {
      ...data,
      description_html: description,
      cycle_id: data?.cycle_id ? data?.cycle_id : cycleId ? cycleId.toString() : null,
      module_ids: data?.module_ids ? data?.module_ids : moduleId ? [moduleId.toString()] : null,
    },
    onAssetUpload: handleUpdateUploadedAssetIds,
    onClose: handleClose,
    onSubmit: (payload) => handleFormSubmit(payload, isDraft),
    projectId: activeProjectId,
    isCreateMoreToggleEnabled: createMore,
    onCreateMoreToggleChange: handleCreateMoreToggleChange,
    isDraft: isDraft,
    moveToIssue: moveToIssue,
    modalTitle: modalTitle,
    primaryButtonText: primaryButtonText,
    isDuplicateModalOpen: isDuplicateModalOpen,
    handleDuplicateIssueModal: handleDuplicateIssueModal,
    isProjectSelectionDisabled: isProjectSelectionDisabled,
    pendingAttachments,
    onAddPendingAttachments: handleAddPendingAttachments,
    onRemovePendingAttachment: handleRemovePendingAttachment,
  };

  return (
    <ModalCore
      isOpen={isOpen}
      position={EModalPosition.TOP}
      width={isDuplicateModalOpen ? EModalWidth.VIXL : EModalWidth.XXXXL}
      className="rounded-lg !bg-transparent shadow-none transition-[width] ease-linear"
    >
      {withDraftIssueWrapper ? (
        <DraftIssueLayout {...commonIssueModalProps} changesMade={changesMade} onChange={handleFormChange} />
      ) : (
        <IssueFormRoot {...commonIssueModalProps} />
      )}
    </ModalCore>
  );
});
