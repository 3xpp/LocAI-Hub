# Phase 1A Prompt Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a tested local prompt registry with CRUD, search, tags, pagination, copy, dirty-state protection, and confirmed permanent deletion.

**Architecture:** FastAPI prompt routes depend on a focused SQLAlchemy repository and pure prompt-domain normalization service while reusing the existing Prompt table. The React application adds an Overview/Prompts view switch and a responsive split registry whose network payloads are runtime validated. Backend and frontend behavior are developed test-first and committed in independently reviewable milestones.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, SQLite, pytest, Ruff, mypy, React, TypeScript, Vite, Vitest, Testing Library, jsdom, pnpm, Docker Compose.

---

## File Responsibility Map

- **backend/src/local_ai_hub/services/prompts.py**: prompt validation, tag codec, and preview generation.
- **backend/src/local_ai_hub/db/repositories/prompts.py**: CRUD, filtered count/list, ordering, and pagination.
- **backend/src/local_ai_hub/api/prompt_schemas.py**: prompt query/body/response contracts.
- **backend/src/local_ai_hub/api/routes/prompts.py**: HTTP status codes and repository orchestration.
- **backend/tests/unit/test_prompt_service.py**: pure normalization and preview behavior.
- **backend/tests/unit/test_prompt_repository.py**: isolated persistence/search/filter/order behavior.
- **backend/tests/e2e/test_prompts_api.py**: complete HTTP contracts against an isolated SQLite database.
- **web/src/api/client.ts**: shared JSON/no-content request behavior.
- **web/src/api/prompts.ts**: prompt types, runtime parsers, and CRUD/search functions.
- **web/src/features/prompts/promptState.ts**: pure draft/dirty-state helpers.
- **web/src/features/prompts/usePromptRegistry.ts**: cancellation-safe feature orchestration.
- **web/src/features/prompts/PromptRegistry.tsx**: list/editor composition and mobile mode.
- **web/src/features/prompts/PromptList.tsx**: search, filters, summaries, and pagination.
- **web/src/features/prompts/PromptEditor.tsx**: raw-text draft form and mutations.
- **web/src/features/prompts/TagInput.tsx**: accessible canonical tag chips.
- **web/src/features/prompts/ConfirmDialog.tsx**: native-dialog confirmation boundary.
- **web/src/features/prompts/*.test.tsx**: API and user-flow behavior.
- **web/src/test/setup.ts**: Testing Library cleanup.
- **web/vitest.config.ts**: jsdom test configuration.
- **web/src/App.tsx** and **web/src/styles.css**: top-level navigation and visual integration.
- **README.md**, **docs/**, and **history/BUILD_LOG.md**: current product, security, decisions, failures, and milestone record.

### Task 1: Prompt domain and repository

**Files:**
- Create: backend/src/local_ai_hub/services/prompts.py
- Create: backend/src/local_ai_hub/db/repositories/__init__.py
- Create: backend/src/local_ai_hub/db/repositories/prompts.py
- Create: backend/tests/unit/test_prompt_service.py
- Create: backend/tests/unit/test_prompt_repository.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing prompt-domain tests**

Create tests that establish these exact values:

~~~python
from pytest import raises

from local_ai_hub.services.prompts import (
    PromptInputError,
    content_preview,
    decode_tags,
    encode_tags,
    normalize_content,
    normalize_tags,
    normalize_title,
)


def test_normalize_title_trims_but_content_preserves_edges() -> None:
    assert normalize_title("  Review code  ") == "Review code"
    assert normalize_content("  Keep prompt spacing.\n") == "  Keep prompt spacing.\n"


def test_content_rejects_whitespace_only() -> None:
    with raises(PromptInputError, match="content"):
        normalize_content(" \n\t ")


def test_tags_are_canonical_deduplicated_and_round_trip() -> None:
    tags = normalize_tags([" Code ", "code", "Error   Review"])
    assert tags == ("code", "error review")
    assert encode_tags(tags) == "code,error review"
    assert decode_tags("code,error review") == tags
    assert decode_tags(None) == ()
    assert decode_tags("") == ()


def test_tag_rejects_comma_and_control_character() -> None:
    with raises(PromptInputError, match="tag"):
        normalize_tags(["code,review"])
    with raises(PromptInputError, match="tag"):
        normalize_tags(["line\nbreak"])


def test_preview_collapses_whitespace_and_truncates() -> None:
    assert content_preview("one\n\n two") == "one two"
    preview = content_preview("x" * 161)
    assert preview == ("x" * 160) + "…"
~~~

- [ ] **Step 2: Run domain tests and confirm the missing-module failure**

Run:

~~~bash
(cd backend && uv run pytest tests/unit/test_prompt_service.py -v)
~~~

Expected: collection fails because local_ai_hub.services.prompts does not exist.

- [ ] **Step 3: Implement the pure prompt domain service**

Implement PromptInputError with field and message attributes. Define constants for title 200, content 50,000, tag count 10, tag length 30, query length 200, and preview length 160. Use Unicode casefolding and whitespace collapse for tags. Reject commas and every character whose Unicode category starts with C. Preserve content exactly after proving it contains non-whitespace and is within the limit.

The public signatures are:

~~~python
class PromptInputError(ValueError):
    field: str
    message: str


def normalize_title(value: str) -> str: ...
def normalize_content(value: str) -> str: ...
def normalize_search(value: str | None) -> str | None: ...
def normalize_tag(value: str) -> str: ...
def normalize_tags(values: list[str] | tuple[str, ...]) -> tuple[str, ...]: ...
def encode_tags(values: tuple[str, ...]) -> str: ...
def decode_tags(value: str | None) -> tuple[str, ...]: ...
def content_preview(value: str) -> str: ...
~~~

decode_tags is tolerant of legacy null/empty storage and deduplicates valid values. Invalid legacy fragments are omitted rather than causing a list/read failure.

- [ ] **Step 4: Write failing repository tests**

Use an in-memory StaticPool SQLite engine and create the existing metadata. Cover:

~~~python
def test_repository_crud_and_updated_order(session: Session) -> None:
    first = create_prompt(session, title="First", content="alpha", tags=("one",))
    second = create_prompt(session, title="Second", content="beta", tags=("two",))
    updated = update_prompt(
        session,
        first,
        title="First edited",
        content="alpha changed",
        tags=("one", "edited"),
    )
    page = list_prompts(session, query=None, tag=None, limit=50, offset=0)

    assert updated.updated_at >= updated.created_at
    assert [item.id for item in page.items] == [first.id, second.id]
    assert page.total == 2
    delete_prompt(session, second)
    assert get_prompt(session, second.id) is None


def test_search_tag_and_pagination_share_filters(session: Session) -> None:
    create_prompt(session, title="Refactor review", content="clean code", tags=("code", "review"))
    create_prompt(session, title="Meeting summary", content="decisions", tags=("writing",))
    create_prompt(session, title="Debug notes", content="refactor stack", tags=("debug",))

    search = list_prompts(session, query="refactor", tag=None, limit=1, offset=0)
    tagged = list_prompts(session, query=None, tag="code", limit=50, offset=0)

    assert search.total == 2
    assert len(search.items) == 1
    assert [item.title for item in tagged.items] == ["Refactor review"]
~~~

Also cover SQL wildcard characters in q/tag so percent and underscore are treated as literal input.

- [ ] **Step 5: Implement repository functions**

Define:

~~~python
@dataclass(frozen=True, slots=True)
class PromptPage:
    items: tuple[Prompt, ...]
    total: int


def list_prompts(
    session: Session,
    *,
    query: str | None,
    tag: str | None,
    limit: int,
    offset: int,
) -> PromptPage: ...

def get_prompt(session: Session, prompt_id: int) -> Prompt | None: ...
def create_prompt(session: Session, *, title: str, content: str, tags: tuple[str, ...]) -> Prompt: ...
def update_prompt(
    session: Session,
    prompt: Prompt,
    *,
    title: str,
    content: str,
    tags: tuple[str, ...],
) -> Prompt: ...
def delete_prompt(session: Session, prompt: Prompt) -> None: ...
~~~

Escape backslash, percent, and underscore in LIKE patterns. Use one padded comma expression for exact tag matching. Order by updated_at DESC and id DESC. Create/update/delete commit exactly once; create/update refresh the record before returning.

- [ ] **Step 6: Run backend domain/repository gates**

Run:

~~~bash
(cd backend && uv run pytest tests/unit/test_prompt_service.py tests/unit/test_prompt_repository.py -v)
(cd backend && uv run ruff check src tests)
(cd backend && uv run ruff format --check src tests)
(cd backend && uv run mypy src)
~~~

Expected: all new tests and static gates pass.

- [ ] **Step 7: Record and commit Task 1**

Append the exact test counts and decisions to history/BUILD_LOG.md, then:

~~~bash
git add backend/src/local_ai_hub/services/prompts.py backend/src/local_ai_hub/db/repositories backend/tests/unit/test_prompt_service.py backend/tests/unit/test_prompt_repository.py history/BUILD_LOG.md
git commit -m "feat: add prompt registry domain and repository"
~~~

### Task 2: Prompt CRUD and search API

**Files:**
- Create: backend/src/local_ai_hub/api/prompt_schemas.py
- Create: backend/src/local_ai_hub/api/routes/prompts.py
- Create: backend/tests/e2e/test_prompts_api.py
- Modify: backend/src/local_ai_hub/api/main.py
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Add an isolated prompt API fixture and failing CRUD tests**

Override get_db with a temporary StaticPool database and restore only that override after each TestClient context. Tests must assert:

~~~python
def test_create_get_update_delete_prompt(client: TestClient) -> None:
    created = client.post(
        "/api/prompts",
        json={
            "title": "  Refactor review  ",
            "content": "Review this code.",
            "tags": ["Code", "review", "code"],
        },
    )
    assert created.status_code == 201
    assert created.json()["title"] == "Refactor review"
    assert created.json()["tags"] == ["code", "review"]
    prompt_id = created.json()["id"]

    assert client.get(f"/api/prompts/{prompt_id}").status_code == 200

    updated = client.put(
        f"/api/prompts/{prompt_id}",
        json={"title": "Updated", "content": "New content", "tags": ["edited"]},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated"

    deleted = client.delete(f"/api/prompts/{prompt_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get(f"/api/prompts/{prompt_id}").status_code == 404
~~~

Add tests for duplicate titles, list summaries without full content, query + exact tag filtering, pagination metadata, invalid bodies/queries, and 404 update/delete.

- [ ] **Step 2: Run the focused API test and confirm route absence**

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_prompts_api.py -v)
~~~

Expected: requests return 404 because the prompt router is not mounted.

- [ ] **Step 3: Implement prompt schemas**

Create request models PromptCreate and PromptUpdate with title, content, and tags. Both call the domain normalizers in Pydantic field/model validators and return canonical values. Define:

~~~python
class PromptSummaryResponse(BaseModel):
    id: int
    title: str
    content_preview: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PromptResponse(BaseModel):
    id: int
    title: str
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PromptListResponse(BaseModel):
    items: list[PromptSummaryResponse]
    total: int
    limit: int
    offset: int
~~~

Provide conversion functions that decode ORM tags and generate previews without exposing ORM internals in routes.

- [ ] **Step 4: Implement routes and mount the router**

Implement GET collection, POST collection, GET item, PUT item, and DELETE item under /api/prompts. Use Query constraints for q, tag, limit, and offset. Convert PromptInputError from a query-tag normalizer into an HTTP 422 field detail. Missing IDs use the fixed detail Prompt not found. Delete returns Response(status_code=204).

Mount the router in api/main.py:

~~~python
app.include_router(prompts.router, prefix="/api/prompts")
~~~

- [ ] **Step 5: Run API and full backend gates**

Run:

~~~bash
(cd backend && uv run pytest tests/e2e/test_prompts_api.py -v)
make test
make test-e2e
(cd backend && uv run ruff check .)
(cd backend && uv run ruff format --check .)
(cd backend && uv run mypy src)
~~~

Expected: all prior Phase 0 tests and new prompt tests pass.

- [ ] **Step 6: Record and commit Task 2**

~~~bash
git add backend/src/local_ai_hub/api/prompt_schemas.py backend/src/local_ai_hub/api/routes/prompts.py backend/src/local_ai_hub/api/main.py backend/tests/e2e/test_prompts_api.py history/BUILD_LOG.md
git commit -m "feat: add prompt registry api"
~~~

### Task 3: Frontend test harness and typed prompt client

**Files:**
- Modify: web/package.json
- Modify: web/pnpm-lock.yaml
- Modify: web/tsconfig.node.json
- Create: web/vitest.config.ts
- Create: web/src/test/setup.ts
- Modify: web/src/api/client.ts
- Create: web/src/api/prompts.ts
- Create: web/src/api/prompts.test.ts
- Modify: Makefile
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Add dev-only frontend testing dependencies**

Use pnpm:

~~~bash
(cd web && pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom)
~~~

Add scripts:

~~~json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
~~~

Add root make test-web and include it in .PHONY. Do not add a runtime dependency.

- [ ] **Step 2: Configure jsdom and Testing Library**

Create vitest.config.ts with the React plugin, jsdom environment, setup file, globals disabled, restoreMocks true, and CSS enabled. Include vitest.config.ts in tsconfig.node.json. setup.ts imports jest-dom/vitest and registers cleanup after each test.

- [ ] **Step 3: Write failing runtime-parser/client tests**

Mock global fetch and cover:

- valid list/detail payloads;
- invalid nested tag, timestamp, count, and content fields;
- HTTP/network/invalid JSON errors inherited from the shared client;
- POST/PUT JSON headers and body;
- DELETE 204 without JSON parsing;
- AbortSignal forwarding;
- URLSearchParams for q, tag, limit, and offset.

Every malformed shape must reject with Backend returned an invalid response.

- [ ] **Step 4: Refactor shared request behavior**

Export a typed requestJson function from client.ts:

~~~typescript
export interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  signal?: AbortSignal
}

export async function requestJson<T>(
  path: string,
  parse: (payload: unknown) => T,
  options?: JsonRequestOptions,
): Promise<T>
~~~

Keep the exact Phase 0 messages for network, HTTP, and invalid responses. Add requestNoContent for DELETE that accepts only HTTP 204. Update existing health/Ollama calls without changing their public behavior.

- [ ] **Step 5: Implement prompt types, parsers, and API functions**

Export PromptSummary, Prompt, PromptListResponse, PromptWriteInput, and PromptListQuery. Implement:

~~~typescript
export const listPrompts = (query: PromptListQuery, signal?: AbortSignal) => Promise<PromptListResponse>
export const getPrompt = (id: number, signal?: AbortSignal) => Promise<Prompt>
export const createPrompt = (input: PromptWriteInput, signal?: AbortSignal) => Promise<Prompt>
export const updatePrompt = (id: number, input: PromptWriteInput, signal?: AbortSignal) => Promise<Prompt>
export const deletePrompt = (id: number, signal?: AbortSignal) => Promise<void>
~~~

Parsers require positive integer IDs, non-empty strings, finite non-negative counts/offsets, limit 1–100, arrays of strings, and parseable ISO timestamps.

- [ ] **Step 6: Run and commit Task 3**

Run:

~~~bash
(cd web && pnpm test)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
~~~

Record resolved dependency versions and test counts, then:

~~~bash
git add Makefile web/package.json web/pnpm-lock.yaml web/tsconfig.node.json web/vitest.config.ts web/src/test/setup.ts web/src/api/client.ts web/src/api/prompts.ts web/src/api/prompts.test.ts history/BUILD_LOG.md
git commit -m "test: add prompt registry frontend harness"
~~~

### Task 4: Searchable Prompt Registry list

**Files:**
- Create: web/src/features/prompts/promptState.ts
- Create: web/src/features/prompts/usePromptRegistry.ts
- Create: web/src/features/prompts/PromptList.tsx
- Create: web/src/features/prompts/PromptRegistry.tsx
- Create: web/src/features/prompts/PromptRegistry.test.tsx
- Modify: web/src/App.tsx
- Modify: web/src/styles.css
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing registry-list tests**

Mock prompt API functions and cover:

- Overview/Prompts navigation;
- initial loading and first-page rendering;
- empty registry and no-search-results copy;
- 250 ms debounced query;
- exact tag filter from a prompt chip;
- Load more appending results;
- stale/aborted requests not replacing new results;
- list error with Retry;
- automatic desktop selection only when safe.

Use fake timers only around debounce and restore real timers after each test.

- [ ] **Step 2: Implement pure state helpers**

Define PromptDraft, selected/draft modes, new draft creation, prompt-to-draft conversion, normalized dirty comparison, and list-page merge deduplication by ID. Test pure helpers in the registry test file or a focused promptState.test.ts.

- [ ] **Step 3: Implement cancellation-safe list orchestration**

usePromptRegistry owns query, debounced query, active tag, list page, total, selected ID, editor mode, and AbortController refs. New list requests abort previous list requests. Load more keeps the same filter generation and ignores stale completions.

- [ ] **Step 4: Implement PromptList and initial PromptRegistry**

PromptList uses labeled search, semantic result list, accessible filter chip, result count, loading skeleton, empty/no-match/error states, and Load more. PromptRegistry renders the list plus a temporary detail placeholder until Task 5 and emits selected/new actions.

- [ ] **Step 5: Add Overview/Prompts top-level navigation and styles**

App maintains activeView as overview or prompts, instantiates usePromptRegistry with an enabled flag, and passes the returned controller to PromptRegistry. Preserve the existing Overview component tree unchanged. Add accessible masthead view buttons, aria-current, responsive split layout, prompt-row focus/selected styles, and reduced-motion-safe transitions.

- [ ] **Step 6: Run and commit Task 4**

~~~bash
(cd web && pnpm test)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
git add web/src/features/prompts web/src/App.tsx web/src/styles.css history/BUILD_LOG.md
git commit -m "feat: add searchable prompt registry"
~~~

### Task 5: Prompt editor, dirty protection, copy, and deletion

**Files:**
- Create: web/src/features/prompts/TagInput.tsx
- Create: web/src/features/prompts/ConfirmDialog.tsx
- Create: web/src/features/prompts/PromptEditor.tsx
- Create: web/src/features/prompts/PromptEditor.test.tsx
- Modify: web/src/features/prompts/usePromptRegistry.ts
- Modify: web/src/features/prompts/PromptRegistry.tsx
- Modify: web/src/features/prompts/PromptRegistry.test.tsx
- Modify: web/src/App.tsx
- Modify: web/src/styles.css
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Write failing editor flow tests**

Cover:

- New opens a blank title-focused draft.
- Selecting fetches full content.
- Title/content/tag editing creates a dirty state.
- Enter/comma adds canonical tags; duplicate tags collapse; Backspace removes the last tag.
- Save creates or updates and adopts the server response.
- Save failure preserves draft values.
- Ctrl/Cmd+S saves only a valid dirty draft.
- Copy success/failure live messages.
- Selection/New/Overview/Back dirty confirmation accept and cancel.
- beforeunload listener exists only while dirty.
- Delete dialog cancel does nothing.
- Delete confirmation calls API, clears editor, and refreshes list.
- Delete failure preserves selection.
- 404 detail/mutation offers refresh.

- [ ] **Step 2: Implement TagInput and ConfirmDialog**

TagInput has an explicit label, chip remove buttons, text input, normalized feedback, max-count behavior, Enter/comma commit, and empty-input Backspace behavior. ConfirmDialog wraps native dialog with Cancel/Delete buttons, prompt title, irreversible warning, Escape support, and focus restoration.

- [ ] **Step 3: Implement PromptEditor**

Render title, 50,000-character raw textarea, character count, tags, timestamps, dirty/saving/saved/error status, Copy, Save, and Delete. Do not use dangerouslySetInnerHTML. Copy only content after a click. Disable mutations while the current mutation is pending.

- [ ] **Step 4: Complete orchestration and navigation guards**

Add detail/mutation AbortControllers separate from list fetches. Preserve drafts on expected errors. Install/remove beforeunload from dirty state. All feature exits call one confirmDiscard function. App owns the usePromptRegistry instance and calls that guard before changing from Prompts to Overview; PromptRegistry receives the same controller object so list/editor exits cannot bypass it. After create/update/delete, reconcile selected data and list summaries using server values, then refetch when totals/order may change.

- [ ] **Step 5: Complete mobile list/editor flow and CSS**

Below the existing mobile breakpoint, show list mode or editor mode rather than both. Back returns to list through dirty confirmation. Move focus to the editor heading after mobile selection and to title after New. Maintain AA contrast and non-color status labels.

- [ ] **Step 6: Run and commit Task 5**

~~~bash
(cd web && pnpm test)
(cd web && pnpm lint)
(cd web && pnpm typecheck)
(cd web && pnpm build)
git add web/src/features/prompts web/src/App.tsx web/src/styles.css history/BUILD_LOG.md
git commit -m "feat: add prompt editor and safe deletion"
~~~

### Task 6: Integration documentation and regression gates

**Files:**
- Modify: README.md
- Modify: docs/DECISIONS.md
- Modify: docs/FAILURES.md with only issues observed during Phase 1A, or leave it unchanged when
  validation reveals no new failure
- Modify: docs/SECURITY_NOTES.md
- Modify: AGENTS.md to require the frontend behavior suite before prompt-UI commits
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Run the combined application locally**

Apply Alembic head, start the API with safe offline Ollama configuration, and start Vite. Exercise create/search/filter/get/update/copy/delete through the UI and API. Confirm no schema revision is generated by alembic check.

- [ ] **Step 2: Update documentation from verified behavior**

README adds Prompt Registry features, five API routes, frontend test command, updated limitations, and marks Phase 1A complete while retaining 1B/1C order. DECISIONS records canonical tags, server filtering, hard deletion, explicit save, and dev-only frontend test tooling. SECURITY_NOTES records prompt content exposure through CRUD, clipboard behavior, hard-delete irreversibility, and unchanged localhost warning. FAILURES changes only for actual observed incidents.

- [ ] **Step 3: Run all non-Docker gates**

~~~bash
make install
make test
make test-e2e
make test-web
make lint
make typecheck
(cd web && pnpm build)
(cd backend && uv run alembic check)
~~~

- [ ] **Step 4: Build and smoke Docker**

With automatic Compose env loading disabled and a safe explicit offline Ollama URL:

~~~bash
OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null build
OLLAMA_BASE_URL=http://127.0.0.1:9 docker compose --env-file /dev/null up -d
~~~

Smoke direct/proxied health and prompt CRUD/search. Run normal down, confirm zero project containers, and retain named volumes.

- [ ] **Step 5: Record and commit docs/integration**

~~~bash
git add README.md AGENTS.md docs history/BUILD_LOG.md
git commit -m "docs: document phase 1a prompt registry"
~~~

### Task 7: Final Phase 1A acceptance

**Files:**
- Modify: history/BUILD_LOG.md

- [ ] **Step 1: Derive an acceptance checklist from the committed specification**

Map every API contract, UI action/state, validation rule, security invariant, test gate, documentation requirement, and Git requirement to direct evidence. Treat a missing or indirect check as incomplete.

- [ ] **Step 2: Re-run the complete suite**

Run install, backend full/e2e, frontend tests, both linters, both typecheckers, Vite build, Alembic check, Docker builds, local API/UI smoke, Compose direct/proxied prompt smoke, and teardown.

- [ ] **Step 3: Audit repository scope and artifacts**

Verify no real .env, database, secret, cache, node_modules, dist, bytecode, Docker socket, public host binding, n8n/cloud integration, Markdown renderer, prompt execution path, or schema revision was tracked.

- [ ] **Step 4: Append and commit final validation**

Record exact counts, warnings, smoke outcomes, container/volume state, and artifact audit in history/BUILD_LOG.md:

~~~bash
git add history/BUILD_LOG.md
git commit -m "test: record phase 1a acceptance validation"
git status --short
~~~

Expected: the final status command prints nothing.
