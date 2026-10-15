import { onValue, push, ref, update } from "firebase/database";
import { database } from "./config";

/**
 * Where this rider's conversations with dispatchers live. The web portal reads
 * the same switch (Capstone_Project_Web src/portals/dispatcher/riderChat.ts).
 *
 * "shared": one thread, `rider_chats/<riderId>`, read by every dispatcher. The
 * user ruled that out on 2026-10-07: a dispatcher's chat with a rider is that
 * dispatcher's alone.
 *
 * "threads": one thread per dispatcher, `rider_threads/<riderId>/staff_<id>`,
 * with a summary row in `rider_inbox/<riderId>/staff_<id>` (this rider's list)
 * and `dispatcher_inbox/staff_<id>/<riderId>` (theirs). The Firebase rules open
 * a thread to its rider and its dispatcher only.
 *
 * `config/riderChatMode` flips both apps at once, after every rider has an app
 * that knows threads. Missing or unreadable means "shared", which is what an
 * app from before this change does anyway.
 */
export type RiderChatMode = "shared" | "threads";

export interface DispatcherThread {
  /** `staff_<dispatcherId>`: the thread's key and the dispatcher's Firebase uid. */
  staffUid: string;
  dispatcherId: string;
  dispatcherName: string;
  lastMessage: string;
  lastSender: "rider" | "dispatcher" | null;
  updatedAt: number;
}

export const staffUidFor = (dispatcherId: number | string) => `staff_${dispatcherId}`;
const dispatcherIdOf = (staffUid: string) => staffUid.replace(/^staff_/, "");

export function subscribeRiderChatMode(onMode: (mode: RiderChatMode) => void): () => void {
  return onValue(
    ref(database, "config/riderChatMode"),
    (snapshot) => onMode(snapshot.val() === "threads" ? "threads" : "shared"),
    () => onMode("shared")
  );
}

/** This rider's conversations, most recent first. */
export function subscribeRiderInbox(riderId: string, onThreads: (threads: DispatcherThread[]) => void): () => void {
  return onValue(
    ref(database, `rider_inbox/${riderId}`),
    (snapshot) => {
      const value = snapshot.val();
      const threads: DispatcherThread[] = Object.entries<any>(value && typeof value === "object" ? value : {})
        .filter(([staffUid]) => staffUid.startsWith("staff_"))
        .map(([staffUid, meta]) => ({
          staffUid,
          dispatcherId: dispatcherIdOf(staffUid),
          dispatcherName: String(meta?.dispatcherName || "Dispatcher"),
          lastMessage: String(meta?.lastMessage || ""),
          lastSender: meta?.lastSender === "rider" || meta?.lastSender === "dispatcher" ? meta.lastSender : null,
          updatedAt: Number(meta?.updatedAt) || 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onThreads(threads);
    },
    () => onThreads([])
  );
}

/** The messages of the conversation shown, or null when there is none to show. */
export function riderMessagesPath(mode: RiderChatMode, riderId: string, staffUid: string | null): string | null {
  if (mode === "shared") return `rider_chats/${riderId}/messages`;
  return staffUid ? `rider_threads/${riderId}/${staffUid}/messages` : null;
}

/**
 * One message from the rider, with every summary row it touches, in one
 * atomic write: a message never lands without the inbox row that lists it.
 */
export async function sendRiderMessage(
  mode: RiderChatMode,
  {
    riderId,
    riderName,
    staffUid,
    dispatcherName,
    text,
    imageUrl,
  }: {
    riderId: string;
    riderName: string;
    staffUid: string | null;
    dispatcherName: string | null;
    text: string;
    imageUrl?: string;
  }
): Promise<void> {
  const path = riderMessagesPath(mode, riderId, staffUid);
  if (!path) throw new Error("No dispatcher to send to yet.");
  const now = Date.now();
  const message: Record<string, unknown> = { senderId: riderId, senderName: riderName, role: "rider", timestamp: now };
  if (text) message.text = text;
  if (imageUrl) message.imageUrl = imageUrl;
  const lastMessage = text || (imageUrl ? "Sent a photo" : "New message");
  const key = push(ref(database, path)).key;
  if (!key) throw new Error("Could not create a message id.");

  if (mode === "threads" && staffUid) {
    const meta = { lastMessage, lastSender: "rider", riderName, dispatcherName: dispatcherName || "Dispatcher", updatedAt: now };
    await update(ref(database), {
      [`${path}/${key}`]: message,
      [`rider_inbox/${riderId}/${staffUid}`]: meta,
      [`dispatcher_inbox/${staffUid}/${riderId}`]: meta,
    });
    return;
  }

  await update(ref(database), {
    [`${path}/${key}`]: message,
    [`rider_chats/${riderId}/meta`]: { lastMessage, lastSender: "rider", senderName: riderName, updatedAt: now },
  });
}

/**
 * Which conversation the rider's reply goes to when they have not picked one.
 *
 * `threads` is this rider's inbox, most recent first. `errandDispatcherId` is
 * the dispatcher who claimed the errand the rider is working now, if any.
 * Returns a `staff_<id>` key, or null when there is nobody to write to yet.
 */
export function pickReplyThread(
  threads: DispatcherThread[],
  errandDispatcherId: number | string | null | undefined
): string | null {
  // The dispatcher handling the errand on the rider's hands first: a question
  // about this order belongs with the person who has it, even when another
  // dispatcher wrote more recently. Their thread need not exist yet; the
  // rider's first message creates it.
  if (errandDispatcherId != null && String(errandDispatcherId).trim() !== "") {
    return staffUidFor(errandDispatcherId);
  }
  // No errand: whoever wrote last. No one at all: nobody to write to.
  return threads[0]?.staffUid ?? null;
}
