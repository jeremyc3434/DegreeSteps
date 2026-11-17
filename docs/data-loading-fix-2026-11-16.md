# Degree data loading correction

The live JSON response was gzip-compressed twice. A production GET for `/data/pathways.json` returned HTTP 200 and `Content-Encoding: gzip`, but its body still started with the gzip signature after the client's normal decompression. One extra manual decompression produced the exact source JSON. This prevents browser JSON loading and can surface as a generic pattern/parse error.

The static asset response now uses Cloudflare's `encodeBody: 'manual'` so already-compressed bytes are sent unchanged. Compressed asset cache validators also receive a new representation suffix: an older cached response must be fetched again rather than reused through a 304 response. HEAD and conditional responses keep consistent headers.

Regression coverage simulates Cloudflare's automatic response encoding around the actual built Worker and checks a single browser decompression followed by JSON parsing. It covers initial degree data, cost data, the registry, a compiled curriculum pack, identity requests and cache validators. Existing Worker boundary tests remain applicable. Live compressed responses are checked again after publication.

Runtime reference: https://developers.cloudflare.com/workers/runtime-apis/response/#the-encodebody-option
