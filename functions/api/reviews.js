// GET /api/reviews — public list of approved reviews
// POST /api/reviews — public submission, stored as "pending" until approved in the admin panel

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ env }) {
  const { results } = await env.REVIEWS_DB.prepare(
    "SELECT id, name, rating, trip, review, created_at FROM reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT 50"
  ).all();
  return json({ reviews: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  // honeypot: bots tend to fill every field, humans never see or fill this one
  if (body.website) {
    return json({ ok: true });
  }

  const name = String(body.name || "").trim().slice(0, 80);
  const trip = String(body.trip || "").trim().slice(0, 120);
  const review = String(body.review || "").trim().slice(0, 2000);
  const rating = Number(body.rating);

  if (!name || !review) {
    return json({ error: "Name and review are required." }, 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: "Rating must be a whole number from 1 to 5." }, 400);
  }
  if (review.length < 10) {
    return json({ error: "Review is too short." }, 400);
  }

  await env.REVIEWS_DB.prepare(
    "INSERT INTO reviews (name, rating, trip, review, status) VALUES (?, ?, ?, ?, 'pending')"
  )
    .bind(name, rating, trip || null, review)
    .run();

  return json({ ok: true, message: "Thanks — your review will appear once it's been checked." });
}
