import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  atFactory: vi.fn(),
  atSend: vi.fn(),
}));

vi.mock("axios", () => ({ default: { post: mocks.axiosPost } }));
vi.mock("africastalking", () => ({ default: mocks.atFactory }));

import { isSmsConfigured, sendSms } from "./notifications";

const SMS_ENV_KEYS = [
  "SMS_PROVIDER",
  "ONFON_API_KEY",
  "ONFON_CLIENT_ID",
  "ONFON_ACCESS_KEY",
  "ONFON_SENDER_ID",
  "ONFON_BASE_URL",
  "SWIFTALERT_API_KEY",
  "SWIFTALERT_CLIENT_ID",
  "SWIFTALERT_ACCESS_KEY",
  "SWIFTALERT_SENDER_ID",
  "SWIFTALERT_BASE_URL",
  "AT_API_KEY",
  "AT_USERNAME",
  "AT_SENDER_ID",
];

describe("sendSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of SMS_ENV_KEYS) delete process.env[key];
    mocks.axiosPost.mockResolvedValue({
      data: {
        ErrorCode: 0,
        ErrorDescription: "Success",
        Data: [{ MobileNumber: "254712345678", MessageId: "msg-1" }],
      },
    });
    mocks.atFactory.mockReturnValue({ SMS: { send: mocks.atSend } });
  });

  it("sends through Onfon with the documented SendBulkSMS payload", async () => {
    process.env.SMS_PROVIDER = "onfon";
    process.env.ONFON_API_KEY = "api-key";
    process.env.ONFON_CLIENT_ID = "client-id";
    process.env.ONFON_ACCESS_KEY = "access-key";
    process.env.ONFON_SENDER_ID = "NURU";

    expect(isSmsConfigured()).toBe(true);
    await sendSms("+254712345678", "Hello from Nuru");

    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS",
      {
        SenderId: "NURU",
        MessageParameters: [{ Number: "254712345678", Text: "Hello from Nuru" }],
        ApiKey: "api-key",
        ClientId: "client-id",
      },
      {
        headers: {
          "Content-Type": "application/json",
          AccessKey: "access-key",
        },
        timeout: 15_000,
      },
    );
  });

  it("accepts SwiftAlert env aliases for the Onfon API", async () => {
    process.env.SWIFTALERT_API_KEY = "api-key";
    process.env.SWIFTALERT_CLIENT_ID = "client-id";
    process.env.SWIFTALERT_ACCESS_KEY = "access-key";
    process.env.SWIFTALERT_SENDER_ID = "NURU";
    process.env.SWIFTALERT_BASE_URL = "https://example.test/sms/";

    await sendSms("+254712345678", "Alias check");

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "https://example.test/sms/SendBulkSMS",
      expect.objectContaining({
        SenderId: "NURU",
        ApiKey: "api-key",
        ClientId: "client-id",
      }),
      expect.objectContaining({ headers: expect.objectContaining({ AccessKey: "access-key" }) }),
    );
  });

  it("keeps Africa's Talking as a fallback provider", async () => {
    process.env.AT_API_KEY = "at-key";
    process.env.AT_USERNAME = "live-user";
    process.env.AT_SENDER_ID = "NURU";

    await sendSms("+254712345678", "Fallback");

    expect(mocks.atFactory).toHaveBeenCalledWith({
      apiKey: "at-key",
      username: "live-user",
    });
    expect(mocks.atSend).toHaveBeenCalledWith({
      to: ["+254712345678"],
      message: "Fallback",
      from: "NURU",
    });
  });

  it("no-ops when Onfon is selected but credentials are incomplete", async () => {
    process.env.SMS_PROVIDER = "onfon";

    expect(isSmsConfigured()).toBe(false);
    await sendSms("+254712345678", "Missing config");

    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.atFactory).not.toHaveBeenCalled();
  });

  it("throws when Onfon rejects the SMS request", async () => {
    process.env.SMS_PROVIDER = "onfon";
    process.env.ONFON_API_KEY = "api-key";
    process.env.ONFON_CLIENT_ID = "client-id";
    process.env.ONFON_ACCESS_KEY = "access-key";
    process.env.ONFON_SENDER_ID = "NURU";
    mocks.axiosPost.mockResolvedValue({
      data: { ErrorCode: 10, ErrorDescription: "Rejected" },
    });

    await expect(sendSms("+254712345678", "Will reject")).rejects.toThrow("Onfon SMS error");
  });
});
