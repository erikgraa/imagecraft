# Development, hosting, and releases

## Local development

Use Node.js 22 or newer (CI and the container use Node.js 24):

```sh
npm ci
npm run check
npm start
```

Open http://localhost:8080. Set `PORT` to change the listening port. The server binds to all interfaces; use a firewall or reverse proxy when exposing it publicly.

The root URL opens **Understand**. Direct links use `?view=compose`, `?view=pipeline`, `?view=build`, or `?view=templates`; `?view=learn` also opens Understand. Unknown views fall back to Understand. The Imagecraft brand is a keyboard-accessible home link. In-app navigation updates browser history without replacing the current recipe or color/pipeline preferences. Verify reloads, Back/Forward, and edited recipes when changing navigation.

There are no runtime package dependencies. The development-only YAML parser validates downloaded pipelines and repository workflows. Tests cover ordering, pipeline generation, static serving, and release-note extraction. CI also lints Actions and builds and smoke-tests the container.

## Files

- `public/`: the chosen app, its two browser helpers, and custom-domain CNAME. Only this folder is deployed to Pages.
- `server.cjs`: static asset allowlist; never executes submitted recipes.
- `tests/` and `scripts/`: checks and release utilities; not served to visitors.
- `Dockerfile`: non-root Node.js static server, listening on port 8080.
- `.github/workflows/delivery.yml`: CI, Pages, GHCR, and release automation.

Do not change the existing browser-storage keys without a migration. Keep generated build credentials as secret references. The generated OS build workflows are distinct from Imagecraft's own hosting workflow.

## Container hosting

Build locally if you do not want the published image:

```sh
docker build -t imagecraft .
docker run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges -p 8080:8080 imagecraft
```

Podman accepts the same commands. No persistent volume or RHEL entitlement is required to host Imagecraft. Its container includes only the server and public assets. Published images support Linux amd64 and arm64; your container tool selects the matching architecture. Both platforms run native non-root, read-only HTTP smoke checks before publication. Use a reverse proxy for HTTPS outside localhost.

CI publishes the exact checked platform images by digest, verifies a combined image index, then promotes that index to the appropriate public tags. Internal `checked-<run>-<attempt>-<arch|index>` staging tags remain in GHCR; use `edge` or a numbered release instead. Digest receipts are retained for seven days. Failed-job reruns can reuse a successful architecture from the same run and commit; after receipt expiry, rerun both architecture jobs.

## Deployment

Pull requests run tests and container HTTP checks but cannot publish images, deploy Pages, or create releases. A push to `main` publishes `ghcr.io/erikgraa/imagecraft:edge` and deploys `public/` to GitHub Pages. A manual run on main can redeploy Pages and runs container checks, but does not publish images.

Repository settings must enable Pages with GitHub Actions as its source and allow package publication. Set the Pages custom domain to `imagecraft.graa.dev`, its DNS CNAME to `erikgraa.github.io`, and enable HTTPS after certificate approval. The domain settings are already configured; `public/CNAME` preserves the intended hostname.

GHCR package visibility is separate from repository visibility. After the first publication, the owner must make the Imagecraft package **public** if it is not already public. Verify an unauthenticated image pull before recommending it to users. OCI source labels associate the package with this repository.

Actions use pinned commits; review upstream changes before updating them. Dependabot checks npm, Docker, and GitHub Actions weekly on Monday mornings (Europe/Oslo), grouping npm and Actions updates. Keep the base Node image supported and rebuild regularly for security updates.

## Numbered releases

No numbered release is declared by this initial setup. When a release is ready:

1. Move the relevant Unreleased changes into a dated heading such as `## [0.1.0] - 2026-11-09`, leaving Unreleased for future changes. That heading must have at least one change bullet.
2. Commit the changelog on main and let its checks pass.
3. Validate locally: `node scripts/release.cjs v0.1.0` (the generated `release-notes.md` is ignored).
4. Create and push the matching `v0.1.0` tag pointing at the reviewed main commit.

Version numbers and dates above are examples, not released versions. Tags must be `vX.Y.Z` or `vX.Y.Z-prerelease`, refer to a main-branch commit, and have an exact matching dated changelog entry. The tag workflow validates first, builds and checks the image, publishes `:X.Y.Z`, and creates a GitHub release from that entry only. Stable tags also update `:latest`; publish stable tags in increasing order. Prerelease tags publish only their exact version image and create a prerelease, without moving stable `latest` in GHCR or GitHub Releases. There are no shortened major/minor tags or npm publications.

Treat published tags as immutable. A rerun leaves an existing GitHub release unchanged. No license is selected by this setup; the repository owner should choose one before promising reuse rights.
