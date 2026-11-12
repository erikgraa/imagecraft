# <img src="assets/imagecraft.svg" width="29" height="36" alt=""> Imagecraft

**Build with intent. Your OS, composed.**

[![Version 0.6.0](https://img.shields.io/badge/version-0.6.0-c62828)](https://github.com/erikgraa/imagecraft/releases/tag/v0.6.0)
[![CI](https://github.com/erikgraa/imagecraft/actions/workflows/delivery.yml/badge.svg?branch=main)](https://github.com/erikgraa/imagecraft/actions/workflows/delivery.yml)
[![Self-hosted: amd64 + arm64](https://img.shields.io/badge/self--hosted-amd64%20%2B%20arm64-374151)](#-run-it-yourself)
[![RHEL 10 recommended](https://img.shields.io/badge/RHEL%2010-recommended-c62828)](https://imagecraft.graa.dev/)

A friendly RHEL image-mode recipe workbench. Choose what you're building, compose a recipe, save local drafts, and download files to review on your own build host. **No account, no uploads, no builds in your browser.**

**Independent and unaffiliated:** Imagecraft is not affiliated with, endorsed by, or sponsored by Red Hat. It is not a Red Hat product.

## ✨ Get started

**[Open Imagecraft →](https://imagecraft.graa.dev/)**

1. Answer **“What are you building?”**, choose a RHEL release, and pick a destination. **RHEL 10 is selected by default for new images**; RHEL 9 remains available and existing recipes keep their release. **Reset** on the destination or review screen clears just these answers and returns to question 1.
2. Customize your starter in **Compose**: packages, commands, services, files, builder stages, and ordered Containerfile instructions. Collapse sections to focus, or use **Image map** to visualize declared packages, file destinations, services, and separate builder stages. This is a recipe plan, not a scanned image inventory; **Copy** still copies the whole Containerfile.
3. **Save draft** to return later. **Take your recipe with you**, above the Compose editor, keeps downloads visible even with sections collapsed: choose the recommended **build folder** to build locally, **Containerfile only** for the instructions, or a **portable recipe** to import into another browser.
4. Follow **Compose → Build → Publish → Boot → Update**. Boot is the first installation; later versions loop back through Compose, Build, Publish, and installed-host Update without another disk import. Build and Publish share one whole-shell command block, including caution comments; copying never runs it.

Each **Install packages** step has an optional single-line comment explaining its purpose. Comments appear in the Image map and exported Containerfile and survive drafts and portable JSON; they are public recipe text, never secret storage.

Selecting VMware vSphere adds `open-vm-tools` and enables `vmtoolsd` in the editable OS recipe. Rebuild and publish the image before creating a VMware disk. The disk builder's `config.toml` provisions the initial user and SSH key at build time; it is not cloud-init user-data.

Explore [the field guide](https://imagecraft.graa.dev/?view=learn), [starter library](https://imagecraft.graa.dev/?view=templates), or [pipeline generator](https://imagecraft.graa.dev/?view=pipeline) directly. The theme follows your system by default; the header's single sun/moon button toggles a saved Light or Dark override.

![The welcome page asks what you are building with illustrated workload choices.](assets/screenshots/welcome.png)

![The centered Compose workspace with its recipe editor and generated Containerfile.](assets/screenshots/compose.png)

<details>
<summary>📸 More screenshots: dark mode, drafts, starters, build, and pipelines</summary>

![Compose with the red-accented dark theme.](assets/screenshots/compose-dark.png)

![My drafts with named, browser-local recipe snapshots.](assets/screenshots/drafts.png)

![Illustrated starter recipes with compatibility notes.](assets/screenshots/starter-library.png)

![The focused Build task with prominent warnings and whole-shell copying.](assets/screenshots/build.png)

![Pipeline generation with explicit runner requirements and safeguards.](assets/screenshots/pipeline.png)

</details>

## 💾 Your work stays local

**My drafts** holds named snapshots, separate from working-copy autosave. Save updates explicitly, use **Save as copy** for a variation, or reopen/delete a snapshot. Opening asks before replacing your working copy; unfinished drafts are allowed, but exports require a valid recipe. Storage errors are shown without erasing existing snapshots.

Drafts have **no cross-device sync** and disappear if browser storage is cleared. Local file bytes stay in memory and are **not saved in drafts or autosave**: reselect files after reopening. Portable JSON and complete build-folder exports deliberately include referenced local file bytes; a standalone Containerfile does not.

Standalone Containerfiles use the draft name, such as `Web baseline.Containerfile`, with unsafe filename characters adjusted. Build-folder exports keep the standard `Containerfile` for generated commands and CI. To build a standalone named file, rename it to `Containerfile` or specify `podman build --file "Web baseline.Containerfile" …`.

## ⚠️ Review before you build

Version 0.6.0 releases the **workbench**, not validated OS images. Recipes, disk commands and provider workflows are illustrative; real RHEL builds, boot tests and runner validation are still outstanding. Building needs your own RHEL access and trusted, appropriately configured Linux hosts.

Never put credentials or private keys in recipes, attached files, or exports. Credential detection is incomplete. Review every download and command, especially privileged builds and reboot steps. The disk wizard generates commands/configuration—not a disk. OCI verification, disk signatures, bootc enforcement and Secure Boot are separate trust boundaries.

Prefer **COPY** for straightforward local files. **ADD** may download HTTPS files or unpack local tar archives **at build time**, never in Imagecraft; review provenance and contents on your build host. See the [field guide](https://imagecraft.graa.dev/?view=learn) and [validation guidance](CONTRIBUTING.md#external-validation-required-evidence-not-automated-claims).

## 🏠 Run it yourself

```sh
podman run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  -p 8080:8080 ghcr.io/erikgraa/imagecraft:0.6.0
```

Open **[localhost:8080](http://localhost:8080)**. Docker works too—replace `podman` with `docker`. Images support Linux **amd64 and arm64**. Hosting Imagecraft needs no RHEL entitlement or server-side recipe storage; use a reverse proxy for public HTTPS.

`0.6.0` pins this workbench release once its reviewed PR is merged and the release tag is published. `latest` tracks numbered releases; `edge` tracks development on main. Image tags do not change the RHEL version of your recipe. [Build locally or configure hosting →](CONTRIBUTING.md#container-hosting)

## 🧭 Follow along

[Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contribute](CONTRIBUTING.md) · [Report a problem](https://github.com/erikgraa/imagecraft/issues)

CI checks unit/browser/accessibility behavior and both container architectures before delivery to GitHub Pages and GHCR. Dependabot updates npm, Docker and GitHub Actions weekly. No license has been selected yet; no reuse rights are promised.
