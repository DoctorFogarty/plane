/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { API_BASE_URL } from "@plane/constants";
import { SitesIntakeFormService } from "@plane/services";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PoweredBy } from "@/components/common/powered-by";
import { PublicIntakeForm } from "@/components/forms/public-form";
import { PageNotFound } from "@/components/ui/not-found";
import { useUser } from "@/hooks/store/use-user";

const formService = new SitesIntakeFormService();

const ANCHOR_REGEX = /^[a-zA-Z0-9_-]+$/;

async function loadForm(anchor: string) {
  const [, schema] = await Promise.all([
    fetch(`${API_BASE_URL}/auth/get-csrf-token/`, { credentials: "include" }).catch(() => null),
    formService.retrieve(anchor),
  ]);
  return schema;
}

const IntakeFormPage = observer(function IntakeFormPage() {
  const params = useParams() as { anchor?: string };
  const anchor = params.anchor || "";
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useUser();

  const canFetch = Boolean(anchor && ANCHOR_REGEX.test(anchor));
  const { data, error, isLoading } = useSWR(canFetch ? `PUBLIC_INTAKE_FORM_${anchor}` : null, () => loadForm(anchor), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const needsAuth = Boolean(data && data.access === "AUTHENTICATED" && !isAuthenticated && !isInitializing);

  useEffect(() => {
    if (!needsAuth) return;
    router.replace(`/?next_path=${encodeURIComponent(`/forms/${anchor}`)}`);
  }, [anchor, needsAuth, router]);

  if (!canFetch || error) return <PageNotFound />;
  if (isLoading || !data || isInitializing || needsAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-1">
        <LogoSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <PublicIntakeForm anchor={anchor} schema={data} />
      </div>
      <PoweredBy />
    </div>
  );
});

export default IntakeFormPage;
