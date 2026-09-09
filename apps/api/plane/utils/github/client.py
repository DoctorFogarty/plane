# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import jwt
import requests

from plane.license.utils.instance_value import get_configuration_value


_SEARCH_DISALLOWED = re.compile(r"[^A-Za-z0-9._/-]+")


def sanitize_github_search_query(raw: str) -> str:
    """Strip GitHub search qualifiers and characters that are not part of a repo name."""
    remaining = " ".join(token for token in str(raw or "").split() if ":" not in token)
    return _SEARCH_DISALLOWED.sub("", remaining).strip()[:256]


def _account_is_user(account_type: str | None) -> bool:
    return str(account_type or "").strip().lower() == "user"


class GitHubAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None, response: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


def normalize_github_app_name(raw: str) -> str:
    """Return GitHub App slug only (first token; never secrets pasted beside it)."""
    return str(raw or "").strip().split()[0] if raw else ""


def normalize_private_key(raw: str) -> str:
    """Normalize PEM private keys pasted via env/admin forms."""
    key = (raw or "").strip().strip('"').strip("'")
    if not key:
        return ""
    # Common paste forms: literal \n, escaped \\n, or spaces instead of newlines
    key = key.replace("\\n", "\n").replace("\r\n", "\n")
    if "BEGIN" in key and "\n" not in key and " " in key:
        # Single-line PEM with spaces — restore newlines around headers/body
        key = key.replace("-----BEGIN RSA PRIVATE KEY----- ", "-----BEGIN RSA PRIVATE KEY-----\n")
        key = key.replace(" -----END RSA PRIVATE KEY-----", "\n-----END RSA PRIVATE KEY-----")
        key = key.replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
        key = key.replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
    return key.strip()


def validate_private_key(raw: str) -> str:
    """
    Normalize and validate a GitHub App PEM private key.
    Returns the normalized key, or raises ValueError with a user-facing message.
    Empty string is allowed (clearing the field).
    """
    key = normalize_private_key(raw)
    if not key:
        return ""
    if "BEGIN" not in key or "PRIVATE KEY" not in key:
        raise ValueError(
            "GitHub App private key is invalid. Paste the full PEM from GitHub "
            "(including -----BEGIN ... PRIVATE KEY----- lines)."
        )
    try:
        jwt.encode(
            {"iat": int(time.time()) - 60, "exp": int(time.time()) + 60, "iss": "0"},
            key,
            algorithm="RS256",
        )
    except Exception as exc:
        raise ValueError(
            "GitHub App private key could not be parsed. Re-generate a private key on the "
            "GitHub App and paste the full PEM."
        ) from exc
    return key


def _get_github_app_config() -> Dict[str, str]:
    (
        app_id,
        private_key,
        client_id,
        client_secret,
        webhook_secret,
        app_name,
    ) = get_configuration_value(
        [
            {"key": "GITHUB_APP_ID", "default": os.environ.get("GITHUB_APP_ID", "")},
            {"key": "GITHUB_PRIVATE_KEY", "default": os.environ.get("GITHUB_PRIVATE_KEY", "")},
            {"key": "GITHUB_CLIENT_ID", "default": os.environ.get("GITHUB_CLIENT_ID", "")},
            {"key": "GITHUB_CLIENT_SECRET", "default": os.environ.get("GITHUB_CLIENT_SECRET", "")},
            {"key": "GITHUB_WEBHOOK_SECRET", "default": os.environ.get("GITHUB_WEBHOOK_SECRET", "")},
            {"key": "GITHUB_APP_NAME", "default": os.environ.get("GITHUB_APP_NAME", "")},
        ]
    )
    return {
        "app_id": str(app_id or "").strip(),
        "private_key": normalize_private_key(str(private_key or "")),
        "client_id": str(client_id or ""),
        "client_secret": str(client_secret or ""),
        "webhook_secret": str(webhook_secret or ""),
        "app_name": normalize_github_app_name(str(app_name or "")),
    }


class GitHubAppClient:
    """Minimal GitHub App client for installation tokens and REST calls."""

    API_BASE = "https://api.github.com"

    def __init__(self, installation_id: int | str | None = None):
        self.config = _get_github_app_config()
        self.installation_id = str(installation_id) if installation_id else None
        self._installation_token: Optional[str] = None
        self._token_expires_at: float = 0

    @property
    def is_configured(self) -> bool:
        key = self.config["private_key"]
        return bool(self.config["app_id"] and key and "BEGIN" in key and "PRIVATE KEY" in key)

    @property
    def webhook_secret(self) -> str:
        return self.config["webhook_secret"]

    def create_jwt(self) -> str:
        if not self.is_configured:
            raise GitHubAPIError("GitHub App is not configured")
        private_key = self.config["private_key"]
        if "BEGIN" not in private_key or "PRIVATE KEY" not in private_key:
            raise GitHubAPIError(
                "GitHub App private key is invalid. Paste the full PEM from GitHub "
                "(including -----BEGIN ... PRIVATE KEY----- lines) into God Mode → Authentication → GitHub."
            )
        now = int(time.time())
        payload = {
            "iat": now - 60,
            "exp": now + (9 * 60),
            "iss": self.config["app_id"],
        }
        try:
            return jwt.encode(payload, private_key, algorithm="RS256")
        except Exception as exc:
            raise GitHubAPIError(
                "GitHub App private key could not be parsed. Re-generate a private key on the "
                "GitHub App and paste the full PEM into God Mode."
            ) from exc

    def get_installation_token(self) -> str:
        if not self.installation_id:
            raise GitHubAPIError("GitHub installation id is required")
        if self._installation_token and time.time() < self._token_expires_at - 60:
            return self._installation_token

        response = requests.post(
            f"{self.API_BASE}/app/installations/{self.installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {self.create_jwt()}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30,
        )
        if response.status_code >= 400:
            raise GitHubAPIError(
                "Failed to create GitHub installation token",
                status_code=response.status_code,
                response=response.text,
            )
        data = response.json()
        self._installation_token = data["token"]
        # Tokens typically expire in 1 hour
        self._token_expires_at = time.time() + 3600
        return self._installation_token

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.get_installation_token()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def request(self, method: str, path: str, **kwargs) -> Any:
        url = path if path.startswith("http") else f"{self.API_BASE}{path}"
        response = requests.request(method, url, headers=self._headers(), timeout=30, **kwargs)
        if response.status_code == 204:
            return None
        if response.status_code >= 400:
            raise GitHubAPIError(
                f"GitHub API error: {response.status_code}",
                status_code=response.status_code,
                response=response.text,
            )
        if not response.content:
            return None
        return response.json()

    def get_installation(self, installation_id: int | str | None = None) -> Dict[str, Any]:
        install_id = installation_id or self.installation_id
        response = requests.get(
            f"{self.API_BASE}/app/installations/{install_id}",
            headers={
                "Authorization": f"Bearer {self.create_jwt()}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=30,
        )
        if response.status_code >= 400:
            raise GitHubAPIError(
                "Failed to fetch GitHub installation",
                status_code=response.status_code,
                response=response.text,
            )
        return response.json()

    def list_repositories(self, page: int = 1, per_page: int = 30) -> Dict[str, Any]:
        return self.request(
            "GET",
            f"/installation/repositories?page={page}&per_page={per_page}",
        )

    def list_account_repositories(
        self,
        login: str,
        account_type: str | None = None,
        per_page: int = 100,
    ) -> Dict[str, Any]:
        encoded = quote(login, safe="")
        if _account_is_user(account_type):
            path = f"/users/{encoded}/repos?sort=pushed&direction=desc&type=all&per_page={per_page}"
        else:
            path = f"/orgs/{encoded}/repos?sort=pushed&direction=desc&per_page={per_page}"
        data = self.request("GET", path)
        repositories = data if isinstance(data, list) else []
        return {"total_count": len(repositories), "repositories": repositories}

    def search_account_repositories(
        self,
        login: str,
        account_type: str | None,
        q: str,
        per_page: int = 30,
    ) -> Dict[str, Any]:
        sanitized = sanitize_github_search_query(q)
        if not sanitized:
            return {"total_count": 0, "repositories": []}
        qualifier = "user" if _account_is_user(account_type) else "org"
        safe_login = sanitize_github_search_query(login) or login
        query = f"{sanitized} {qualifier}:{safe_login}"
        data = self.request(
            "GET",
            f"/search/repositories?q={quote(query)}&sort=updated&per_page={per_page}",
        )
        if not isinstance(data, dict):
            return {"total_count": 0, "repositories": []}
        items = data.get("items") or []
        return {
            "total_count": data.get("total_count", len(items)),
            "repositories": items,
        }

    def get_repository(self, owner: str, repo: str) -> Dict[str, Any]:
        return self.request("GET", f"/repos/{owner}/{repo}")

    def get_repository_by_id(self, repository_id: int) -> Dict[str, Any]:
        return self.request("GET", f"/repositories/{repository_id}")

    def get_ref(self, owner: str, repo: str, ref: str) -> Dict[str, Any]:
        return self.request("GET", f"/repos/{owner}/{repo}/git/ref/heads/{ref}")

    def create_branch(self, owner: str, repo: str, branch: str, from_sha: str) -> Dict[str, Any]:
        return self.request(
            "POST",
            f"/repos/{owner}/{repo}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": from_sha},
        )

    def list_commits(self, owner: str, repo: str, sha: str, per_page: int = 10) -> List[Dict[str, Any]]:
        data = self.request(
            "GET",
            f"/repos/{owner}/{repo}/commits?sha={sha}&per_page={per_page}",
        )
        return data or []

    def get_pull_request(self, owner: str, repo: str, number: int) -> Dict[str, Any]:
        return self.request("GET", f"/repos/{owner}/{repo}/pulls/{number}")

    def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        head: str,
        base: str,
        body: str = "",
        draft: bool = False,
    ) -> Dict[str, Any]:
        return self.request(
            "POST",
            f"/repos/{owner}/{repo}/pulls",
            json={
                "title": title,
                "head": head,
                "base": base,
                "body": body,
                "draft": draft,
            },
        )

    def get_branch(self, owner: str, repo: str, branch: str) -> Dict[str, Any]:
        return self.request("GET", f"/repos/{owner}/{repo}/branches/{branch}")

    def list_branches(self, owner: str, repo: str, per_page: int = 100) -> List[Dict[str, Any]]:
        data = self.request(
            "GET",
            f"/repos/{owner}/{repo}/branches?per_page={per_page}",
        )
        return data or []

    def list_pull_requests(
        self,
        owner: str,
        repo: str,
        state: str = "open",
        per_page: int = 30,
    ) -> List[Dict[str, Any]]:
        data = self.request(
            "GET",
            f"/repos/{owner}/{repo}/pulls?state={state}&per_page={per_page}",
        )
        return data or []
