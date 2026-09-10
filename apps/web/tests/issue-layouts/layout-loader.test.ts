/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListLoaderItemRow } from "@/components/ui/loader/layouts/list-layout-loader";
import { getStableLoaderClass, LOADER_TITLE_WIDTH_CLASSES, shouldRenderLoaderChip } from "@/components/ui/loader/utils";

describe("layout loaders", () => {
  it("picks title widths from the row index", () => {
    expect(getStableLoaderClass(0, LOADER_TITLE_WIDTH_CLASSES)).toBe("w-32");
    expect(getStableLoaderClass(1, LOADER_TITLE_WIDTH_CLASSES)).toBe("w-52");
    expect(getStableLoaderClass(2, LOADER_TITLE_WIDTH_CLASSES)).toBe("w-72");
    expect(getStableLoaderClass(3, LOADER_TITLE_WIDTH_CLASSES)).toBe("w-32");
    expect(shouldRenderLoaderChip(0)).toBe(true);
    expect(shouldRenderLoaderChip(1)).toBe(false);
  });

  it("keeps list skeleton markup stable across rerenders", () => {
    const { container, rerender } = render(createElement(ListLoaderItemRow, { rowIndex: 3 }));
    const first = container.innerHTML;
    rerender(createElement(ListLoaderItemRow, { rowIndex: 3 }));
    expect(container.innerHTML).toBe(first);
    expect(first).toContain("w-32");
  });
});
