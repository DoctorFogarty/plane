import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EIssueServiceType } from "@plane/types";
import type { IGithubRepository, IWorkspaceIntegration } from "@plane/types";
import { WorkItemAdditionalWidgetActionButtons } from "@/plane-web/components/issues/issue-detail-widgets/action-buttons";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";
import { IntegrationCard } from "@/components/project/integration-card";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  setToast: vi.fn(),
  syncGithubRepository: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({
    projectId: "project-id",
    workspaceSlug: "workspace",
  }),
}));

vi.mock("swr", () => ({
  default: () => ({
    data: [
      {
        id: "sync-id",
        repository: "repository-record-id",
        repo_detail: {
          id: "repository-record-id",
          name: "plane",
          owner: "makeplane",
          repository_id: 123,
          url: "https://github.com/makeplane/plane",
        },
      },
    ],
  }),
  mutate: mocks.mutate,
}));

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: {
    ERROR: "error",
    SUCCESS: "success",
  },
  setToast: mocks.setToast,
}));

vi.mock("@/services/project", () => ({
  ProjectService: class {
    syncGithubRepository = mocks.syncGithubRepository;
  },
}));

vi.mock("@/components/integration/github/select-repository", () => ({
  SelectRepository: ({
    label,
    onChange,
    value,
  }: {
    label: string;
    onChange: (repository: IGithubRepository) => void;
    value: number | null;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          id: 123,
          name: "plane",
          full_name: "makeplane/plane",
          html_url: "https://github.com/makeplane/plane",
          owner: { login: "makeplane" },
          url: "https://api.github.com/repos/makeplane/plane",
        })
      }
    >
      {label}:{value}
    </button>
  ),
}));

vi.mock("@/components/integration/slack/select-channel", () => ({
  SelectChannel: () => null,
}));

const integration = {
  id: "integration-id",
  integration_detail: {
    provider: "github",
    title: "GitHub",
  },
} as IWorkspaceIntegration;

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.setToast.mockReset();
  mocks.syncGithubRepository.mockReset();
  mocks.syncGithubRepository.mockResolvedValue({});
  connectCodeModalStore.close();
});

describe("GitHub integration controls", () => {
  it("renders one Connect Code button and opens the modal store", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkItemAdditionalWidgetActionButtons
        disabled={false}
        hideWidgets={[]}
        issueServiceType={EIssueServiceType.ISSUES}
        projectId="project-id"
        workItemId="issue-id"
        workspaceSlug="workspace"
      />
    );

    expect(container.querySelector("button button")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Connect code" }));

    expect(connectCodeModalStore.isOpen).toBe(true);
    expect(connectCodeModalStore.workItemId).toBe("issue-id");
  });

  it("opens the connect code store in create pull request mode", () => {
    connectCodeModalStore.open("issue-id", "create_pull_request");
    expect(connectCodeModalStore.isOpen).toBe(true);
    expect(connectCodeModalStore.mode).toBe("create_pull_request");
  });

  it("uses the numeric repository id as value and sync payload", async () => {
    const user = userEvent.setup();
    render(<IntegrationCard integration={integration} />);

    const repositoryButton = screen.getByRole("button", {
      name: "makeplane/plane:123",
    });
    await user.click(repositoryButton);

    await waitFor(() =>
      expect(mocks.syncGithubRepository).toHaveBeenCalledWith("workspace", "project-id", "integration-id", {
        repository_id: 123,
      })
    );
  });
});
