/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CustomSearchSelect } from "@plane/ui";

export type TConnectCodePickerRepository = {
  id: number;
  owner: string;
  name: string;
  default_branch?: string;
};

type Props = {
  issueId: string;
  repositories: TConnectCodePickerRepository[];
  value: number | null;
  defaultRepositoryId?: number;
  onChange: (repositoryId: number) => void;
  onSearchChange: (query: string) => void;
  isSearching?: boolean;
};

function RepositoryName(props: { owner: string; name: string; isDefault?: boolean }) {
  const { owner, name, isDefault = false } = props;
  return (
    <span className="flex min-w-0 items-center gap-1.5 [content-visibility:auto]">
      <span className="truncate text-secondary">{owner}</span>
      <span className="text-placeholder">/</span>
      <span className="truncate font-medium text-primary">{name}</span>
      {isDefault ? (
        <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-10 font-medium text-secondary">Default</span>
      ) : null}
    </span>
  );
}

export function ConnectCodeRepositoryPicker(props: Props) {
  const { issueId, repositories, value, defaultRepositoryId, onChange, onSearchChange, isSearching = false } = props;

  const selected = repositories.find((repository) => repository.id === value) ?? null;
  const options = repositories.map((repository) => ({
    value: repository.id,
    query: `${repository.owner}/${repository.name}`,
    content: (
      <RepositoryName
        owner={repository.owner}
        name={repository.name}
        isDefault={repository.id === defaultRepositoryId}
      />
    ),
  }));

  return (
    <div>
      <label htmlFor={`connect-code-repository-${issueId}`} className="text-sm mb-1 block text-secondary">
        Repository
      </label>
      <CustomSearchSelect
        id={`connect-code-repository-${issueId}`}
        value={value}
        options={options}
        onChange={(repositoryId: number) => onChange(repositoryId)}
        onSearchChange={onSearchChange}
        input
        className="w-full"
        buttonClassName="w-full border-subtle bg-surface-1 text-sm"
        optionsClassName="w-80"
        maxHeight="lg"
        searchPlaceholder="Search repositories"
        noResultsMessage="No matching repositories"
        label={
          selected ? (
            <RepositoryName
              owner={selected.owner}
              name={selected.name}
              isDefault={selected.id === defaultRepositoryId}
            />
          ) : (
            <span className="text-placeholder">Search repositories</span>
          )
        }
        footerOption={isSearching ? <p className="px-2 py-1 text-center text-10 text-secondary">Searching…</p> : null}
      />
    </div>
  );
}
