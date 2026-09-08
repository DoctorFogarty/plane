/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_ATTACHMENT_MIME_TYPE } from "@plane/constants";
import { getFileMetaDataForUpload } from "@plane/services";
import { hasDangerousAttachmentExtension, resolveAttachmentMimeType } from "@plane/utils";

describe("resolveAttachmentMimeType", () => {
  it("falls back when CAD files have no browser MIME type", () => {
    expect(resolveAttachmentMimeType("", undefined)).toBe(DEFAULT_ATTACHMENT_MIME_TYPE);
    expect(resolveAttachmentMimeType("application/step")).toBe("application/step");
    expect(resolveAttachmentMimeType(undefined, "image/vnd.dxf")).toBe("image/vnd.dxf");
  });
});

describe("hasDangerousAttachmentExtension", () => {
  it("allows engineering extensions", () => {
    expect(hasDangerousAttachmentExtension("bracket.step")).toBe(false);
    expect(hasDangerousAttachmentExtension("toolpath.TAP")).toBe(false);
    expect(hasDangerousAttachmentExtension("plate.dxf")).toBe(false);
  });

  it("blocks executable extensions", () => {
    expect(hasDangerousAttachmentExtension("payload.exe")).toBe(true);
    expect(hasDangerousAttachmentExtension("payload.exe.step")).toBe(true);
  });
});

describe("getFileMetaDataForUpload", () => {
  it("sends a generic type for CAD files the browser cannot identify", async () => {
    const file = new File([new Uint8Array([73, 83, 79, 45, 49, 48, 51, 48, 51])], "bracket.step", { type: "" });
    await expect(getFileMetaDataForUpload(file)).resolves.toMatchObject({
      name: "bracket.step",
      type: DEFAULT_ATTACHMENT_MIME_TYPE,
    });
  });

  it("keeps a browser-provided CAD MIME type when signature detection fails", async () => {
    const file = new File(["0\nSECTION\n"], "plate.dxf", { type: "image/vnd.dxf" });
    await expect(getFileMetaDataForUpload(file)).resolves.toMatchObject({
      name: "plate.dxf",
      type: "image/vnd.dxf",
    });
  });

  it("rejects executable attachments", async () => {
    const file = new File([new Uint8Array([77, 90])], "payload.exe", { type: "application/x-msdownload" });
    await expect(getFileMetaDataForUpload(file)).rejects.toThrow(/not allowed/);
  });
});
