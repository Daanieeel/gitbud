import en from "./messages/en.json";

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export type Messages = typeof en;

const messagesByLocale = { en } satisfies Record<Locale, Messages>;

export function getMessages(locale: Locale = defaultLocale): Messages {
  return messagesByLocale[locale];
}
