# Changelog

Notable changes are recorded here. Work under **Unreleased** has not been published as a numbered release.

## [Unreleased]

### Fixed

- Fingerprinted recipe-engine loading prevents a cached pre-ADD helper from breaking recipe rendering and template loading after a deployment; existing recipes and browser preferences are not cleared.

### Added

- Signing and verification guidance for published OCI images and generated disk files, distinguishing bootc trust policy, detached signatures, checksums and Secure Boot.
- Guided bootc status, upgrade, target switch and rollback walkthrough with separate staging/reboot expectations and persistent-data warnings.
- Installation artifact command/config wizard for QCOW2, raw disks and a documented vSphere VMDK import path; generated output is not a tested build or deployment.
- Initial-HTML Open Graph and large-image card metadata with a real 1200×630 homepage preview served by Pages and the static container.
- Public Imagecraft workbench, with RHEL 9/10 selection and six illustrative starter recipes with compatibility notes.
- Ordered local-file COPY, LABEL, ARG, ENV, WORKDIR, named builder stages, and earlier-stage artifact copies.
- First-class ADD steps for local files/opaque archives and HTTPS file URLs (not Git), with octal permissions, directory destinations, local-byte JSON/build-folder exports and source-specific reload validation. The app never downloads URL content or unpacks selected archives; ADD behavior happens at build time.
- Complete build-folder TAR downloads including exact referenced files, ignore rules, and the selected provider workflow.
- Versioned portable JSON recipes with embedded files, old-recipe migration, and explicit file-reselection warnings after reload.
- Optional manually reviewed sha256 base-image pins, cleared when the selected RHEL version changes.
- Optional local recipe review hints that do not verify package availability.
- Ordered package, command, and service editing with pointer, touch, and keyboard sorting.
- Browser-local recipe, theme, and workflow-provider preferences.
- Containerfile and build-command export, plus GitHub, GitLab, and Azure workflow downloads.
- Light and dark themes and responsive layouts.
- Expanded guidance on credentials, local files, builder compatibility, persistent state, SELinux, protected runners, and updates/rollback.
- Dev-only Playwright/axe browser checks for desktop/mobile and light/dark themes, including real file import/export, keyboard focus, validation errors, and all guided views. Manual screen-reader and user testing remain outstanding.
- Improved skip/navigation and recipe-row focus, pressed states, associated persistent option/file errors, keyboard-scroll regions, and light-theme contrast.
- GitHub Pages hosting at imagecraft.graa.dev.
- Non-root self-hosted container and tested GHCR publication infrastructure.
- Native Linux amd64 and arm64 container build/HTTP checks and verified two-platform GHCR image publication.
- Automated tests, container HTTP checks, and changelog-driven tagged release infrastructure.
- Weekly Dependabot updates for validation dependencies, the container base image, and GitHub Actions.

### Changed
- The selected prototype is now the default application; discarded design routes are not shipped.
- Podman is the primary self-hosting example, with Docker as an alternative.
- The README and app explicitly state that Imagecraft is unaffiliated with Red Hat.
- Removed the "INTERACTIVE CONCEPT" header badge.
- Added guidance and roadmap priorities for file copying, complete build-folder exports, and Containerfile instructions beyond RUN.

### Known limitations
- Recipes and generated workflows are illustrative and have not been validated by real RHEL builds.
- Input checks do not verify package availability, command correctness, or successful OS boot. Builder architecture/ABI compatibility and SELinux/persistent-state behavior still need real validation.
- Credential detection is best-effort, not a guarantee. Review files and exports; never include secrets. Files remain in memory, while portable downloads deliberately include their bytes.
- Generated OS workflows require appropriately configured self-hosted Linux runners with Podman and RHEL entitlement. Hosting Imagecraft itself does not require RHEL access.
