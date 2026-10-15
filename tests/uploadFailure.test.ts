import { describe, expect, it } from "vitest";
import {
  describeUploadFailure,
  uploadFraction,
  PHOTO_UPLOAD_TIMEOUT_MS,
} from "../src/services/uploadFailure";

/**
 * What a rider is told when a receipt photo does not go through.
 *
 * Every failure used to read "No signal. Move toward the road", including the
 * ones where the server answered in full: the API's words sit in `error`, and
 * the app looked for `message`. And the real failure on 2026-09-24 was neither:
 * the upload outlived a 10 s timeout and never reached the server at all.
 */

const answered = (status: number, data: unknown) => ({ response: { status, data } });

describe("describing a failed photo upload", () => {
  it("passes on what the server said, from the field the server uses", () => {
    const failure = describeUploadFailure(
      answered(422, { error: "We couldn't read that photo. Move to better light." })
    );
    expect(failure.message).toBe("We couldn't read that photo. Move to better light.");
    // A photo nobody could read is not fixed by pressing the same button.
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(422);
  });

  it("still reads the older `message` field", () => {
    expect(describeUploadFailure(answered(400, { message: "Enter the total." })).message).toBe("Enter the total.");
  });

  it("treats scanning being down, or a rate limit, as worth another try", () => {
    expect(describeUploadFailure(answered(503, { error: "Receipt scanning is unavailable." })).retryable).toBe(true);
    expect(describeUploadFailure(answered(429, { error: "Please wait." })).retryable).toBe(true);
  });

  it("names the error when a proxy answered with a page instead of words", () => {
    const failure = describeUploadFailure(answered(502, "<html>Bad gateway</html>"));
    expect(failure.message).toMatch(/error 502/);
  });

  it("says the upload was slow, not that there is no signal, when it timed out", () => {
    const failure = describeUploadFailure({ code: "ECONNABORTED", message: "timeout of 90000ms exceeded" });
    expect(failure.message).toMatch(/took too long/);
    expect(failure.message).not.toMatch(/No signal/i);
  });

  it("says the server could not be reached when nothing answered", () => {
    const failure = describeUploadFailure({ message: "Network Error" });
    expect(failure.message).toMatch(/Could not reach the server/);
    expect(failure.status).toBeNull();
  });

  it("writes no em dashes into what the rider reads", () => {
    const texts = [
      describeUploadFailure({ code: "ECONNABORTED" }).message,
      describeUploadFailure({ message: "Network Error" }).message,
      describeUploadFailure(answered(502, "")).message,
    ];
    for (const text of texts) expect(text).not.toContain("—");
  });

  it("gives a photo far longer than the app's 10 s default to arrive", () => {
    expect(PHOTO_UPLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});

describe("upload progress", () => {
  it("is the share of the photo sent", () => {
    expect(uploadFraction({ loaded: 250, total: 1000 })).toBe(0.25);
    expect(uploadFraction({ loaded: 1200, total: 1000 })).toBe(1);
  });

  it("is unknown rather than zero when the size is not reported", () => {
    expect(uploadFraction({ loaded: 250 })).toBeNull();
    expect(uploadFraction(undefined)).toBeNull();
  });
});
