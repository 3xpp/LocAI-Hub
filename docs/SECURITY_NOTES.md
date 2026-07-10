# Security Notes

## Phase 0 security posture

Local AI Workflow Hub is an unauthenticated, local development dashboard. Phase 0 is designed for one trusted operator on one machine. It is not a public service, remote administration plane, or production deployment profile.

> Do not expose the dashboard or API publicly without authentication, authorization, TLS, network policy, audit logging, and a dedicated threat model.

Loopback host bindings reduce accidental exposure; they are not a substitute for the missing controls.

## Explicit Phase 0 boundaries

- **No Docker socket access:** Neither the application nor Compose mounts /var/run/docker.sock. There is no Docker SDK or container-control API.
- **No n8n API key usage:** Phase 0 does not read N8N_API_KEY, call n8n, or mutate n8n workflows.
- **No administrative actions:** There are no container restart buttons, arbitrary scripts, shell execution, Ollama pull/delete controls, or workflow mutation.
- **No cloud AI integration:** The application does not use OpenAI or another hosted model provider.
- **No authentication:** This is why public or untrusted network exposure is prohibited.

Adding any of these capabilities requires explicit approval and separate authentication, authorization, audit, least-privilege, failure-mode, and abuse-case design.

## Secrets and environment files

- Secrets must stay in an ignored local .env file or an appropriate external secret manager and must never be committed.
- The Python application reads process environment variables; it does not open or parse .env itself.
- Docker Compose may load .env through normal Compose behavior. Treat rendered Compose configuration and container inspection as potentially sensitive when environment values exist.
- The committed .env.example contains safe local examples only.
- Do not put credentials in OLLAMA_BASE_URL. The client rejects user information, query strings, fragments, and non-root URL paths.
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

## Local data sensitivity

Local model prompts may contain sensitive data: proprietary source code, personal information, credentials copied by mistake, internal documents, or private conversations.

The Phase 0 Prompt table has no HTTP endpoints, but its future content will live in SQLite:

- non-Docker development uses an ignored database below backend/ by default;
- Compose stores the database in the hub-data named volume;
- docker compose down retains that volume;
- docker compose down --volumes deliberately deletes it.

Local-first storage does not automatically provide encryption, backups, retention controls, or secure deletion. These belong to later operational phases.

## Dependency and build safety

- Backend and frontend dependencies are locked with uv.lock and pnpm-lock.yaml.
- Docker builds use the frozen locks.
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
