import "server-only";

import { readAgreementParties } from "./agreement-chain";
import { dbRun } from "./db";

export type ThreadInfo = {
  thread: string;
  a: string;
  b: string;
  /** Everyone allowed to read and write in this thread. */
  members: string[];
  kind: "agreement" | "dm" | "dispute";
};

/** Returns the thread only if the signed-in wallet is one of its participants. */
export async function resolveThread(thread: string, me: string): Promise<ThreadInfo | null> {
  const onAgreement = /^(agreement|dispute):(\d{1,9})$/.exec(thread);
  if (onAgreement) {
    const kind = onAgreement[1] as "agreement" | "dispute";
    const parties = await readAgreementParties(Number(onAgreement[2])).catch(() => null);
    if (!parties) return null;
    const members =
      kind === "dispute"
        ? [parties.client, parties.contractor, parties.resolver]
        : [parties.client, parties.contractor];
    if (!members.includes(me)) return null;
    return { thread, a: parties.client, b: parties.contractor, members, kind };
  }

  const direct = /^dm:(0x[0-9a-f]{40}):(0x[0-9a-f]{40})$/.exec(thread);
  if (direct) {
    const [, a, b] = direct;
    if (a >= b || (me !== a && me !== b)) return null;
    return { thread, a, b, members: [a, b], kind: "dm" };
  }
  return null;
}

export async function ensureThread(info: ThreadInfo): Promise<void> {
  await dbRun("INSERT OR IGNORE INTO chat_threads (thread, a, b, kind, created_at) VALUES (?, ?, ?, ?, ?)", [
    info.thread,
    info.a,
    info.b,
    info.kind,
    new Date().toISOString(),
  ]);
}