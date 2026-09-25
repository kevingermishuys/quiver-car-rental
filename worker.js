// Cloudflare Worker for Quiver Car Rental Booking API
// Handles: validation, storage, email notifications, payment processing

export default {
  async fetch(request, env) {
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response('OK', { headers });
    }

    const url = new URL(request.url);

    // POST /api/bookings - Create new booking
    if (url.pathname === '/api/bookings' && request.method === 'POST') {
      return handleBooking(request, env, headers);
    }

    // GET /api/bookings/availability - Check availability
    if (url.pathname === '/api/bookings/availability' && request.method === 'GET') {
      return handleAvailability(request, env, headers);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  }
};

async function handleBooking(request, env, headers) {
  try {
    const payload = await request.json();

    // Validate required fields
    const validation = validateBooking(payload);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers });
    }

    // Check availability
    const availability = await checkAvailability(payload, env);
    if (!availability.available) {
      return new Response(JSON.stringify({ error: availability.reason || 'Dates not available' }), { status: 400, headers });
    }

    // Generate booking reference
    const reference = generateReference();
    const holdExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate total amount
    const rentalDays = payload.rentalDays || 1;
    const rates = {
      'Swakopmund': 1850,
      'Hosea Kutako International Airport (Windhoek)': 1900,
      'Walvis Bay International Airport': 2050
    };
    const dailyRate = rates[payload.pickupLocation] || 1850;
    const rentalAmount = dailyRate * rentalDays;
    const depositAmount = 5000;
    const totalAmount = rentalAmount + depositAmount;

    // Prepare booking data
    const booking = {
      reference,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      idNumber: payload.idNumber,
      licenceNumber: payload.licenceNumber,
      pickupLocation: payload.pickupLocation,
      returnLocation: payload.returnLocation,
      pickupDate: payload.pickupDate,
      returnDate: payload.returnDate,
      rentalDays,
      totalAmount
    };

    // Store in database
    await storeBooking(booking, env);

    // Send confirmation email to customer
    await sendCustomerConfirmationEmail(booking, env);

    // Send notification email to you
    await sendNotificationEmail(booking, env);

    // If payment provider is configured, return payment URL
    let paymentUrl = null;
    if (env.PAYMENT_PROVIDER_URL) {
      paymentUrl = buildPaymentUrl(booking, env);
    }

    return new Response(JSON.stringify({
      success: true,
      reference: booking.reference,
      holdExpiresAt: booking.holdExpiresAt,
      totalAmount: booking.totalAmount,
      paymentUrl: paymentUrl
    }), { status: 200, headers });

  } catch (error) {
    console.error('Booking error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process booking: ' + error.message }), { status: 500, headers });
  }
}

async function handleAvailability(request, env, headers) {
  try {
    const url = new URL(request.url);
    const pickupDate = url.searchParams.get('pickupDate');
    const returnDate = url.searchParams.get('returnDate');

    if (!pickupDate || !returnDate) {
      return new Response(JSON.stringify({ error: 'Missing dates' }), { status: 400, headers });
    }

    const blocked = await getBlockedDates(env);
    const isAvailable = !blocked.some(d => (d >= pickupDate && d <= returnDate));

    return new Response(JSON.stringify({
      available: isAvailable,
      blockedDates: blocked
    }), { status: 200, headers });

  } catch (error) {
    console.error('Availability error:', error);
    return new Response(JSON.stringify({ available: true, error: error.message }), { status: 200, headers });
  }
}

function validateBooking(payload) {
  const required = ['fullName', 'email', 'phone', 'pickupDate', 'returnDate', 'pickupLocation', 'returnLocation', 'idNumber', 'licenceNumber', 'emergencyName', 'emergencyPhone'];

  for (const field of required) {
    if (!payload[field]) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { valid: false, error: 'Invalid email address' };
  }

  // Validate dates
  const pickup = new Date(payload.pickupDate);
  const returnD = new Date(payload.returnDate);
  if (returnD <= pickup) {
    return { valid: false, error: 'Return date must be after pickup date' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (pickup < today) {
    return { valid: false, error: 'Pickup date must be in the future' };
  }

  return { valid: true };
}

async function checkAvailability(payload, env) {
  try {
    const blocked = await getBlockedDates(env);
    const pickup = payload.pickupDate;
    const returnDate = payload.returnDate;

    const isBlocked = blocked.some(d => (d >= pickup && d <= returnDate));
    if (isBlocked) {
      return { available: false, reason: 'Vehicle not available for selected dates' };
    }

    return { available: true };
  } catch (error) {
    console.warn('Availability check warning:', error);
    // If check fails, allow booking to proceed (fail open)
    return { available: true };
  }
}

async function getBlockedDates(env) {
  try {
    // Fetch blocked dates from database or return empty array
    // TODO: Implement when database is set up
    return [];
  } catch (error) {
    console.warn('Error fetching blocked dates:', error);
    return [];
  }
}

async function storeBooking(booking, env) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      console.warn('Supabase credentials not configured');
      return;
    }

    const url = new URL(`${env.SUPABASE_URL}/rest/v1/bookings`);
    url.searchParams.set('apikey', env.SUPABASE_SERVICE_KEY);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(booking)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Supabase error:', error);
    } else {
      console.log('Booking stored successfully:', booking.reference);
    }
  } catch (error) {
    console.error('Database error:', error);
    // Don't fail the booking if database write fails
  }
}

async function sendCustomerConfirmationEmail(booking, env) {
  try {
    const emailBody = `
Hi ${booking.fullName},

Thank you for your booking request with Quiver Car Rental!

Your booking reference: ${booking.reference}
Dates held until: ${booking.holdExpiresAt}

Booking Details:
- Pickup: ${booking.pickupDate} at ${booking.pickupLocation}
- Return: ${booking.returnDate} at ${booking.returnLocation}
- Rental Days: ${booking.rentalDays}
- Daily Rate: N$${(booking.rentalAmount / booking.rentalDays).toLocaleString()}
- Rental Amount: N$${booking.rentalAmount.toLocaleString()}
- Refundable Deposit: N$${booking.depositAmount.toLocaleString()}
- Total Due: N$${booking.totalAmount.toLocaleString()}

We will confirm availability and pricing with you shortly via WhatsApp or email.

Contact: +264 81 808 9213 (WhatsApp)
Email: quivercar@gmail.com

Best regards,
Quiver Car Rental
Swakopmund, Namibia
    `.trim();

    if (!env.RESEND_API_KEY) {
      console.warn('Resend API key not configured, skipping email');
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'noreply@quivercarrental.com',
        to: booking.email,
        subject: `Booking Confirmation - Reference: ${booking.reference}`,
        text: emailBody
      })
    });

    if (response.ok) {
      console.log('Customer confirmation email sent to:', booking.email);
    } else {
      console.error('Resend email error:', await response.text());
    }
  } catch (error) {
    console.error('Email error:', error);
  }
}

async function sendNotificationEmail(booking, env) {
  try {
    const adminEmail = 'quivercar@gmail.com';

    const emailBody = `
New Booking Request Received!

Reference: ${booking.reference}
Status: ${booking.status}

Customer:
${booking.fullName}
Email: ${booking.email}
Phone: ${booking.phone}
Country: ${booking.country || 'N/A'}

ID/Passport: ${booking.idNumber}
Driver's Licence: ${booking.licenceNumber}

Emergency Contact: ${booking.emergencyName} - ${booking.emergencyPhone}

Booking Dates:
Pickup: ${booking.pickupDate} at ${booking.pickupLocation}
Return: ${booking.returnDate} at ${booking.returnLocation}
Days: ${booking.rentalDays}

Pricing:
Rental: N$${booking.rentalAmount.toLocaleString()}
Deposit: N$${booking.depositAmount.toLocaleString()}
Total: N$${booking.totalAmount.toLocaleString()}

Notes: ${booking.notes || 'None'}

Please review and confirm with the customer.
    `.trim();

    if (!env.RESEND_API_KEY) {
      console.warn('Resend API key not configured, skipping notification email');
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'noreply@quivercarrental.com',
        to: adminEmail,
        subject: `New Booking Request - Reference: ${booking.reference}`,
        text: emailBody
      })
    });

    if (response.ok) {
      console.log('Admin notification email sent to:', adminEmail);
    } else {
      console.error('Resend notification error:', await response.text());
    }
  } catch (error) {
    console.error('Notification error:', error);
  }
}

function buildPaymentUrl(booking, env) {
  const baseUrl = env.PAYMENT_PROVIDER_URL;
  const params = new URLSearchParams({
    amount: booking.totalAmount * 100, // Convert to cents
    reference: booking.reference,
    return_url: 'https://quivercarrental.com/booking.html?success=true',
    customer_email: booking.email,
    customer_name: booking.fullName
  });
  return `${baseUrl}?${params.toString()}`;
}

function generateReference() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'QCR-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
