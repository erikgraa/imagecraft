# 🖼️ Imagecraft

**Build your RHEL image recipe, one step at a time.**

A friendly guide and workbench for choosing packages, arranging changes, and downloading a ready-to-review recipe. No account needed; your recipe stays in your browser.

## ✨ Use it online

**[Open Imagecraft →](https://imagecraft.graa.dev/)**

1. Choose RHEL 9 or 10, or start with a template.
2. Add packages, commands, and services; drag them into order.
3. Review and download your Containerfile and build workflow.

Imagecraft helps you write recipes—it does not build or run them. Review every download before using it. Building RHEL images needs your own RHEL access and a suitable build machine. This is an independent prototype, not a Red Hat product.

## 🏠 Run it yourself

With Docker installed:

```sh
docker run --rm -p 8080:8080 ghcr.io/erikgraa/imagecraft:edge
```

Open **[localhost:8080](http://localhost:8080)**. You can replace `docker` with `podman`.

`edge` is the newest development build. Numbered releases will have their own image tags and a stable `latest` tag; no numbered release has been published yet.

## 🧭 Follow along

[What's changed](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Report a problem](https://github.com/erikgraa/imagecraft/issues)
