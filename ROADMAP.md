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

## Next to explore

- [ ] Add ordered `COPY` file steps for configuration, service units, and scripts, with source/destination checks and explicit file permissions.
- [ ] Export a complete build folder (Containerfile, referenced files, and ignore rules), so local builds and generated workflows have the same inputs. Keep secrets out of uploaded files and exports.
- [ ] Validate starter recipes with real RHEL builds and boot tests.
- [ ] Test generated workflows on each supported provider with entitled runners.
- [ ] Expand guidance around secrets, persistent state, and safe updates.
- [ ] Add recipe import/export so work can move between browsers.
- [ ] Broaden accessibility checks with screen readers and user feedback.
- [ ] Publish the first numbered release after real-world validation.

## Later possibilities

- [ ] Add image metadata with `LABEL`, build-time options with `ARG`, and explicit `ENV`/`WORKDIR` steps with clear explanations of how they affect later instructions. Never treat these as secret storage.
- [ ] Offer digest-pinned base images for reproducible builds and explain how to refresh them safely.
- [ ] Explore multi-stage builds for copying compiled artifacts into the final OS image.
- [ ] More starter recipes, with explicit compatibility notes.
- [ ] Optional checks for package availability and recipe mistakes.

Imagecraft does not execute recipes or hold build credentials. Any future integration needs a separate design and review. Preserve bootc startup and user defaults: application-container features such as `CMD`, `ENTRYPOINT`, `USER`, and `EXPOSE` are not a priority for this OS-image editor. Prefer `COPY` over the implicit download/extraction behavior of `ADD` for the initial file workflow.
