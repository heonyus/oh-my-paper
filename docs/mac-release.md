# macOS arm64 release boundary

oh-my-paper release commands support Apple Silicon macOS only. The Windows and Linux builder configuration remains in `package.json` as historical context, but their npm release entry points stop with an unsupported-target error.

## Safe local commands

- `npm run release:check` checks the target, publishing flags, bundle allowlist, resource paths, and icon without building anything.
- `npm run package` builds an unpacked macOS arm64 app with electron-builder publishing disabled.
- `npm run make` and `npm run dist:mac` build arm64 DMG and ZIP artifacts with electron-builder publishing disabled.
- `npm run release:preflight` performs the configuration checks and reports release-readiness gaps. It does not build, sign, notarize, staple, upload, or purchase anything.

Every builder command includes `--publish never`. The package is also marked private to prevent accidental npm publication. The dormant GitHub publish provider configuration is retained for history and is not activated by these commands.

## Bundle boundary

The electron-builder `files` allowlist contains only `dist/**` and `dist-electron/**`. electron-builder supplies the packaged application metadata itself. Tests, `.env` files, repository source, and private or secret paths are not admitted through that allowlist.

The existing layout parser files remain explicit `extraResources` because the application invokes them at runtime. The preflight rejects extra-resource paths containing test, environment, private, or secret path segments; it never reads or prints their contents.

## Release readiness is not proven by preflight

Before distributing an artifact, resolve every `BLOCKED` or `UNVERIFIED` line from `npm run release:preflight`:

- Code signing may use a certificate supplied by `CSC_LINK` or `CSC_NAME`, or a suitable Keychain identity. The script reports environment-variable presence by name only and does not inspect values or the Keychain.
- Notarization requires `build.mac.notarize` plus one complete electron-builder credential set: App Store Connect API variables, or Apple ID/app-specific password/team variables. Presence is configuration evidence, not proof that Apple accepted or stapled an artifact.
- Set `build.mac.minimumSystemVersion` only after choosing the supported floor. A configured value still does not prove behavior on that macOS version; test the packaged app on the actual oldest supported OS.
- Inspect the produced arm64 application and both artifacts for signatures, notarization/stapling, architecture, launch behavior, entitlements, and unexpected files. None were produced or inspected in this task.
