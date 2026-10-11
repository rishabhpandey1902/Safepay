export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_FILES = 3;
export const MAX_MESSAGE_CHARS = 2000;

export const agreementThread = (id: number) => `agreement:${id}`;

/** Both people always get the same key, whoever opens the chat first. */
export function dmThread(x: string, y: string): string {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;