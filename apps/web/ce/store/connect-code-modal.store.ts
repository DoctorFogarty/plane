/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";
import type { TConnectCodeMode } from "@plane/types";

class ConnectCodeModalStore {
  isOpen = false;
  mode: TConnectCodeMode = "create_branch";
  workItemId: string | null = null;

  constructor() {
    makeObservable(this, {
      isOpen: observable.ref,
      mode: observable.ref,
      workItemId: observable.ref,
      open: action,
      close: action,
      setMode: action,
    });
  }

  open = (workItemId: string, mode: TConnectCodeMode = "create_branch") => {
    this.workItemId = workItemId;
    this.mode = mode;
    this.isOpen = true;
  };

  close = () => {
    this.isOpen = false;
    this.workItemId = null;
  };

  setMode = (mode: TConnectCodeMode) => {
    this.mode = mode;
  };
}

export const connectCodeModalStore = new ConnectCodeModalStore();
