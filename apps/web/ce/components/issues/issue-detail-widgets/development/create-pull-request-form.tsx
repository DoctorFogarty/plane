/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowRight } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TIssueGithubRemoteBranch } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  issueId: string;
  branches: TIssueGithubRemoteBranch[];
  isBranchesLoading: boolean;
  branchesError: boolean;
  onRetryBranches: () => void;
  headBranch: string;
  baseBranch: string;
  title: string;
  body: string;
  draft: boolean;
  onHeadBranchChange: (value: string) => void;
  onBaseBranchChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onDraftChange: (value: boolean) => void;
};

function BranchSelect(props: {
  id: string;
  label: string;
  value: string;
  branches: TIssueGithubRemoteBranch[];
  onChange: (value: string) => void;
}) {
  const { id, label, value, branches, onChange } = props;
  const selected = branches.some((branch) => branch.name === value) ? value : "";

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-11 font-medium tracking-wide text-tertiary uppercase">
        {label}
      </label>
      <select
        id={id}
        className="text-sm focus:ring-accent-primary w-full truncate rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary focus:ring-1 focus:outline-none"
        value={selected}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      >
        <option value="">Select a branch</option>
        {branches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreatePullRequestForm(props: Props) {
  const {
    issueId,
    branches,
    isBranchesLoading,
    branchesError,
    onRetryBranches,
    headBranch,
    baseBranch,
    title,
    body,
    draft,
    onHeadBranchChange,
    onBaseBranchChange,
    onTitleChange,
    onBodyChange,
    onDraftChange,
  } = props;

  return (
    <div className="space-y-3">
      {isBranchesLoading ? (
        <div className="h-20 animate-pulse rounded-md bg-surface-2" />
      ) : branchesError ? (
        <div className="flex items-center justify-between gap-3 rounded border border-danger-subtle bg-danger-subtle px-3 py-2">
          <p className="text-12 text-danger-primary">Could not load branches from GitHub.</p>
          <Button variant="secondary" size="sm" onClick={onRetryBranches}>
            Retry
          </Button>
        </div>
      ) : (
        <div
          data-testid="compare-rail"
          className="flex flex-wrap items-end gap-2 rounded-md border border-subtle bg-surface-2 p-3"
        >
          <BranchSelect
            id={`connect-code-pr-head-${issueId}`}
            label="head"
            value={headBranch}
            branches={branches}
            onChange={onHeadBranchChange}
          />
          <ArrowRight className="mb-2.5 h-4 w-4 shrink-0 text-tertiary" aria-hidden />
          <BranchSelect
            id={`connect-code-pr-base-${issueId}`}
            label="base"
            value={baseBranch}
            branches={branches}
            onChange={onBaseBranchChange}
          />
          <button
            type="button"
            aria-pressed={draft}
            onClick={() => onDraftChange(!draft)}
            className={cn(
              "mb-0.5 shrink-0 rounded-full border px-2.5 py-1 text-12 transition-colors",
              draft
                ? "border-subtle bg-surface-1 font-medium text-primary"
                : "border-subtle text-secondary hover:text-primary"
            )}
          >
            Draft
          </button>
        </div>
      )}

      <div>
        <label htmlFor={`connect-code-pr-title-${issueId}`} className="text-sm mb-1 block text-secondary">
          Title
        </label>
        <Input
          id={`connect-code-pr-title-${issueId}`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="PROJ-12 Add login"
        />
      </div>

      <div>
        <label htmlFor={`connect-code-pr-body-${issueId}`} className="text-sm mb-1 block text-secondary">
          Description
        </label>
        <TextArea
          id={`connect-code-pr-body-${issueId}`}
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="PROJ-12"
          textAreaSize="sm"
          className="text-sm min-h-20 text-primary"
        />
      </div>
    </div>
  );
}
