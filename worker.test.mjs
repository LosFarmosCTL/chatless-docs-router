import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.mjs";

const publicOrigin = "https://docs.chatless.app";

function mockOrigin(t, response) {
  return t.mock.method(globalThis, "fetch", async () => response);
}

test("adds the library's trailing slash without losing the query", async (t) => {
  const origin = mockOrigin(t, new Response("unused"));
  const result = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client?q=1`),
  );
  assert.equal(result.status, 308);
  assert.equal(
    result.headers.get("Location"),
    `${publicOrigin}/swift-twitch-client/?q=1`,
  );
  assert.equal(origin.mock.callCount(), 0);
});

test("proxies deep library paths, query strings, and validators without credentials", async (t) => {
  const origin = mockOrigin(
    t,
    new Response("module", {
      headers: { "Content-Type": "application/json", ETag: "version-1" },
    }),
  );
  const path =
    "/swift-twitch-client/data/documentation/twitch.json?language=swift";
  const result = await worker.fetch(
    new Request(publicOrigin + path, {
      headers: {
        Cookie: "session=private",
        Authorization: "Bearer private",
        "If-None-Match": "version-0",
      },
    }),
  );
  const [url, options] = origin.mock.calls[0].arguments;
  assert.equal(url.href, "https://losfarmosctl.github.io" + path);
  assert.equal(options.headers.get("If-None-Match"), "version-0");
  assert.equal(options.headers.has("Cookie"), false);
  assert.equal(options.headers.has("Authorization"), false);
  assert.equal(result.headers.get("Content-Type"), "application/json");
  assert.equal(result.headers.get("ETag"), "version-1");
  assert.equal(await result.text(), "module");
});

test("preserves HEAD requests and upstream error status", async (t) => {
  const origin = mockOrigin(t, new Response(null, { status: 404 }));
  const result = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client/missing`, {
      method: "HEAD",
    }),
  );
  assert.equal(origin.mock.calls[0].arguments[1].method, "HEAD");
  assert.equal(result.status, 404);
  assert.equal(await result.text(), "");
});

for (const location of [
  "/swift-twitch-client/documentation/twitch/",
  "https://losfarmosctl.github.io/swift-twitch-client/documentation/twitch/",
]) {
  test(`keeps upstream redirect public: ${location}`, async (t) => {
    const origin = mockOrigin(
      t,
      new Response(null, { status: 301, headers: { Location: location } }),
    );
    const result = await worker.fetch(
      new Request(`${publicOrigin}/swift-twitch-client/documentation/twitch`),
    );
    assert.equal(origin.mock.calls[0].arguments[1].redirect, "manual");
    assert.equal(result.status, 301);
    assert.equal(
      result.headers.get("Location"),
      `${publicOrigin}/swift-twitch-client/documentation/twitch/`,
    );
  });
}

test("leaves external redirects unchanged", async (t) => {
  mockOrigin(
    t,
    new Response(null, {
      status: 302,
      headers: { Location: "https://example.com/" },
    }),
  );
  const result = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client/`),
  );
  assert.equal(result.headers.get("Location"), "https://example.com/");
});

test("the library takes priority over valid or broken Chatless configuration", async (t) => {
  const origin = mockOrigin(t, new Response("library"));
  for (const value of ["https://chatless-docs.example.com/", "not a URL"]) {
    const result = await worker.fetch(
      new Request(`${publicOrigin}/swift-twitch-client/js/app.js`),
      {
        CHATLESS_DOCS_ORIGIN: value,
      },
    );
    assert.equal(result.status, 200);
    assert.equal(
      origin.mock.calls.at(-1).arguments[0].href,
      "https://losfarmosctl.github.io/swift-twitch-client/js/app.js",
    );
  }
});

test("future custom docs can use their own origin and base path", async (t) => {
  const origin = mockOrigin(
    t,
    new Response(null, {
      status: 301,
      headers: { Location: "/chatless-docs/guide/?q=1" },
    }),
  );
  const result = await worker.fetch(new Request(`${publicOrigin}/guide?q=1`), {
    CHATLESS_DOCS_ORIGIN: "https://losfarmosctl.github.io/chatless-docs/",
  });
  assert.equal(
    origin.mock.calls[0].arguments[0].href,
    "https://losfarmosctl.github.io/chatless-docs/guide?q=1",
  );
  assert.equal(result.headers.get("Location"), `${publicOrigin}/guide/?q=1`);
});

test("unpublished Chatless docs and lookalike prefixes do not use the library origin", async (t) => {
  const origin = mockOrigin(t, new Response("unused"));
  for (const path of ["/", "/guide/", "/swift-twitch-client-other/"]) {
    assert.equal(
      (await worker.fetch(new Request(publicOrigin + path))).status,
      404,
    );
  }
  assert.equal(origin.mock.callCount(), 0);
});

test("rejects unsupported methods without contacting an origin", async (t) => {
  const origin = mockOrigin(t, new Response("unused"));
  const post = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client/`, { method: "POST" }),
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
  assert.equal(origin.mock.callCount(), 0);
});

test("invalid Chatless origins fail without making an upstream request", async (t) => {
  const origin = mockOrigin(t, new Response("unused"));
  for (const value of [
    "not a URL",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/?query=1",
    "https://example.com/#fragment",
    publicOrigin,
    "https://docs.chatless.app:8443/",
  ]) {
    const result = await worker.fetch(new Request(publicOrigin + "/"), {
      CHATLESS_DOCS_ORIGIN: value,
    });
    assert.equal(result.status, 500, value);
  }
  assert.equal(origin.mock.callCount(), 0);
});

test("forwards ranges and preserves partial responses", async (t) => {
  const origin = mockOrigin(
    t,
    new Response("part", {
      status: 206,
      headers: { "Content-Range": "bytes 0-3/10" },
    }),
  );
  const result = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client/image.png`, {
      headers: { Range: "bytes=0-3", "If-Range": '"version-1"' },
    }),
  );
  const headers = origin.mock.calls[0].arguments[1].headers;
  assert.equal(headers.get("Range"), "bytes=0-3");
  assert.equal(headers.get("If-Range"), '"version-1"');
  assert.equal(result.status, 206);
  assert.equal(result.headers.get("Content-Range"), "bytes 0-3/10");
});

test("preserves a bodyless cache validation response", async (t) => {
  mockOrigin(
    t,
    new Response(null, { status: 304, headers: { ETag: '"version-1"' } }),
  );
  const result = await worker.fetch(
    new Request(`${publicOrigin}/swift-twitch-client/`),
  );
  assert.equal(result.status, 304);
  assert.equal(result.headers.get("ETag"), '"version-1"');
  assert.equal(await result.text(), "");
});
