// A test handler for this reproduction, not one to copy: it keeps entries and tag state in
// memory and checks tags in get(), as the cacheHandlers contract allows. REPRO_HANDLER picks
// what getExpiration() returns:
//   infinity: Infinity, "check soft tags in get() instead", so get() checks soft tags too
//   zero:     0, "not tracking tag revalidation", so get() checks only the entry's tags
const expirations = { infinity: Infinity, zero: 0 };
const mode = process.env.REPRO_HANDLER;
if (!Object.hasOwn(expirations, mode)) {
  throw new Error(`REPRO_HANDLER must be "infinity" or "zero", not "${mode}"`);
}
const reportedExpiration = expirations[mode];

const entries = new Map();
const pendingSets = new Map();
const tagStates = new Map();

const now = () => performance.timeOrigin + performance.now();

function isExpired(tag, timestamp) {
  const expired = tagStates.get(tag)?.expired;
  return expired !== undefined && expired > timestamp && expired <= now();
}

function isStale(tag, timestamp) {
  const stale = tagStates.get(tag)?.stale;
  return stale !== undefined && stale > timestamp;
}

module.exports = {
  async get(cacheKey, softTags) {
    await pendingSets.get(cacheKey);
    const stored = entries.get(cacheKey);
    if (!stored) return undefined;
    const { entry, bytes } = stored;
    const tags = reportedExpiration === Infinity ? [...entry.tags, ...softTags] : entry.tags;
    if (tags.some((tag) => isExpired(tag, entry.timestamp))) return undefined;
    const revalidate = tags.some((tag) => isStale(tag, entry.timestamp)) ? -1 : entry.revalidate;
    return {
      ...entry,
      revalidate,
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    };
  },

  async set(cacheKey, pendingEntry) {
    let settle;
    pendingSets.set(cacheKey, new Promise((resolve) => (settle = resolve)));
    try {
      const { value, ...entry } = await pendingEntry;
      const bytes = new Uint8Array(await new Response(value).arrayBuffer());
      entries.set(cacheKey, { entry, bytes });
    } finally {
      settle();
      pendingSets.delete(cacheKey);
    }
  },

  async refreshTags() {},

  async getExpiration() {
    return reportedExpiration;
  },

  async updateTags(tags, durations) {
    const at = now();
    for (const tag of tags) {
      const state = { ...tagStates.get(tag) };
      if (durations) {
        state.stale = at;
        if (durations.expire !== undefined) state.expired = at + durations.expire * 1000;
      } else {
        state.expired = at;
      }
      tagStates.set(tag, state);
    }
  },
};
