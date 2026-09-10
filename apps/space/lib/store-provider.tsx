/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext } from "react";
import type { IInstance, IUser } from "@plane/types";
// plane web store
import { RootStore } from "@/store/root.store";

let rootStore = new RootStore();

export const StoreContext = createContext(rootStore);

function initializeStore() {
  const singletonRootStore = rootStore ?? new RootStore();
  // For SSG and SSR always create a new store
  if (typeof window === "undefined") return singletonRootStore;
  // Create the store once in the client
  if (!rootStore) rootStore = singletonRootStore;
  return singletonRootStore;
}

export type StoreProviderProps = {
  children: React.ReactNode;
  initialState?: { instance?: IInstance; user?: IUser };
};

export function StoreProvider({ children, initialState = undefined }: StoreProviderProps) {
  const store = initializeStore();
  // If your page has Next.js data fetching methods that use a Mobx store, it will
  // get hydrated here, check `pages/ssg.js` and `pages/ssr.js` for more details
  if (initialState) {
    store.hydrate(initialState);
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
