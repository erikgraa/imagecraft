# Development, hosting, and releases

## Local development

Use Node.js 22 or newer (CI and the container use Node.js 24):

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm start
```

Open http://localhost:8080. Set `PORT` to change the listening port. The server binds to all interfaces; use a firewall or reverse proxy when exposing it publicly.

The root URL opens **Understand**. Direct links use `?view=compose`, `?view=pipeline`, `?view=build`, or `?view=templates`; `?view=learn` also opens Understand. Unknown views fall back to Understand. The Imagecraft brand is a keyboard-accessible home link. In-app navigation updates browser history without replacing the current recipe or color/pipeline preferences. Verify reloads, Back/Forward, and edited recipes when changing navigation.

There are no runtime package dependencies. YAML, Playwright and axe are development-only. `npm run check` covers recipe normalization/generation, file/path/credential heuristics, binary/base64 and USTAR exports, stage ordering/pins, pipeline YAML, static serving, release-note extraction and multi-platform publication guards. It does not require a browser.

`npm run test:browser` starts and stops its own static server, then runs Chromium keyboard/semantic/axe checks across desktop (1280×900) and mobile (390×844), in light and dark. Coverage includes the Understand homepage, direct-link reloads, mouse/keyboard logo home navigation, Back/Forward and recipe/preference preservation, composition and preview controls, skip navigation, row reordering/boundaries/focus, COPY/file reselection, stage and pin options, persistent error associations (including file rejection with collapsed options), real JSON/tar downloads and import round-trips, reviewed pin confirmation/version-change clearing, templates, guided disclosures and each provider, plus terminal command-copy accuracy, invalid-recipe disabling and clipboard-denial/unavailability fallback. Artifact coverage checks all three formats, native-architecture constraints, invalid public-key/reference/user rejection, exact TOML/script downloads, signing/lifecycle copies and in-memory-only wizard inputs. Initial-HTML crawler/PNG checks do not require a browser. Terminal copying must exclude decorative prompts/comments and never execute commands; keep installed-host update and rollback actions separate. All axe rules run without exclusions; a passing result is not a WCAG certification or a screen-reader test. Screenshots are saved in `test-results/`; failures retain traces and screenshots there. These ignored files can contain recipe content: review before sharing.

The default browser-test port is 18374; set `IMAGECRAFT_TEST_PORT` to an unused port if needed. Tests refuse to reuse an existing server, so they cannot accidentally validate another checkout. On Linux install browser system dependencies with `npx playwright install --with-deps chromium` (normal package-install permissions required). The actual delivery `check` job runs both commands before native container checks, publication, Pages and release jobs. CI also runs actionlint. Browser packages are not copied into the runtime image or deployed to Pages.

## Files

- `public/`: the chosen app, its four browser helpers, real social-preview PNG and custom-domain CNAME. Only this folder is deployed to Pages.
- `server.cjs`: static asset allowlist; never executes submitted recipes.
- `tests/` and `scripts/`: checks and release utilities; not served to visitors.
- `Dockerfile`: non-root Node.js static server, listening on port 8080.
- `.github/workflows/delivery.yml`: CI, Pages, GHCR, and release automation.

Do not change the existing browser-storage keys without a migration. Keep generated build credentials as secret references. The generated OS build workflows are distinct from Imagecraft's own hosting workflow.

## Editor architecture and portable recipes

`public/index.html` owns the UI, guidance, focus management and browser preferences. `recipe-order.js` implements identity-preserving sorting, `recipe-engine.js` handles normalized recipes, validation, Containerfiles, portable JSON and USTAR folders, `pipeline-generator.js` produces provider YAML, and `installation-generator.js` produces QCOW2/raw/VMDK build commands, initial-user TOML and illustrative signing/verification commands. The disk wizard uses the recipe destination and RHEL major version, with a separate optional published-reference override; never substitute the Containerfile's base pin for that published OS digest. Wizard inputs, including SSH public keys, stay in memory and are not added to portable recipes or browser storage. Helpers work in the browser without runtime dependencies and are tested directly with Node. Keep generation separate from execution: the hosting server serves an asset allowlist only and has no build, upload, registry-login or credential endpoints.

The browser key `imagecraft-ordered-recipe-v1` retains normalized recipe text/settings, not file bytes. Existing rows migrate to the expanded recipe shape without changing their identities/order. Preserve that key and the color/provider keys. Saved COPY recipes require reselection after reload. Optional review is local and heuristic; it does **not** query package availability or guarantee secret detection.

Portable exports use this envelope (the fields below describe the schema, not a ready-to-build recipe):

```json
{
  "format": "imagecraft-recipe",
  "schemaVersion": 2,
  "recipe": {
    "version": "10",
    "image": "quay.io/example/os:latest",
    "name": "example.recipe",
    "digest": "",
    "stages": [],
    "rows": [],
    "files": {}
  }
}
```

Rows carry unique IDs, type/value and applicable stage/source/destination/mode/from fields. `stages` contain unique names and qualified bases; the final `os` stage is reserved. `files` maps referenced safe `files/` paths to canonical base64 bytes. Schema version 2 is the only supported portable envelope; unknown versions are rejected, not silently migrated. Limits are 100 rows, 10 builders, 5 MiB per decoded file, 20 MiB total decoded files and 30 MiB JSON input. The UI checks input file bytes before reading; the engine also bounds serialized input and decoded bytes. Path/credential rules deliberately reject some legitimate names, but cannot identify every secret.

The complete `.tar` build folder is USTAR with referenced files, generated Containerfile, allowlist `.containerignore`/`.dockerignore`, and the selected provider workflow at its expected path. It is not a disk/installer artifact. Extract into a **new empty directory**, review text and bytes, then build from that directory or commit the entire folder at the repository root. A standalone Containerfile does not carry local COPY files. JSON and tar exports are not encrypted and may disclose sensitive content; never commit build credentials or use ARG, ENV or LABEL for secrets. Use CI secret stores and separate runtime provisioning.

## External validation: required evidence, not automated claims

Hosting tests validate Imagecraft's own static app/container, **not** generated RHEL images. Entitled RHEL builds/boots, real provider runs, screen-reader/user feedback and a first numbered release remain external gates. Do not mark them complete from YAML parsing, `bootc container lint`, axe results or illustrative starter output.

### RHEL entitlement, packages, build and boot

1. Choose a supported RHEL release, target architecture and an authorized disposable Linux build host. Record RHEL/Podman/bootc/bootc-image-builder versions and host architecture. Configure registry authentication and container-build package entitlement separately using official instructions; keep credentials outside source/build context and redact logs.
2. Export each starter/build folder from a recorded Imagecraft commit, inspect it, and retain its source commit or archive hash. Test RHEL 9 and 10 and each architecture you intend to support; record explicit untested combinations. Resolve all package names against the selected entitled repositories. Record repository configuration without secrets, package versions and build/lint logs. Pin/review the bootc base digest and every builder base independently; verify builder artifact ABI, libraries and architecture.
3. Build with Podman on that host, retain the resulting immutable image digest, and use bootc-image-builder with reviewed users/disk/target configuration to create the VM/installer artifact. A successful OCI build or lint is not boot evidence.
4. Boot a disposable target. Record deployment digest, boot/health logs, enabled service results, network/firewall access and enforcing SELinux state. Verify copied file permissions, ownership and contexts, not just chmod. Test initial configuration under `/etc`, first-run state initialization under `/var`, and persistence across reboots.
5. Rebuild against a deliberately reviewed refreshed base digest. On staging, test an upgrade with representative application data and locally modified `/etc` configuration; record conflict/merge behavior. Verify the active deployment after reboot. Roll back to the known-good deployment and verify application/data compatibility. OS rollback does not undo `/var` migrations: retain backup/restore rehearsal evidence and recovery instructions. Consult the selected release's bootc target-change/update procedure for digest-pinned hosts.

Use the [Red Hat getting-started guide](https://developers.redhat.com/products/rhel-image-mode/getting-started), [bootc filesystem reference](https://bootc-dev.github.io/bootc/filesystem.html) and [bootc documentation](https://bootc-dev.github.io/bootc/). Report entitlement/architecture/tooling failures as blockers, never bypass them or publish secrets in evidence.

### Disk artifacts, lifecycle and signature validation

The wizard is generation-only and intentionally uses the legacy RHEL 9/10 `bootc-image-builder` entry point, native host architecture, source-default root filesystem and SSH-public-key-only user customization. It does not run builds, enable cross-architecture emulation, create an OVA/ISO or write a hardware disk. Rootful Podman authentication/storage and package entitlement are separate. `wheel` without a password does not imply usable sudo; test reviewed SSH/console/admin provisioning.

Reference review used the [official compatibility notice](https://osbuild.org/docs/bootc/deprecation-notice/), [legacy builder configuration/types](https://github.com/osbuild/bootc-image-builder/blob/a686afed6dde14fa5444a3d3be0f269acc783470/README.md), [legacy output-path tests](https://github.com/osbuild/bootc-image-builder/blob/a686afed6dde14fa5444a3d3be0f269acc783470/test/test_build_disk.py) and [Broadcom disk conversion reference](https://knowledge.broadcom.com/external/article/343140/cloning-and-converting-virtual-machine-di.html). The latter requires reviewed VM firmware/controller settings; disk conversion alone is not deployment evidence. Raw's legacy output is `output/image/disk.raw`, not `output/raw/disk.raw`. Current unified image-builder flags must not be mixed into these compatibility commands.

The RHEL 9 and 10 full manuals returned HTTP 403 during implementation, including native HTTP retrieval. Do not treat this as completed minor-release validation: check the [RHEL 9 manual](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html-single/using_image_mode_for_rhel_to_build_deploy_and_manage_operating_systems/index) and [RHEL 10 manual](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html-single/using_image_mode_for_rhel_to_build_deploy_and_manage_operating_systems/index), entitled builder availability and your installed versions before real use. Record untested combinations rather than inferring them from generated commands.

Lifecycle guidance follows upstream [upgrade](https://bootc.dev/bootc/man/bootc-upgrade.8.html), [switch](https://bootc.dev/bootc/man/bootc-switch.8.html) and [rollback](https://bootc.dev/bootc/man/bootc-rollback.8.html): staging is not activation, a fixed digest needs deliberate promotion, rollback discards staged updates, `/var` is persistent and the previous deployment's `/etc` is reused. Rehearse updates, reboot, rollback and update-agent coordination with representative data.

Signing examples follow official [Cosign OCI signing](https://docs.sigstore.dev/cosign/signing/signing_with_containers/), [blob signing](https://docs.sigstore.dev/cosign/signing/signing_with_blobs/) and [verification](https://docs.sigstore.dev/cosign/verifying/verify/). They use pre-existing key-path placeholders, never generate or accept private keys. Sign/verify the published OCI digest separately from disk bytes. Confirm bundles with the installed Cosign version and distribute verification keys through an independent trust channel. Checksum comparison is not authenticity. Converted/multi-file VMDKs require signatures for each final distributed file; none of these signatures establishes Secure Boot trust.

Standalone Cosign verification does not enforce future bootc pulls. Review [bootc security](https://github.com/bootc-dev/bootc/blob/main/docs/src/bootc-security.7.md), the [containers/image policy](https://github.com/containers/image/blob/main/docs/containers-policy.json.5.md) and registry signature discovery against the exact release. Current Cosign OCI 1.1 referrers and older attachment discovery may not interoperate automatically. Preserve vendor policies, configure scoped trust, and prove signed acceptance plus unsigned/wrong-key/wrong-repository rejection on a disposable host. These RHEL builds, vSphere imports, real signatures and policy-enforcement tests have **not** been performed by browser or Node checks.

### Social link previews

The initial `public/index.html` head contains the canonical URL, Open Graph and large-image card metadata with absolute public HTTPS URLs. `public/social-preview.png` is an actual locally rendered 1200×630 homepage screenshot, not a mock image. `tests/social-metadata.test.cjs` checks initial HTML as a Discordbot without executing JavaScript, plus PNG MIME, dimensions and GET/HEAD delivery on the local server.

After an authorized deployment, fetch the public homepage with a crawler user-agent and fetch `https://imagecraft.graa.dev/social-preview.png` to confirm status, headers and bytes. Local checks are not public deployment or Discord validation. Discord can cache old/absent embeds; a corrected server does not force immediate refresh of previously pasted links. No deployment is authorized by these checks.

### Actual runs on every supported provider

Run the exported workflow separately on GitHub Actions, GitLab CI and Azure DevOps using the runner labels/pool and protected branch specified by that generator. Configure the named secret variables in the provider's secret store, grant least-privilege registry access and configure package entitlement on the runner. Run only reviewed source on a dedicated/disposable runner; a private temporary auth file is not a build sandbox. Verify cleanup after both success and a deliberately failed build without exposing secret values.

Retain each provider's run URL/ID, source commit, runner OS/architecture and Bash/Podman versions, redacted entitlement/build/push logs, destination repository and commit/run-tagged image digest. Verify that the pushed digest is the tested build, then boot-test it. Review non-publication behavior for untrusted/PR sources and enforce branch/environment controls. Syntax validation does not prove these runner guards or secret masking work in a real provider. Boot tests, SBOM/scanning, signing and protected promotion are additional gates, not implemented by these generated build-and-publish starters.

### Screen readers and user feedback

Record app commit/URL, OS/browser/screen-reader versions, viewport, color mode, zoom and input method. At minimum test keyboard-only navigation and NVDA with a supported Windows browser, and VoiceOver with Safari on macOS/iOS where available. Additional assistive-technology combinations should be listed explicitly, not assumed covered by Chromium.

Exercise skip navigation, every guided view, theme/version/provider state announcements, all six templates and replacement confirmations, options disclosure, COPY selection/reselection, pin/stage validation, import rejection, successful exports, keyboard ordering/boundaries and focus after duplicate/remove/reset. Verify errors are announced and associated with their controls, status updates do not repeatedly interrupt reading, hidden views are absent from the reading/tab order, and overflowing preview/YAML regions can be scrolled by keyboard. Test 200%/400% zoom and narrow layouts; seek feedback from people using assistive technology with consent. Save anonymized task outcomes, observed problems and follow-up issue links, not identifying details. Automated checks are regression aids, not WCAG certification or proof of screen-reader usability.

A release decision needs reviewed evidence/gaps for all applicable gates above, passing actual repository CI, and the owner's license/release approval. This procedure does not create or authorize a release.

## Container hosting

Build locally if you do not want the published image:

```sh
podman build -t imagecraft .
podman run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges -p 8080:8080 imagecraft
```

For Docker, replace `podman` with `docker`. No persistent volume or RHEL entitlement is required to host Imagecraft. Its container includes only the server and public assets. Published images support Linux amd64 and arm64; your container tool selects the matching architecture. Both platforms run native non-root, read-only HTTP smoke checks before publication. Use a reverse proxy for HTTPS outside localhost.

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
