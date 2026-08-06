/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AppInstallationService } from "@/services/app_installation.service";

const appInstallationService = new AppInstallationService();

export default function InstallationCallbackPage() {
  const { provider } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const installationId = searchParams.get("installation_id");
    const workspaceSlug = searchParams.get("state");
    const setupAction = searchParams.get("setup_action");

    if (!provider || !installationId || !workspaceSlug) {
      const message =
        "Missing installation details from GitHub. Return to workspace integrations and click Install again.";
      setStatus("error");
      setErrorMessage(message);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not connect GitHub",
        message,
      });
      return;
    }

    if (setupAction === "request") {
      setStatus("done");
      setToast({
        type: TOAST_TYPE.INFO,
        title: "Installation requested",
        message: "A GitHub organization owner must approve the app install.",
      });
      router.push(`/${workspaceSlug}/settings/integrations`);
      return;
    }

    const finishSuccess = () => {
      setStatus("done");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Connected",
        message: "GitHub is connected to your workspace.",
      });
      if (window.opener) {
        window.close();
        return;
      }
      router.push(`/${workspaceSlug}/settings/integrations`);
    };

    appInstallationService
      .addInstallationApp(workspaceSlug, provider.toString(), { installation_id: installationId })
      .then(() => finishSuccess())
      .catch((error) => {
        const statusCode = error?.status ?? error?.response?.status;
        const apiError =
          error?.data?.error || error?.response?.data?.error || "GitHub App install could not be completed.";

        // Already connected / idempotent update from GitHub setup_action=update
        if (statusCode === 409 || statusCode === 200) {
          finishSuccess();
          return;
        }

        setStatus("error");
        setErrorMessage(apiError);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not connect GitHub",
          message: apiError,
        });
        if (!window.opener) {
          router.push(`/${workspaceSlug}/settings/integrations`);
        }
      });
  }, [provider, router, searchParams]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-1">
      <div className="max-w-md px-6 text-center">
        <h1 className="text-lg font-medium text-primary">
          {status === "working" && "Connecting GitHub…"}
          {status === "done" && "GitHub connected"}
          {status === "error" && "Could not connect GitHub"}
        </h1>
        <p className="text-sm mt-2 text-secondary">
          {status === "working"
            ? "Finishing workspace setup. You can close this window when it completes."
            : status === "done"
              ? "You can close this window and return to Plane."
              : errorMessage || "Check that the GitHub App is configured, then try again from workspace integrations."}
        </p>
      </div>
    </div>
  );
}
