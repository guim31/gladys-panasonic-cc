# Panasonic Comfort Cloud for Gladys Assistant

Control of **Panasonic air conditioners and air-to-air heat pumps** (Etherea, TZ, Z, ducted units...) set up in the **Panasonic Comfort Cloud** app, from [Gladys Assistant](https://gladysassistant.com): on/off, mode, setpoint, fan speed, louvers, Powerful and Quiet modes, nanoe, ECONAVI, AI Eco, indoor and outdoor temperature, and energy consumption.

> **Developed without the hardware: feedback welcome.** The Comfort Cloud client is a port of [aio-panasonic-comfort-cloud](https://github.com/sockless-coding/aio-panasonic-comfort-cloud), the library of the Home Assistant integration [panasonic_cc](https://github.com/sockless-coding/panasonic_cc), checked against what that library computes on the same inputs, but it has not run against a real account or unit yet. Please report what works and what does not in the [issues](https://github.com/guim31/gladys-panasonic-cc/issues).

This project is not affiliated with Panasonic.

## What it does

- **Panasonic ID login** as the current Android app does it (Auth0, PKCE, several redirections, signed API headers, app version read from Google Play), two-factor accounts included (an action takes the code of the authenticator app). The session is kept in the integration volume (`/data`) and renewed without sending the password again.
- **One Gladys device per indoor unit**, with only the features the unit announces: on/off, mode (auto, cool, heat, dry, fan), setpoint by half degrees, fan speed (6 speeds), vertical and horizontal swing (swing or five positions), indoor and outdoor temperature, Powerful and Quiet modes, nanoe, ECONAVI, AI Eco, energy of the day and an energy counter for the Gladys energy monitoring.
- **No surprise start**: a setpoint, louver position or special mode asked while a unit is off is kept and sent at its next power-on.
- **Refresh**: the integration reads the units added to Gladys itself, every 2 minutes by default (like the Home Assistant integration), one Comfort Cloud call at a time, and sends Gladys only what changed. A unit is read again 3 seconds after a command.
- **Scenes**: trigger "Panasonic sign-in needed" (password refused, two-factor code, new terms); action "Apply an air conditioning preset" (mode, setpoint, fan and special mode in one call).
- **Widget** "Air conditioner": room, setpoint and outdoor temperature, mode, fan, special mode, energy of the day; on/off, setpoint and "Mode and fan" buttons.
- English, French, German and Spanish.

See the [documentation](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md), [español](docs/es.md)).

## Requirements

- Gladys Assistant **5.2.0** or later (widget buttons with a form).
- A Panasonic ID with the units in its Comfort Cloud app.
- Internet access for Gladys: everything goes through the Panasonic cloud.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter this repository's URL, fill in the e-mail address and password of your Panasonic ID in the **Configuration** tab, then open the **Discovery** tab and add your units. The settings are described in the [documentation](docs/en.md).

## Limits

- Cloud only: no local control, and a change of Panasonic's login or API stops the integration until it is updated (`scripts/probe.mjs` checks the real login in a minute).
- The energy values come from the Comfort Cloud daily history, which lags behind by up to an hour or so.
- Not handled: iAuto-X, the 8/15 °C frost protection preset, weekly timers, zones of ducted units, inside cleaning.
- Aquarea air-to-water heat pumps and hot water tanks are not supported.

## Development

```bash
npm install
npm test               # node --test: client, statuses, hub, widget, scenes, logs, Gladys rules, languages
npm run lint
npm run format:check
node scripts/probe.mjs                 # the real login with an invented account, until Panasonic refuses it
PANASONIC_USERNAME=... PANASONIC_PASSWORD=... node scripts/probe.mjs --account   # read-only, real account
```

The tests never touch the network: `test/fixtures/reference-vectors.json` holds what aio-panasonic-comfort-cloud itself computes (API keys, PKCE, parsed statuses including a real `/deviceStatus` answer, change requests), produced by `scripts/reference-vectors.py`, and `test/helpers/fakePanasonic.js` simulates the Panasonic login and the Comfort Cloud API. See [CLAUDE.md](CLAUDE.md) for the project rules.

## Credits

- [aio-panasonic-comfort-cloud](https://github.com/sockless-coding/aio-panasonic-comfort-cloud) by Jimmy Everling (sockless-coding) and contributors (MIT): login flow, headers, endpoints, values and test data. Its MIT notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), shipped in the image.
- [panasonic_cc](https://github.com/sockless-coding/panasonic_cc), the Home Assistant integration by the same author (MIT): polling pace, entities and behaviours.
- [python-panasonic-comfort-cloud](https://github.com/lostfields/python-panasonic-comfort-cloud) by lostfields (MIT): the original reverse engineering of the API.
- Built from the official [integration template](https://github.com/GladysAssistant/integration-template-js) of Gladys Assistant.

## License

[Apache-2.0](LICENSE).
