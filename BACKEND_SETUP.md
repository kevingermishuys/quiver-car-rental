# Backend Setup Guide - Quiver Car Rental Booking System

This guide will help you set up a complete backend for automatic booking processing, email notifications, and payment handling.

## Overview

The system consists of:
1. **Cloudflare Worker** - API endpoint to receive bookings
2. **Supabase** - Database to store booking records
3. **Resend** - Email service for customer & admin notifications
4. **PayGate/Ozow** - Payment processing (optional for now)

## Step 1: Deploy Cloudflare Worker

### 1.1 Create a new Worker

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Workers & Pages** in the left menu
3. Click **Create** → **Create Worker**
4. Name it: `quiver-bookings-api`
5. Click **Deploy**

### 1.2 Add the Worker Code

1. Click **Edit code**
2. Paste the entire contents of `worker.js` (from this repo)
3. Click **Deploy**

### 1.3 Add Environment Variables

1. In the Worker dashboard, go to **Settings** → **Environment variables**
2. Add these variables (you'll set values as you create services):

```
SUPABASE_URL = [will add after Supabase setup]
SUPABASE_KEY = [will add after Supabase setup]
RESEND_API_KEY = [will add after Resend setup]
PAYMENT_PROVIDER_URL = [optional, for PayGate/Ozow]
```

### 1.4 Get Your Worker URL

Your Worker is now live at: `https://quiver-bookings-api.<your-subdomain>.workers.dev/api/bookings`

Note this URL - you'll use it in Step 5.

---

## Step 2: Set Up Supabase (Database)

### 2.1 Create Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Click **Sign Up** (use your email: kevingermishuys@gmail.com)
3. Create a new project
   - Name: `quiver-car-rental`
   - Region: Choose one close to you (South Africa/Johannesburg recommended)
   - Password: Create a strong password

### 2.2 Create Bookings Table

1. In Supabase, click **SQL Editor** (left menu)
2. Click **New Query** and paste this:

```sql
CREATE TABLE bookings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  reference TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  fullName TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT,
  idNumber TEXT NOT NULL,
  licenceNumber TEXT NOT NULL,
  emergencyName TEXT NOT NULL,
  emergencyPhone TEXT NOT NULL,
  pickupLocation TEXT NOT NULL,
  returnLocation TEXT NOT NULL,
  pickupDate DATE NOT NULL,
  returnDate DATE NOT NULL,
  rentalDays INT,
  notes TEXT,
  rentalAmount INT,
  depositAmount INT,
  totalAmount INT,
  paymentStatus TEXT DEFAULT 'pending',
  holdExpiresAt DATE,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bookings_email ON bookings(email);
CREATE INDEX idx_bookings_reference ON bookings(reference);
CREATE INDEX idx_bookings_status ON bookings(status);
```

3. Click **Run**

### 2.3 Get API Credentials

1. In Supabase, go to **Settings** → **API**
2. Copy:
   - **Project URL** → This is your `SUPABASE_URL`
   - **anon public** key → This is your `SUPABASE_KEY`
3. Add these to your Cloudflare Worker environment variables (Step 1.3)

---

## Step 3: Set Up Resend (Email Service)

### 3.1 Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up with your email
3. Go to **API Keys** (left menu)
4. Click **Create API Key** (select "Production")
5. Copy the key

### 3.2 Add Email Domain

1. Go to **Domains** in Resend
2. Add domain: `quivercarrental.com`
3. Follow instructions to add DNS records to Cloudflare
4. Once verified, you can send from `noreply@quivercarrental.com`

### 3.3 Update Worker

1. Add `RESEND_API_KEY` to Cloudflare Worker environment variables (Step 1.3)
2. Uncomment the Resend code in `worker.js` (lines with `api.resend.com`)

---

## Step 4: Update booking.html Form

Change the API endpoint in `booking.html`:

**Find this line (around line 657):**
```javascript
fetch("/api/bookings", {
```

**Replace with your Worker URL:**
```javascript
fetch("https://quiver-bookings-api.<your-subdomain>.workers.dev/api/bookings", {
```

Get your actual Worker subdomain from Cloudflare Worker settings.

---

## Step 5: Test the System

### 5.1 Test Booking Submission

1. Go to https://quivercarrental.com/booking.html
2. Fill in the form completely
3. Click **Pay N$X**
4. Check:
   - ✅ You receive an email at quivercar@gmail.com
   - ✅ Customer receives confirmation at their email
   - ✅ Booking appears in Supabase (check **bookings** table)
   - ✅ Booking reference is generated (QCR-XXXXXXXX)

### 5.2 Check Supabase

1. Go to Supabase dashboard
2. Click **Table Editor** → **bookings**
3. You should see your test booking stored

---

## Step 6: Payment Processing (Optional)

### Option A: PayGate (Recommended for Namibia)

1. Go to [paygate.co.za](https://paygate.co.za)
2. Sign up for merchant account
3. Get credentials:
   - Merchant ID
   - API Key
4. Add to Worker: `PAYMENT_PROVIDER_URL = https://api.paygate.co.za/v1/gateway`
5. In `booking.html`, update payment handler to redirect to PayGate URL

### Option B: Ozow (Also good for Namibia)

1. Go to [ozow.com](https://ozow.com)
2. Create merchant account
3. Get API credentials
4. Similar setup to PayGate

### For Now (Manual)

Leave payment processing off. Customers will still see:
- ✅ Automatic confirmation emails
- ✅ You get notified of new bookings
- ✅ Bookings stored in database
- ❌ Payment handled manually via WhatsApp/Bank transfer

---

## Step 7: Monitor Bookings

### Via Supabase Dashboard

1. Supabase → **Table Editor** → **bookings**
2. See all bookings, filter by status, export to CSV

### Via Email Notifications

Each new booking sends admin email to: quivercar@gmail.com

---

## Troubleshooting

**Bookings not being stored?**
- Check Cloudflare Worker logs: Workers & Pages → Your Worker → Logs
- Verify Supabase credentials in environment variables

**Emails not sending?**
- Check Resend API key is correct
- Verify domain is verified in Resend
- Check spam folder

**Form submission fails?**
- Check browser console for errors (F12)
- Verify Worker URL is correct
- Check CORS headers in Worker

---

## Cost

**Free tier includes:**
- Cloudflare Workers: 100,000 requests/day free
- Supabase: 500MB database, 2GB bandwidth free
- Resend: 100 emails/day free

For your volume, everything stays free indefinitely.

---

## Next Steps

1. Set up Cloudflare Worker (Step 1)
2. Set up Supabase (Step 2)
3. Set up Resend (Step 3)
4. Update booking.html with Worker URL (Step 4)
5. Test the system (Step 5)
6. Monitor bookings (Step 7)

Questions? Check the logs in Cloudflare Worker or Supabase for detailed error messages.
