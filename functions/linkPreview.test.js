const assert = require("node:assert/strict");
const dns = require("node:dns").promises;
const test = require("node:test");
const {
  createImagePreview,
  createYouTubePreview,
  extractLinkMetadata,
  fetchLinkPreview,
  getYouTubeVideoId,
  isPrivateAddress,
  normalizePreviewUrl,
} = require("./linkPreview");

test("builds a visual preview for a direct image URL", () => {
  assert.deepEqual(
    createImagePreview(new URL("https://cdn.example.com/images/photo%20one.jpg")),
    {
      status: "ok",
      kind: "image",
      url: "https://cdn.example.com/images/photo%20one.jpg",
      host: "cdn.example.com",
      title: "photo one.jpg",
      description: "",
      image: "https://cdn.example.com/images/photo%20one.jpg",
    }
  );
});

test("returns an image preview when the remote response is an image", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (name) => name === "content-type" ? "image/jpeg" : null,
    },
  });

  assert.deepEqual(await fetchLinkPreview("https://8.8.8.8/photo.jpg"), {
    status: "ok",
    kind: "image",
    url: "https://8.8.8.8/photo.jpg",
    host: "8.8.8.8",
    title: "photo.jpg",
    description: "",
    image: "https://8.8.8.8/photo.jpg",
  });
});

test("recognizes supported YouTube URLs without accepting lookalike hosts", () => {
  assert.equal(getYouTubeVideoId(new URL("https://youtu.be/7VWj-DukBLY?si=abc")), "7VWj-DukBLY");
  assert.equal(getYouTubeVideoId(new URL("https://www.youtube.com/watch?v=7VWj-DukBLY")), "7VWj-DukBLY");
  assert.equal(getYouTubeVideoId(new URL("https://youtube.com/shorts/7VWj-DukBLY")), "7VWj-DukBLY");
  assert.equal(getYouTubeVideoId(new URL("https://youtube.com.evil.example/watch?v=7VWj-DukBLY")), "");
});

test("builds a deterministic YouTube fallback preview", () => {
  assert.deepEqual(createYouTubePreview(new URL("https://youtu.be/7VWj-DukBLY?si=abc")), {
    status: "ok",
    kind: "video",
    url: "https://youtu.be/7VWj-DukBLY?si=abc",
    host: "youtube.com",
    title: "YouTube video",
    description: "",
    image: "https://i.ytimg.com/vi/7VWj-DukBLY/hqdefault.jpg",
  });
});

test("uses YouTube oEmbed metadata when it is available", async (t) => {
  const originalFetch = global.fetch;
  const originalLookup = dns.lookup;
  t.after(() => {
    global.fetch = originalFetch;
    dns.lookup = originalLookup;
  });
  dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({
      title: "Preview title",
      author_name: "Channel name",
      thumbnail_url: "https://i.ytimg.com/vi/7VWj-DukBLY/hqdefault.jpg",
    }),
  });

  assert.deepEqual(await fetchLinkPreview("https://youtu.be/7VWj-DukBLY?si=abc"), {
    status: "ok",
    kind: "video",
    url: "https://youtu.be/7VWj-DukBLY?si=abc",
    host: "youtube.com",
    title: "Preview title",
    description: "Channel name",
    image: "https://i.ytimg.com/vi/7VWj-DukBLY/hqdefault.jpg",
  });
});

test("parses metadata from the bounded prefix of a large HTML page", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const html = `<head><title>Large page title</title></head>${"x".repeat(600 * 1024)}`;
  let read = false;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => name === "content-type" ? "text/html" : String(html.length) },
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          return { done: false, value: new TextEncoder().encode(html) };
        },
        cancel: async () => {},
      }),
    },
  });

  assert.deepEqual(await fetchLinkPreview("https://8.8.8.8/large-page"), {
    status: "ok",
    kind: "page",
    url: "https://8.8.8.8/large-page",
    host: "8.8.8.8",
    title: "Large page title",
    description: "",
    image: "",
    siteName: "",
    icon: "https://8.8.8.8/favicon.ico",
  });
});

test("extracts Open Graph metadata regardless of attribute order", () => {
  const html = `
    <html><head>
      <title>Fallback title</title>
      <meta content="Guild &amp; Chat" property="og:title">
      <meta name="description" content="A useful page">
      <meta property="og:image" content="/cover.jpg">
      <meta property="og:site_name" content="Example site">
      <link rel="icon" href="/favicon.png">
    </head></html>`;
  assert.deepEqual(extractLinkMetadata(html, "https://example.com/topic"), {
    title: "Guild & Chat",
    description: "A useful page",
    image: "https://example.com/cover.jpg",
    siteName: "Example site",
    icon: "https://example.com/favicon.png",
  });
});

test("normalizes public web URLs and rejects unsafe protocols and ports", () => {
  assert.equal(normalizePreviewUrl("example.com/a#part").toString(), "https://example.com/a");
  assert.throws(() => normalizePreviewUrl("file:///etc/passwd"), /invalid-url/);
  assert.throws(() => normalizePreviewUrl("https://example.com:8443"), /unsupported-port/);
});

test("detects private IPv4 and IPv6 targets", () => {
  for (const address of ["127.0.0.1", "10.2.3.4", "172.20.1.1", "192.168.1.2", "169.254.1.1", "::1", "fd00::1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});
