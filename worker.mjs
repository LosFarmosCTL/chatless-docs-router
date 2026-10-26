const libraryPath = "/swift-twitch-client";
const libraryOrigin = "https://losfarmosctl.github.io";

export default {
  async fetch(request, env = {}) {
    const publicURL = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    if (publicURL.pathname === libraryPath) {
      publicURL.pathname += "/";
      return Response.redirect(publicURL.href, 308);
    }

    let upstreamURL;
    if (publicURL.pathname.startsWith(`${libraryPath}/`)) {
      upstreamURL = new URL(
        publicURL.pathname + publicURL.search,
        libraryOrigin,
      );
    } else if (env.CHATLESS_DOCS_ORIGIN) {
      let origin;
      try {
        origin = new URL(env.CHATLESS_DOCS_ORIGIN);
      } catch {
        return new Response("Invalid Chatless documentation origin", {
          status: 500,
        });
      }

      if (
        origin.protocol !== "https:" ||
        origin.hostname === publicURL.hostname ||
        origin.username ||
        origin.password ||
        origin.search ||
        origin.hash
      ) {
        return new Response("Invalid Chatless documentation origin", {
          status: 500,
        });
      }

      upstreamURL = new URL(origin);
      upstreamURL.pathname =
        origin.pathname.replace(/\/$/, "") + publicURL.pathname;
      upstreamURL.search = publicURL.search;
    } else {
      return new Response("Chatless documentation is not published yet.\n", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers();
    for (const name of [
      "accept",
      "accept-encoding",
      "if-modified-since",
      "if-none-match",
      "range",
      "if-range",
    ]) {
      const value = request.headers.get(name);
      if (value !== null) {
        headers.set(name, value);
      }
    }

    const upstream = await fetch(upstreamURL, {
      method: request.method,
      headers,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get("Location");
    if (location) {
      const target = new URL(location, upstreamURL);
      if (target.origin === upstreamURL.origin) {
        if (!publicURL.pathname.startsWith(`${libraryPath}/`)) {
          const basePath = new URL(env.CHATLESS_DOCS_ORIGIN).pathname.replace(
            /\/$/,
            "",
          );
          if (
            target.pathname === basePath ||
            target.pathname.startsWith(`${basePath}/`)
          ) {
            target.pathname = target.pathname.slice(basePath.length) || "/";
          }
        }

        target.protocol = publicURL.protocol;
        target.host = publicURL.host;
        responseHeaders.set("Location", target.href);
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
