import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import Razorpay from "razorpay";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { products } from "./src/products.js";

const app = express();
const port = Number(process.env.PORT) || 4242;
const freeShippingThreshold = 150000;
const standardShipping = 7900;

app.use(express.json());

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function isValidShippingDetails(details) {
  return (
    details &&
    typeof details.fullName === "string" &&
    details.fullName.trim().length > 0 &&
    details.fullName.trim().length <= 100 &&
    typeof details.email === "string" &&
    details.email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim()) &&
    typeof details.phone === "string" &&
    /^[6-9]\d{9}$/.test(details.phone.trim()) &&
    typeof details.addressLine1 === "string" &&
    details.addressLine1.trim().length > 0 &&
    details.addressLine1.trim().length <= 200 &&
    typeof details.city === "string" &&
    details.city.trim().length > 0 &&
    details.city.trim().length <= 100 &&
    typeof details.state === "string" &&
    details.state.trim().length > 0 &&
    details.state.trim().length <= 100 &&
    typeof details.pincode === "string" &&
    /^\d{6}$/.test(details.pincode.trim())
  );
}

app.post("/api/create-razorpay-order", async (request, response) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return response.status(503).json({
      error: "Online payments are not configured yet. Add your Razorpay API keys to .env.",
    });
  }
  if (!Array.isArray(request.body?.items) || request.body.items.length === 0) {
    return response.status(400).json({ error: "Your bag is empty." });
  }
  if (!isValidShippingDetails(request.body?.shippingDetails)) {
    return response.status(400).json({ error: "Enter a valid Indian delivery address." });
  }

  const seenProductIds = new Set();
  let subtotal = 0;
  for (const item of request.body.items) {
    const product = products.find((entry) => entry.id === item?.id);
    if (
      !product ||
      seenProductIds.has(item.id) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    ) {
      return response.status(400).json({ error: "Your bag contains an invalid item." });
    }
    seenProductIds.add(item.id);
    subtotal += product.price * item.quantity * 100;
  }

  const shipping = subtotal >= freeShippingThreshold ? 0 : standardShipping;
  const details = request.body.shippingDetails;

  try {
    const order = await razorpay.orders.create({
      amount: subtotal + shipping,
      currency: "INR",
      receipt: `nails-${Date.now()}`,
      notes: {
        customer_name: details.fullName.trim(),
        customer_email: details.email.trim(),
        customer_phone: details.phone.trim(),
        address_line1: details.addressLine1.trim(),
        address_city: details.city.trim(),
        address_state: details.state.trim(),
        address_pincode: details.pincode.trim(),
      },
    });
    return response.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Unable to create Razorpay order:", error);
    return response.status(502).json({
      error: "We couldn't connect to secure checkout. Please try again.",
    });
  }
});

app.post("/api/verify-razorpay-payment", async (request, response) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return response.status(503).json({
      error: "Online payments are not configured yet. Add your Razorpay API keys to .env.",
    });
  }

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } =
    request.body || {};
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return response.status(400).json({ error: "The payment confirmation is invalid." });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return response.status(400).json({ error: "The payment signature could not be verified." });
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.currency !== "INR") {
      return response.status(400).json({ error: "The payment does not match this order." });
    }
    if (payment.status !== "captured") {
      return response.status(409).json({
        error: "Your payment is still being confirmed. Please check again shortly.",
      });
    }
    return response.json({ verified: true });
  } catch (error) {
    console.error("Unable to verify Razorpay payment:", error);
    return response.status(502).json({
      error: "We couldn't confirm your payment yet. Please contact the store before trying again.",
    });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
  app.use(express.static(distPath));
  app.get("*", (_request, response) => response.sendFile(path.join(distPath, "index.html")));
}

app.listen(port, () => {
  console.log(`nails.musestudio payment server listening on http://localhost:${port}`);
});
