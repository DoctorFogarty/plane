import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { observer } from "mobx-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ConnectCodeModal } from "@/plane-web/components/issues/issue-detail-widgets/development/connect-code-modal";
import usePeekOverviewOutsideClickDetector from "@/hooks/use-peek-overview-outside-click";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";

const ISSUE_ID = "a7f48f6d-5567-4ec7-b76f-bbed20c600bf";

const githubMocks = vi.hoisted(() => ({
  listRepositoryBranches: vi.fn(),
  listRepositoryPullRequests: vi.fn(),
  createBranch: vi.fn(),
  linkBranch: vi.fn(),
  linkPullRequest: vi.fn(),
  createPullRequest: vi.fn(),
}));

vi.mock("@/services/issue", () => ({
  IssueGithubService: class {
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
  githubMocks.listRepositoryBranches.mockReset();
  githubMocks.listRepositoryPullRequests.mockReset();
  githubMocks.createBranch.mockReset();
  githubMocks.linkBranch.mockReset();
  githubMocks.linkPullRequest.mockReset();
  githubMocks.createPullRequest.mockReset();
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
      expect(githubMocks.listRepositoryBranches).toHaveBeenCalledWith(
        "workspace",
        "project-id",
        ISSUE_ID,
        "repository-record-id"
      );
    });

    const baseBranchSelect = await screen.findByLabelText("Base branch");
    expect(baseBranchSelect.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "main" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "develop" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("main")).toBeNull();
    expect((baseBranchSelect as HTMLSelectElement).value).toBe("main");
  });
});

const REPOSITORY = {
  id: "repository-record-id",
  name: "plane",
  owner: "makeplane",
  repository_id: 123,
  url: "https://github.com/makeplane/plane",
  project: "project-id",
};

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
        repository_id: "repository-record-id",
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
