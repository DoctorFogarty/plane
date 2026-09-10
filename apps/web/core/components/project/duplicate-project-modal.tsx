/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Copy } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProject } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { projectIdentifierSanitizer } from "@plane/utils";
// hooks
import { getDefaultTabUrl } from "@/components/navigation/tab-navigation-utils";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";

type DuplicateProjectModalProps = {
  isOpen: boolean;
  project: Pick<TProject, "id" | "name" | "identifier">;
  workspaceSlug: string;
  onClose: () => void;
};

type TDuplicateProjectForm = {
  name: string;
  identifier: string;
};

function deriveIdentifier(name: string): string {
  return projectIdentifierSanitizer(name).substring(0, 10).toUpperCase();
}

export function DuplicateProjectModal(props: DuplicateProjectModalProps) {
  const { isOpen, project, workspaceSlug, onClose } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { duplicateProject } = useProject();
  const [shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier] = useState(true);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setError,
    setValue,
  } = useForm<TDuplicateProjectForm>({
    defaultValues: {
      name: "",
      identifier: "",
    },
  });

  useEffect(() => {
    if (!isOpen || !project) return;
    const name = `${project.name} (copy)`.slice(0, 255);
    reset({
      name,
      identifier: deriveIdentifier(name),
    });
    setShouldAutoSyncIdentifier(true);
  }, [isOpen, project, reset]);

  const handleClose = () => {
    const timer = setTimeout(() => {
      reset({ name: "", identifier: "" });
      setShouldAutoSyncIdentifier(true);
      clearTimeout(timer);
    }, 350);
    onClose();
  };

  const onSubmit = async (formData: TDuplicateProjectForm) => {
    if (!workspaceSlug || !project?.id) return;

    try {
      const response = await duplicateProject(workspaceSlug, project.id, {
        name: formData.name.trim(),
        identifier: formData.identifier.toUpperCase(),
      });
      handleClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("project_duplicate.toast.success"),
      });
      router.push(getDefaultTabUrl(workspaceSlug, response.id));
    } catch (error: any) {
      const errorData = error?.data ?? error;
      const nameError =
        errorData?.name?.includes?.("PROJECT_NAME_ALREADY_EXIST") ||
        (Array.isArray(errorData?.name) && errorData.name.includes("PROJECT_NAME_ALREADY_EXIST"));
      const identifierError =
        errorData?.identifier?.includes?.("PROJECT_IDENTIFIER_ALREADY_EXIST") ||
        (Array.isArray(errorData?.identifier) && errorData.identifier.includes("PROJECT_IDENTIFIER_ALREADY_EXIST"));

      if (nameError) {
        setError("name", { message: t("project_name_already_taken") });
      }
      if (identifierError) {
        setError("identifier", { message: t("project_identifier_already_taken") });
      }
      if (!nameError && !identifierError) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("project_duplicate.toast.error"),
        });
      }
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 p-6">
        <div className="flex w-full items-center justify-start gap-4">
          <span className="place-items-center rounded-full bg-layer-2 p-3">
            <Copy className="h-5 w-5 text-secondary" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-18 font-medium">{t("project_duplicate.title")}</h3>
            <p className="text-13 text-secondary">{t("project_duplicate.description")}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="duplicate-project-name" className="mb-1 block text-13 font-medium text-secondary">
              {t("project_name")}
            </label>
            <Controller
              control={control}
              name="name"
              rules={{
                required: t("name_is_required"),
                maxLength: {
                  value: 255,
                  message: t("title_should_be_less_than_255_characters"),
                },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  id="duplicate-project-name"
                  name="name"
                  type="text"
                  value={value}
                  onChange={(e) => {
                    onChange(e);
                    if (shouldAutoSyncIdentifier) {
                      setValue("identifier", deriveIdentifier(e.target.value));
                    }
                  }}
                  hasError={Boolean(errors.name)}
                  placeholder={t("project_name")}
                  className="w-full"
                  autoFocus
                />
              )}
            />
            {errors.name?.message ? <span className="text-11 text-danger-primary">{errors.name.message}</span> : null}
          </div>

          <div>
            <label htmlFor="duplicate-project-identifier" className="mb-1 block text-13 font-medium text-secondary">
              {t("project_id")}
            </label>
            <Controller
              control={control}
              name="identifier"
              rules={{
                required: t("project_id_is_required"),
                validate: (value) =>
                  /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("only_alphanumeric_non_latin_characters_allowed"),
                minLength: {
                  value: 1,
                  message: t("project_id_min_char"),
                },
                maxLength: {
                  value: 10,
                  message: t("project_id_max_char"),
                },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  id="duplicate-project-identifier"
                  name="identifier"
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setShouldAutoSyncIdentifier(false);
                    onChange(projectIdentifierSanitizer(e.target.value).substring(0, 10));
                  }}
                  hasError={Boolean(errors.identifier)}
                  placeholder={t("project_id")}
                  className="w-full uppercase"
                />
              )}
            />
            {errors.identifier?.message ? (
              <span className="text-11 text-danger-primary">{errors.identifier.message}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {isSubmitting ? t("project_duplicate.duplicating") : t("project_duplicate.action")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
