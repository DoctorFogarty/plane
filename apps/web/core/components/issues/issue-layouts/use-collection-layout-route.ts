/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  getCollectionLayoutHref,
  getIssueLayoutFromPathSlug,
  getIssueLayoutSlugFromPathname,
  isCollectionIndexPath,
  type TIssueCollectionKind,
} from "@plane/constants";
import { EIssueLayoutTypes } from "@plane/types";

type TUseCollectionLayoutRouteArgs = {
  kind: TIssueCollectionKind;
  workspaceSlug?: string;
  projectId?: string;
  entityId?: string;
  storedLayout: EIssueLayoutTypes | undefined;
  hasFilters: boolean;
  persistLayout: (layout: EIssueLayoutTypes) => void;
};

export function useCollectionLayoutRoute(args: TUseCollectionLayoutRouteArgs) {
  const { kind, workspaceSlug, projectId, entityId, storedLayout, hasFilters, persistLayout } = args;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const urlLayout = getIssueLayoutFromPathSlug(getIssueLayoutSlugFromPathname(pathname));
  const activeLayout = urlLayout ?? storedLayout ?? EIssueLayoutTypes.LIST;

  // URL is the runtime layout. Persist is write-through only.
  useLayoutEffect(() => {
    if (!workspaceSlug || !projectId || !entityId || !urlLayout || !hasFilters) return;
    if (storedLayout === urlLayout) return;
    persistLayout(urlLayout);
  }, [workspaceSlug, projectId, entityId, urlLayout, storedLayout, hasFilters, persistLayout]);

  // Index paths (`/issues`, `/cycles/:id`) redirect once to a slug. Layout slugs never bounce.
  useEffect(() => {
    if (!workspaceSlug || !projectId || !entityId || !hasFilters) return;
    if (!isCollectionIndexPath(pathname, kind)) return;
    navigate(getCollectionLayoutHref({ workspaceSlug, projectId, kind, entityId, layout: storedLayout }), {
      replace: true,
    });
  }, [entityId, hasFilters, kind, navigate, pathname, projectId, storedLayout, workspaceSlug]);

  return { activeLayout, urlLayout };
}

export function useCollectionLayoutSelection(args: {
  kind: TIssueCollectionKind;
  entityId?: string;
  storedLayout?: EIssueLayoutTypes;
}) {
  const { kind, entityId, storedLayout } = args;
  const { workspaceSlug, projectId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const urlLayout = getIssueLayoutFromPathSlug(getIssueLayoutSlugFromPathname(pathname));

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !projectId || !entityId) return;
      navigate(
        getCollectionLayoutHref({
          workspaceSlug: workspaceSlug.toString(),
          projectId: projectId.toString(),
          kind,
          entityId,
          layout,
        })
      );
    },
    [entityId, kind, navigate, projectId, workspaceSlug]
  );

  return {
    activeLayout: urlLayout ?? storedLayout,
    handleLayoutChange,
  };
}
