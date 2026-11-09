# 🖼️ Imagecraft

**Build your RHEL image recipe, one step at a time.**

A friendly guide and workbench for choosing packages, arranging changes, and downloading a ready-to-review recipe. No account needed; your recipe stays in your browser.

**Independent and unaffiliated:** Imagecraft is not affiliated with, endorsed by, or sponsored by Red Hat. It is not a Red Hat product.

## ✨ Use it online

**[Open Imagecraft →](https://imagecraft.graa.dev/)**

1. Choose RHEL 9 or 10, or start with a template.
2. Add packages, commands, and services; drag them into order.
3. Review and download your Containerfile and build workflow.

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
