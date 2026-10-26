# Chatless docs router

Cloudflare Worker serving independently published documentation sites under
`docs.chatless.app`.

- `/swift-twitch-client/…` → `https://losfarmosctl.github.io/swift-twitch-client/…`
- All other paths → `CHATLESS_DOCS_ORIGIN`, or `404` until configured.

Documentation updates publish from their own repositories without redeploying
this router. The Worker preserves paths and queries, keeps upstream redirects on
the public hostname, and accepts `GET` and `HEAD`.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:8787/swift-twitch-client/` to proxy the published library docs.

```sh
npm run check   # Formatting, tests, and deployment dry run
npm run format  # Apply Prettier formatting
```
