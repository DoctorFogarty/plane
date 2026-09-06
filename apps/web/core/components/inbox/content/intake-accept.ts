/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Intake items already exist as TRIAGE issues. Accept is a status PATCH,
 * not a create-work-item modal.
 */
export type TIntakeAcceptInteraction = "update-status" | "open-create-modal";

export function resolveIntakeAcceptInteraction(): TIntakeAcceptInteraction {
  return "update-status";
}

export function canStartIntakeAccept(params: { acceptInFlight: boolean; issueId: string | undefined }): boolean {
  return !params.acceptInFlight && Boolean(params.issueId);
}

export function shouldRedirectAfterIntakeAccept(didSucceed: boolean): boolean {
  return didSucceed;
}
