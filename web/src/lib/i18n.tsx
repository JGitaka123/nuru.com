"use client";

/**
 * Lightweight EN/Swahili i18n — no deps, no build step.
 *
 * `useI18n()` gives `t(key)`, the active language, and a setter that
 * persists to localStorage. Keys cover the tenant-facing surfaces; agent
 * and admin tooling stays English for now. Sheng is deliberately not a
 * separate locale — Sheng speakers read both, and search/chat already
 * accept Sheng input natively (the AI side handles it).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sw";

const STORAGE_KEY = "nuru-lang";

const en = {
  // nav + footer
  "nav.search": "Search",
  "nav.messages": "Messages",
  "nav.saved": "Saved",
  "nav.alerts": "Alerts",
  "nav.applications": "Applications",
  "nav.viewings": "Viewings",
  "nav.pricing": "Pricing",
  "nav.forAgents": "For agents",
  "nav.signIn": "Sign in",
  "footer.tagline": "Nuru. Long-term rentals in Nairobi.",
  "footer.privacy": "Privacy",
  "footer.contact": "Contact",

  // home
  "home.heroTitle": "Find your next home in Nairobi.",
  "home.heroSub":
    "Conversational search. Verified listings. Deposits held safely in M-Pesa escrow until you confirm move-in.",
  "home.searchPlaceholder": "2BR Kilimani under 60K with parking",
  "home.search": "Search",
  "home.try": "Try:",
  "home.f1t": "Verified listings",
  "home.f1b": "Every photo and price is checked. No bait pricing. No stolen photos.",
  "home.f2t": "Escrow deposits",
  "home.f2b": "Your deposit sits in M-Pesa escrow until you confirm move-in. Refunded if anything's off.",
  "home.f3t": "Talk to the agent in your language",
  "home.f3b": "English, Swahili, or Sheng — we understand all three. Voice notes too.",
  "home.agentTitle": "Are you an agent?",
  "home.agentBody": "List a property in 60 seconds. Photos in → AI-drafted listing out. You review and publish.",
  "home.getStarted": "Get started →",

  // search page
  "search.placeholder": "What are you looking for?",
  "search.popularAreas": "Popular areas:",
  "search.recentListings": "Recent listings",
  "search.noMatches": "No matches yet. Try expanding your area or budget — or set up a saved search.",
  "search.noListings": "No listings yet — check back soon.",
  "search.saveSearch": "♡ Save this search",
  "search.grid": "Grid",
  "search.map": "Map",
  "search.matchOne": "match",
  "search.matchMany": "matches",
  "search.degraded": "Smart ranking is temporarily unavailable — showing keyword matches.",
  "search.quickQuestion": "Quick question:",
  "search.alertCreated": "Alert created — we'll notify you of new matches",
  "search.couldntSave": "Couldn't save",

  // login
  "login.title": "Sign in to Nuru",
  "login.emailTab": "Email",
  "login.phoneTab": "Phone",
  "login.emailLabel": "Email address",
  "login.phoneLabel": "Phone number",
  "login.sendCode": "Send code",
  "login.sending": "Sending…",
  "login.emailNote": "We'll email you a 6-digit code. M-Pesa actions still require a phone.",
  "login.smsNote": "We'll text you a 6-digit code. Standard SMS rates apply.",
  "login.codeSentTo": "Code sent to",
  "login.codeLabel": "Verification code",
  "login.signIn": "Sign in",
  "login.verifying": "Verifying…",
  "login.differentContact": "Use a different email or phone",
  "login.welcome": "Welcome to Nuru! Just a couple of details:",
  "login.yourName": "Your name",
  "login.iAm": "I am a…",
  "login.tenant": "Tenant",
  "login.agent": "Agent",
  "login.landlord": "Landlord",
  "login.continue": "Continue",
} as const;

export type I18nKey = keyof typeof en;

const sw: Record<I18nKey, string> = {
  "nav.search": "Tafuta",
  "nav.messages": "Ujumbe",
  "nav.saved": "Zilizohifadhiwa",
  "nav.alerts": "Arifa",
  "nav.applications": "Maombi",
  "nav.viewings": "Ziara",
  "nav.pricing": "Bei",
  "nav.forAgents": "Kwa mawakala",
  "nav.signIn": "Ingia",
  "footer.tagline": "Nuru. Nyumba za kupanga Nairobi.",
  "footer.privacy": "Faragha",
  "footer.contact": "Wasiliana nasi",

  "home.heroTitle": "Pata nyumba yako mpya Nairobi.",
  "home.heroSub":
    "Tafuta kwa lugha yako. Nyumba zilizohakikiwa. Amana yako iko salama kwenye escrow ya M-Pesa hadi uthibitishe kuhamia.",
  "home.searchPlaceholder": "2BR Kilimani chini ya 60K na parking",
  "home.search": "Tafuta",
  "home.try": "Jaribu:",
  "home.f1t": "Nyumba zilizohakikiwa",
  "home.f1b": "Kila picha na bei imekaguliwa. Hakuna bei za udanganyifu. Hakuna picha za wizi.",
  "home.f2t": "Amana kwenye escrow",
  "home.f2b": "Amana yako inakaa kwenye escrow ya M-Pesa hadi uthibitishe kuhamia. Unarudishiwa ikiwa kuna shida.",
  "home.f3t": "Ongea na wakala kwa lugha yako",
  "home.f3b": "Kiingereza, Kiswahili, au Sheng — tunaelewa zote tatu. Hata voice notes.",
  "home.agentTitle": "Wewe ni wakala?",
  "home.agentBody": "Weka nyumba kwa sekunde 60. Picha ndani → tangazo la AI nje. Wewe unakagua na kuchapisha.",
  "home.getStarted": "Anza sasa →",

  "search.placeholder": "Unatafuta nini?",
  "search.popularAreas": "Maeneo maarufu:",
  "search.recentListings": "Nyumba mpya",
  "search.noMatches": "Hakuna zinazolingana bado. Panua eneo au bajeti — au weka arifa ya utafutaji.",
  "search.noListings": "Hakuna nyumba bado — rudi baadaye.",
  "search.saveSearch": "♡ Hifadhi utafutaji huu",
  "search.grid": "Gridi",
  "search.map": "Ramani",
  "search.matchOne": "inayolingana",
  "search.matchMany": "zinazolingana",
  "search.degraded": "Upangaji mahiri haupatikani kwa sasa — tunaonyesha matokeo ya maneno.",
  "search.quickQuestion": "Swali fupi:",
  "search.alertCreated": "Arifa imewekwa — tutakujulisha nyumba mpya zikilingana",
  "search.couldntSave": "Imeshindikana kuhifadhi",

  "login.title": "Ingia Nuru",
  "login.emailTab": "Barua pepe",
  "login.phoneTab": "Simu",
  "login.emailLabel": "Anwani ya barua pepe",
  "login.phoneLabel": "Nambari ya simu",
  "login.sendCode": "Tuma nambari",
  "login.sending": "Inatuma…",
  "login.emailNote": "Tutakutumia nambari ya tarakimu 6 kwa barua pepe. M-Pesa bado inahitaji simu.",
  "login.smsNote": "Tutakutumia nambari ya tarakimu 6 kwa SMS. Gharama za kawaida za SMS zinatumika.",
  "login.codeSentTo": "Nambari imetumwa kwa",
  "login.codeLabel": "Nambari ya uthibitisho",
  "login.signIn": "Ingia",
  "login.verifying": "Inathibitisha…",
  "login.differentContact": "Tumia barua pepe au simu nyingine",
  "login.welcome": "Karibu Nuru! Maelezo mawili tu:",
  "login.yourName": "Jina lako",
  "login.iAm": "Mimi ni…",
  "login.tenant": "Mpangaji",
  "login.agent": "Wakala",
  "login.landlord": "Mwenye nyumba",
  "login.continue": "Endelea",
};

const DICTS: Record<Lang, Record<I18nKey, string>> = { en, sw };

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => undefined,
  t: (k) => en[k],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Read the persisted choice after mount (SSR always renders English).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "sw" || stored === "en") setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }

  const t = (key: I18nKey) => DICTS[lang][key] ?? en[key];

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
