# Google Stitch MCP — VisionSetil setup

**Status:** MCP entry wired in Grok (`mcp_servers.stitch`). Needs **your** API token (not in repo).

## 1. Auth (operator, once)

```powershell
# After creating a token at https://stitch.withgoogle.com (Settings → API tokens)
[Environment]::SetEnvironmentVariable('STITCH_API_KEY', 'YOUR_TOKEN_HERE', 'User')
```

Restart Grok Build so MCP reloads. Verify:

```powershell
grok mcp doctor stitch
# or
npx @_davideast/stitch-mcp doctor
```

Optional OAuth wizard (gcloud):

```powershell
npx @_davideast/stitch-mcp init
```

## 2. Grok config

User `~/.grok/config.toml`:

```toml
[mcp_servers.stitch]
command = "powershell"
args = [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "C:/Users/Mariano/.grok/scripts/run-stitch-mcp.ps1",
]
enabled = true
startup_timeout_sec = 180
tool_timeout_sec = 600
```

Launcher: `~/.grok/scripts/run-stitch-mcp.ps1` (reads `STITCH_API_KEY` / token env).

## 3. Design directions (pick one)

See mockups under `docs/design/proposals/` and the comparison in `FRONTEND_DESIGN_OPTIONS.md`.

After you pick A / B / C, we implement that direction in the React PWA (safety copy unchanged).
