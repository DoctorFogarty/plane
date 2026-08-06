/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { isEmpty } from "lodash-es";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Monitor } from "lucide-react";
// plane internal packages
import { API_BASE_URL, WEB_BASE_URL } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceGithubAuthenticationConfigurationKeys } from "@plane/types";
// components
import { CodeBlock } from "@/components/common/code-block";
import { ConfirmDiscardModal } from "@/components/common/confirm-discard-modal";
import type { TControllerInputFormField } from "@/components/common/controller-input";
import type { TControllerSwitchFormField } from "@/components/common/controller-switch";
import { ControllerSwitch } from "@/components/common/controller-switch";
import { ControllerInput } from "@/components/common/controller-input";
import type { TCopyField } from "@/components/common/copy-field";
import { CopyField } from "@/components/common/copy-field";
// hooks
import { useInstance } from "@/hooks/store";

type Props = {
  config: IFormattedInstanceConfiguration;
};

type GithubConfigFormValues = Record<TInstanceGithubAuthenticationConfigurationKeys, string>;

const GITHUB_APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function resolveOrigin(preferred: string): string {
  if (!isEmpty(preferred)) return preferred.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function InstanceGithubConfigForm(props: Props) {
  const { config } = props;
  // states
  const [isDiscardChangesModalOpen, setIsDiscardChangesModalOpen] = useState(false);
  // store hooks
  const { updateInstanceConfigurations, config: instanceConfig } = useInstance();
  // form data
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GithubConfigFormValues>({
    defaultValues: {
      GITHUB_APP_NAME: config["GITHUB_APP_NAME"] || "",
      GITHUB_APP_ID: config["GITHUB_APP_ID"] || "",
      GITHUB_PRIVATE_KEY: config["GITHUB_PRIVATE_KEY"] || "",
      GITHUB_WEBHOOK_SECRET: config["GITHUB_WEBHOOK_SECRET"] || "",
      GITHUB_CLIENT_ID: config["GITHUB_CLIENT_ID"],
      GITHUB_CLIENT_SECRET: config["GITHUB_CLIENT_SECRET"],
      GITHUB_ORGANIZATION_ID: config["GITHUB_ORGANIZATION_ID"],
      ENABLE_GITHUB_SYNC: config["ENABLE_GITHUB_SYNC"] || "0",
    },
  });

  const apiOrigin = resolveOrigin(API_BASE_URL);
  const webOrigin = resolveOrigin(WEB_BASE_URL || instanceConfig?.app_base_url || API_BASE_URL);

  const GITHUB_FORM_FIELDS: TControllerInputFormField[] = [
    {
      key: "GITHUB_APP_NAME",
      type: "text",
      label: "GitHub App slug",
      description: (
        <>
          The App slug from your{" "}
          <a
            tabIndex={-1}
            href="https://github.com/settings/apps"
            target="_blank"
            className="text-accent-primary hover:underline"
            rel="noreferrer"
          >
            GitHub App settings
          </a>
          . Used for Install URLs like <CodeBlock darkerShade>github.com/apps/&lt;slug&gt;</CodeBlock>. Paste only the
          slug — never the webhook secret in this field.
        </>
      ),
      placeholder: "plane-dev",
      error: Boolean(errors.GITHUB_APP_NAME),
      required: false,
    },
    {
      key: "GITHUB_APP_ID",
      type: "text",
      label: "GitHub App ID",
      description: <>Numeric App ID from the GitHub App settings page (required to create installation tokens).</>,
      placeholder: "123456",
      error: Boolean(errors.GITHUB_APP_ID),
      required: false,
    },
    {
      key: "GITHUB_PRIVATE_KEY",
      type: "password",
      label: "GitHub App private key",
      description: <>PEM private key generated for the GitHub App (paste the full key including BEGIN/END lines).</>,
      placeholder: "-----BEGIN RSA PRIVATE KEY-----",
      error: Boolean(errors.GITHUB_PRIVATE_KEY),
      required: false,
    },
    {
      key: "GITHUB_WEBHOOK_SECRET",
      type: "password",
      label: "GitHub webhook secret",
      description: (
        <>
          Webhook secret from the GitHub App. Required for Plane to accept webhook deliveries (commits, PRs). Set the
          same value on the GitHub App and here.
        </>
      ),
      placeholder: "your-webhook-secret",
      error: Boolean(errors.GITHUB_WEBHOOK_SECRET),
      required: false,
    },
    {
      key: "GITHUB_CLIENT_ID",
      type: "text",
      label: "Client ID",
      description: (
        <>
          You will get this from your{" "}
          <a
            tabIndex={-1}
            href="https://github.com/settings/apps"
            target="_blank"
            className="text-accent-primary hover:underline"
            rel="noreferrer"
          >
            GitHub App / OAuth settings.
          </a>
        </>
      ),
      placeholder: "70a44354520df8bd9bcd",
      error: Boolean(errors.GITHUB_CLIENT_ID),
      required: true,
    },
    {
      key: "GITHUB_CLIENT_SECRET",
      type: "password",
      label: "Client secret",
      description: (
        <>
          Your client secret is also found in your{" "}
          <a
            tabIndex={-1}
            href="https://github.com/settings/apps"
            target="_blank"
            className="text-accent-primary hover:underline"
            rel="noreferrer"
          >
            GitHub App / OAuth settings.
          </a>
        </>
      ),
      placeholder: "9b0050f94ec1b744e32ce79ea4ffacd40d4119cb",
      error: Boolean(errors.GITHUB_CLIENT_SECRET),
      required: true,
    },
    {
      key: "GITHUB_ORGANIZATION_ID",
      type: "text",
      label: "Organization ID",
      description: <>The organization github ID.</>,
      placeholder: "123456789",
      error: Boolean(errors.GITHUB_ORGANIZATION_ID),
      required: false,
    },
  ];

  const GITHUB_FORM_SWITCH_FIELD: TControllerSwitchFormField<GithubConfigFormValues> = {
    name: "ENABLE_GITHUB_SYNC",
    label: "GitHub",
  };

  const GITHUB_COMMON_SERVICE_DETAILS: TCopyField[] = [
    {
      key: "Origin_URL",
      label: "Origin URL",
      url: webOrigin,
      description: (
        <>
          We will auto-generate this. Paste this into the <CodeBlock darkerShade>Authorized origin URL</CodeBlock> field{" "}
          <a
            tabIndex={-1}
            href="https://github.com/settings/applications/new"
            target="_blank"
            className="text-accent-primary hover:underline"
            rel="noreferrer"
          >
            here.
          </a>
        </>
      ),
    },
  ];

  const GITHUB_SERVICE_DETAILS: TCopyField[] = [
    {
      key: "Callback_URI",
      label: "Callback URI",
      url: `${apiOrigin}/auth/github/callback/`,
      description: (
        <>
          We will auto-generate this. Paste this into your <CodeBlock darkerShade>Authorized Callback URI</CodeBlock>{" "}
          field{" "}
          <a
            tabIndex={-1}
            href="https://github.com/settings/apps"
            target="_blank"
            className="text-accent-primary hover:underline"
            rel="noreferrer"
          >
            here.
          </a>
        </>
      ),
    },
    {
      key: "App_Setup_URL",
      label: "GitHub App setup URL",
      url: `${webOrigin}/installations/github`,
      description: (
        <>
          Paste this into the GitHub App <CodeBlock darkerShade>Setup URL</CodeBlock> (after installation callback).
          Enable <CodeBlock darkerShade>Redirect on update</CodeBlock> so permission changes return to Plane.
        </>
      ),
    },
    {
      key: "Webhook_URL",
      label: "Webhook URL",
      url: `${apiOrigin}/api/hooks/github/`,
      description: (
        <>
          Paste this into the GitHub App <CodeBlock darkerShade>Webhook URL</CodeBlock> field. The URL must be publicly
          reachable. Also set repository permissions: Contents (R/W), Metadata (R), Pull requests (R/W); subscribe to
          create, push, and pull_request.
        </>
      ),
    },
  ];

  const onSubmit = async (formData: GithubConfigFormValues) => {
    const rawSlug = formData.GITHUB_APP_NAME || "";
    const sanitizedSlug = rawSlug.trim().split(/\s+/)[0] || "";
    if (rawSlug.trim() && rawSlug.trim() !== sanitizedSlug) {
      setToast({
        type: TOAST_TYPE.INFO,
        title: "App slug cleaned",
        message: "Only the first token was saved as the App slug. Put secrets in the Webhook secret field instead.",
      });
    }
    if (sanitizedSlug && !GITHUB_APP_SLUG_PATTERN.test(sanitizedSlug)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Invalid App slug",
        message: "GitHub App slug must be lowercase letters, numbers, and hyphens only.",
      });
      return;
    }

    const privateKey = (formData.GITHUB_PRIVATE_KEY || "").trim();
    if (privateKey && (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY"))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Invalid private key",
        message: "Paste the full PEM including -----BEGIN ... PRIVATE KEY----- lines.",
      });
      return;
    }

    const payload: Partial<GithubConfigFormValues> = {
      ...formData,
      GITHUB_APP_NAME: sanitizedSlug,
    };

    try {
      const response = await updateInstanceConfigurations(payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Done!",
        message: "Your GitHub authentication is configured. You should test it now.",
      });
      reset({
        GITHUB_APP_NAME: response.find((item) => item.key === "GITHUB_APP_NAME")?.value || "",
        GITHUB_APP_ID: response.find((item) => item.key === "GITHUB_APP_ID")?.value || "",
        GITHUB_PRIVATE_KEY: response.find((item) => item.key === "GITHUB_PRIVATE_KEY")?.value || "",
        GITHUB_WEBHOOK_SECRET: response.find((item) => item.key === "GITHUB_WEBHOOK_SECRET")?.value || "",
        GITHUB_CLIENT_ID: response.find((item) => item.key === "GITHUB_CLIENT_ID")?.value,
        GITHUB_CLIENT_SECRET: response.find((item) => item.key === "GITHUB_CLIENT_SECRET")?.value,
        GITHUB_ORGANIZATION_ID: response.find((item) => item.key === "GITHUB_ORGANIZATION_ID")?.value,
        ENABLE_GITHUB_SYNC: response.find((item) => item.key === "ENABLE_GITHUB_SYNC")?.value,
      });
    } catch (err: any) {
      const message =
        err?.data?.error || err?.response?.data?.error || "Could not save GitHub configuration. Please try again.";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message,
      });
    }
  };

  const handleGoBack = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (isDirty) {
      e.preventDefault();
      setIsDiscardChangesModalOpen(true);
    }
  };

  return (
    <>
      <ConfirmDiscardModal
        isOpen={isDiscardChangesModalOpen}
        onDiscardHref="/authentication"
        handleClose={() => setIsDiscardChangesModalOpen(false)}
      />
      <div className="flex flex-col gap-8">
        <div className="grid w-full grid-cols-2 gap-x-12 gap-y-8">
          <div className="col-span-2 flex flex-col gap-y-4 pt-1 md:col-span-1">
            <div className="pt-2.5 text-18 font-medium">GitHub-provided details for Plane</div>
            {GITHUB_FORM_FIELDS.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
              />
            ))}
            <ControllerSwitch control={control} field={GITHUB_FORM_SWITCH_FIELD} />
            <div className="flex flex-col gap-1 pt-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={(e) => void handleSubmit(onSubmit)(e)}
                  loading={isSubmitting}
                  disabled={!isDirty}
                >
                  {isSubmitting ? "Saving" : "Save changes"}
                </Button>
                <Link href="/authentication" className={getButtonStyling("secondary", "lg")} onClick={handleGoBack}>
                  Go back
                </Link>
              </div>
            </div>
          </div>
          <div className="col-span-2 flex flex-col gap-y-6 md:col-span-1">
            <div className="pt-2 text-18 font-medium">Plane-provided details for GitHub</div>

            <div className="flex flex-col gap-y-4">
              {/* common service details */}
              <div className="flex flex-col gap-y-4 rounded-lg bg-layer-1 px-6 py-4">
                {GITHUB_COMMON_SERVICE_DETAILS.map((field) => (
                  <CopyField key={field.key} label={field.label} url={field.url} description={field.description} />
                ))}
              </div>

              {/* web service details */}
              <div className="flex flex-col overflow-hidden rounded-lg">
                <div className="flex items-center gap-x-3 bg-layer-3 px-6 py-3 text-11 font-medium text-secondary uppercase">
                  <Monitor className="h-3 w-3" />
                  Web
                </div>
                <div className="flex flex-col gap-y-4 bg-layer-1 px-6 py-4">
                  {GITHUB_SERVICE_DETAILS.map((field) => (
                    <CopyField key={field.key} label={field.label} url={field.url} description={field.description} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
