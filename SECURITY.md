# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular:

- **What is stored in `/data`** (`panasonic-cc.json`, mode 0600): the Comfort
  Cloud session (access token, **refresh token**, client id), the version of
  the Comfort Cloud app announced, a hash of the account e-mail (to drop the
  session when the account changes), and for each unit its guid, name, the
  sensors seen, its energy counter and the settings kept until its next
  power-on. Whoever reads this file can control the units of the account
  until the refresh token expires or is revoked.
- **Secrets of the configuration**: the Panasonic ID password. It is only sent
  to Panasonic's login page (`authglb.digital.panasonic.com`) when the saved
  session cannot be renewed; it is never written in `/data` nor in the logs,
  and neither are the tokens nor the two-factor codes.
- **Network**: outbound HTTPS only, to `authglb.digital.panasonic.com`
  (Panasonic ID login, Auth0), `accsmart.panasonic.com` (Comfort Cloud API),
  the two-factor service whose address the Panasonic login page gives, and
  `play.google.com` / `www.appbrain.com` (the current version of the app).
  Nothing listens, nothing on the local network.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Panasonic's cloud and the units' firmware.
