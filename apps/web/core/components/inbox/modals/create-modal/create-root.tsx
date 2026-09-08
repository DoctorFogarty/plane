/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/prefer-tag-over-role, promise/always-return */

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { ETabIndices } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { renderFormattedPayloadDate, getTabIndex } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { useProjectInbox } from "@/hooks/store/use-project-inbox";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAppRouter } from "@/hooks/use-app-router";
import useKeypress from "@/hooks/use-keypress";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { InboxCustomProperties } from "@/plane-web/components/inbox/modals/create-modal/custom-properties";
import { DeDupeButtonRoot } from "@/plane-web/components/de-dupe/de-dupe-button";
import { DuplicateModalRoot } from "@/plane-web/components/de-dupe/duplicate-modal";
import {
  buildDefaultPropertyValues,
  validateRequiredPropertyValues,
} from "@/plane-web/components/issues/issue-properties/property-values";
import { useDebouncedDuplicateIssues } from "@/hooks/use-debounced-duplicate-issues";
// services
import { FileService } from "@/services/file.service";
// local imports
import { CreateIssueAttachments } from "@/components/issues/issue-modal/components/create-attachments";
import type { TPendingAttachment } from "@/helpers/create-issue-attachments";
import { addPendingAttachments, uploadPendingIssueAttachments } from "@/helpers/create-issue-attachments";
import { InboxIssueDescription } from "./issue-description";
import { InboxIssueProperties } from "./issue-properties";
import { InboxIssueTitle } from "./issue-title";

const fileService = new FileService();

type TInboxIssueCreateRoot = {
  workspaceSlug: string;
  projectId: string;
  handleModalClose: () => void;
  isDuplicateModalOpen: boolean;
  handleDuplicateIssueModal: (value: boolean) => void;
};

export const defaultIssueData: Partial<TIssue> = {
  id: undefined,
  name: "",
  description_html: "",
  priority: "none",
  state_id: "",
  label_ids: [],
  assignee_ids: [],
  start_date: renderFormattedPayloadDate(new Date()),
  target_date: "",
};

export const InboxIssueCreateRoot = observer(function InboxIssueCreateRoot(props: TInboxIssueCreateRoot) {
  const { workspaceSlug, projectId, handleModalClose, isDuplicateModalOpen, handleDuplicateIssueModal } = props;
  // states
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<TPendingAttachment[]>([]);
  // router
  const router = useAppRouter();
  // refs
  const descriptionEditorRef = useRef<EditorRefApi>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  // hooks
  const { createInboxIssue } = useProjectInbox();
  const { addAttachments } = useIssueDetail();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id;
  const { isMobile } = usePlatformOS();
  const { getProjectById } = useProject();
  const issueTypeStore = useIssueType();
  const { t } = useTranslation();
  // states
  const [createMore, setCreateMore] = useState<boolean>(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<TIssue>>(defaultIssueData);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  const handleFormData = useCallback(
    <T extends keyof Partial<TIssue>>(issueKey: T, issueValue: Partial<TIssue>[T]) => {
      setFormData({
        ...formData,
        [issueKey]: issueValue,
      });
    },
    [formData]
  );

  // derived values
  const projectDetails = projectId ? getProjectById(projectId) : undefined;

  const { getIndex } = getTabIndex(ETabIndices.INTAKE_ISSUE_FORM, isMobile);

  // debounced duplicate issues swr
  const { duplicateIssues } = useDebouncedDuplicateIssues(
    workspaceSlug,
    projectDetails?.workspace.toString(),
    projectId,
    {
      name: formData?.name,
      description_html: formData?.description_html,
    }
  );

  const handleEscKeyDown = (event: KeyboardEvent) => {
    if (descriptionEditorRef.current?.isEditorReadyToDiscard()) {
      handleModalClose();
    } else {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Editor is still processing changes. Please wait before proceeding.",
      });
      event.preventDefault(); // Prevent default action if editor is not ready to discard
    }
  };

  useKeypress("Escape", handleEscKeyDown);

  useEffect(() => {
    const formElement = formRef?.current;
    const modalElement = modalContainerRef?.current;

    if (!formElement || !modalElement) return;

    const resizeObserver = new ResizeObserver(() => {
      modalElement.style.maxHeight = `${formElement?.offsetHeight}px`;
    });

    resizeObserver.observe(formElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [formRef, modalContainerRef]);

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!descriptionEditorRef.current?.isEditorReadyToDiscard()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Editor is still processing changes. Please wait before proceeding.",
      });
      return;
    }

    const typeId = formData.type_id || issueTypeStore.getDefaultIssueTypeId(projectId);
    if (issueTypeStore.isIssueTypeEnabled(projectId) && typeId) {
      const properties = issueTypeStore.getActivePropertiesForType(projectId, typeId);
      const errors = validateRequiredPropertyValues(properties, issuePropertyValues);
      setIssuePropertyValueErrors(errors);
      if (Object.keys(errors).length > 0) {
        return;
      }
    }

    const payload: Partial<TIssue> = {
      name: formData.name || "",
      description_html: formData.description_html || "<p></p>",
      priority: formData.priority || "none",
      state_id: formData.state_id || "",
      label_ids: formData.label_ids || [],
      assignee_ids: formData.assignee_ids || [],
      target_date: formData.target_date || null,
      type_id: typeId || null,
    };
    setFormSubmitting(true);

    await createInboxIssue(workspaceSlug, projectId, payload)
      .then(async (res) => {
        if (uploadedAssetIds.length > 0) {
          await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, res?.issue.id ?? "", {
            asset_ids: uploadedAssetIds,
          });
          setUploadedAssetIds([]);
        }

        const createdIssueId = res?.issue?.id;
        if (
          createdIssueId &&
          typeId &&
          issueTypeStore.isIssueTypeEnabled(projectId) &&
          Object.keys(issuePropertyValues).length > 0
        ) {
          await issueTypeStore.upsertPropertyValues(
            workspaceSlug,
            projectId,
            createdIssueId,
            issuePropertyValues,
            true
          );
        }

        let failedAttachmentCount = 0;
        if (createdIssueId && pendingAttachments.length > 0) {
          const { failed, attachments } = await uploadPendingIssueAttachments({
            workspaceSlug,
            projectId,
            issueId: createdIssueId,
            files: pendingAttachments.map((item) => item.file),
          });
          failedAttachmentCount = failed;
          if (attachments.length > 0) addAttachments(createdIssueId, attachments);
        }
        setPendingAttachments([]);

        if (!createMore) {
          router.push(`/${workspaceSlug}/projects/${projectId}/intake/?currentTab=open&inboxIssueId=${res?.issue?.id}`);
          handleModalClose();
        } else {
          descriptionEditorRef?.current?.clearEditor();
          setFormData(defaultIssueData);
          const nextTypeId = issueTypeStore.getDefaultIssueTypeId(projectId);
          if (nextTypeId) {
            setIssuePropertyValues(
              buildDefaultPropertyValues(issueTypeStore.getActivePropertiesForType(projectId, nextTypeId))
            );
          } else {
            setIssuePropertyValues({});
          }
          setIssuePropertyValueErrors({});
        }
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: `Success!`,
          message: "Work item created successfully.",
        });
        if (failedAttachmentCount > 0) {
          setToast({
            type: TOAST_TYPE.WARNING,
            title: t("error"),
            message: t("attachment.upload_partial", { count: failedAttachmentCount }),
          });
        }
      })
      .catch((error) => {
        console.error(error);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: `Error!`,
          message: "Some error occurred. Please try again.",
        });
      });
    setFormSubmitting(false);
  };

  const isTitleLengthMoreThan255Character = formData?.name ? formData.name.length > 255 : false;

  const shouldRenderDuplicateModal = isDuplicateModalOpen && duplicateIssues?.length > 0;

  if (!workspaceSlug || !projectId || !workspaceId) return <></>;
  return (
    <div className="flex w-full gap-2 bg-transparent">
      <div className="w-full rounded-lg">
        <form ref={formRef} onSubmit={handleFormSubmit} className="flex w-full flex-col">
          <div className="space-y-5 rounded-t-lg bg-surface-1 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-18 font-medium text-secondary">{t("inbox_issue.modal.title")}</h3>
              {duplicateIssues?.length > 0 && (
                <DeDupeButtonRoot
                  workspaceSlug={workspaceSlug}
                  isDuplicateModalOpen={isDuplicateModalOpen}
                  label={`${duplicateIssues.length} duplicate issue${duplicateIssues.length > 1 ? "s" : ""} found!`}
                  handleOnClick={() => handleDuplicateIssueModal(!isDuplicateModalOpen)}
                />
              )}
            </div>
            <div className="space-y-3">
              <InboxIssueTitle
                data={formData}
                handleData={handleFormData}
                isTitleLengthMoreThan255Character={isTitleLengthMoreThan255Character}
              />
              <InboxIssueDescription
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                workspaceId={workspaceId}
                data={formData}
                handleData={handleFormData}
                editorRef={descriptionEditorRef}
                containerClassName="bg-layer-2 border-[0.5px] border-subtle-1 py-3 min-h-[150px]"
                onEnterKeyPress={() => submitBtnRef?.current?.click()}
                onAssetUpload={(assetId) => setUploadedAssetIds((prev) => [...prev, assetId])}
              />
              <InboxIssueProperties projectId={projectId} data={formData} handleData={handleFormData} />
              <CreateIssueAttachments
                files={pendingAttachments}
                onAdd={(files) => setPendingAttachments((current) => addPendingAttachments(current, files).next)}
                onRemove={(id) => setPendingAttachments((current) => current.filter((item) => item.id !== id))}
                disabled={formSubmitting}
                tabIndex={getIndex("attachments")}
              />
              <InboxCustomProperties
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                typeId={formData.type_id}
                onTypeChange={(nextTypeId) => handleFormData("type_id", nextTypeId)}
                values={issuePropertyValues}
                errors={issuePropertyValueErrors}
                onValuesChange={setIssuePropertyValues}
                onErrorsChange={setIssuePropertyValueErrors}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-b-lg border-t-[0.5px] border-subtle bg-surface-1 px-5 py-4">
            <div
              className="inline-flex cursor-pointer items-center gap-1.5"
              onClick={() => setCreateMore((prevData) => !prevData)}
              role="button"
              tabIndex={getIndex("create_more")}
            >
              <ToggleSwitch value={createMore} onChange={() => {}} size="sm" />
              <span className="text-11">{t("create_more")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                type="button"
                onClick={() => {
                  if (descriptionEditorRef.current?.isEditorReadyToDiscard()) {
                    handleModalClose();
                  } else {
                    setToast({
                      type: TOAST_TYPE.ERROR,
                      title: "Error!",
                      message: "Editor is still processing changes. Please wait before proceeding.",
                    });
                  }
                }}
                tabIndex={getIndex("discard_button")}
              >
                {t("discard")}
              </Button>
              <Button
                variant="primary"
                ref={submitBtnRef}
                type="submit"
                loading={formSubmitting}
                disabled={isTitleLengthMoreThan255Character}
                tabIndex={getIndex("submit_button")}
                size="lg"
              >
                {formSubmitting ? t("creating") : t("create_work_item")}
              </Button>
            </div>
          </div>
        </form>
      </div>
      {shouldRenderDuplicateModal && (
        <div
          ref={modalContainerRef}
          className="shadow-xl bg-pi-50 relative flex flex-col gap-2.5 rounded-lg px-3 py-4"
          style={{ maxHeight: formRef?.current?.offsetHeight ? `${formRef.current.offsetHeight}px` : "436px" }}
        >
          <DuplicateModalRoot
            workspaceSlug={workspaceSlug.toString()}
            issues={duplicateIssues}
            handleDuplicateIssueModal={handleDuplicateIssueModal}
          />
        </div>
      )}
    </div>
  );
});
