# Changelog

## [0.3.0] - 2026-10-14

- Add Android Auto Desktop Head Unit status, installation and device-specific
  sessions through library APIs and JSON `dhu-status`, `dhu-install` and
  `dhu-start <serial>` commands. Advertise the `dhu` capability.
- Allocate a separate ADB tunnel for each DHU session and remove it on exit,
  launch failure or interruption without replacing existing forwards.
- Document Android Auto setup and strengthen release version and published
  installation verification.

## [0.2.0] - 2026-10-10

- Add hardware-profile and system-image catalogs through library APIs and JSON
  `profiles` / `images [--installed]` commands, with capability discovery.
- Bundle an Android emulator creation skill with the npm package.
- Add automatic Homebrew distribution through the Androperator tap.

## [0.1.1]

- Update installation documentation for the published scoped package.
- First release through GitHub Actions using npm Trusted Publishing.

## [0.1.0]

- Initial public release of the Android emulator lifecycle library and JSON CLI.
