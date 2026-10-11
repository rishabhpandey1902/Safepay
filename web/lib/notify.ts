import "server-only";

import { dbGet, dbRun } from "./db";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export async function displayName(address: string): Promise<string> {
  const row = await dbGet<{ display_name: string }>(
    "SELECT display_name FROM freelancer_profiles WHERE address = ? AND is_demo = 0",
    [address.toLowerCase()],
  );
  return row?.display_name ?? short(address);
}

export type NewNotification = {
  address: string;
  type: string;
  title: string;
  body: string;
  link: string;
  /** Replaces an older unread notification of the same type and link, so chats do not flood the bell. */
  collapse?: boolean;
};

export async function notify(input: NewNotification): Promise<void> {
  const address = input.address.toLowerCase();
  if (input.collapse) {
    await dbRun("DELETE FROM notifications WHERE address = ? AND type = ? AND link = ? AND is_read = 0", [
      address,
      input.type,
      input.link,
    ]);
  }
  await dbRun(
    `INSERT INTO notifications (address, type, title, body, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [address, input.type, input.title.slice(0, 120), input.body.slice(0, 300), input.link, new Date().toISOString()],
  );
}

export async function notifyMany(list: NewNotification[]): Promise<void> {
  await Promise.all(list.map((item) => notify(item).catch(() => undefined)));
}