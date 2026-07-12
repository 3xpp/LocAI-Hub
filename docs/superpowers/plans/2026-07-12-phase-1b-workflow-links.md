# Phase 1B Workflow Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a tested local Workflow Links registry with safe HTTP(S) URL storage, CRUD, search, canonical tags, pagination, explicit navigation/copy, dirty-state protection, and confirmed permanent deletion.

**Architecture:** FastAPI workflow-link routes depend on a focused SQLAlchemy repository and pure validation service, backed by additive migration 0002 and a dedicated workflow_links table. The React application adds a third top-level view with its own cancellation-safe split-registry controller while sharing only domain-neutral tag and dialog primitives. Stored destinations are validated in Python and TypeScript but are never dereferenced, previewed, or contacted automatically.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, Alembic, SQLite, pytest, Ruff, mypy, React 19, TypeScript, Vite, Vitest, Testing Library, jsdom, pnpm, Docker Compose, Firefox WebDriver.

---

## File Responsibility Map

- **web/src/test/fixtures/workflowLinkUrlCases.json**: one committed accepted/rejected URL corpus consumed by Python and TypeScript tests.
- **backend/src/local_ai_hub/services/validation.py**: shared field/message validation error type.
- **backend/src/local_ai_hub/services/tags.py**: domain-neutral canonical tag codec.
- **backend/src/local_ai_hub/services/workflow_links.py**: workflow-link title, URL, description, search, and preview rules.
- **backend/src/local_ai_hub/services/prompts.py**: prompt-only rules plus compatibility re-exports from the shared tag module.
- **backend/src/local_ai_hub/db/models.py**: additive WorkflowLink SQLAlchemy mapping.
- **backend/src/local_ai_hub/db/sqlite_functions.py**: Unicode case-folding and domain-neutral canonical-tag SQLite functions.
- **backend/src/local_ai_hub/db/repositories/workflow_links.py**: workflow-link CRUD, search, exact tags, ordering, and pagination.
- **backend/migrations/versions/0002_create_workflow_links.py**: reversible workflow_links table creation.
- **backend/src/local_ai_hub/api/workflow_link_schemas.py**: normalized write, summary, detail, and page contracts.
- **backend/src/local_ai_hub/api/routes/workflow_links.py**: HTTP orchestration, fixed 404/500 responses, and rollback boundary.
- **backend/src/local_ai_hub/api/access_logs.py**: idempotent Uvicorn query-string redaction filter.
- **backend/src/local_ai_hub/api/main.py**: workflow-link router registration.
- **backend/tests/unit/test_workflow_link_service.py**: pure validation, shared URL corpus, tags, and preview behavior.
- **backend/tests/unit/test_workflow_link_repository.py**: isolated CRUD/search/filter/order behavior.
- **backend/tests/e2e/test_workflow_links_api.py**: HTTP contracts with isolated SQLite and redaction assertions.
- **backend/tests/e2e/test_migrations.py**: 0001→0002 prompt preservation, downgrade, exact columns/defaults, and drift.
- **web/src/api/workflowLinkUrl.ts**: fail-closed browser URL validation and safe origin derivation.
- **web/src/api/workflowLinks.ts**: workflow-link types, strict runtime payload parsers, and CRUD/search requests.
- **web/src/api/client.ts**: safe status-bearing HTTP errors without response-body parsing.
- **web/src/features/shared/registryState.ts**: shared Unicode text length and canonical tag helpers.
- **web/src/features/shared/TagInput.tsx**: domain-neutral controlled tag chips and pending-input feedback.
- **web/src/features/shared/ConfirmDialog.tsx**: domain-neutral native destructive confirmation.
- **web/src/features/prompts/**: updated imports and regression coverage for shared primitives.
- **web/src/features/workflows/workflowState.ts**: workflow-link drafts, dirty comparison, URL validation, and page merge.
- **web/src/features/workflows/useWorkflowRegistry.ts**: independent list/detail/mutation/copy ownership and dirty guards.
- **web/src/features/workflows/WorkflowRegistry.tsx**: directory/workbench composition and mobile pane.
- **web/src/features/workflows/WorkflowList.tsx**: search, exact tags, summaries, origin display, and pagination.
- **web/src/features/workflows/WorkflowEditor.tsx**: title/URL/description/tags form, saved-link actions, and deletion.
- **web/src/App.tsx**: centralized guarded navigation among Overview, Prompts, and Workflows.
- **web/src/styles.css**: route-map visual treatment, three-view masthead, editor, and responsive behavior.
- **README.md**, **AGENTS.md**, **docs/**, and **history/BUILD_LOG.md**: current product, security, decisions, observed failures, and chronological evidence.

### Task 1: Shared tags and workflow-link domain contracts

**Files:**
- Create: web/src/test/fixtures/workflowLinkUrlCases.json
- Create: backend/src/local_ai_hub/services/validation.py
- Create: backend/src/local_ai_hub/services/tags.py
- Create: backend/src/local_ai_hub/services/workflow_links.py
- Create: backend/tests/unit/test_workflow_link_service.py
- Modify: backend/src/local_ai_hub/services/prompts.py
- Modify: backend/src/local_ai_hub/db/sqlite_functions.py
- Modify: backend/src/local_ai_hub/db/repositories/prompts.py
- Modify: backend/tests/unit/test_prompt_service.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Add the shared URL decision corpus**

Create the JSON fixture with named cases. Keep values inert; tests parse strings but never request
them.

~~~json
{
  "accepted": [
    {"name": "localhost", "value": "http://localhost:5678/workflow/abc"},
    {"name": "single-label-host", "value": "http://n8n:5678/workflow/abc"},
    {"name": "dns-query-fragment", "value": "https://automation.home.arpa/path?view=full#node-2"},
    {"name": "canonical-ipv4", "value": "http://192.168.1.20:8080/dashboard"},
    {"name": "bracketed-ipv6", "value": "http://[::1]:5678/workflow/abc"},
    {"name": "punycode", "value": "https://xn--bcher-kva.example/docs"},
    {"name": "uppercase-scheme-host", "value": "HTTPS://EXAMPLE.COM/CaseSensitivePath"},
    {"name": "outer-whitespace-trimmed", "value": "  http://localhost:3000/path  "}
  ],
  "rejected": [
    {"name": "relative", "value": "/workflow/abc"},
    {"name": "protocol-relative", "value": "//localhost/workflow/abc"},
    {"name": "missing-literal-delimiter", "value": "http:localhost/workflow/abc"},
    {"name": "javascript", "value": "javascript:alert(1)"},
    {"name": "file", "value": "file:///tmp/workflow.json"},
    {"name": "userinfo", "value": "http://user:password@localhost/workflow"},
    {"name": "empty-userinfo", "value": "http://@localhost/workflow"},
    {"name": "raw-space", "value": "http://local host/workflow"},
    {"name": "raw-tab", "value": "http://localhost/\tworkflow"},
    {"name": "backslash", "value": "http://localhost\\workflow"},
    {"name": "unicode-host", "value": "https://bücher.example/docs"},
    {"name": "trailing-dot", "value": "http://localhost./workflow"},
    {"name": "percent-authority", "value": "http://local%68ost/workflow"},
    {"name": "numeric-shorthand", "value": "http://127.1/workflow"},
    {"name": "leading-zero-ipv4", "value": "http://127.000.000.001/workflow"},
    {"name": "port-zero", "value": "http://localhost:0/workflow"},
    {"name": "port-too-large", "value": "http://localhost:65536/workflow"},
    {"name": "empty-port", "value": "http://localhost:/workflow"},
    {"name": "unbracketed-ipv6", "value": "http://::1/workflow"},
    {"name": "ipv6-zone", "value": "http://[fe80::1%25eth0]/workflow"}
  ]
}
~~~

- [ ] **Step 2: Write failing workflow-link service and shared-tag tests**

The tests load the fixture through a repository-root path and establish the exact public behavior:

~~~python
import json
from pathlib import Path

import pytest

from local_ai_hub.services.tags import normalize_tags
from local_ai_hub.services.workflow_links import (
    WorkflowLinkInputError,
    description_preview,
    normalize_description,
    normalize_title,
    normalize_url,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "web"
    / "src"
    / "test"
    / "fixtures"
    / "workflowLinkUrlCases.json"
)
URL_CASES = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", URL_CASES["accepted"], ids=lambda case: case["name"])
def test_accepted_url_corpus(case: dict[str, str]) -> None:
    assert normalize_url(case["value"]) == case["value"].strip()


@pytest.mark.parametrize("case", URL_CASES["rejected"], ids=lambda case: case["name"])
def test_rejected_url_corpus(case: dict[str, str]) -> None:
    with pytest.raises(WorkflowLinkInputError, match="URL"):
        normalize_url(case["value"])


def test_title_description_preview_and_tags() -> None:
    assert normalize_title("  Nightly summary  ") == "Nightly summary"
    assert normalize_description("  first\nsecond  ") == "first\nsecond"
    assert normalize_description(" \n ") == ""
    assert description_preview("") == ""
    assert description_preview("x" * 161) == ("x" * 160) + "…"
    assert normalize_tags([" N8N ", "n8n", "Local Flow"]) == ("n8n", "local flow")
~~~

Add boundary tests for title 0/200/201, URL 2048/2049, description 5000/5001, query 200/201,
DNS label length 63/64, DNS host total length 253/254, IPv4 canonical spelling, IPv6 bracket rules,
ports 1/65535, control/format characters, and malformed authority syntax.

- [ ] **Step 3: Run the new unit test and confirm missing modules**

Run:

~~~bash
(cd backend && uv run pytest tests/unit/test_workflow_link_service.py -v)
~~~

Expected: collection fails because local_ai_hub.services.tags and
local_ai_hub.services.workflow_links do not exist.

- [ ] **Step 4: Extract the domain-neutral tag codec without changing Prompt behavior**

Define InputValidationError with field and message attributes in services/validation.py. Move
normalize_tag, normalize_tags, encode_tags, and decode_tags into services/tags.py and make them raise
that shared error. In prompts.py, re-export the class under the existing PromptInputError name and
re-export the tag functions so current imports remain valid:

~~~python
from local_ai_hub.services.tags import (
    decode_tags,
    encode_tags,
    normalize_tag,
    normalize_tags,
)
from local_ai_hub.services.validation import InputValidationError as PromptInputError
~~~

Rename the registered SQLite helper to local_ai_hub_tags through
CANONICAL_TAGS_FUNCTION, retain CANONICAL_PROMPT_TAGS_FUNCTION as an alias for compatibility, and
update the prompt repository to use the generic name. Add prompt regressions proving canonical
tags, Unicode case folding, legacy malformed fragments, exact filtering, and public imports are
unchanged.

- [ ] **Step 5: Implement the pure workflow-link service**

Define these exact constants and public functions:

~~~python
MAX_TITLE_LENGTH = 200
MAX_URL_LENGTH = 2_048
MAX_DESCRIPTION_LENGTH = 5_000
MAX_QUERY_LENGTH = 200
MAX_PREVIEW_LENGTH = 160

WorkflowLinkInputError = InputValidationError


def normalize_title(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise WorkflowLinkInputError("title", "must not be empty")
    if len(normalized) > MAX_TITLE_LENGTH:
        raise WorkflowLinkInputError("title", "must be at most 200 characters")
    return normalized


def normalize_description(value: str) -> str:
    normalized = value.strip()
    if len(normalized) > MAX_DESCRIPTION_LENGTH:
        raise WorkflowLinkInputError("description", "must be at most 5000 characters")
    return normalized


def normalize_search(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > MAX_QUERY_LENGTH:
        raise WorkflowLinkInputError("query", "must be at most 200 characters")
    return normalized


def description_preview(value: str) -> str:
    collapsed = " ".join(value.split())
    if len(collapsed) <= MAX_PREVIEW_LENGTH:
        return collapsed
    return collapsed[:MAX_PREVIEW_LENGTH] + "…"
~~~

Implement normalize_url from the approved profile: trim outer whitespace; reject empty/oversized
values, internal whitespace, Unicode category C, and backslash; require a case-insensitive literal
http:// or https:// prefix; isolate raw authority; reject @ and % in authority; use urlsplit; validate
ASCII DNS labels and total length, canonical numeric IPv4 through ipaddress.IPv4Address, bracketed
IPv6 through ipaddress.IPv6Address without a zone, and decimal port 1–65535; preserve and return the
trimmed input. Raise only fixed field-oriented messages.

- [ ] **Step 6: Run domain and Prompt regression gates**

Run:

~~~bash
(cd backend && uv run pytest tests/unit/test_workflow_link_service.py tests/unit/test_prompt_service.py tests/unit/test_prompt_repository.py -v)
(cd backend && uv run ruff check src tests)
(cd backend && uv run ruff format --check src tests)
(cd backend && uv run mypy src)
~~~

Expected: all focused tests and static checks pass; no URL fixture causes network activity.

- [ ] **Step 7: Record and commit Task 1**

Append the exact test counts, tag-refactor compatibility evidence, URL corpus decisions, and absence
of remote requests to history/BUILD_LOG.md, then run:

~~~bash
git add backend/src/local_ai_hub/services backend/src/local_ai_hub/db backend/tests/unit web/src/test/fixtures history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add workflow link domain contracts"
~~~

### Task 2: WorkflowLink schema, migration, and repository

**Files:**
- Create: backend/migrations/versions/0002_create_workflow_links.py
- Create: backend/src/local_ai_hub/db/repositories/workflow_links.py
- Create: backend/tests/unit/test_workflow_link_repository.py
- Modify: backend/src/local_ai_hub/db/models.py
- Modify: backend/tests/e2e/test_migrations.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Replace the single-revision migration test with a failing preservation round trip**

Build an existing revision-0001 database, insert one prompt with bound SQL, then upgrade to head.
Assert the head and exact table contract:

~~~python
command.upgrade(alembic_config, "0001_create_prompts")
with engine.begin() as connection:
    connection.execute(
        sa.text(
            "INSERT INTO prompts (title, content, tags) "
            "VALUES (:title, :content, :tags)"
        ),
        {"title": "Preserved", "content": "Keep me", "tags": "migration"},
    )

command.upgrade(alembic_config, "head")
inspector = inspect(engine)
assert inspector.has_table("prompts")
assert inspector.has_table("workflow_links")
assert set(column["name"] for column in inspector.get_columns("workflow_links")) == {
    "id",
    "title",
    "url",
    "description",
    "tags",
    "created_at",
    "updated_at",
}
with engine.connect() as connection:
    context = MigrationContext.configure(connection)
    assert context.get_current_revision() == "0002_create_workflow_links"
    assert connection.scalar(sa.text("SELECT title FROM prompts")) == "Preserved"
~~~

Also assert description/tags are NOT NULL with SQL defaults '', timestamp defaults contain
CURRENT_TIMESTAMP, downgrade to 0001 removes only workflow_links and preserves the prompt row,
alembic check passes at head, and downgrade to base removes prompts.

- [ ] **Step 2: Run the migration test and confirm 0002 is absent**

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_migrations.py -v)
~~~

Expected: the test fails because head remains 0001 and workflow_links does not exist.

- [ ] **Step 3: Add the WorkflowLink mapping and reversible migration**

Add this mapping without modifying Prompt columns:

~~~python
class WorkflowLink(Base):
    __tablename__ = "workflow_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(2048))
    description: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default=text("''"),
    )
    tags: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default=text("''"),
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
~~~

Migration 0002_create_workflow_links has down_revision 0001_create_prompts, creates only the seven
specified columns and primary key, and drops only workflow_links on downgrade.

- [ ] **Step 4: Write failing repository tests**

Use an in-memory StaticPool SQLite engine with registered functions. Cover create/get/update/delete,
duplicate titles and URLs, UTC timestamps, updated ordering, search across all four fields, Unicode
case folding, literal percent/underscore/backslash, exact/partial tags, combined filters, malformed
stored tag fragments, and count/offset agreement:

~~~python
def test_repository_crud_search_and_duplicates(session: Session) -> None:
    first = create_workflow_link(
        session,
        title="Nightly summary",
        url="http://localhost:5678/workflow/a",
        description="Repository activity",
        tags=("n8n", "repository"),
    )
    duplicate = create_workflow_link(
        session,
        title="Nightly summary",
        url="http://localhost:5678/workflow/a",
        description="Second operator context",
        tags=("n8n",),
    )
    updated = update_workflow_link(
        session,
        first,
        title="Nightly summary edited",
        url=first.url,
        description="Updated activity",
        tags=("n8n", "edited"),
    )
    page = list_workflow_links(
        session,
        query="activity",
        tag="edited",
        limit=50,
        offset=0,
    )

    assert updated.updated_at >= updated.created_at
    assert page.total == 1
    assert [item.id for item in page.items] == [first.id]
    assert duplicate.id != first.id
    delete_workflow_link(session, duplicate)
    assert get_workflow_link(session, duplicate.id) is None
~~~

- [ ] **Step 5: Implement the focused repository**

Define:

~~~python
LIKE_ESCAPE = "\\"


def _escape_like(value: str) -> str:
    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


def _workflow_link_filters(
    query: str | None,
    tag: str | None,
) -> tuple[ColumnElement[bool], ...]:
    filters: list[ColumnElement[bool]] = []
    canonical_tags = getattr(func, CANONICAL_TAGS_FUNCTION)(WorkflowLink.tags)
    casefold = getattr(func, UNICODE_CASEFOLD_FUNCTION)
    if query:
        pattern = "%" + _escape_like(query.casefold()) + "%"
        filters.append(
            or_(
                casefold(WorkflowLink.title).like(pattern, escape=LIKE_ESCAPE),
                casefold(WorkflowLink.url).like(pattern, escape=LIKE_ESCAPE),
                casefold(WorkflowLink.description).like(pattern, escape=LIKE_ESCAPE),
                casefold(canonical_tags).like(pattern, escape=LIKE_ESCAPE),
            )
        )
    if tag:
        padded = literal(",") + canonical_tags + literal(",")
        pattern = "%," + _escape_like(tag.casefold()) + ",%"
        filters.append(padded.like(pattern, escape=LIKE_ESCAPE))
    return tuple(filters)


@dataclass(frozen=True, slots=True)
class WorkflowLinkPage:
    items: tuple[WorkflowLink, ...]
    total: int


def list_workflow_links(
    session: Session,
    *,
    query: str | None,
    tag: str | None,
    limit: int,
    offset: int,
) -> WorkflowLinkPage:
    filters = _workflow_link_filters(query, tag)
    count = session.scalar(
        select(func.count()).select_from(WorkflowLink).where(*filters)
    )
    statement = (
        select(WorkflowLink)
        .where(*filters)
        .order_by(WorkflowLink.updated_at.desc(), WorkflowLink.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = tuple(session.scalars(statement).all())
    total = count or 0
    return WorkflowLinkPage(items=items, total=total)


def get_workflow_link(session: Session, workflow_link_id: int) -> WorkflowLink | None:
    return session.get(WorkflowLink, workflow_link_id)
~~~

Also implement create_workflow_link, update_workflow_link, and delete_workflow_link with keyword-only
title, url, description, and tags. Encode tags through the shared codec. Each mutation commits once;
create/update refresh once.

- [ ] **Step 6: Run migration, repository, and full backend regression gates**

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_migrations.py tests/unit/test_workflow_link_repository.py -v)
(cd backend && uv run pytest)
(cd backend && uv run ruff check .)
(cd backend && uv run ruff format --check .)
(cd backend && uv run mypy src)
test "$(sha256sum backend/migrations/versions/0001_create_prompts.py | cut -d' ' -f1)" = "4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5"
~~~

Expected: migration preservation/drift and all backend tests/static checks pass; migration 0001
remains byte-for-byte unchanged.

- [ ] **Step 7: Record and commit Task 2**

Append the exact schema, migration, prompt-preservation, repository, and full-suite evidence to the
build journal, then:

~~~bash
git add backend/migrations backend/src/local_ai_hub/db backend/tests history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add workflow link persistence"
~~~

### Task 3: Workflow-link CRUD and search API

**Files:**
- Create: backend/src/local_ai_hub/api/workflow_link_schemas.py
- Create: backend/src/local_ai_hub/api/routes/workflow_links.py
- Create: backend/src/local_ai_hub/api/access_logs.py
- Create: backend/tests/e2e/test_workflow_links_api.py
- Create: backend/tests/e2e/test_access_logs.py
- Modify: backend/src/local_ai_hub/api/main.py
- Modify: backend/src/local_ai_hub/api/routes/__init__.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Add an isolated API fixture and failing lifecycle tests**

Use StaticPool, register SQLite functions, create metadata, override get_db, and restore the previous
override. Establish this lifecycle:

~~~python
def workflow_link_payload() -> dict[str, object]:
    return {
        "title": "Local n8n workflow",
        "url": "http://localhost:5678/workflow/abc?view=full#node",
        "description": "Runs the local repository summary.",
        "tags": ["N8N", "local", "n8n"],
    }


def test_create_get_replace_delete_and_repeat_404(harness: WorkflowLinkApiHarness) -> None:
    created = harness.client.post("/api/workflow-links", json=workflow_link_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Local n8n workflow"
    assert body["tags"] == ["n8n", "local"]

    item_id = body["id"]
    assert harness.client.get("/api/workflow-links/" + str(item_id)).json() == body

    updated = harness.client.put(
        "/api/workflow-links/" + str(item_id),
        json={
            "title": "Updated workflow",
            "url": "https://example.com/workflow/updated",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == ""
    assert updated.json()["tags"] == []

    assert harness.client.delete("/api/workflow-links/" + str(item_id)).status_code == 204
    repeated = harness.client.delete("/api/workflow-links/" + str(item_id))
    assert repeated.status_code == 404
    assert repeated.json() == {"detail": "Workflow link not found"}
~~~

Add direct cases for summary omission of full description, empty preview, q+exact-tag filtering,
pagination/order metadata, omitted defaults, duplicate URLs, invalid IDs, unknown body fields, every
URL corpus rejection, 201/200/204 content types, and fixed 404 messages.

- [ ] **Step 2: Add failing redaction and rollback tests**

Use unique sensitive markers in URL, description, query, SQLAlchemy exception text, and bound-like
values. Parameterize list, create, get, update, and delete repository failures. Patch each route
dependency to raise SQLAlchemyError and spy on session.rollback:

~~~python
def test_persistence_failure_rolls_back_without_leaking(
    harness: WorkflowLinkApiHarness,
    caplog: pytest.LogCaptureFixture,
) -> None:
    marker = "sensitive-workflow-link-marker"
    with patch(
        "local_ai_hub.api.routes.workflow_links.list_workflow_links",
        side_effect=SQLAlchemyError("SELECT secret FROM links WHERE value=" + marker),
    ):
        response = harness.client.get("/api/workflow-links")

    assert response.status_code == 500
    assert response.json() == {"detail": "Workflow link operation failed"}
    assert marker not in response.text
    assert marker not in caplog.text
~~~

Also prove validation responses do not reflect an oversized URL, description, or query marker.
Use bound SQL in separate cases to corrupt ID, title, URL, description, tags, created_at, and
updated_at. Prove list/detail emits only the fixed 500 instead of repairing or returning any corrupt
field. Patch rollback itself to raise RuntimeError and prove the original fixed 500 still wins with
no marker in response or caplog.

- [ ] **Step 3: Run the focused API file and confirm route absence**

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_workflow_links_api.py -v)
~~~

Expected: requests return HTTP 404 because /api/workflow-links is not mounted.

- [ ] **Step 4: Implement Pydantic contracts**

Create strict extra-forbid write models. Title and URL are required; description defaults to "";
tags default to an empty list. Validators call domain functions and convert InputValidationError
into fixed ValueError messages. Define:

~~~python
class WorkflowLinkCreate(_WorkflowLinkWrite):
    pass


class WorkflowLinkUpdate(_WorkflowLinkWrite):
    pass


class WorkflowLinkSummaryResponse(BaseModel):
    id: int
    title: str
    url: str
    description_preview: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class WorkflowLinkResponse(BaseModel):
    id: int
    title: str
    url: str
    description: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class WorkflowLinkListResponse(BaseModel):
    items: list[WorkflowLinkSummaryResponse]
    total: int
    limit: int
    offset: int
~~~

Add workflow_link_to_summary and workflow_link_to_response conversion functions. Before building a
response they require a positive integer ID, canonical-equal title/URL/description, canonical-equal
encoded tags, and timezone-aware datetime values. Any mismatch raises WorkflowLinkInputError so
direct database corruption cannot become a browser response. Empty description preview is valid.

- [ ] **Step 5: Implement fixed-error routes and mount them**

Expose GET/POST on the collection and GET/PUT/DELETE on /{workflow_link_id}. Normalize q and tag
before repository calls. Wrap every SQLAlchemy repository operation:

~~~python
def _raise_operation_failed(session: Session) -> NoReturn:
    try:
        session.rollback()
    except Exception:
        pass
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Workflow link operation failed",
    ) from None


def _required_workflow_link(session: Session, workflow_link_id: int) -> WorkflowLink:
    try:
        workflow_link = get_workflow_link(session, workflow_link_id)
    except (SQLAlchemyError, WorkflowLinkInputError):
        _raise_operation_failed(session)
    if workflow_link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow link not found",
        )
    return workflow_link
~~~

Wrap response conversion in the same boundary and catch SQLAlchemyError, WorkflowLinkInputError,
and the concrete ValueError/TypeError raised while SQLAlchemy decodes corrupt stored scalar values.
Do not log or chain caught exceptions; suppress any ordinary rollback Exception so the fixed
response still wins. Register the router under /api/workflow-links in main.py.

Implement access_logs.py with a logging.Filter that copies record.args, replaces the query portion
of every Uvicorn request-target argument with ?<redacted>, and never stores the original value on the
record. install_safe_access_log_filter is idempotent and runs from the FastAPI lifespan startup, after
Uvicorn has configured its logger and before it formats request access records. Unit cases cover no
query, q/tag, encoded delimiters, unexpected argument shapes, and repeated installation.

- [ ] **Step 6: Run API, real Uvicorn log-redaction, and full backend gates**

test_access_logs.py starts Uvicorn against the real app on a task-owned loopback socket with access
logging enabled, sends /api/workflow-links?q=access-log-marker&tag=secret-tag through httpx, and
captures the formatted uvicorn.access output. Assert both values are absent, the path and
?<redacted> are present, and the server/thread/socket stop in a finally block.

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_workflow_links_api.py tests/e2e/test_access_logs.py -v)
(cd backend && uv run pytest)
(cd backend && uv run ruff check .)
(cd backend && uv run ruff format --check .)
(cd backend && uv run mypy src)
~~~

Expected: lifecycle, filtering, redaction, rollback, migration, Prompt, Ollama, and health tests pass.

- [ ] **Step 7: Record and commit Task 3**

Record exact route/status/error/test evidence in history/BUILD_LOG.md, then:

~~~bash
git add backend/src/local_ai_hub/api backend/tests/e2e history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add workflow link api"
~~~

### Task 4: Frontend runtime contracts and shared registry primitives

**Files:**
- Create: web/src/api/workflowLinkUrl.ts
- Create: web/src/api/workflowLinkUrl.test.ts
- Create: web/src/api/workflowLinks.ts
- Create: web/src/api/workflowLinks.test.ts
- Create: web/src/features/shared/registryState.ts
- Create: web/src/features/shared/TagInput.tsx
- Create: web/src/features/shared/ConfirmDialog.tsx
- Create: web/src/features/shared/registryState.test.ts
- Modify: web/tsconfig.app.json
- Modify: web/src/api/client.ts
- Modify: web/src/api/prompts.test.ts
- Modify: web/src/features/prompts/promptState.ts
- Modify: web/src/features/prompts/PromptEditor.tsx
- Modify: web/src/features/prompts/TagInput.tsx
- Modify: web/src/features/prompts/ConfirmDialog.tsx
- Modify: web/src/features/prompts/PromptEditor.test.tsx
- Modify: web/src/features/prompts/PromptRegistry.editor.test.tsx
- Modify: web/src/features/prompts/PromptRegistry.test.tsx
- Modify: web/src/features/prompts/promptState.test.ts
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing URL-parity and API client tests**

Enable resolveJsonModule in tsconfig.app.json and import the shared JSON corpus. Test every accepted
case after trimming and every rejected case:

~~~typescript
import urlCases from '../test/fixtures/workflowLinkUrlCases.json'
import {
  createWorkflowLink,
  deleteWorkflowLink,
  getWorkflowLink,
  listWorkflowLinks,
  updateWorkflowLink,
} from './workflowLinks'
import { isSafeWorkflowLinkUrl } from './workflowLinkUrl'

it.each(urlCases.accepted)('accepts $name', ({ value }) => {
  expect(isSafeWorkflowLinkUrl(value.trim())).toBe(true)
})

it.each(urlCases.rejected)('rejects $name', ({ value }) => {
  expect(isSafeWorkflowLinkUrl(value)).toBe(false)
})
~~~

Mock fetch and directly cover valid full/list payloads, empty description_preview, malformed IDs,
timestamps, tags, pagination, URL, missing/extra full description in summaries, invalid JSON,
network/abort behavior, exact URLSearchParams encoding, POST/PUT bodies, and required 204 deletion.

- [ ] **Step 2: Run the client test and confirm the missing module**

Run:

~~~bash
(cd web && pnpm test -- src/api/workflowLinks.test.ts)
~~~

Expected: collection fails because src/api/workflowLinks.ts does not exist.

- [ ] **Step 3: Implement the fail-closed URL parser, safe HTTP error, and API functions**

workflowLinkUrl.ts implements the same literal scheme, raw authority, userinfo/percent, ASCII host,
canonical numeric IPv4, bracketed IPv6, port, whitespace/control, and backslash decisions before and
after new URL(value). It exports isSafeWorkflowLinkUrl and workflowLinkOrigin. Add a BackendHttpError
class to client.ts with a numeric status and the unchanged safe message Backend returned HTTP N; do
not parse or expose an error response body. Preserve all Prompt client behavior with regressions.

Define WorkflowLinkSummary, WorkflowLink, WorkflowLinkListResponse, WorkflowLinkWriteInput, and
WorkflowLinkListQuery. parseWorkflowLink and parseWorkflowLinkList throw only Backend returned an
invalid response.

Expose:

~~~typescript
export const listWorkflowLinks = (
  query: WorkflowLinkListQuery,
  signal?: AbortSignal,
) => requestJson(workflowLinkListPath(query), parseWorkflowLinkList, { signal })

export const getWorkflowLink = (id: number, signal?: AbortSignal) =>
  requestJson('/api/workflow-links/' + id, parseWorkflowLink, { signal })

export const createWorkflowLink = (
  input: WorkflowLinkWriteInput,
  signal?: AbortSignal,
) =>
  requestJson('/api/workflow-links', parseWorkflowLink, {
    method: 'POST',
    body: input,
    signal,
  })

export const updateWorkflowLink = (
  id: number,
  input: WorkflowLinkWriteInput,
  signal?: AbortSignal,
) =>
  requestJson('/api/workflow-links/' + id, parseWorkflowLink, {
    method: 'PUT',
    body: input,
    signal,
  })

export const deleteWorkflowLink = (id: number, signal?: AbortSignal) =>
  requestNoContent('/api/workflow-links/' + id, signal)
~~~

No parser, component, or test calls fetch with a stored destination.

- [ ] **Step 4: Write failing shared-tag and generic-dialog regressions**

Establish that registryTextLength and normalizeRegistryTag preserve the current Unicode behavior.
Render TagInput with label="Prompt tags" and subjectName="prompt", then with label="Workflow link
tags" and subjectName="workflow link". Render ConfirmDialog with explicit accessible IDs, heading,
subject, explanation, confirm label, and pending label. Cover safe Cancel focus, Escape, pending
lock, Confirm, and focus return.

- [ ] **Step 5: Move only the proven shared primitives**

Move Unicode length/case-fold/tag normalization into features/shared/registryState.ts. Keep
promptTextLength and normalizePromptTag as compatibility exports from promptState.ts. Replace the
prompt-local TagInput and ConfirmDialog with imports from features/shared; remove the old files only
after prompt tests pass.

The generic dialog props are:

~~~typescript
interface ConfirmDialogProps {
  open: boolean
  eyebrow: string
  heading: string
  subject: string
  explanation: string
  confirmLabel: string
  pendingLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}
~~~

ConfirmDialog generates unique heading and description IDs with useId. TagInput accepts label and
subjectName so no prompt-specific text remains in shared code.

- [ ] **Step 6: Run frontend contract and Prompt regression gates**

Run:

~~~bash
(cd web && pnpm test -- src/api/workflowLinks.test.ts src/features/shared src/features/prompts)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
~~~

Expected: URL decisions match the Python corpus, shared primitive tests and all existing Prompt
behavior pass, and production code builds without a new dependency.

- [ ] **Step 7: Record and commit Task 4**

Record exact test/build counts and shared-refactor evidence, then:

~~~bash
git add web/tsconfig.app.json web/src/api web/src/features web/src/test history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add workflow link frontend contracts"
~~~

### Task 5: Searchable Workflow Links directory

**Files:**
- Create: web/src/features/workflows/workflowState.ts
- Create: web/src/features/workflows/workflowState.test.ts
- Create: web/src/features/workflows/useWorkflowRegistry.ts
- Create: web/src/features/workflows/WorkflowRegistry.tsx
- Create: web/src/features/workflows/WorkflowList.tsx
- Create: web/src/features/workflows/WorkflowRegistry.test.tsx
- Create: web/src/App.navigation.test.tsx
- Modify: web/src/App.tsx
- Modify: web/src/styles.css
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing pure-state and directory behavior tests**

Define WorkflowLinkDraft as title/url/description/tags. Test new draft, server-to-draft conversion,
trim-aware dirty comparison, canonical tags, URL changes, merge-by-id page behavior, and origin
display. In component tests cover:

- initial loading and background refresh;
- empty registry versus filtered empty;
- retryable list error that leaves a loaded detail/draft intact;
- 250 ms debounced search and whitespace-only clearing;
- exact tag apply/clear and combined q+tag query;
- Load more merge/dedup/count behavior;
- stale search/page completions ignored and unmount abort;
- desktop auto-selection only from true standby;
- mobile no auto-selection;
- semantic list rows with title, origin, empty/nonempty preview, tags, and updated time.

Use deferred promises and fake timers so every request race is deterministic.

- [ ] **Step 2: Run the workflow feature tests and confirm missing modules**

Run:

~~~bash
(cd web && pnpm test -- src/features/workflows)
~~~

Expected: collection fails because the workflow feature modules do not exist.

- [ ] **Step 3: Implement pure workflow state**

Define:

~~~typescript
export type WorkflowEditorMode = 'empty' | 'new' | 'selected'

export interface WorkflowLinkDraft {
  title: string
  url: string
  description: string
  tags: string[]
}

export const newWorkflowLinkDraft = (): WorkflowLinkDraft => ({
  title: '',
  url: '',
  description: '',
  tags: [],
})

export const workflowLinkToDraft = (item: WorkflowLink): WorkflowLinkDraft => ({
  title: item.title,
  url: item.url,
  description: item.description,
  tags: [...item.tags],
})
~~~

Add isWorkflowLinkDraftDirty, mergeWorkflowLinkPages, and code-point length helpers. Import
workflowLinkOrigin from api/workflowLinkUrl.ts wherever origin display is needed; do not create a
second URL parser.

- [ ] **Step 4: Implement list/detail orchestration**

Create an independent WorkflowRegistryController. Use the Prompt controller's proven request
ownership concepts but write workflow-specific state. For this task, implement enabled
list/search/tag/page/detail selection, retry, safe standby auto-selection, mobile pane transitions,
focus versions, and confirmDiscard based on draft/pending-tag state. The Task 5 controller interface
contains exactly the list, detail, selection, draft, pane, and navigation members consumed by the
directory. Task 6 extends that typed interface with mutation and clipboard state; do not add stub
methods.

- [ ] **Step 5: Implement WorkflowList and initial WorkflowRegistry**

Use a semantic result list. Each row's selection button is separate from future Open actions and
shows title, runtime-safe origin, description preview (including a deliberate no-description state),
tags, and updated time. Add search label "Search workflow links", exact-tag chip, New link, Retry,
Load more, initial/filtered empty states, and polite refresh status.

WorkflowRegistry provides the approved copy and a route-map workbench placeholder or detail-loading
state. It never renders HTML from record values and never creates an anchor from list failure data.

- [ ] **Step 6: Add the third top-level view without bypassing Prompt dirty state**

Instantiate useWorkflowRegistry(activeView === 'workflows'), extend ActiveView to overview,
prompts, or workflows, and route every button through one navigateTo function:

~~~typescript
type ActiveView = 'overview' | 'prompts' | 'workflows'

const navigateTo = (target: ActiveView) => {
  if (target === activeView) return
  if (activeView === 'prompts' && !promptRegistry.confirmDiscard()) return
  if (activeView === 'workflows' && !workflowRegistry.confirmDiscard()) return
  setActiveView(target)
}
~~~

Add App-level tests proving dirty Prompt blocks Workflows and canceled navigation retains the active
view. Task 6 adds the reverse dirty-Workflow cases after editing exists.

- [ ] **Step 7: Add directory and three-button responsive styles**

Extend existing registry primitives and add workflow-specific route nodes/lines without favicons,
remote assets, provider logos, or color-only meaning. At max-width 600 px, use a two-row masthead and
three equal 44 px view buttons. Long origins/titles/tags use overflow-wrap:anywhere.

- [ ] **Step 8: Run and commit Task 5**

Run:

~~~bash
(cd web && pnpm test)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
~~~

Expected: all Prompt and Workflow directory behavior, static checks, and production build pass.
Append exact counts and browser-contract decisions to history, then:

~~~bash
git add web/src/App.tsx web/src/App.navigation.test.tsx web/src/styles.css web/src/features/workflows history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add searchable workflow link registry"
~~~

### Task 6: Workflow editor, safe navigation, copy, and deletion

**Files:**
- Create: web/src/features/workflows/WorkflowEditor.tsx
- Create: web/src/features/workflows/WorkflowEditor.test.tsx
- Create: web/src/features/workflows/WorkflowRegistry.editor.test.tsx
- Modify: web/src/features/workflows/useWorkflowRegistry.ts
- Modify: web/src/features/workflows/WorkflowRegistry.tsx
- Modify: web/src/features/workflows/WorkflowList.tsx
- Modify: web/src/App.tsx
- Modify: web/src/App.navigation.test.tsx
- Modify: web/src/styles.css
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing create/update and validation tests**

Cover New link, title/URL required errors, 200/2048/5000 code-point counters, pending canonical tag
save, POST response adoption, PUT complete replacement, Ctrl/Cmd+S, mutation pending lock, and save
failure preserving title, URL, description, tags, and pending tag text. Verify unsafe or unsaved
draft URLs never produce an anchor.

- [ ] **Step 2: Write failing saved Open/Copy and no-dereference tests**

For a persisted record, assert:

~~~typescript
const anchor = screen.getByRole('link', { name: /open saved link/i })
expect(anchor).toHaveAttribute('href', persisted.url)
expect(anchor).toHaveAttribute('target', '_blank')
expect(anchor).toHaveAttribute('rel', expect.stringContaining('noopener'))
expect(anchor).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
expect(anchor).toHaveAttribute('referrerpolicy', 'no-referrer')
~~~

Mock navigator.clipboard.writeText and prove Copy saved URL writes the exact persisted URL after a
click, reports success/failure in a polite region, ignores a stale completion after selection, and
continues to reference clearly labeled persisted state while a different URL draft is dirty. Spy on
global fetch and prove rendering, selecting, searching, editing, and saving never request the stored
destination.

- [ ] **Step 3: Write failing dirty-navigation and deletion tests**

Cover dirty selection, New, mobile Back, missing-record recovery, beforeunload, Workflow→Overview,
Workflow→Prompts, and Prompt→Workflow. Cancel preserves every field and active view; Confirm discards
only the active draft. A pending save/delete cannot be abandoned.

Cover native dialog Cancel focus, Escape, title-bearing warning, pending lock, one DELETE call,
success announcement and adjacent/New focus, failure preservation, delete 404 directory recovery
without success text, and ignored late mutation completion.

- [ ] **Step 4: Complete workflow mutation and clipboard orchestration**

Implement create/update/delete/copy with separate generation ownership. Compute canSave only when
the draft is valid, dirty, detail is settled, no mutation is pending, and new/selected state is
saveable. Include a valid pending tag in the outgoing canonical tag array. Adopt the complete
server response as selected item, baseline, draft, and list summary after save.

On deletion, remove the selected ID, clear detail/draft/baseline, refresh totals/list, announce the
title, move mobile to list, and request safe focus. On HTTP 404, recover to the directory with a
fixed missing-record message. Never retry a mutation automatically.

- [ ] **Step 5: Implement WorkflowEditor**

Render title, URL, description, shared TagInput, timestamps, saved-destination origin, explicit Open
anchor, Copy saved URL, Save link, Delete, Back, status/alert regions, and the generic ConfirmDialog.
Use type="url", inputMode="url", autoCapitalize="none", autoCorrect="off", and spellCheck={false}.
Render description as textarea text only. Keep Open/Copy absent for new records and explain persisted
behavior when the URL draft differs.

- [ ] **Step 6: Complete mobile focus and visual behavior**

At max-width 600 px show one directory/editor pane. New focuses title. Selection focuses the settled
heading after detail resolves. Back returns to the originating row or New link. Deletion returns to
a safe adjacent row/New. Ensure 16 px form text, 44 px actions, overflow-wrap:anywhere, reduced
motion, visible focus, AA contrast, and no horizontal overflow at 320 px.

- [ ] **Step 7: Run frontend gates and real Firefox smoke**

Run:

~~~bash
(cd web && pnpm test)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
~~~

Then launch FastAPI with a disposable SQLite file and safe unreachable Ollama origin, Vite, and a
task-owned loopback HTTP sentinel. Use headless Firefox WebDriver to exercise create, search, exact
tag, clear filter, detail, update, exact saved-URL copy, dirty canceled navigation, delete
Cancel/Escape/Confirm, repeated API delete 404, mobile settled focus, and widths 320/600/601/1280
with no horizontal overflow. Before Open, the sentinel count is zero. Clicking Open creates exactly
one new tab and one sentinel request with no Referer header. Close the tab, then remove the
disposable database and stop every process/listener.

Expected: all automated and browser assertions pass with no stored-target contact before Open and
exactly one explicit sentinel request after Open.

- [ ] **Step 8: Record and commit Task 6**

Append exact test/build/browser results, async/focus decisions, and any observed/resolved failures to
history and docs/FAILURES.md only if a real failure occurred, then:

~~~bash
git add web/src docs/FAILURES.md history/BUILD_LOG.md
git diff --cached --check
git commit -m "feat: add workflow link editor and safe navigation"
~~~

### Task 7: Integration documentation and regression gates

**Files:**
- Modify: README.md
- Modify: AGENTS.md
- Modify: docs/DECISIONS.md
- Modify: docs/SECURITY_NOTES.md
- Modify: docs/FAILURES.md only for observed incidents
- Modify: docs/superpowers/specs/2026-07-12-phase-1b-workflow-links-design.md
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Run the complete non-Docker application gates**

Run literally:

~~~bash
make install
make test
make test-e2e
make test-web
make lint
make typecheck
(cd backend && uv run ruff format --check .)
(cd web && pnpm build)
~~~

Expected: dependency locks remain unchanged unless a tool-only correction was explicitly needed; all
backend/frontend tests, lint, typecheck, format, and production build pass. Record exact counts and
only actual warnings.

- [ ] **Step 2: Verify migration preservation and drift on a disposable database**

Use a new task-owned /tmp SQLite path and safe process variable:

~~~bash
(cd backend && DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1b.sqlite uv run alembic upgrade head)
(cd backend && DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1b.sqlite uv run alembic check)
(cd backend && DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1b.sqlite uv run alembic downgrade 0001_create_prompts)
(cd backend && DATABASE_URL=sqlite:////tmp/local-ai-hub-phase1b.sqlite uv run alembic upgrade head)
rm -f /tmp/local-ai-hub-phase1b.sqlite /tmp/local-ai-hub-phase1b.sqlite-shm /tmp/local-ai-hub-phase1b.sqlite-wal
~~~

Expected: head is 0002, no drift exists, downgrade/upgrade succeeds, and the disposable files are
removed. The automated migration test remains the proof that a preexisting prompt survives.

- [ ] **Step 3: Build and smoke Docker Compose with explicit safe configuration**

Use an isolated acceptance project name so existing development data and dependency volumes are not
modified. Run:

~~~bash
env OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1b-acceptance build
env OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1b-acceptance up -d
~~~

Wait for direct API and proxied /health. Verify graceful direct/proxied offline Ollama state. Through
direct and proxied /api/workflow-links routes, create a localhost deep link, retrieve it, search by q
plus exact tag, update it, delete it, and verify repeated DELETE 404. Assert no request reaches the
stored destination. Verify pnpm store remains /pnpm/store/v10 and no web/.pnpm-store appears.

Tear down the isolated project and its task-owned volumes:

~~~bash
docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1b-acceptance down --volumes --remove-orphans
docker compose --env-file /dev/null -p local-ai-workflow-hub-phase1b-acceptance ps -a
~~~

Expected: zero acceptance containers and volumes remain, the four preexisting main-project named
volumes are unchanged, and no source-tree package store or database was created.

- [ ] **Step 4: Update current product and security documentation**

README describes the implemented/current Phase 1B behavior and notes final acceptance is in
progress; lists all five routes, URL/tag behavior, safe Open/Copy, setup/validation commands,
limitations, and no-dereference warning. DECISIONS records the dedicated reference model, additive
migration, URL profile, flexible tags, and provider deferral. SECURITY_NOTES records full-URL
exposure, query/fragment secret warning, explicit new-tab behavior, and absence of target
requests/n8n. AGENTS requires make test-web before Prompt or Workflow UI behavior commits. The
design status becomes Approved; implementation complete, final acceptance pending.

- [ ] **Step 5: Run documentation, artifact, and prohibited-capability checks**

Run path/link/whitespace checks and search tracked source for Docker socket, privileged mode, Docker
SDK, n8n keys/calls, cloud AI, unsafe HTML, window.open, backend redirects/proxies, target fetches,
and Ollama mutation. Confirm .env.example remains safe and no real .env, database, key, dependency,
cache, build, bytecode, or TypeScript output is tracked. Do not inspect ignored secret files.

- [ ] **Step 6: Record and commit Task 7**

Append exact integration evidence and observed failures/resolutions to history. Run the relevant
gates again after any documentation/config correction, then:

~~~bash
git add README.md AGENTS.md docs history/BUILD_LOG.md
git diff --cached --check
git commit -m "chore: finalize phase 1b integration"
~~~

### Task 8: Final Phase 1B acceptance

**Files:**
- Modify: README.md
- Modify: docs/superpowers/specs/2026-07-12-phase-1b-workflow-links-design.md
- Modify: history/BUILD_LOG.md
- Modify: docs/FAILURES.md only if final validation exposes an actual incident
- Modify: implementation files only for acceptance blockers, with focused regression tests

- [ ] **Step 1: Derive a requirement-by-requirement matrix from the committed specification**

Map every persistence, validation, API, UI, error, accessibility, security, documentation, Git, and
Phase 1C boundary to direct evidence. Treat missing or indirect evidence as incomplete. Dispatch
independent read-only behavior and artifact/security audits against the exact committed HEAD.

- [ ] **Step 2: Re-run all acceptance gates on the exact candidate revision**

Run:

~~~bash
make install
make test
make test-e2e
make test-web
make lint
make typecheck
(cd backend && uv run ruff format --check .)
(cd web && pnpm build)
env OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
~~~

Repeat disposable migration drift/preservation evidence, comprehensive Firefox desktop/mobile CRUD/
search/tag/copy/navigation/delete/no-overflow smoke, explicit one-request/no-Referer Open behavior
against a task-owned loopback sentinel, and the isolated Compose direct/proxied workflow lifecycle.
If any check fails, record the observed failure, add a focused regression, implement the smallest
spec-aligned correction, rerun affected and broad gates, update history, and commit conventionally
before repeating acceptance from the new HEAD.

- [ ] **Step 3: Audit final scope, artifacts, containers, and Git**

Require:

- exactly migrations 0001 and 0002, with Prompt schema unchanged;
- migration 0001 SHA-256 remains
  4f1e37711a7d7311a6d138023bc014bd7c755e20ca860082c494bd34ba50f8b5;
- no automatic/backend request path to stored destinations;
- no n8n integration/key, Docker socket/SDK, privileged mode, cloud AI, auth, or production config;
- loopback-only host publishing;
- no tracked/untracked real secret, environment file, project database, dependency/build/cache, or
  bytecode artifact;
- zero remaining acceptance containers or acceptance volumes after isolated teardown;
- the four preexisting main-project named volumes remain unchanged;
- no task-owned /tmp database/process/listener;
- conventional milestone commits, no remote push, git diff --check, and clean final status.

- [ ] **Step 4: Record and commit final validation**

Mark Phase 1B complete and Phase 1C next in README, and set the design status to Approved;
implementation complete. Append the complete gate counts, migration evidence, Firefox flows,
Compose lifecycle, independent audit outcomes, warnings, teardown, artifact scan, and clean-status
evidence to history/BUILD_LOG.md. If docs/FAILURES.md changed for an actual final incident, include
it. Then:

~~~bash
git add README.md docs/superpowers/specs/2026-07-12-phase-1b-workflow-links-design.md history/BUILD_LOG.md docs/FAILURES.md
git diff --cached --check
git commit -m "test: record phase 1b acceptance validation"
git status --short
git log --oneline --decorate=no -10
~~~

Expected: the acceptance commit succeeds, git status prints nothing, Phase 1B is proven complete,
and Phase 1C remains the next separately designed milestone.
