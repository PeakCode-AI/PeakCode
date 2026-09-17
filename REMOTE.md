# Remote Access Setup

Use this when you want to open Peak Code from another device (phone, tablet, another laptop).

## CLI ↔ Env option map

The Peak Code CLI accepts the following configuration options, available either as CLI flags or environment variables:

| CLI flag                | Env var               | Notes                              |
| ----------------------- | --------------------- | ---------------------------------- |
| `--mode <web\|desktop>` | `PEAKCODE_MODE`       | Runtime mode.                      |
| `--port <number>`       | `PEAKCODE_PORT`       | HTTP/WebSocket port.               |
| `--host <address>`      | `PEAKCODE_HOST`       | Bind interface/address.            |
| `--home-dir <path>`     | `PEAKCODE_HOME`       | Base directory.                    |
| `--dev-url <url>`       | `VITE_DEV_SERVER_URL` | Dev web URL redirect/proxy target. |
| `--no-browser`          | `PEAKCODE_NO_BROWSER` | Disable auto-open browser.         |
| `--auth-token <token>`  | `PEAKCODE_AUTH_TOKEN` | WebSocket auth token.              |

> TIP: Use the `--help` flag to see all available options and their descriptions.

## Security First

- Always set `--auth-token` before exposing the server outside localhost.
- Treat the token like a password.
- Prefer binding to trusted interfaces (LAN IP or Tailnet IP) instead of opening all interfaces unless needed.

## 1) Build + run server for remote access

Remote access should use the built web app (not local Vite redirect mode).

```bash
bun run build
TOKEN="$(openssl rand -hex 24)"
bun run --cwd apps/server start -- --host 0.0.0.0 --port 3773 --auth-token "$TOKEN" --no-browser
```

Then open on your phone:

`http://<your-machine-ip>:3773`

Example:

`http://192.168.1.42:3773`

Notes:

- `--host 0.0.0.0` listens on all IPv4 interfaces.
- `--no-browser` prevents local auto-open, which is usually better for headless/remote sessions.
- Ensure your OS firewall allows inbound TCP on the selected port.

## 2) Tailnet / Tailscale access

If you use Tailscale, you can bind directly to your Tailnet address.

```bash
TAILNET_IP="$(tailscale ip -4)"
TOKEN="$(openssl rand -hex 24)"
bun run --cwd apps/server start -- --host "$(tailscale ip -4)" --port 3773 --auth-token "$TOKEN" --no-browser
```

Open from any device in your tailnet:

`http://<tailnet-ip>:3773`

You can also bind `--host 0.0.0.0` and connect through the Tailnet IP, but binding directly to the Tailnet IP limits exposure.

## 3) Code on a remote dev box (SSH tunnel)

When the code you want the agent to work on lives on a machine you reach over SSH, run Peak Code on
that machine and keep the browser on your laptop. The agent, the workspace and the git history all
stay where the code is, and nothing has to be reachable from the network: the server binds its own
loopback and the SSH tunnel is the only way in.

```bash
# On the remote host, from a checkout of this repository.
bun run build
TOKEN="$(openssl rand -hex 24)"
bun run --cwd apps/server start -- --host 127.0.0.1 --port 3773 --auth-token "$TOKEN" --no-browser

# On your laptop, in a second terminal. Keep it running while you work.
ssh -N -L 3773:127.0.0.1:3773 you@remote-host
```

Then open `http://127.0.0.1:3773` on your laptop and connect with `$TOKEN`, the same way as above.

Notes:

- `--host 127.0.0.1` keeps the server off every interface of the remote machine, so the token and the
  SSH account are what stand between the API and everyone else.
- Add the forward to `~/.ssh/config` (`LocalForward 3773 127.0.0.1:3773`) if you use this daily.
- Dropping the tunnel closes the browser connection; Peak Code reconnects by itself once the tunnel
  and the server are back.
- Everything that runs locally for the agent — file reads and writes, git, terminals — resolves
  against the remote workspace, because that is where the server runs.
