/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueProperty, TIssueType, TLogoProps } from "@plane/types";
import { Button, Input, TextArea, ToggleSwitch } from "@plane/ui";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { PROPERTY_TYPES, PropertyForm } from "@/plane-web/components/work-item-types/property-form";
import type { TPropertyFormSubmitPayload } from "@/plane-web/components/work-item-types/property-form";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

type TTypeFormState = {
  name: string;
  description: string;
  is_epic: boolean;
  logo_props: TLogoProps | Record<string, unknown>;
};

const EMPTY_TYPE_FORM: TTypeFormState = {
  name: "",
  description: "",
  is_epic: false,
  logo_props: {},
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  const issueTypeStore = useIssueType();
  const { currentProjectDetails } = useProject();
  const [isEnabling, setIsEnabling] = useState(false);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TTypeFormState>(EMPTY_TYPE_FORM);
  const [isCreateLogoOpen, setIsCreateLogoOpen] = useState(false);
  const [isCreatingType, setIsCreatingType] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TTypeFormState>(EMPTY_TYPE_FORM);
  const [isEditLogoOpen, setIsEditLogoOpen] = useState(false);
  const [isSavingType, setIsSavingType] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);

  useEffect(() => {
    void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId);
  }, [workspaceSlug, projectId, issueTypeStore]);

  const enabled = issueTypeStore.isIssueTypeEnabled(projectId) || Boolean(currentProjectDetails?.is_issue_type_enabled);
  const types = issueTypeStore.getProjectIssueTypes(projectId);

  const handleEnable = async () => {
    if (!isAdmin) return;
    setIsEnabling(true);
    try {
      await issueTypeStore.enableIssueTypes(workspaceSlug, projectId);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleCreateType = async () => {
    if (!createForm.name.trim()) return;
    setIsCreatingType(true);
    try {
      await issueTypeStore.createIssueType(workspaceSlug, projectId, {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        is_epic: createForm.is_epic,
        logo_props: createForm.logo_props,
        is_active: true,
      });
      setCreateForm(EMPTY_TYPE_FORM);
    } finally {
      setIsCreatingType(false);
    }
  };

  const startEditingType = (type: TIssueType) => {
    setEditingTypeId(type.id);
    setEditForm({
      name: type.name,
      description: type.description || "",
      is_epic: type.is_epic,
      logo_props: type.logo_props || {},
    });
    setExpandedTypeId(type.id);
    setEditingPropertyId(null);
  };

  const handleUpdateType = async (typeId: string) => {
    if (!editForm.name.trim()) return;
    setIsSavingType(true);
    try {
      await issueTypeStore.updateIssueType(workspaceSlug, projectId, typeId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        is_epic: editForm.is_epic,
        logo_props: editForm.logo_props,
      });
      setEditingTypeId(null);
      setEditForm(EMPTY_TYPE_FORM);
    } finally {
      setIsSavingType(false);
    }
  };

  const handleCreateProperty = async (type: TIssueType, payload: TPropertyFormSubmitPayload) => {
    setIsSavingProperty(true);
    try {
      await issueTypeStore.createProperty(workspaceSlug, projectId, type.id, {
        name: payload.name,
        property_type: payload.property_type,
        is_required: payload.is_required,
        is_active: payload.is_active,
        settings: payload.settings,
        options: payload.options,
      });
      setCreateFormKey((key) => key + 1);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.properties.toast.create.success.title"),
        message: t("work_item_types.settings.properties.toast.create.success.message", { name: payload.name }),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_types.settings.properties.toast.create.error.title"),
        message: t("work_item_types.settings.properties.toast.create.error.message"),
      });
    } finally {
      setIsSavingProperty(false);
    }
  };

  const handleUpdateProperty = async (
    type: TIssueType,
    property: TIssueProperty,
    payload: TPropertyFormSubmitPayload
  ) => {
    setIsSavingProperty(true);
    try {
      await issueTypeStore.updateProperty(workspaceSlug, projectId, type.id, property.id, {
        name: payload.name,
        is_required: payload.is_required,
        is_active: payload.is_active,
        settings: payload.settings,
        ...(property.property_type === "DROPDOWN" ? { options: payload.options } : {}),
      });
      setEditingPropertyId(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.properties.toast.update.success.title"),
        message: t("work_item_types.settings.properties.toast.update.success.message", { name: payload.name }),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_types.settings.properties.toast.update.error.title"),
        message: t("work_item_types.settings.properties.toast.update.error.message"),
      });
    } finally {
      setIsSavingProperty(false);
    }
  };

  const handleDeleteProperty = async (type: TIssueType, property: TIssueProperty) => {
    try {
      await issueTypeStore.deleteProperty(workspaceSlug, projectId, type.id, property.id);
      if (editingPropertyId === property.id) setEditingPropertyId(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.properties.toast.delete.success.title"),
        message: t("work_item_types.settings.properties.toast.delete.success.message", { name: property.name }),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_types.settings.properties.toast.delete.error.title"),
        message: t("work_item_types.settings.properties.toast.delete.error.message"),
      });
    }
  };

  const renderLogoPicker = (
    logoProps: TLogoProps | Record<string, unknown>,
    isOpen: boolean,
    setIsOpen: (open: boolean) => void,
    onChange: (logo: TLogoProps | Record<string, unknown>) => void,
    disabled?: boolean
  ) => (
    <EmojiPicker
      isOpen={isOpen}
      handleToggle={(val: boolean) => {
        if (disabled) return;
        setIsOpen(val);
      }}
      className="flex flex-shrink-0 items-center justify-center"
      buttonClassName="flex items-center justify-center rounded-md bg-layer-2 hover:bg-layer-2-hover"
      label={
        <span className="grid h-9 w-9 place-items-center rounded-md">
          {logoProps && "in_use" in logoProps && logoProps.in_use ? (
            <Logo logo={logoProps as TLogoProps} size={18} type="lucide" />
          ) : (
            <Layers className="h-4 w-4 text-tertiary" />
          )}
        </span>
      }
      onChange={(val: any) => {
        let logoValue = {};
        if (val?.type === "emoji")
          logoValue = {
            value: val.value,
            url: undefined,
          };
        else if (val?.type === "icon") logoValue = val.value;

        onChange({
          in_use: val?.type,
          [val?.type]: logoValue,
        });
        setIsOpen(false);
      }}
      defaultIconColor={
        logoProps && "in_use" in logoProps && logoProps.in_use === "icon"
          ? (logoProps as TLogoProps)?.icon?.color
          : undefined
      }
      defaultOpen={
        logoProps && "in_use" in logoProps && logoProps.in_use === "emoji"
          ? EmojiIconPickerTypes.EMOJI
          : EmojiIconPickerTypes.ICON
      }
      disabled={disabled}
    />
  );

  if (!enabled) {
    return (
      <div className="border-custom-border-200 flex flex-col items-start gap-4 rounded-lg border p-6">
        <div>
          <h3 className="text-lg font-medium">{t("project_settings.work_item_types.heading")}</h3>
          <p className="text-sm text-custom-text-200 mt-1">{t("project_settings.work_item_types.description")}</p>
        </div>
        <p className="text-sm text-custom-text-300">
          Enabling work item types cannot be undone. Task and Epic types will be created for this project.
        </p>
        <Button variant="primary" onClick={handleEnable} disabled={!isAdmin || isEnabling} loading={isEnabling}>
          Enable work item types
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{t("project_settings.work_item_types.heading")}</h3>
          <p className="text-sm text-custom-text-200">{t("project_settings.work_item_types.description")}</p>
        </div>
      </div>

      <div className="border-custom-border-200 space-y-3 rounded-lg border p-4">
        <div className="flex items-start gap-2">
          {renderLogoPicker(
            createForm.logo_props,
            isCreateLogoOpen,
            setIsCreateLogoOpen,
            (logo_props) => setCreateForm((prev) => ({ ...prev, logo_props })),
            !isAdmin
          )}
          <div className="flex-1 space-y-2">
            <Input
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Bug"
              disabled={!isAdmin}
            />
            <TextArea
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              className="text-sm min-h-16"
              disabled={!isAdmin}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-custom-text-200 flex items-center gap-2">
            <ToggleSwitch
              value={createForm.is_epic}
              onChange={(is_epic) => setCreateForm((prev) => ({ ...prev, is_epic }))}
              disabled={!isAdmin}
              size="sm"
            />
            Epic type
          </div>
          <Button
            variant="primary"
            onClick={handleCreateType}
            disabled={!isAdmin || isCreatingType || !createForm.name.trim()}
            loading={isCreatingType}
          >
            <Plus className="h-3.5 w-3.5" />
            Add type
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {types.map((type) => {
          const properties = type.properties || [];
          const isExpanded = expandedTypeId === type.id;
          const isEditing = editingTypeId === type.id;
          return (
            <div key={type.id} className="border-custom-border-200 rounded-lg border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    setExpandedTypeId(isExpanded ? null : type.id);
                    setEditingPropertyId(null);
                    if (editingTypeId && editingTypeId !== type.id) {
                      setEditingTypeId(null);
                    }
                  }}
                >
                  {type.logo_props && "in_use" in type.logo_props && type.logo_props.in_use ? (
                    <Logo logo={type.logo_props as TLogoProps} size={16} type="lucide" />
                  ) : (
                    <Layers className="text-custom-text-300 h-4 w-4" />
                  )}
                  <span className="font-medium">{type.name}</span>
                  {type.is_default && (
                    <span className="bg-custom-primary-100/10 text-custom-primary-100 rounded px-1.5 py-0.5 text-[10px]">
                      Default
                    </span>
                  )}
                  {type.is_epic && (
                    <span className="bg-custom-background-80 text-custom-text-200 rounded px-1.5 py-0.5 text-[10px]">
                      Epic
                    </span>
                  )}
                  <span className="text-xs text-custom-text-300">{properties.length} properties</span>
                </button>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-custom-text-300 flex items-center gap-2">
                    Active
                    <ToggleSwitch
                      value={type.is_active}
                      onChange={async (is_active) => {
                        if (!isAdmin) return;
                        await issueTypeStore.updateIssueType(workspaceSlug, projectId, type.id, {
                          is_active,
                        });
                      }}
                      disabled={!isAdmin || type.is_default}
                      size="sm"
                    />
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => startEditingType(type)}
                      className="text-custom-text-300 hover:text-custom-text-100"
                      title="Edit type"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!type.is_default && isAdmin && (
                    <button
                      type="button"
                      onClick={() => issueTypeStore.deleteIssueType(workspaceSlug, projectId, type.id)}
                      className="text-custom-text-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isAdmin && !type.is_default && (
                    <Button
                      variant="neutral-primary"
                      size="sm"
                      onClick={() =>
                        issueTypeStore.updateIssueType(workspaceSlug, projectId, type.id, { is_default: true })
                      }
                    >
                      Set default
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-custom-border-200 space-y-4 border-t px-4 py-4">
                  {isEditing && isAdmin && (
                    <div className="border-custom-border-100 space-y-3 rounded border p-3">
                      <div className="flex items-start gap-2">
                        {renderLogoPicker(editForm.logo_props, isEditLogoOpen, setIsEditLogoOpen, (logo_props) =>
                          setEditForm((prev) => ({ ...prev, logo_props }))
                        )}
                        <div className="flex-1 space-y-2">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Type name"
                          />
                          <TextArea
                            value={editForm.description}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Description (optional)"
                            className="text-sm min-h-16"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-custom-text-200 flex items-center gap-2">
                          <ToggleSwitch
                            value={editForm.is_epic}
                            onChange={(is_epic) => setEditForm((prev) => ({ ...prev, is_epic }))}
                            size="sm"
                          />
                          Epic type
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="neutral-primary"
                            size="sm"
                            onClick={() => {
                              setEditingTypeId(null);
                              setEditForm(EMPTY_TYPE_FORM);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleUpdateType(type.id)}
                            disabled={isSavingType || !editForm.name.trim()}
                            loading={isSavingType}
                          >
                            Save type
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {properties.map((property: TIssueProperty) => {
                      const isEditingProperty = editingPropertyId === property.id;
                      return (
                        <div key={property.id} className="space-y-2">
                          {!isEditingProperty && (
                            <div className="border-custom-border-100 flex items-center justify-between rounded border px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">
                                  {property.name}
                                  {property.is_required ? " *" : ""}
                                </div>
                                <div className="text-xs text-custom-text-300">
                                  {PROPERTY_TYPES.find((p) => p.value === property.property_type)?.label ||
                                    property.property_type}
                                  {!property.is_active ? " · inactive" : ""}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <ToggleSwitch
                                  value={property.is_active}
                                  onChange={async (is_active) => {
                                    if (!isAdmin) return;
                                    await issueTypeStore.updateProperty(
                                      workspaceSlug,
                                      projectId,
                                      type.id,
                                      property.id,
                                      { is_active }
                                    );
                                  }}
                                  disabled={!isAdmin}
                                  size="sm"
                                />
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPropertyId(property.id)}
                                      className="text-custom-text-300 hover:text-custom-text-100"
                                      title="Edit property"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProperty(type, property)}
                                      className="text-custom-text-300 hover:text-red-500"
                                      title="Delete property"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          {isEditingProperty && isAdmin && (
                            <PropertyForm
                              mode="edit"
                              initialValues={property}
                              disabled={!isAdmin}
                              loading={isSavingProperty}
                              onCancel={() => setEditingPropertyId(null)}
                              onSubmit={(payload) => handleUpdateProperty(type, property, payload)}
                            />
                          )}
                        </div>
                      );
                    })}
                    {!properties.length && <p className="text-sm text-custom-text-300">No custom properties yet.</p>}
                  </div>

                  {isAdmin && (
                    <PropertyForm
                      key={`${type.id}-${createFormKey}`}
                      mode="create"
                      disabled={!isAdmin || Boolean(editingPropertyId)}
                      loading={isSavingProperty && !editingPropertyId}
                      onSubmit={(payload) => handleCreateProperty(type, payload)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
