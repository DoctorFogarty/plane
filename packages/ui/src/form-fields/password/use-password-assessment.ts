/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import type { TPasswordAssessment } from "@plane/constants";
import { clampPasswordScore, isPasswordAcceptable, mapZxcvbnFeedback } from "@plane/utils";
import type { ZXCVBNResult } from "zxcvbn";

type ZxcvbnFn = (password: string, userInputs?: string[]) => ZXCVBNResult;

let zxcvbnPromise: Promise<ZxcvbnFn> | null = null;
let zxcvbnFn: ZxcvbnFn | null = null;

const loadZxcvbn = (): Promise<ZxcvbnFn> => {
  if (zxcvbnFn) return Promise.resolve(zxcvbnFn);
  zxcvbnPromise ??= import("zxcvbn").then((mod) => {
    const loaded = (mod.default ?? mod) as ZxcvbnFn;
    zxcvbnFn = loaded;
    return loaded;
  });
  return zxcvbnPromise;
};

export type TPasswordAssessmentState = {
  assessment: TPasswordAssessment | null;
  ready: boolean;
};

export const usePasswordAssessment = (password: string): TPasswordAssessmentState => {
  const [ready, setReady] = useState(() => zxcvbnFn !== null);

  useEffect(() => {
    if (zxcvbnFn) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadZxcvbn().then(() => {
      if (!cancelled) setReady(true);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const assessment = useMemo((): TPasswordAssessment | null => {
    if (!password || !ready || !zxcvbnFn) return null;
    const result = zxcvbnFn(password);
    const score = clampPasswordScore(result.score);
    const { warningKey, suggestionKeys } = mapZxcvbnFeedback(result.feedback?.warning, result.feedback?.suggestions);
    return {
      score,
      acceptable: isPasswordAcceptable(score),
      warningKey,
      suggestionKeys,
    };
  }, [password, ready]);

  return { assessment, ready };
};
