/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const LOADER_TITLE_WIDTH_CLASSES = ["w-32", "w-52", "w-72"] as const;
export const LOADER_GANTT_OFFSETS = ["115px", "208px", "260px"] as const;

export const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const getRandomLength = (lengthArray: string[]) => {
  const randomIndex = Math.floor(Math.random() * lengthArray.length);
  return `${lengthArray[randomIndex]}`;
};

export function getStableLoaderClass(index: number, classes: readonly string[]) {
  return classes[index % classes.length] ?? classes[0];
}

export function shouldRenderLoaderChip(index: number) {
  return index % 2 === 0;
}
