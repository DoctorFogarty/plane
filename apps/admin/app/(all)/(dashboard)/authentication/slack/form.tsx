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
import { API_BASE_URL } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceSlackConfigurationKeys } from "@plane/types";
import { ConfirmDiscardModal } from "@/components/common/confirm-discard-modal";
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { ControllerInput } from "@/components/common/controller-input";
import type { TCopyField } from "@/components/common/copy-field";
import { CopyField } from "@/components/common/copy-field";
import { useInstance } from "@/hooks/store";

type Props = {
  config: IFormattedInstanceConfiguration;
};

type SlackConfigFormValues = Record<TInstanceSlackConfigurationKeys, string>;

export function InstanceSlackConfigForm(props: Props) {
  const { config } = props;
  const [isDiscardChangesModalOpen, setIsDiscardChangesModalOpen] = useState(false);
  const { updateInstanceConfigurations } = useInstance();
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SlackConfigFormValues>({
    defaultValues: {
      SLACK_CLIENT_ID: config["SLACK_CLIENT_ID"] || "",
      SLACK_CLIENT_SECRET: config["SLACK_CLIENT_SECRET"] || "",
      SLACK_SIGNING_SECRET: config["SLACK_SIGNING_SECRET"] || "",
      SLACK_APP_TOKEN: config["SLACK_APP_TOKEN"] || "",
    },
  });

  const originURL = !isEmpty(API_BASE_URL) ? API_BASE_URL : typeof window !== "undefined" ? window.location.origin : "";

  const SLACK_FORM_FIELDS: TControllerInputFormField[] = [
    {
      key: "SLACK_CLIENT_ID",
      type: "text",
      label: "Client ID",
      description: "From your Slack app Basic Information page. This value is public.",
      placeholder: "1234567890.1234567890",
      error: Boolean(errors.SLACK_CLIENT_ID),
      required: true,
    },
    {
      key: "SLACK_CLIENT_SECRET",
      type: "password",
      label: "Client Secret",
      description: "Stored encrypted. Never returned on GET /api/instances/.",
      placeholder: "••••••••",
      error: Boolean(errors.SLACK_CLIENT_SECRET),
      required: true,
    },
    {
      key: "SLACK_SIGNING_SECRET",
      type: "password",
      label: "Signing Secret",
      description: "Used to verify Events API, interactivity, and slash requests.",
      placeholder: "••••••••",
      error: Boolean(errors.SLACK_SIGNING_SECRET),
      required: true,
    },
    {
      key: "SLACK_APP_TOKEN",
      type: "password",
      label: "App-level token (optional)",
      description: "Only needed for Socket Mode on air-gapped hosts. Leave empty on this VPS.",
      placeholder: "xapp-…",
      error: Boolean(errors.SLACK_APP_TOKEN),
      required: false,
    },
  ];

  const SLACK_SERVICE_DETAILS: TCopyField[] = [
    {
      key: "events",
      label: "Events Request URL",
      url: `${originURL}/api/hooks/slack/events`,
      description: "Slack app Event Subscriptions request URL.",
    },
    {
      key: "interactive",
      label: "Interactivity Request URL",
      url: `${originURL}/api/hooks/slack/interactive`,
      description: "Interactivity & Shortcuts request URL.",
    },
    {
      key: "commands",
      label: "Slash command Request URL",
      url: `${originURL}/api/hooks/slack/commands`,
      description: "Request URL for /plane.",
    },
    {
      key: "oauth-workspace",
      label: "Workspace OAuth redirect",
      url: `${originURL}/api/hooks/slack/oauth/workspace`,
      description: "Redirect URL for workspace install.",
    },
    {
      key: "oauth-user",
      label: "User OAuth redirect",
      url: `${originURL}/api/hooks/slack/oauth/user`,
      description: "Redirect URL for linking a Slack account.",
    },
  ];

  const onSubmit = async (formData: SlackConfigFormValues) => {
    try {
      const response = await updateInstanceConfigurations(formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Done!",
        message: "Slack app credentials are saved. Test Connect Slack from a workspace.",
      });
      reset({
        SLACK_CLIENT_ID: response.find((item) => item.key === "SLACK_CLIENT_ID")?.value || "",
        SLACK_CLIENT_SECRET: response.find((item) => item.key === "SLACK_CLIENT_SECRET")?.value || "",
        SLACK_SIGNING_SECRET: response.find((item) => item.key === "SLACK_SIGNING_SECRET")?.value || "",
        SLACK_APP_TOKEN: response.find((item) => item.key === "SLACK_APP_TOKEN")?.value || "",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Could not save Slack configuration. Please try again.",
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
            <div className="pt-2.5 text-18 font-medium">Slack app credentials</div>
            {SLACK_FORM_FIELDS.map((field) => (
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
            <div className="flex items-center gap-4 pt-4">
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
          <div className="col-span-2 flex flex-col gap-y-6 md:col-span-1">
            <div className="pt-2 text-18 font-medium">Plane-provided details for Slack</div>
            <div className="flex flex-col overflow-hidden rounded-lg">
              <div className="flex items-center gap-x-3 bg-layer-3 px-6 py-3 text-11 font-medium text-secondary uppercase">
                <Monitor className="h-3 w-3" />
                Request URLs
              </div>
              <div className="flex flex-col gap-y-4 bg-layer-1 px-6 py-4">
                {SLACK_SERVICE_DETAILS.map((field) => (
                  <CopyField key={field.key} label={field.label} url={field.url} description={field.description} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
