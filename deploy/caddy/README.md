# Caddy Reverse Proxy Configuration

This directory contains example Caddy configurations for serving CamillaEQ.

## HTTP-Only Configuration (for WebSocket compatibility)

When CamillaEQ needs to connect to CamillaDSP over plain `ws://` (non-TLS WebSockets), the UI must be served over HTTP to avoid mixed-content blocking by modern browsers.

### Example: Single HTTP-only site

```caddyfile
# Caddyfile
http://camillaeq.his.house {
  reverse_proxy 127.0.0.1:3000

  # Ensure no HSTS is sent
  header {
    -Strict-Transport-Security
  }
}
```

### Example: HTTP + optional HTTPS redirect

If you want users who type `https://` to be redirected to `http://`:

```caddyfile
# Caddyfile

# HTTPS site that redirects to HTTP
camillaeq.his.house {
  redir http://{host}{uri} 301
  
  header {
    -Strict-Transport-Security
  }
}

# HTTP site (actual service)
http://camillaeq.his.house {
  reverse_proxy 127.0.0.1:3000
  
  header {
    -Strict-Transport-Security
  }
}
```

**Important notes:**
- This requires Caddy to obtain TLS certificates for the redirect to work
- If clients have HSTS cached for this domain, they may refuse HTTP regardless
- For maximum compatibility, only expose HTTP (no HTTPS listener at all)

---

## Read-Only Mode (Public Exposure)

When exposing CamillaEQ publicly, enable read-only mode to prevent unauthorized persistence changes:

### CamillaEQ `.env`
```bash
SERVER_HOST=127.0.0.1
SERVER_PORT=3000
SERVER_READ_ONLY=true
CONFIG_DIR=/opt/camillaeq/data
```

This configuration:
- ✅ Allows UI to load and control CamillaDSP
- ✅ Allows GET requests (read presets, read state)
- ❌ Blocks PUT/POST/PATCH/DELETE to `/api/*` (no disk writes)

---

## Security Considerations

### When serving HTTP-only
- Only do this for LAN-only deployments or when WebSocket compatibility is required
- Consider firewall rules to restrict access to trusted networks
- CamillaDSP should also be firewalled if not intended for public access

### When using HTTPS
- If you serve CamillaEQ over HTTPS, CamillaDSP must use `wss://` (WebSocket Secure)
- This requires a TLS terminator/proxy in front of CamillaDSP
- Mixed content (HTTPS page + WS connection) is blocked by all modern browsers

---

## Testing

### Verify HTTP-only is working
```bash
curl http://camillaeq.his.house/health
# Should return: {"status":"ok"}
```

### Verify read-only mode
```bash
# This should succeed (GET is allowed)
curl http://camillaeq.his.house/api/configs

# This should fail with 403 (PUT is blocked)
curl -X PUT http://camillaeq.his.house/api/state/latest \
  -H 'Content-Type: application/json' \
  -d '{"devices":{},"filters":{},"mixers":{},"pipeline":[]}'

# Expected response:
# {"error":{"code":"ERR_READ_ONLY","message":"Server is in read-only mode. Write operations are not permitted.","statusCode":403}}
```

---

## Troubleshooting

### Mixed content errors in browser console
**Symptom:** Browser blocks WebSocket connections with "Mixed Content" error

**Cause:** UI served over HTTPS, CamillaDSP using plain `ws://`

**Solution:** Use HTTP-only configuration above, or upgrade CamillaDSP to `wss://`

### HSTS errors / browser auto-upgrades to HTTPS
**Symptom:** Browser refuses to load `http://` URL, auto-upgrades to HTTPS

**Cause:** HSTS cached from previous HTTPS access to this domain

**Solutions:**
1. Clear browser HSTS cache for this domain
2. Use a different hostname/subdomain that has never served HTTPS
3. Wait for HSTS max-age to expire (can be months)

### Read-only mode not blocking writes
**Symptom:** PUT/POST requests succeed even with `SERVER_READ_ONLY=true`

**Diagnosis:**
```bash
# Check if env var is loaded
curl http://localhost:3000/health
# Check server logs for: "SERVER_READ_ONLY mode enabled"
```

**Solution:** Ensure `.env` file is in correct location and server restarted
