/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TWorkItemTemplateDropdownSize = "xs" | "sm";

export type TWorkItemTemplateSelect = {
  projectId: string | null;
  typeId: string | null;
  disabled?: boolean;
  size?: TWorkItemTemplateDropdownSize;
  placeholder?: string;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  handleModalClose: () => void;
  handleFormChange?: () => void;
};

export function WorkItemTemplateSelect(_props: TWorkItemTemplateSelect) {
  return <></>;
}
