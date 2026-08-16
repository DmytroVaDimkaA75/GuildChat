const assert = require("node:assert/strict");
const test = require("node:test");
const {
  YOUTUBE_CHANNEL,
  fetchYouTubeChannelFeed,
  parseYouTubeChannelFeed,
} = require("./youtubeFeed");

const makeEntry = ({ id, title, publishedAt, description = "", views = "0" }) => `
  <entry>
    <yt:videoId>${id}</yt:videoId>
    <title>${title}</title>
    <published>${publishedAt}</published>
    <media:group>
      <media:thumbnail width="480" url="https://img.example/${id}.jpg" height="360"/>
      <media:description>${description}</media:description>
      <media:community><media:statistics views="${views}"/></media:community>
    </media:group>
  </entry>`;

test("parses and sorts YouTube feed videos from newest to oldest", () => {
  const xml = `<?xml version="1.0"?><feed>
    <title>FoEgameUA &amp; друзі</title>
    ${makeEntry({ id: "aaaaaaaaaaa", title: "Старіше", publishedAt: "2025-01-02T10:00:00Z", views: "12" })}
    ${makeEntry({ id: "bbbbbbbbbbb", title: "Нове &amp; важливе", publishedAt: "2026-02-03T10:00:00Z", description: "Опис\nвідео", views: "45" })}
  </feed>`;

  const result = parseYouTubeChannelFeed(xml);
  assert.equal(result.channel.title, "FoEgameUA & друзі");
  assert.equal(result.channel.id, YOUTUBE_CHANNEL.id);
  assert.deepEqual(result.videos.map(({ id }) => id), ["bbbbbbbbbbb", "aaaaaaaaaaa"]);
  assert.equal(result.videos[0].title, "Нове & важливе");
  assert.equal(result.videos[0].description, "Опис відео");
  assert.equal(result.videos[0].viewCount, 45);
  assert.equal(result.videos[0].thumbnail, "https://img.example/bbbbbbbbbbb.jpg");
});

test("ignores malformed and duplicate video entries", () => {
  const valid = makeEntry({ id: "ccccccccccc", title: "Відео", publishedAt: "2026-01-01T00:00:00Z" });
  const xml = `<feed><title>FoEgameUA</title>${valid}${valid}${makeEntry({ id: "bad", title: "Bad", publishedAt: "2026-01-02T00:00:00Z" })}</feed>`;
  assert.deepEqual(parseYouTubeChannelFeed(xml).videos.map(({ id }) => id), ["ccccccccccc"]);
});

test("fetches and normalizes the fixed channel feed", async () => {
  const xml = `<feed><title>FoEgameUA</title>${makeEntry({ id: "ddddddddddd", title: "Відео", publishedAt: "2026-01-01T00:00:00Z" })}</feed>`;
  let requestedUrl = "";
  const result = await fetchYouTubeChannelFeed({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => xml };
    },
  });

  assert.match(requestedUrl, new RegExp(YOUTUBE_CHANNEL.id));
  assert.equal(result.channel.title, "FoEgameUA");
  assert.equal(result.videos[0].id, "ddddddddddd");
  assert.ok(Number.isFinite(result.fetchedAt));
});

test("rejects invalid feeds and upstream errors", async () => {
  assert.throws(() => parseYouTubeChannelFeed("not xml"), /invalid-youtube-feed/);
  await assert.rejects(
    () => fetchYouTubeChannelFeed({ fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /youtube-feed-http-503/
  );
});
