/**
 * Simulate an STK push in the Daraja sandbox.
 *
 * Run: pnpm mpesa:simulate <amount> [phone]
 *
 * Defaults:
 *   amount: 1 KES
 *   phone:  the Daraja sandbox test number 254708374149
 *
 * Useful for verifying:
 *   - Daraja credentials are correct.
 *   - Callback URL is reachable from Safaricom (use ngrok in dev).
 *   - Our callback handler updates Escrow correctly.
 */

import { buildDarajaFromEnv } from "../src/services/mpesa";

async function main() {
  const amount = Number(process.argv[2] ?? 1);
  const phone = process.argv[3] ?? "+254708374149";

  if (!process.env.MPESA_CONSUMER_KEY) {
    console.error("MPESA_CONSUMER_KEY not set; copy from .env.example and configure.");
    process.exit(1);
  }
  if (process.env.MPESA_ENV !== "sandbox") {
    console.error("Refusing to run against non-sandbox env. Set MPESA_ENV=sandbox.");
    process.exit(1);
  }

  const daraja = buildDarajaFromEnv();
  console.log(`Simulating STK push of KES ${amount} to ${phone}…`);
  const r = await daraja.stkPush({
    phoneE164: phone,
    amountKes: amount,
    accountReference: "SIMTEST",
    description: "Simulator",
  });
  console.log("✓ Sent. Watch the test phone for the prompt.");
  console.log(`  MerchantRequestID:  ${r.merchantRequestId}`);
  console.log(`  CheckoutRequestID:  ${r.checkoutRequestId}`);
  console.log(`  Customer message:   ${r.customerMessage}`);
  console.log();
  console.log("Daraja will POST the result to MPESA_CALLBACK_URL.");
  console.log("Tail your API logs to see the callback come in.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
