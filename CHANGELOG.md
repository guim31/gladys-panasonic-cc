# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- Panasonic air conditioners and air-to-air heat pumps (Etherea, TZ, Z,
  ducted...) through Panasonic Comfort Cloud, with the Panasonic ID login of
  the current Android app (Auth0 with PKCE), the session kept under `/data`
  and renewed without sending the password again.
- Two-factor accounts: an action "Sign in with a 2FA code" completes the
  sign-in with the code of the authenticator app.
- One Gladys device per indoor unit: on/off, mode, setpoint by half degrees,
  fan speed, vertical and horizontal swing (swing or five positions), indoor
  and outdoor temperature, Powerful and Quiet modes, nanoe, ECONAVI, AI Eco,
  energy of the day and an energy counter for the Gladys energy monitoring —
  only the features the unit announces.
- A setpoint, louver position or special mode asked while a unit is off is
  kept and sent at its next power-on, never starting it by surprise.
- The units are read by the integration itself, every 2 minutes by default
  (1 to 10 minutes), one Comfort Cloud call at a time, the energy history
  at most every 5 minutes; a unit is read again 3 seconds after a command;
  the pace slows down while Comfort Cloud fails.
- The version of the Comfort Cloud app the API requires is read from Google
  Play (AppBrain as a fallback), or set in an advanced setting.
- An action "Search for air conditioners" that lists the units of the account
  and whether they answer.
- A scene trigger "Panasonic sign-in needed" (password refused, two-factor
  code needed, new terms to accept) and a scene action "Apply an air
  conditioning preset" that sets mode, setpoint, fan and special mode in one
  call.
- A dashboard widget "Air conditioner": room, setpoint and outdoor
  temperature, mode, fan, special mode and energy of the day, with on/off,
  setpoint and "Mode and fan" buttons.
- Names, messages and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-panasonic-cc/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-panasonic-cc/releases/tag/v1.0.1
