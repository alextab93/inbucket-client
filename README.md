# Inbucket Client

Inbucket Client is an authenticated Rails and React interface for an Inbucket server. It reads Inbucket's REST API and monitor websocket, keeps only user metadata and bounded message summaries in PostgreSQL, and leaves message bodies and source in Inbucket storage.

The client receives all deployment-specific values through environment variables. StartOS supplies them from its package configuration. A standalone deployment uses the same contract through `compose.yaml`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for users, sessions, indexed metadata, rules, and delivery records. |
| `SECRET_KEY_BASE` | Rails cookie and message-verification secret. |
| `INBUCKET_BASE_URL` | Base HTTP URL for the Inbucket REST API and monitor websocket. |
| `CLIENT_PUBLIC_URL` | External URL included in notification links. |
| `ADMIN_USERNAME` | Account created or synchronized during deployment preparation. |
| `ADMIN_PASSWORD` | Password for that account. Changing it invalidates active sessions. |
| `LUA_EVENT_TOKEN` | Shared secret used only by Inbucket's generated hook when reporting stored-message events. |
| `LUA_SCRIPT_PATH` | Writable shared path where the client writes Inbucket's generated hook. |
| `LUA_CALLBACK_URL` | URL reachable from Inbucket for the generated hook. It must end in `/v1/internal/rule-events`. |
| `LUA_COMPILER` | Lua compiler used to validate generated hook source before it replaces the active file. |
| `OUTBOUND_SMTP_ENABLED` | Enables notification email only when set to `true`. |
| `OUTBOUND_SMTP_HOST`, `OUTBOUND_SMTP_PORT`, `OUTBOUND_SMTP_USERNAME`, `OUTBOUND_SMTP_PASSWORD`, `OUTBOUND_SMTP_FROM`, `OUTBOUND_SMTP_SECURITY` | SMTP configuration for notification email. `OUTBOUND_SMTP_SECURITY` is `tls` or `starttls`. |

The browser never receives these values. The frontend uses relative `/v1/*` requests and an HttpOnly session cookie.

## Standalone deployment

Copy `.env.example` to `.env`, replace every placeholder secret, set the accepted mail domain, then run:

```sh
docker compose up --build
```

The compose stack starts PostgreSQL, prepares the client database and generated hook, starts Inbucket, then starts the web client, monitor, reconciler, and notification-delivery worker. The web client is available at `http://localhost:3000`, and Inbucket accepts SMTP on port `2500`.

The generated hook uses `LUA_CALLBACK_URL=http://client:3000/v1/internal/rule-events` inside the Compose network. StartOS supplies its own loopback callback URL because its Inbucket and client processes share a subcontainer.

## Development

```sh
npm ci
npm run check
npm test
npm run build
bundle install
bundle exec rspec
```

The Rails suite needs PostgreSQL. The Compose stack provides the same service topology used for standalone operation.

## Container releases

Pushing a version tag beginning with `v` publishes `ghcr.io/alextab93/inbucket-client:<tag>` for `linux/amd64` and `linux/arm64`.

Use the published digest, rather than the tag alone, when another deployment system consumes the image:

```text
ghcr.io/alextab93/inbucket-client:<tag>@sha256:<digest>
```

The StartOS wrapper pins that digest in its manifest before building an S9PK.

Set the resulting GitHub Container Registry package visibility to public before the wrapper consumes it. Community package builds and installations cannot require registry credentials.
