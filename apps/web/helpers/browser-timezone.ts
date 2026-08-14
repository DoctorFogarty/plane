/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const stampBrowserTimezoneOnForm = (form: EventTarget | null): void => {
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.elements.namedItem("user_timezone");
  if (input instanceof HTMLInputElement) {
    input.value = getBrowserTimezone();
  }
};
