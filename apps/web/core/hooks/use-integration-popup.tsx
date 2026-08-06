/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { mutate } from "swr";
import { WORKSPACE_INTEGRATIONS } from "@plane/constants";

const useIntegrationPopup = ({
  provider,
  stateParams,
  github_app_name,
  slack_client_id,
}: {
  provider: string | undefined;
  stateParams?: string;
  github_app_name?: string;
  slack_client_id?: string;
}) => {
  const [authLoader, setAuthLoader] = useState(false);

  const { workspaceSlug, projectId } = useParams();

  // GitHub App slug only — never secrets. Strip whitespace and reject invalid values.
  const githubAppSlug = (github_app_name || "").trim().split(/\s+/)[0] || "";

  const providerUrls: { [key: string]: string } = {
    github: `https://github.com/apps/${encodeURIComponent(githubAppSlug)}/installations/new?state=${workspaceSlug?.toString()}`,
    slack: `https://slack.com/oauth/v2/authorize?scope=chat:write,im:history,im:write,links:read,links:write,users:read,users:read.email&amp;user_scope=&amp;&client_id=${slack_client_id}&state=${workspaceSlug?.toString()}`,
    slackChannel: `https://slack.com/oauth/v2/authorize?scope=incoming-webhook&client_id=${slack_client_id}&state=${workspaceSlug?.toString()},${projectId?.toString()}${
      stateParams ? "," + stateParams : ""
    }`,
  };

  const popup = useRef<Window | null>(null);

  const checkPopup = () => {
    const check = setInterval(() => {
      if (!popup.current || popup.current.closed) {
        clearInterval(check);
        setAuthLoader(false);
        if (workspaceSlug) {
          mutate(WORKSPACE_INTEGRATIONS(workspaceSlug.toString()));
        }
      }
    }, 1000);
  };

  const openPopup = () => {
    if (!provider) return null;
    if (provider === "github" && !githubAppSlug) return null;

    const width = 600,
      height = 600;
    const left = window.innerWidth / 2 - width / 2;
    const top = window.innerHeight / 2 - height / 2;
    const url = providerUrls[provider];

    return window.open(url, "", `width=${width}, height=${height}, top=${top}, left=${left}`);
  };

  const startAuth = () => {
    if (provider === "github" && !githubAppSlug) {
      setAuthLoader(false);
      return;
    }
    popup.current = openPopup();
    if (!popup.current) {
      setAuthLoader(false);
      return;
    }
    checkPopup();
    setAuthLoader(true);
  };

  return {
    startAuth,
    isConnecting: authLoader,
  };
};

export default useIntegrationPopup;
