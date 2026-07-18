# Security Notes

## Phase 1C security posture

Local AI Workflow Hub is an unauthenticated, local development dashboard. Phase 1C is designed for
one trusted operator on one machine. It is not a public service, remote administration plane, or
production deployment profile. The Prompt and Workflow Links registries add local data read,
create, update, copy/open, permanent-delete, and full-registry transfer capabilities; that increases
the impact of unintended network access and downloaded-file disclosure.

> Do not expose the dashboard or API publicly without authentication, authorization, TLS, network policy, audit logging, and a dedicated threat model.

Loopback host bindings reduce accidental exposure; they are not a substitute for the missing controls.

## Explicit Phase 1C boundaries

- **No Docker socket access:** Neither the application nor Compose mounts /var/run/docker.sock. There is no Docker SDK or container-control API.
- **No n8n API key usage:** Phase 1C does not read N8N_API_KEY, call n8n, discover remote workflows,
  or mutate n8n workflows. An `n8n` tag is only operator-authored text.
- **No service-administration actions:** There are no container restart buttons, arbitrary scripts,
  shell execution, Ollama pull/delete controls, or remote workflow mutation. Prompt and Workflow
  Link CRUD are limited to the Hub's local SQLite registry.
- **No cloud AI integration:** The application does not use OpenAI or another hosted model provider.
- **No authentication:** This is why public or untrusted network exposure is prohibited.

Adding any of these capabilities requires explicit approval and separate authentication, authorization, audit, least-privilege, failure-mode, and abuse-case design.

## Secrets and environment files

- Secrets must stay in an ignored local .env file or an appropriate external secret manager and must never be committed.
- The Python application reads process environment variables; it does not open or parse .env itself.
- Vite disables automatic `.env` loading with `envDir: false`; its proxy and bind overrides come
  only from explicit process variables.
- Docker Compose may load .env through normal Compose behavior. Treat rendered Compose configuration and container inspection as potentially sensitive when environment values exist.
- The committed .env.example contains safe local examples only.
- Do not put credentials in OLLAMA_BASE_URL. The client rejects user information, query strings, fragments, and non-root URL paths.
- Do not put credentials, signed tokens, or other secrets in a saved workflow URL. Workflow-link
  user information is rejected, but allowed query strings and fragments are deliberately preserved
  and are not inspected for secrets.
- Do not log complete environment variables, database URLs, headers, raw transport exceptions, or upstream response bodies.

Common real-secret files, local databases, dependency directories, and generated output are excluded by .gitignore and Docker build contexts. Ignore rules are defense in depth, not permission to inspect secret files.

## Network boundaries

Host development ports are published as:

- 127.0.0.1:5173 for Vite;
- 127.0.0.1:8000 for FastAPI.

Containers listen on 0.0.0.0 only inside their private Compose network so host loopback publishing can reach them. Changing the host side to 0.0.0.0 or placing a reverse proxy in front of the services changes the security model and requires approval.

The browser uses relative paths through the Vite proxy rather than a broad CORS policy. The API currently exposes FastAPI's development documentation when running in development mode; that is another reason not to publish it.

## Ollama connection safety

The Ollama integration is read-only and calls only /api/tags.

- Base URLs must be credential-free HTTP or HTTPS origins with a host and root path.
- Invalid configuration fails closed before an HTTP request is created.
- Credential-bearing or malformed input is never reflected in API responses.
- httpx uses trust_env=False, so ambient HTTP proxy and certificate environment variables do not redirect the request.
- Transport, HTTP, and payload failures become fixed user-facing messages without raw exception or response content.

The status response still reveals a valid configured Ollama origin, and the model endpoint reveals installed model names, dates, and sizes. Treat that as local service metadata. An operator who makes Ollama reachable from Docker must also secure Ollama's listen address and host firewall.

## Prompt Registry data exposure and deletion

Local model prompts may contain sensitive data: proprietary source code, personal information, credentials copied by mistake, internal documents, or private conversations.

Phase 1A exposes prompt data through an unauthenticated local API:

- list responses reveal titles, bounded content previews, tags, and timestamps;
- single-item, create, and update responses include full raw prompt content;
- any client that can reach the API can create, change, or permanently delete prompts;
- prompt content is displayed as raw text and is not interpreted as Markdown or HTML;
- Copy writes the exact prompt content to the browser/operating-system clipboard only after an explicit
  operator click. Clipboard history, synchronization, and access by other local software are outside the
  Hub's control.

Prompt data lives in SQLite:

- non-Docker development uses an ignored database below backend/ by default;
- Compose stores the database in the hub-data named volume;
- docker compose down retains that volume;
- docker compose down --volumes deliberately deletes it.

Prompt deletion is a hard delete with a confirmation dialog and no application-level undo, archive, or
restore. SQLite pages, filesystem snapshots, volume backups, clipboard history, and exported bundles
may retain copies; hard delete is not a secure-erasure guarantee. Local-first storage and portable
transfer do not automatically provide encryption, backups, retention controls, or secure deletion.

## Workflow Links data exposure and destination isolation

Workflow links may point to localhost, private-network services, repository pages, dashboards,
documentation, or provider UIs. The complete saved URL can itself be sensitive:

- list responses expose title, complete URL, bounded description preview, tags, and timestamps;
- single-item, create, and update responses expose the complete URL and raw-text description;
- allowed query strings and fragments may contain opaque tokens, signed parameters, record IDs, or
  other private context even though URL user information is rejected;
- any client that can reach the unauthenticated API can create, replace, or permanently delete
  stored references;
- Copy writes the exact persisted URL to the browser/operating-system clipboard only after an
  explicit click. Clipboard history, synchronization, and other local software remain outside the
  Hub's control.

Saving a link is not a connectivity test or integration. The application has no destination HTTP
client, redirect endpoint, proxy endpoint, metadata scraper, favicon request, iframe, prefetch,
provider SDK, or `window.open` call. Rendering, listing, selecting, searching, editing, saving,
copying, and deleting a record do not contact its target.

**Open saved link** is an explicit browser anchor shown only for a persisted URL that passes the
runtime browser safety check. It uses a new tab, `rel="noopener noreferrer"`, and
`referrerPolicy="no-referrer"`. The action can still navigate to a dangerous or compromised site;
validation establishes URL syntax and browser handling, not destination trust, ownership,
availability, or content safety. Operators must inspect destinations and protect the services they
open.

Workflow-link deletion removes only the local SQLite reference. It does not contact or delete the
remote/local destination and has no application-level undo. As with prompts, database pages,
filesystem snapshots, backups, browser history, and clipboard history may retain copies; hard
delete is not secure erasure.

## Import/export data boundary

Phase 1C exports every Prompt followed by every Workflow Link into one versioned JSON bundle. The
file can contain complete prompt text, descriptions, internal hostnames, query strings, fragments,
or signed URL material. Protect it like the SQLite database. After download, browser history,
filesystem permissions, backups, synchronization software, and other local processes are outside
the Hub's control. The Hub does not encrypt, password-protect, sign, securely erase, or manage the
retention of a bundle.

- Export starts only after an explicit operator action. Successful transfer responses use
  `Cache-Control: no-store`, `Pragma: no-cache`, and `X-Content-Type-Options: nosniff`; these reduce
  application-controlled caching but cannot erase an intentionally downloaded file.
- Import accepts only selected local UTF-8 JSON content. It accepts no remote URL, network share,
  server filesystem path, SQLite file, or application-side file lookup. Workflow Link URLs remain
  inert strings and are never resolved, fetched, previewed, or dereferenced during transfer.
- Selected JSON is bounded to 10 MiB and remains in private browser memory for the active flow. It
  is not placed in localStorage, sessionStorage, IndexedDB, the page URL, service workers, or a
  module cache, and is released on clear, replacement, confirmed navigation, success, or unmount.
- Preview strictly validates the complete bundle and duplicate counts without mutation. Import
  independently revalidates the same raw content and appends all valid records in one transaction;
  any write failure rolls back the complete import.
- Validation responses expose only bounded issue locations and fixed messages. Request bodies,
  filenames, prompt content, descriptions, complete URLs, raw exceptions, and submitted values are
  not reflected into transfer errors or application logs.
- Exact duplicates are warnings, not conflicts: confirmation imports them as new records with fresh
  local IDs and timestamps. Version 1 transfer is not backup, restore, synchronization, merge,
  deduplication, or secure deletion.

## Dependency and build safety

- Backend and frontend dependencies are locked with uv.lock and pnpm-lock.yaml.
- Docker builds use the frozen locks.
- `make build` supplies an explicit safe Ollama URL and `/dev/null` Compose env file so build
  validation does not implicitly interpolate an ignored local `.env` file.
- Real environment files and local databases are excluded from Docker contexts.
- Compose does not use privileged mode or the Docker socket.
- Development images and source mounts are not a production hardening profile.

Review dependency changes, lockfile diffs, image-base changes, and migration changes before committing them.

## Before any network-exposed deployment

At minimum, design and verify:

1. authentication and secure session handling;
2. authorization for every read and future action;
3. TLS and trusted-origin policy;
4. restrictive firewall and bind-address policy;
5. rate limiting and abuse handling;
6. secret management and rotation;
7. security headers and production-safe API documentation settings;
8. audit events without sensitive prompt content;
9. backup, restore, retention, and secure deletion;
10. dependency, container-image, and application security review.

Until that work exists, keep Local AI Workflow Hub on a trusted localhost.
