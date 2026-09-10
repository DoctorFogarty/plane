/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

interface IRadialProgressBar {
  progress: number;
}

const CIRCUMFERENCE = 2 * Math.PI * 40;

export function RadialProgressBar(props: IRadialProgressBar) {
  const { progress } = props;
  const progressOffset = ((100 - progress) / 100) * CIRCUMFERENCE;

  return (
    <div className="relative h-4 w-4">
      <svg className="absolute top-0 left-0" viewBox="0 0 100 100">
        <circle
          className={"stroke-current opacity-10"}
          cx="50"
          cy="50"
          r="40"
          strokeWidth="12"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        />
        <circle
          className={`stroke-current`}
          cx="50"
          cy="50"
          r="40"
          strokeWidth="12"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 50 50)"
        />
      </svg>
    </div>
  );
}
