# BUILD_LOG.md — `tabletop-reveal`

- **App Name:** `tabletop-reveal`
- **App ID:** `app_01M84QHVDQS2NWMNQZPSJJHWMD`
- **Live URL:** `https://tabletop-reveal.app.space`
- **GitHub Remote:** `git@github.com:bcheema2/Tabletop-reveal.git` (`main`)
- **SDK Version:** `deepspace` `0.44.2`

---

## 1. Auth & Session APIs

### Server-Side (`src/server/http-routes.ts`, `src/server/action-routes.ts`, `src/server/realtime-routes.ts`)
- **Bearer JWT verification (`resolveAuth`):** Extracts `Authorization: Bearer <token>` and calls `verifyJwt({ publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }, token)` from `deepspace/worker`, returning `VerifyResult | null`[cite: 2, 3].
- **Agent token verification (`resolveAgentAuth`):** Extracts `Bearer <token>` and calls `verifyAgentToken(jwtConfig(env), token, new URL(req.url).origin)` scoped to the exact request origin.
- **Session cookie / read fallback:** `SESSION_COOKIE` is set on `/api/auth/oauth-complete` (`HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`) and cleared on `/api/auth/sign-out`[cite: 3]. `resolveSessionReadAuth(c.req.raw, c.env)` from `deepspace/worker` is used as a fallback on `/api/files/*` so same-origin media requests (`<img>`, `<audio>`, `<video>`) can authenticate via session cookie[cite: 3].
- **App role lookup (`resolveAppRole`):** Calls `resolveAppRole(env, userId)` from `deepspace/worker` to check roles such as `'admin'` or `'member'` (used on `/api/debug/*`, `/ws/canvas/:docId`, `/ws/cron/:roomId`, and `AppJobRoom`)[cite: 3, 4, 5].
- **WebSocket identity forwarding (`authenticatedRoomRequest`):** WebSocket routes in `src/server/realtime-routes.ts` read `?token=...`, verify via `verifyJwt`, optionally attach `{ role }`, and call `authenticatedRoomRequest(c.req.raw, auth, extraIdentity)` before forwarding to the Durable Object stub[cite: 4].

### Client / Route Layouts (`src/pages/(app)/_layout.tsx`, `src/pages/(app)/(protected)/_layout.tsx`)
- **`src/pages/(app)/_layout.tsx` (Dynamic app boundary):** Wraps routes in `<DeepSpaceAuthProvider>`, waits for `useAuthStatus().isLoaded`, and mounts `<RecordProvider allowAnonymous onWriteError={...}>` and `<RecordScope roomId={SCOPE_ID} schemas={schemas}>` with `<AgentTools />`.
- **`src/pages/(app)/(protected)/_layout.tsx` (Sign-in gate):** Wraps nested protected routes in `<AuthGate fallback={<SignedOutPanel />}>`, where `SignedOutPanel` opens `<AuthOverlay />` on demand without leaving app chrome.

---

## 2. Database & Storage APIs

- **SQLite-backed Durable Objects (`worker.ts`):** `__DO_MANIFEST__` declares six `sqlite: true` Durable Object classes (`AppRecordRoom`, `AppYjsRoom`, `AppCanvasRoom`, `AppPresenceRoom`, `AppCronRoom`, `AppJobRoom`) backed by `deepspace/worker` room classes[cite: 5].
- **RecordRoom (`AppRecordRoom`):** Constructed with `super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID })` and addressed via `env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(\`app:\${env.DEEPSPACE_APP_ID}\`))`[cite: 2, 4, 5].
- **Action tools (`createActionTools` in `src/server/action-routes.ts`):** Executes record operations (`records.create`, `records.update`, `records.delete`, `records.deleteWhere`, `records.get`, `records.query`) and `users.register` against the app's `RecordRoom` at `https://internal/api/tools/execute` with `X-User-Id` and `X-App-Action: 'true'`.
- **Scoped files (`src/server/http-routes.ts`):** `/api/files/*` proxies to `/internal/files/*` via `platformWorkerFetch`, stripping caller `x-user-id` and re-asserting app identity headers from worker bindings (`APP_IDENTITY_TOKEN`, `DEEPSPACE_APP_ID`)[cite: 3, 5].
- **Schemas (`src/schemas/users-schema.ts`, `src/schemas/admin-schema.ts`):** Uses `CollectionSchema` from `deepspace/schema` with column storage/interpretation declarations and role-based `permissions` (`viewer`, `member`, `admin`, plus `'own'` record access on `users`)[cite: 7, 8].

---

## 3. Realtime Sync & Actions APIs

- **WebSocket room endpoints (`src/server/realtime-routes.ts`):**
    - `/ws/:roomId` -> `env.RECORD_ROOMS`[cite: 4]
    - `/ws/yjs/:docId` -> `env.YJS_ROOMS` (requires auth; resolves `'admin' | 'member' | 'viewer'` from the `documents` collection via `records.get` using `env.OWNER_USER_ID`, checking `doc.ownerId`, `doc.editors`, and `doc.collaborators`)[cite: 4]
    - `/ws/canvas/:docId` -> `env.CANVAS_ROOMS` (attaches `resolveAppRole` when authenticated)[cite: 4]
    - `/ws/presence/:scopeId` -> `env.PRESENCE_ROOMS`[cite: 4]
    - `/ws/cron/:roomId` -> `env.CRON_ROOMS` (attaches `resolveAppRole` when authenticated; anonymous connections are read-only viewers)[cite: 4]
    - `/ws/jobs/:roomId` -> `env.JOB_ROOMS`[cite: 4]
- **Server actions (`src/server/action-routes.ts`):** `POST /api/actions/:name` resolves `auth` and requires a `Bearer <jwt>` header (`callerJwt`), looks up own keys via `lookupOwn(actions, name)`, and invokes `action({ userId, params, tools, env, callerJwt })`.

---

## 4. Starter Defaults & Gotchas Observed

1. **Actions run with per-record RBAC OFF (`X-App-Action: 'true'`):** `createActionTools` sets `X-App-Action: 'true'`, disabling per-record RBAC inside `RecordRoom`. Any action receiving an ID in `params` **must** explicitly load the record and verify ownership/`userId` before reading, updating, or deleting (including `tools.deleteWhere`, which enforces a non-empty `where` and `limit` cap of 500, but does not enforce ownership).
2. **`resolveAuth` vs. `callerJwt` on `/api/actions/:name`:** Even if `resolveAuth` succeeds, `/api/actions/:name` explicitly requires a `Bearer ` token in `Authorization` and returns `401` without one so user-billed integrations have a raw JWT to forward.
3. **`<RecordProvider allowAnonymous>` in `(app)/_layout.tsx`:** Anonymous visitors can mount the dynamic app layer and data hooks unless a route is nested under `src/pages/(app)/(protected)/` (`<AuthGate>`)[cite: 10, 11].
4. **Optimistic writes are fire-and-forget:** Client record mutations surface rejections asynchronously via `RecordProvider`'s `onWriteError` callback rather than throwing synchronously[cite: 10].
5. **Strict route registration order in `worker.ts`:** Specific auth/native routes, realtime routes, action routes, agent routes, and platform proxies must precede `registerStaticRoutes` (`API_PREFIXES = ['/api']` returns JSON `404` for unmatched `/api/*` paths, and non-file SPA routes fall back to `/_spa` or `/`)[cite: 3, 5].
6. **Port `5173` & GitHub source lock:** `deepspace dev start` fails with `[port_in_use]` if `5173` is already bound; first deploy permanently claimed `bcheema2/tabletop-reveal` on `main` (disabling DeepSpace source verbs `push`/`pull`/`clone`/`workspace` for this app ID)[cite: 6].