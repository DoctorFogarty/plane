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
  github_app_name,
}: {
  provider: string | undefined;
  stateParams?: string;
  github_app_name?: string;
  slack_client_id?: string;
}) => {
  const [authLoader, setAuthLoader] = useState(false);

  const { workspaceSlug } = useParams();

  const githubAppSlug = (github_app_name || "").trim().split(/\s+/)[0] || "";

  const providerUrls: { [key: string]: string } = {
    github: `https://github.com/apps/${encodeURIComponent(githubAppSlug)}/installations/new?state=${workspaceSlug?.toString()}`,
    slack: `/api/workspaces/${workspaceSlug?.toString()}/integrations/slack/install/`,
    slackUser: `/api/workspaces/${workspaceSlug?.toString()}/integrations/slack/connect-user/`,
  };

  const popup = useRef<Window | null>(null);

  const checkPopup = () => {
    const check = setInterval(() => {
      if (!popup.current || popup.current.closed) {
        clearInterval(check);
        setAuthLoader(false);
        if (workspaceSlug) {
          mutate(WORKSPACE_INTEGRATIONS(workspaceSlug.toString()));
          mutate(`SLACK_CONNECTION_${workspaceSlug.toString()}`);
          mutate(`SLACK_USER_CONNECTION_${workspaceSlug.toString()}`);
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
