const DATA_KEY = "letdove/data/items.json";

export async function onRequestGet({ request, env }) {
  const environment = getRuntimeEnvironment(request);

  try {
    const bucket = env.R2_BUCKET || env.LETDOVE_IMAGES;

    if (!bucket) {
      return json({ environment, error: "R2 not bound", items: [], success: false }, 500);
    }

    const object = await bucket.get(DATA_KEY);

    if (!object) {
      return json({
        environment,
        items: [],
        key: DATA_KEY,
        source: "r2",
        success: true
      });
    }

    const text = await object.text();
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items;

    if (!Array.isArray(items)) {
      return json({ environment, error: "Invalid R2 items JSON", items: [], success: false }, 500);
    }

    return json({
      count: items.length,
      environment,
      items,
      key: DATA_KEY,
      source: "r2",
      success: true,
      updatedAt: parsed.updatedAt ?? object.uploaded?.toISOString?.() ?? null
    });
  } catch (error) {
    return json({ environment, error: String(error), items: [], success: false }, 500);
  }
}

function getRuntimeEnvironment(request) {
  try {
    const host = new URL(request.url).hostname;

    return host === "localhost" || host === "127.0.0.1" || host === "::1" ? "local" : "production";
  } catch {
    return "production";
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
