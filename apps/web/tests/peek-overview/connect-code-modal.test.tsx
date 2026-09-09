import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { observer } from "mobx-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TConnectCodeMode } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ConnectCodeModal } from "@/plane-web/components/issues/issue-detail-widgets/development/connect-code-modal";
import usePeekOverviewOutsideClickDetector from "@/hooks/use-peek-overview-outside-click";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";

const ISSUE_ID = "a7f48f6d-5567-4ec7-b76f-bbed20c600bf";

const REPOSITORY = {
  id: "repository-record-id",
  name: "plane",
  owner: "makeplane",
  repository_id: 123,
  url: "https://github.com/makeplane/plane",
  project: "project-id",
};

const githubMocks = vi.hoisted(() => ({
  listInstallationRepositories: vi.fn(),
  listRepositoryBranches: vi.fn(),
  listRepositoryPullRequests: vi.fn(),
  createBranch: vi.fn(),
  linkBranch: vi.fn(),
  linkPullRequest: vi.fn(),
  createPullRequest: vi.fn(),
}));

vi.mock("@/services/issue", () => ({
  IssueGithubService: class {
    listInstallationRepositories = githubMocks.listInstallationRepositories;
    listRepositoryBranches = githubMocks.listRepositoryBranches;
    listRepositoryPullRequests = githubMocks.listRepositoryPullRequests;
    createBranch = githubMocks.createBranch;
    linkBranch = githubMocks.linkBranch;
    linkPullRequest = githubMocks.linkPullRequest;
    createPullRequest = githubMocks.createPullRequest;
  },
}));

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: {
    ERROR: "error",
    SUCCESS: "success",
  },
  setToast: vi.fn(),
}));

const PeekHarness = observer(function PeekHarness() {
  const [isPeekOpen, setIsPeekOpen] = useState(true);
  const peekRef = useRef<HTMLDivElement>(null);

  usePeekOverviewOutsideClickDetector(
    peekRef,
    () => {
      const isConnectCodeOpenForPeek = connectCodeModalStore.isOpen && connectCodeModalStore.workItemId === ISSUE_ID;
      if (!isConnectCodeOpenForPeek) setIsPeekOpen(false);
    },
    ISSUE_ID
  );

  return (
    <>
      <button type="button">Outside peek</button>
      {isPeekOpen ? (
        <div ref={peekRef} data-testid="peek">
          <button type="button" onClick={() => connectCodeModalStore.open(ISSUE_ID)}>
            Open Connect Code
          </button>
          <ModalCore
            isOpen={connectCodeModalStore.isOpen}
            handleClose={() => connectCodeModalStore.close()}
            position={EModalPosition.CENTER}
            width={EModalWidth.LG}
          >
            <button type="button">Inside modal</button>
            <button type="button" onClick={() => connectCodeModalStore.close()}>
              Cancel
            </button>
          </ModalCore>
        </div>
      ) : (
        <p>Peek closed</p>
      )}
    </>
  );
});

beforeEach(() => {
  githubMocks.listInstallationRepositories.mockReset();
  githubMocks.listRepositoryBranches.mockReset();
  githubMocks.listRepositoryPullRequests.mockReset();
  githubMocks.createBranch.mockReset();
  githubMocks.linkBranch.mockReset();
  githubMocks.linkPullRequest.mockReset();
  githubMocks.createPullRequest.mockReset();
  const planeRepo = {
    id: 123,
    name: "plane",
    full_name: "makeplane/plane",
    html_url: "https://github.com/makeplane/plane",
    owner: { login: "makeplane" },
    default_branch: "main",
  };
  const websiteRepo = {
    id: 456,
    name: "website",
    full_name: "frc/website",
    html_url: "https://github.com/frc/website",
    owner: { login: "frc" },
    default_branch: "master",
  };
  githubMocks.listInstallationRepositories.mockImplementation((_ws, _pid, _iid, q = "") => {
    if (q === "website") {
      return Promise.resolve({ total_count: 1, repositories: [websiteRepo] });
    }
    return Promise.resolve({ total_count: 2, repositories: [planeRepo, websiteRepo] });
  });
  githubMocks.listRepositoryBranches.mockResolvedValue({
    branches: [
      { name: "main", protected: true, commit_sha: "abc" },
      { name: "develop", protected: false, commit_sha: "def" },
      { name: "feature/login", protected: false, commit_sha: "ghi" },
    ],
  });
});

afterEach(() => {
  connectCodeModalStore.close();
});

describe("Connect Code create branch base selector", () => {
  it("loads repository branches and renders a Base branch select", async () => {
    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={ISSUE_ID}
        repositories={[
          {
            id: "repository-record-id",
            name: "plane",
            owner: "makeplane",
            repository_id: 123,
            url: "https://github.com/makeplane/plane",
            project: "project-id",
          },
        ]}
        isRepositoriesLoading={false}
        defaultBranchName="CODEO-1-feature"
      />
    );

    await waitFor(() => {
      expect(githubMocks.listInstallationRepositories).toHaveBeenCalled();
      expect(githubMocks.listRepositoryBranches).toHaveBeenCalledWith("workspace", "project-id", ISSUE_ID, "123");
    });

    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);

    const baseBranchSelect = await screen.findByLabelText("Base branch");
    expect(baseBranchSelect.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "main" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "develop" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("main")).toBeNull();
    expect((baseBranchSelect as HTMLSelectElement).value).toBe("main");
  });
});

describe("Connect Code installation repositories", () => {
  it("creates a branch without a project-linked repository", async () => {
    const user = userEvent.setup();
    githubMocks.createBranch.mockResolvedValue({
      id: "branch-1",
      name: "PROJ-12-stop-shooting",
      head_sha: "abc",
      url: "https://github.com/frc/website/tree/PROJ-12-stop-shooting",
      status: "active",
      repository: "repo-1",
      issue: ISSUE_ID,
      checkout_command: "git fetch origin PROJ-12-stop-shooting && git checkout PROJ-12-stop-shooting",
    });

    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={ISSUE_ID}
        repositories={[]}
        isRepositoriesLoading={false}
        defaultBranchName="PROJ-12-stop-shooting"
      />
    );

    expect(await screen.findByRole("button", { name: /makeplane/i })).toBeTruthy();
    const baseBranchSelect = await screen.findByLabelText("Base branch");
    await waitFor(() => {
      expect((baseBranchSelect as HTMLSelectElement).value).toBe("main");
    });

    const submitButtons = screen.getAllByRole("button", { name: "Create branch" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() =>
      expect(githubMocks.createBranch).toHaveBeenCalledWith("workspace", "project-id", ISSUE_ID, {
        repository_id: "123",
        base_branch: "main",
        branch_name: "PROJ-12-stop-shooting",
      })
    );
  });

  it("searches GitHub for the typed query and does not paginate", async () => {
    const user = userEvent.setup();
    const issueId = "e1b82d0b-9901-4cf1-fb03-ff2b64fa44f4";
    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={issueId}
        repositories={[REPOSITORY]}
        isRepositoriesLoading={false}
        defaultBranchName="CODEO-1-feature"
      />
    );

    expect(await screen.findByRole("button", { name: /makeplane/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /makeplane/i }));
    const search = await screen.findByPlaceholderText("Search repositories");
    await user.type(search, "website");

    await waitFor(() =>
      expect(githubMocks.listInstallationRepositories).toHaveBeenCalledWith(
        "workspace",
        "project-id",
        issueId,
        "website"
      )
    );
    expect(await screen.findByText("website")).toBeTruthy();
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("reloads base branches after selecting a non-default repository", async () => {
    const user = userEvent.setup();
    const issueId = "b8e59a7e-6678-4fd8-c870-ccfe31d711c1";
    githubMocks.listRepositoryBranches.mockImplementation((_ws, _pid, _iid, repositoryId) => {
      if (repositoryId === "456") {
        return Promise.resolve({
          branches: [
            { name: "master", protected: true, commit_sha: "aaa" },
            { name: "staging", protected: false, commit_sha: "bbb" },
          ],
        });
      }
      return Promise.resolve({
        branches: [
          { name: "main", protected: true, commit_sha: "abc" },
          { name: "develop", protected: false, commit_sha: "def" },
        ],
      });
    });

    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={issueId}
        repositories={[REPOSITORY]}
        isRepositoriesLoading={false}
        defaultBranchName="CODEO-1-feature"
      />
    );

    const baseBranchSelect = await screen.findByLabelText("Base branch");
    await waitFor(() => {
      expect(githubMocks.listRepositoryBranches).toHaveBeenCalledWith("workspace", "project-id", issueId, "123");
      expect((baseBranchSelect as HTMLSelectElement).value).toBe("main");
    });

    await user.click(screen.getByRole("button", { name: /makeplane/i }));
    await user.click(await screen.findByText("website"));

    await waitFor(() => {
      expect(githubMocks.listRepositoryBranches).toHaveBeenCalledWith("workspace", "project-id", issueId, "456");
      const updatedSelect = screen.getByLabelText("Base branch") as HTMLSelectElement;
      expect(screen.getByRole("option", { name: "master" })).toBeTruthy();
      expect(updatedSelect.value).toBe("master");
    });
  });

  it("shows disconnected state even when a project default exists", async () => {
    const issueId = "c9f60b8f-7789-4ae9-d981-dd0f42e822d2";
    githubMocks.listInstallationRepositories.mockRejectedValue({
      error: "GitHub App is not installed for this workspace",
    });

    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={issueId}
        repositories={[REPOSITORY]}
        isRepositoriesLoading={false}
        githubConnected={false}
        defaultBranchName="CODEO-1-feature"
      />
    );

    expect(await screen.findByText("GitHub is not connected to this workspace.")).toBeTruthy();
    expect(screen.queryByLabelText("Base branch")).toBeNull();
  });

  it("keeps the default repo and offers retry when the installation list fails", async () => {
    const issueId = "d0a71c9a-8890-4bf0-ea92-ee1a53f933e3";
    githubMocks.listInstallationRepositories.mockRejectedValue({ error: "rate limited" });

    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_branch"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={issueId}
        repositories={[REPOSITORY]}
        isRepositoriesLoading={false}
        defaultBranchName="CODEO-1-feature"
      />
    );

    expect(await screen.findByText("Could not load the full repository list.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /makeplane/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("keeps the selected repository when switching modes", async () => {
    const user = userEvent.setup();
    function ModeSwitchHarness() {
      const [mode, setMode] = useState<TConnectCodeMode>("create_branch");
      return (
        <ConnectCodeModal
          isOpen
          onClose={() => undefined}
          mode={mode}
          onModeChange={setMode}
          workspaceSlug="workspace"
          projectId="project-id"
          issueId={ISSUE_ID}
          repositories={[REPOSITORY]}
          isRepositoriesLoading={false}
          defaultBranchName="CODEO-1-feature"
        />
      );
    }

    githubMocks.listRepositoryPullRequests.mockResolvedValue({
      pull_requests: [
        { number: 9, title: "Fix", state: "open", draft: false, html_url: "", head_branch: "x", base_branch: "main" },
      ],
    });

    render(<ModeSwitchHarness />);

    await user.click(await screen.findByRole("button", { name: /makeplane/i }));
    await user.click(await screen.findByText("website"));
    await user.click(screen.getByRole("button", { name: "Link pull request" }));

    await waitFor(() => {
      expect(githubMocks.listRepositoryPullRequests).toHaveBeenCalledWith("workspace", "project-id", ISSUE_ID, "456");
    });
    expect(screen.getByRole("button", { name: /frc/i })).toBeTruthy();
  });
});

describe("Connect Code create pull request", () => {
  it("shows the compare rail and creates a pull request", async () => {
    const user = userEvent.setup();
    githubMocks.createPullRequest.mockResolvedValue({
      id: "pr-1",
      number: 42,
      title: "PROJ-12 Add login",
      state: "open",
      draft: false,
      merged: false,
      html_url: "https://github.com/makeplane/plane/pull/42",
      head_branch: "feature/login",
      base_branch: "main",
      repository: "repository-record-id",
      issue: ISSUE_ID,
    });

    render(
      <ConnectCodeModal
        isOpen
        onClose={() => undefined}
        mode="create_pull_request"
        onModeChange={() => undefined}
        workspaceSlug="workspace"
        projectId="project-id"
        issueId={ISSUE_ID}
        repositories={[REPOSITORY]}
        isRepositoriesLoading={false}
        defaultBranchName="PROJ-12-add-login"
        linkedBranches={[
          {
            id: "branch-1",
            name: "feature/login",
            head_sha: "abc",
            url: "https://github.com/makeplane/plane/tree/feature/login",
            status: "active",
            repository: "repository-record-id",
            issue: ISSUE_ID,
          },
        ]}
        defaultPrTitle="PROJ-12 Add login"
        defaultPrBody={"PROJ-12\n\nhttp://localhost/workspace/projects/project-id/issues/" + ISSUE_ID}
      />
    );

    expect(screen.getByRole("button", { name: "Create pull request", pressed: true })).toBeTruthy();
    expect(await screen.findByTestId("compare-rail")).toBeTruthy();

    const headSelect = await screen.findByLabelText("head");
    await waitFor(() => {
      expect((headSelect as HTMLSelectElement).value).toBe("feature/login");
    });

    const submitButtons = screen.getAllByRole("button", { name: "Create pull request" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() =>
      expect(githubMocks.createPullRequest).toHaveBeenCalledWith("workspace", "project-id", ISSUE_ID, {
        repository_id: "123",
        head_branch: "feature/login",
        base_branch: "main",
        title: "PROJ-12 Add login",
        body: expect.stringContaining("PROJ-12"),
        draft: false,
      })
    );

    expect(await screen.findByText("#42 PROJ-12 Add login")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open pull request on GitHub" })).toBeTruthy();
  });
});

describe("Connect Code in quick peek", () => {
  it("keeps the peek and portaled modal open after an inside click", async () => {
    const user = userEvent.setup();
    render(<PeekHarness />);

    await user.click(screen.getByRole("button", { name: "Open Connect Code" }));

    const peek = screen.getByTestId("peek");
    const dialog = await screen.findByRole("dialog");
    expect(peek.contains(dialog)).toBe(false);

    await user.click(screen.getByRole("button", { name: "Inside modal" }));

    expect(screen.getByTestId("peek")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes only the top modal on an explicit close or Escape", async () => {
    const user = userEvent.setup();
    render(<PeekHarness />);

    await user.click(screen.getByRole("button", { name: "Open Connect Code" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("peek")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Open Connect Code" }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("peek")).toBeTruthy();
  });

  it("allows a later outside click to close the peek", async () => {
    const user = userEvent.setup();
    render(<PeekHarness />);

    await user.click(screen.getByRole("button", { name: "Outside peek" }));

    expect(screen.getByText("Peek closed")).toBeTruthy();
  });
});
