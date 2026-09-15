// POST /api/bookings — public booking submission.
// Creates a provisional "held" booking that blocks the requested dates for
// HOLD_HOURS while the deposit is arranged, then re-validates and inserts.
// There is no live payment gateway yet: a human confirms the booking and
// marks the deposit paid from the admin panel (see /api/admin/bookings).

const HOLD_HOURS = 48;
const DEPOSIT_AMOUNT = 5000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

async function findOverlap(db, pickupDate, returnDate) {
  const { results } = await db
    .prepare(
      `SELECT id FROM bookings
       WHERE status IN ('held', 'confirmed')
         AND (status = 'confirmed' OR hold_expires_at > datetime('now'))
         AND pickup_date <= ?
         AND return_date >= ?
       LIMIT 1`
    )
    .bind(returnDate, pickupDate)
    .all();
  return results.length > 0;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  // honeypot
  if (body.website) {
    return json({ ok: true, id: 0, holdExpiresAt: null });
  }

  const period = "daily";
  const rate = Number.isFinite(Number(body.rate)) && Number(body.rate) > 0 ? Number(body.rate) : null;
  const estimatedTotal = Number.isFinite(Number(body.estimatedTotal)) && Number(body.estimatedTotal) > 0 ? Number(body.estimatedTotal) : null;
  const pickupDate = body.pickupDate;
  const returnDate = body.returnDate;
  const pickupTime = String(body.pickupTime || "").trim().slice(0, 10);
  const returnTime = String(body.returnTime || "").trim().slice(0, 10);
  const pickupLocation = String(body.pickupLocation || "").trim().slice(0, 120);
  const returnLocation = String(body.returnLocation || "").trim().slice(0, 120);
  const adults = Number(body.adults);
  const children = Number(body.children || 0);
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 160);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const country = String(body.country || "").trim().slice(0, 80) || null;
  const idNumber = String(body.idNumber || "").trim().slice(0, 60) || null;
  const licenceNumber = String(body.licenceNumber || "").trim().slice(0, 60) || null;
  const notes = String(body.notes || "").trim().slice(0, 2000) || null;

  const errors = {};
  if (!isValidDate(pickupDate)) errors.pickupDate = "A valid pickup date is required.";
  if (!isValidDate(returnDate)) errors.returnDate = "A valid return date is required.";
  if (!pickupTime) errors.pickupTime = "A pickup time is required.";
  if (!returnTime) errors.returnTime = "A return time is required.";
  if (!pickupLocation) errors.pickupLocation = "A pickup location is required.";
  if (!returnLocation) errors.returnLocation = "A return location is required.";
  if (!Number.isInteger(adults) || adults < 1) errors.adults = "At least one adult is required.";
  if (!name) errors.name = "A name is required.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "A valid email is required.";
  if (!phone) errors.phone = "A phone/WhatsApp number is required.";

  if (isValidDate(pickupDate) && isValidDate(returnDate)) {
    if (returnDate < pickupDate) {
      errors.returnDate = "The return date must be on or after the pickup date.";
    } else {
      const days = Math.round((Date.parse(returnDate) - Date.parse(pickupDate)) / 86400000) + 1;
      if (days < 3) {
        errors.returnDate = "A rental requires a minimum of 3 days.";
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return json({ error: "Please fix the highlighted fields.", fields: errors }, 400);
  }

  const overlap = await findOverlap(env.REVIEWS_DB, pickupDate, returnDate);
  if (overlap) {
    return json(
      { error: "Those dates were just taken by another booking. Please choose different dates.", fields: { returnDate: "Not available." } },
      409
    );
  }

  const result = await env.REVIEWS_DB.prepare(
    `INSERT INTO bookings
      (status, period, rate, estimated_total, pickup_date, pickup_time, return_date, return_time, pickup_location, return_location,
       adults, children, name, email, phone, country, id_number, licence_number, notes,
       deposit_amount, deposit_status, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', datetime('now', ?))`
  )
    .bind(
      "held",
      period,
      rate,
      estimatedTotal,
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
      pickupLocation,
      returnLocation,
      adults,
      children,
      name,
      email,
      phone,
      country,
      idNumber,
      licenceNumber,
      notes,
      DEPOSIT_AMOUNT,
      `+${HOLD_HOURS} hours`
    )
    .run();

  const id = result.meta.last_row_id;
  const row = await env.REVIEWS_DB.prepare("SELECT hold_expires_at FROM bookings WHERE id = ?").bind(id).first();

  return json({
    ok: true,
    id,
    reference: "QCR-" + String(id).padStart(4, "0"),
    holdExpiresAt: row ? row.hold_expires_at : null,
    depositAmount: DEPOSIT_AMOUNT,
  });
}
