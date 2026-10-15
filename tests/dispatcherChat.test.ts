import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rider's conversations with dispatchers, one each (2026-10-07): whom a
 * reply goes to, where messages live in each mode, and that one send writes
 * the message together with both summary rows.
 */

const writes = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }));

vi.mock("../src/firebase/config", () => ({ database: {} }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path?: string) => ({ path: path ?? "" }),
  push: () => ({ key: "k1" }),
  update: async (_ref: unknown, values: Record<string, unknown>) => {
    writes.updates.push(values);
  },
  onValue: () => () => undefined,
}));

import {
  pickReplyThread,
  riderMessagesPath,
  sendRiderMessage,
  type DispatcherThread,
} from "../src/firebase/dispatcherChat";

const thread = (id: number, updatedAt: number): DispatcherThread => ({
  staffUid: `staff_${id}`,
  dispatcherId: String(id),
  dispatcherName: `Dispatcher ${id}`,
  lastMessage: "",
  lastSender: "dispatcher",
  updatedAt,
});

beforeEach(() => {
  writes.updates = [];
});

describe("whom a reply goes to", () => {
  it("prefers the dispatcher handling the current errand, even over a newer conversation", () => {
    expect(pickReplyThread([thread(4, 200), thread(7, 100)], 7)).toBe("staff_7");
  });

  it("starts a conversation with the errand's dispatcher when none exists yet", () => {
    expect(pickReplyThread([thread(4, 200)], 9)).toBe("staff_9");
  });

  it("without an errand, answers whoever wrote last", () => {
    expect(pickReplyThread([thread(4, 200), thread(7, 100)], null)).toBe("staff_4");
  });

  it("with no errand and no conversation, has nobody to write to", () => {
    expect(pickReplyThread([], undefined)).toBeNull();
    expect(pickReplyThread([], "")).toBeNull();
  });
});

describe("where messages live", () => {
  it("in one shared thread, or in this dispatcher's own", () => {
    expect(riderMessagesPath("shared", "12", null)).toBe("rider_chats/12/messages");
    expect(riderMessagesPath("threads", "12", "staff_7")).toBe("rider_threads/12/staff_7/messages");
    expect(riderMessagesPath("threads", "12", null)).toBeNull();
  });
});

describe("sending", () => {
  it("writes the message and both inbox rows at once in threads mode", async () => {
    await sendRiderMessage("threads", {
      riderId: "12",
      riderName: "Jun",
      staffUid: "staff_7",
      dispatcherName: "Ana",
      text: "Nasa tindahan na po",
    });
    const [values] = writes.updates;
    expect(Object.keys(values).sort()).toEqual([
      "dispatcher_inbox/staff_7/12",
      "rider_inbox/12/staff_7",
      "rider_threads/12/staff_7/messages/k1",
    ]);
    expect(values["rider_threads/12/staff_7/messages/k1"]).toMatchObject({ role: "rider", text: "Nasa tindahan na po" });
    expect(values["dispatcher_inbox/staff_7/12"]).toMatchObject({ lastSender: "rider", dispatcherName: "Ana" });
  });

  it("refuses to send in threads mode with nobody to send to", async () => {
    await expect(
      sendRiderMessage("threads", { riderId: "12", riderName: "Jun", staffUid: null, dispatcherName: null, text: "hi" })
    ).rejects.toThrow();
    expect(writes.updates).toEqual([]);
  });

  it("keeps the shared thread's layout until the switch", async () => {
    await sendRiderMessage("shared", { riderId: "12", riderName: "Jun", staffUid: null, dispatcherName: null, text: "hi" });
    expect(Object.keys(writes.updates[0]).sort()).toEqual(["rider_chats/12/messages/k1", "rider_chats/12/meta"]);
  });
});
