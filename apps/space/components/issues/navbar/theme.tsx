/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export const NavbarTheme = observer(function NavbarTheme() {
  const { setTheme, theme } = useTheme();
  const displayTheme = theme ?? "light";

  const handleTheme = () => {
    setTheme(displayTheme === "light" ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={handleTheme}
      className="relative grid size-7 place-items-center rounded-sm bg-layer-transparent text-primary hover:bg-layer-transparent-hover"
    >
      {displayTheme === "light" ? <Moon className="size-3.5 shrink-0" /> : <Sun className="size-3.5 shrink-0" />}
    </button>
  );
});
