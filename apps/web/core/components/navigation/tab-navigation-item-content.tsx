/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TNavigationItem } from "./tab-navigation-root";

type TTabNavigationItemContentProps = {
  item: TNavigationItem;
};

export function TabNavigationItemContent({ item }: TTabNavigationItemContentProps) {
  const { t } = useTranslation();
  const Icon = item.icon;

  return (
    <span className="z-10 flex items-center gap-2">
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span>{t(item.i18n_key)}</span>
    </span>
  );
}
