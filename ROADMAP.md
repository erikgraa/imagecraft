# Roadmap

Imagecraft is an independent prototype. These ideas are directions to explore, not delivery promises.

## Available now

- [x] Guided RHEL 9/10 recipe composition and starter library.
- [x] Ordered package, command, and service steps with accessible sorting.
- [x] Containerfile, build-command, and GitHub/GitLab/Azure workflow downloads.
- [x] Browser-local preferences, light/dark themes, and responsive layouts.
- [x] Public website and self-hosted container infrastructure.
- [x] Linux amd64 and arm64 Imagecraft images, with native HTTP checks and verified multi-platform publication.
- [x] Automated checks and changelog-based release tooling.
- [x] Ordered local-file `COPY` with source/destination checks and explicit permissions.
- [x] Complete build-folder TAR downloads with Containerfile, referenced files, ignore rules, and the selected provider workflow.
- [x] Versioned portable recipe import/export with embedded files. Files stay in memory; browser saves omit file bytes and require reselection after reload.
- [x] `LABEL`, `ARG`, `ENV`, and `WORKDIR` steps, with validation and per-stage ordering.
- [x] Optional reviewed base-image digest pins, with explicit manual replacement and no registry access.
- [x] Named builder stages and artifact `COPY` from earlier builders into later stages or the final OS.
- [x] Six illustrative starter recipes with compatibility notes.
- [x] Optional local review hints for recipe mistakes; these do not check package availability or execute builds.
- [x] Expanded guidance on credentials, file permissions, persistent state, SELinux, builder compatibility, protected runners, and safe updates/rollback.
- [x] Repeatable Chromium/axe accessibility and interaction checks across desktop/mobile and light/dark themes, with improved keyboard focus and associated validation errors.

## Next to explore

- [ ] Validate starter recipes with real RHEL builds and boot tests.
- [ ] Test generated workflows on each supported provider with entitled runners.
- [ ] Manual screen-reader testing and real user feedback; automated checks are not a substitute.
- [ ] Publish the first numbered release after real-world validation.

## Later possibilities

- [ ] Package-availability checks backed by appropriate RHEL access and version-specific evidence.
- [ ] Broader builder architecture/ABI, SELinux, persistent-state, update, and rollback validation with real build/boot environments.

Imagecraft does not execute recipes or hold build credentials. Any future integration needs a separate design and review. Preserve bootc startup and user defaults: application-container features such as `CMD`, `ENTRYPOINT`, `USER`, and `EXPOSE` are not a priority for this OS-image editor. Prefer `COPY` over the implicit download/extraction behavior of `ADD` for the initial file workflow.
