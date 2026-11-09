# <img src="assets/imagecraft.svg" width="29" height="36" alt=""> Imagecraft

**Build your RHEL image recipe, one step at a time.**

A friendly guide and workbench for choosing packages, adding files, and downloading a ready-to-review recipe. No account needed; nothing is uploaded.

**Independent and unaffiliated:** Imagecraft is not affiliated with, endorsed by, or sponsored by Red Hat. It is not a Red Hat product.

![Imagecraft Compose editor with an illustrative web-server recipe and its generated Containerfile side by side.](assets/screenshots/compose.png)

<details>
<summary>More previews</summary>

**Dark mode**

![The same Compose recipe and Containerfile in dark mode.](assets/screenshots/compose-dark.png)

**Starter Library**

![Starter Library with ready-to-customize image recipe templates.](assets/screenshots/starter-library.png)

**Pipeline**

![Pipeline view with a generated GitHub Actions workflow for an illustrative image.](assets/screenshots/pipeline.png)

</details>

## ✨ Use it online

**[Open Imagecraft →](https://imagecraft.graa.dev/)**

Start with the Understand field guide, then choose **Start composing**. Already know the basics? Open [Compose](https://imagecraft.graa.dev/?view=compose) or [Pipeline](https://imagecraft.graa.dev/?view=pipeline) directly. The Imagecraft logo returns home without resetting your recipe or preferences.

1. Choose RHEL 9 or 10, or start with a template.
2. Add packages, commands, services, COPY files, or ADD local files/archives and HTTPS URLs; arrange them in order.
3. Review and download your Containerfile or a complete build folder. Save a portable recipe to continue in another browser.
4. Open **Build & deploy** for the QCOW2/raw/vSphere VMDK command wizard, initial SSH-public-key config, installed-host update/switch/rollback walkthrough and OCI/disk signing and verification examples.

The disk wizard generates `build-disk.sh` and `config.toml`, not a disk or installer in your browser. Use a reviewed published OS reference (optionally pinned by digest), not the recipe's base-image pin. Privileged builds require your own trusted native Linux host; boot, vSphere import and signing remain external validation gates. Disk signatures, bootc pull trust policy and Secure Boot are separate. No private keys or passwords belong in the wizard, recipe or build folder.

Prefer **COPY** for straightforward local copying. **ADD** may unpack local tar archives or download HTTPS content **at build time**; remote archives stay packed. Git sources are not supported. Imagecraft never fetches these URLs or unpacks uploaded archives. Review provenance, contents and permissions on your build host; HTTPS does not pin content.

Local files stay in memory. After reloading, select them again or import your saved portable recipe. Complete build-folder and portable JSON exports include referenced local COPY/ADD bytes; a standalone Containerfile does not.

Imagecraft is a prototype that helps you write recipes—it does not build or run them. Review every download before using it. Building RHEL images needs your own RHEL access and a suitable build machine.

## 🏠 Run it yourself

With Podman installed:

```sh
podman run --rm -p 8080:8080 ghcr.io/erikgraa/imagecraft:edge
```

Open **[localhost:8080](http://localhost:8080)**. Docker works too—replace `podman` with `docker`.

`edge` is the newest development build. Numbered releases will have their own image tags and a stable `latest` tag; no numbered release has been published yet.

## 🧭 Follow along

[What's changed](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Report a problem](https://github.com/erikgraa/imagecraft/issues)
