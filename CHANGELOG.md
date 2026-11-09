# Changelog

Notable changes are recorded here. Work under **Unreleased** has not been published as a numbered release.

## [Unreleased]

### Added
- Public Imagecraft workbench, with RHEL 9/10 selection and four starter recipes.
- Ordered package, command, and service editing with pointer, touch, and keyboard sorting.
- Browser-local recipe, theme, and workflow-provider preferences.
- Containerfile and build-command export, plus GitHub, GitLab, and Azure workflow downloads.
- Light and dark themes and responsive layouts.
- GitHub Pages hosting at imagecraft.graa.dev.
- Non-root self-hosted container and tested GHCR publication infrastructure.
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
- Input checks do not verify package availability, command correctness, or successful OS boot.
- Generated OS workflows require appropriately configured self-hosted Linux runners with Podman and RHEL entitlement. Hosting Imagecraft itself does not require RHEL access.
