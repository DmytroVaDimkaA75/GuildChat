const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractLinkMetadata,
  isPrivateAddress,
  normalizePreviewUrl,
} = require("./linkPreview");

test("extracts Open Graph metadata regardless of attribute order", () => {
  const html = `
    <html><head>
      <title>Fallback title</title>
      <meta content="Guild &amp; Chat" property="og:title">
      <meta name="description" content="A useful page">
      <meta property="og:image" content="/cover.jpg">
    </head></html>`;
  assert.deepEqual(extractLinkMetadata(html, "https://example.com/topic"), {
    title: "Guild & Chat",
    description: "A useful page",
    image: "https://example.com/cover.jpg",
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
