/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { Hash } from "lucide-react";
import { Loader } from "@plane/ui";
import { AuthenticationMethodCard } from "@/components/authentication/authentication-method-card";
import { PageWrapper } from "@/components/common/page-wrapper";
import { useInstance } from "@/hooks/store";
import type { Route } from "./+types/page";
import { InstanceSlackConfigForm } from "./form";

const InstanceSlackConfigPage = observer(function InstanceSlackConfigPage(_props: Route.ComponentProps) {
  const { fetchInstanceConfigurations, formattedConfig } = useInstance();
  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  return (
    <PageWrapper
      customHeader={
        <AuthenticationMethodCard
          name="Slack"
          description="Bring-your-own Slack app for workspace install, unfurls, slash commands, and notifications."
          icon={<Hash className="h-6 w-6" />}
          config={<span />}
          disabled={false}
          withBorder={false}
        />
      }
    >
      {formattedConfig ? (
        <InstanceSlackConfigForm config={formattedConfig} />
      ) : (
        <Loader className="space-y-8">
          <Loader.Item height="50px" width="25%" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Slack Integration - God Mode" }];

export default InstanceSlackConfigPage;
