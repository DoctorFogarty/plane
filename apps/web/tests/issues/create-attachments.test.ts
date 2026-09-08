/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import { addPendingAttachments, uploadPendingIssueAttachments } from "@/helpers/create-issue-attachments";

const makeFile = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: "text/plain" });

describe("addPendingAttachments", () => {
  it("returns the current list when no files are added", () => {
    const current = [{ id: "existing", file: makeFile("notes.txt", 8) }];
    expect(addPendingAttachments(current, [])).toEqual({ next: current });
  });

  it("appends accepted files with local ids", () => {
    const brief = makeFile("brief.pdf", 12);
    const { next, error } = addPendingAttachments([], [brief], { maxFileSize: 100 });

    expect(error).toBeUndefined();
    expect(next).toHaveLength(1);
    expect(next[0]?.file).toBe(brief);
    expect(next[0]?.id).toContain("brief.pdf");
  });

  it("rejects files over the size limit and keeps accepted files", () => {
    const small = makeFile("ok.txt", 4);
    const large = makeFile("too-big.bin", 20);
    const { next, error } = addPendingAttachments([], [small, large], { maxFileSize: 10 });

    expect(error).toBe("size");
    expect(next).toHaveLength(1);
    expect(next[0]?.file).toBe(small);
  });

  it("keeps the current list when every file is too large", () => {
    const current = [{ id: "kept", file: makeFile("kept.txt", 2) }];
    const { next, error } = addPendingAttachments(current, [makeFile("huge.bin", 50)], { maxFileSize: 10 });

    expect(error).toBe("size");
    expect(next).toBe(current);
  });

  it("accepts CAD and CAM files regardless of extension", () => {
    const files = [
      new File([new Uint8Array(4)], "bracket.step", { type: "" }),
      new File([new Uint8Array(4)], "toolpath.tap", { type: "text/plain" }),
      new File([new Uint8Array(4)], "plate.dxf", { type: "image/vnd.dxf" }),
    ];

    const { next, error } = addPendingAttachments([], files);

    expect(error).toBeUndefined();
    expect(next.map((item) => item.file.name)).toEqual(["bracket.step", "toolpath.tap", "plate.dxf"]);
  });

  it("rejects executable attachments", () => {
    const current = [{ id: "kept", file: makeFile("kept.txt", 2) }];
    const { next, error } = addPendingAttachments(current, [new File([new Uint8Array(4)], "payload.exe")]);

    expect(error).toBe("type");
    expect(next).toBe(current);
  });
});

describe("uploadPendingIssueAttachments", () => {
  it("returns zeros without calling upload when there are no files", async () => {
    const uploadFile = vi.fn();
    await expect(
      uploadPendingIssueAttachments({
        workspaceSlug: "acme",
        projectId: "project-1",
        issueId: "issue-1",
        files: [],
        uploadFile,
      })
    ).resolves.toEqual({ uploaded: 0, failed: 0, attachments: [] });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("uploads independent files in parallel and reports success", async () => {
    const uploadFile = vi.fn().mockResolvedValue({ id: "asset" });
    const files = [makeFile("a.txt", 2), makeFile("b.txt", 3)];

    await expect(
      uploadPendingIssueAttachments({
        workspaceSlug: "acme",
        projectId: "project-1",
        issueId: "issue-1",
        files,
        uploadFile,
      })
    ).resolves.toEqual({ uploaded: 2, failed: 0, attachments: [{ id: "asset" }, { id: "asset" }] });

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenCalledWith("acme", "project-1", "issue-1", files[0]);
    expect(uploadFile).toHaveBeenCalledWith("acme", "project-1", "issue-1", files[1]);
  });

  it("reports partial failure without rejecting", async () => {
    const uploadFile = vi.fn().mockResolvedValueOnce({ id: "ok" }).mockRejectedValueOnce(new Error("upload failed"));

    await expect(
      uploadPendingIssueAttachments({
        workspaceSlug: "acme",
        projectId: "project-1",
        issueId: "issue-1",
        files: [makeFile("ok.txt", 2), makeFile("bad.txt", 3)],
        uploadFile,
      })
    ).resolves.toEqual({ uploaded: 1, failed: 1, attachments: [{ id: "ok" }] });
  });
});
