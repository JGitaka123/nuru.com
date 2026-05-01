/**
 * M-Pesa Daraja API client — STK Push (deposit collection) and B2C
 * (escrow release).
 *
 * Daraja is asynchronous: we initiate, then receive a callback. The
 * callback handler MUST be idempotent — Daraja sometimes retries.
 *
 * Critical invariants:
 *  - Use MerchantRequestID as the dedup key in the DB.
 *  - Persist every callback payload in EscrowEvent for audit.
 *  - Money in the DB is always integer KES cents. Daraja wants whole KES.
 *  - Phone numbers to Daraja: 254712345678 (no +, no spaces).
 *  - STK push amount limits: 1 - 250,000 KES per transaction.
 */

import axios, { type AxiosInstance } from "axios";
import { logger } from "../lib/logger";

export interface DarajaConfig {
  env: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
}

export interface StkPushParams {
  phoneE164: string;        // +254712345678
  amountKes: number;        // whole KES (must be ≥1, ≤250000)
  accountReference: string; // e.g. lease ID, ≤12 chars, alphanumeric
  description: string;      // ≤13 chars per Daraja, but we truncate safely
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export interface StkCallbackPayload {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
}

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PROD_BASE = "https://api.safaricom.co.ke";

export class DarajaClient {
  private http: AxiosInstance;
  private accessToken?: string;
  private accessTokenExpiry = 0;

  constructor(private cfg: DarajaConfig) {
    const baseURL = cfg.env === "production" ? PROD_BASE : SANDBOX_BASE;
    this.http = axios.create({ baseURL, timeout: 15_000 });
  }

  /** Convert +254712345678 to 254712345678 for Daraja. */
  static normalizePhone(phoneE164: string): string {
    if (!phoneE164.startsWith("+254") || phoneE164.length !== 13) {
      throw new Error(`Invalid Kenyan phone number: ${phoneE164}`);
    }
    return phoneE164.slice(1);
  }

  /** Daraja access tokens last 1 hour. We refresh ~5 min early. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }
    const auth = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString("base64");
    const { data } = await this.http.get<{ access_token: string; expires_in: string }>(
      "/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (parseInt(data.expires_in, 10) - 300) * 1000;
    return this.accessToken;
  }

  private buildStkPassword(): { password: string; timestamp: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp =
      now.getFullYear().toString() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());
    const raw = `${this.cfg.shortcode}${this.cfg.passkey}${timestamp}`;
    return { password: Buffer.from(raw).toString("base64"), timestamp };
  }

  /**
   * Initiate STK Push. The user's phone gets a prompt asking for their
   * M-Pesa PIN. Result arrives later via callback to MPESA_CALLBACK_URL.
   *
   * Returns immediately with the IDs we need to track this transaction.
   */
  async stkPush(p: StkPushParams): Promise<StkPushResult> {
    if (p.amountKes < 1 || p.amountKes > 250_000) {
      throw new Error(`Amount out of range: ${p.amountKes} (must be 1-250000)`);
    }
    const phone = DarajaClient.normalizePhone(p.phoneE164);
    const token = await this.getAccessToken();
    const { password, timestamp } = this.buildStkPassword();

    const body = {
      BusinessShortCode: this.cfg.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: p.amountKes,
      PartyA: phone,
      PartyB: this.cfg.shortcode,
      PhoneNumber: phone,
      CallBackURL: this.cfg.callbackUrl,
      AccountReference: p.accountReference.slice(0, 12),
      TransactionDesc: p.description.slice(0, 13),
    };

    const { data } = await this.http.post("/mpesa/stkpush/v1/processrequest", body, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (data.ResponseCode !== "0") {
      logger.error({ data }, "stk push rejected by daraja");
      throw new Error(`Daraja rejected STK push: ${data.ResponseDescription}`);
    }

    return {
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode,
      responseDescription: data.ResponseDescription,
      customerMessage: data.CustomerMessage,
    };
  }

  /**
   * Parse a Daraja STK callback into a typed shape. Caller is responsible
   * for: idempotency check (use merchantRequestId), persisting EscrowEvent,
   * and updating Escrow status.
   */
  static parseStkCallback(payload: any): StkCallbackPayload {
    const stk = payload?.Body?.stkCallback;
    if (!stk) throw new Error("Invalid Daraja callback payload");

    const items: Array<{ Name: string; Value: any }> =
      stk.CallbackMetadata?.Item ?? [];
    const get = (name: string) => items.find((i) => i.Name === name)?.Value;

    return {
      merchantRequestId: stk.MerchantRequestID,
      checkoutRequestId: stk.CheckoutRequestID,
      resultCode: stk.ResultCode,
      resultDesc: stk.ResultDesc,
      amount: get("Amount"),
      mpesaReceiptNumber: get("MpesaReceiptNumber"),
      transactionDate: get("TransactionDate")?.toString(),
      phoneNumber: get("PhoneNumber")?.toString(),
    };
  }

  /**
   * Poll transaction status — fallback if a callback never arrives.
   * Daraja is mostly reliable but never trust the network.
   */
  async queryStkStatus(checkoutRequestId: string): Promise<{
    resultCode: string;
    resultDesc: string;
  }> {
    const token = await this.getAccessToken();
    const { password, timestamp } = this.buildStkPassword();

    const { data } = await this.http.post(
      "/mpesa/stkpushquery/v1/query",
      {
        BusinessShortCode: this.cfg.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return { resultCode: data.ResultCode, resultDesc: data.ResultDesc };
  }
}

/** Singleton built from env. */
export function buildDarajaFromEnv(): DarajaClient {
  return new DarajaClient({
    env: (process.env.MPESA_ENV as "sandbox" | "production") ?? "sandbox",
    consumerKey: process.env.MPESA_CONSUMER_KEY!,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
    shortcode: process.env.MPESA_SHORTCODE!,
    passkey: process.env.MPESA_PASSKEY!,
    callbackUrl: process.env.MPESA_CALLBACK_URL!,
  });
}
