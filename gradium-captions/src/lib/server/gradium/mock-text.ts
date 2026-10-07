import type { Lang } from "@/lib/types";

/** Placeholder speech used by the mock transcriber, one paragraph per language. `{kw}` slots take boosted keywords. */
export const MOCK_TRANSCRIPTS: Record<Lang, string> = {
  en: "Hi everyone, welcome back to the {kw} channel. Today I want to show you how we turn a single voice-over into captioned videos for every market we sell in, all with {kw}. We record once, in our own voice, and the captions follow every single word. It takes minutes instead of days, and nobody has to retype a transcript ever again. Let me walk you through the whole workflow, step by step, so you can try it on your next video. First we upload the recording, then we check the transcript, and finally we pick the languages we want to ship.",
  fr: "Bonjour à tous et bienvenue sur la chaîne {kw}. Aujourd'hui je vais vous montrer comment transformer une seule voix off en vidéos sous-titrées pour chaque marché. On enregistre une fois, avec notre propre voix, et les sous-titres suivent chaque mot. Cela prend quelques minutes au lieu de plusieurs jours.",
  de: "Hallo zusammen und willkommen zurück auf dem {kw} Kanal. Heute zeige ich euch, wie wir aus einer einzigen Sprachaufnahme untertitelte Videos für jeden Markt machen. Wir nehmen einmal auf, mit unserer eigenen Stimme, und die Untertitel folgen jedem Wort. Das dauert Minuten statt Tage.",
  es: "Hola a todos y bienvenidos de nuevo al canal de {kw}. Hoy quiero mostraros cómo convertimos una sola locución en vídeos subtitulados para cada mercado. Grabamos una vez, con nuestra propia voz, y los subtítulos siguen cada palabra. Tarda minutos en lugar de días.",
  pt: "Olá a todos e bem-vindos de volta ao canal da {kw}. Hoje quero mostrar como transformamos uma única narração em vídeos legendados para cada mercado. Gravamos uma vez, com a nossa própria voz, e as legendas acompanham cada palavra. Leva minutos em vez de dias.",
};

type Dict = Record<string, string>;

const FR: Dict = {
  hi: "salut", hello: "bonjour", everyone: "tout le monde", welcome: "bienvenue", back: "de retour", to: "à", the: "la", a: "un", an: "un",
  channel: "chaîne", today: "aujourd'hui", i: "je", want: "veux", show: "montrer", you: "vous", how: "comment", we: "nous", turn: "transformons",
  single: "seule", voice: "voix", "voice-over": "voix off", into: "en", captioned: "sous-titrées", videos: "vidéos", video: "vidéo", for: "pour",
  every: "chaque", market: "marché", sell: "vendons", in: "dans", record: "enregistrons", once: "une fois", our: "notre", own: "propre",
  and: "et", captions: "sous-titres", follow: "suivent", word: "mot", words: "mots", it: "cela", takes: "prend", minutes: "minutes",
  instead: "au lieu", of: "de", days: "jours", nobody: "personne", has: "n'a", retype: "retaper", transcript: "transcription", ever: "jamais",
  again: "encore", let: "laissez", me: "moi", walk: "guider", through: "à travers", whole: "tout le", workflow: "processus", step: "étape",
  by: "par", so: "donc", can: "pouvez", try: "essayer", on: "sur", your: "votre", next: "prochaine", first: "d'abord", upload: "importons",
  recording: "enregistrement", then: "puis", check: "vérifions", finally: "enfin", pick: "choisissons", languages: "langues", ship: "publier",
  is: "est", are: "sont", this: "ce", that: "que", with: "avec", my: "mon", new: "nouveau", product: "produit", team: "équipe", great: "super",
  thank: "merci", thanks: "merci", good: "bon", day: "jour", world: "monde", time: "temps", make: "faire", one: "un", all: "tous", now: "maintenant",
  here: "ici", what: "quoi", why: "pourquoi", people: "gens", love: "aime", fast: "rapide", easy: "facile", simple: "simple", free: "gratuit",
};

const ES: Dict = {
  hi: "hola", hello: "hola", everyone: "a todos", welcome: "bienvenidos", back: "de nuevo", to: "a", the: "el", a: "un", an: "un",
  channel: "canal", today: "hoy", i: "yo", want: "quiero", show: "mostrar", you: "os", how: "cómo", we: "nosotros", turn: "convertimos",
  single: "sola", voice: "voz", "voice-over": "locución", into: "en", captioned: "subtitulados", videos: "vídeos", video: "vídeo", for: "para",
  every: "cada", market: "mercado", sell: "vendemos", in: "en", record: "grabamos", once: "una vez", our: "nuestra", own: "propia",
  and: "y", captions: "subtítulos", follow: "siguen", word: "palabra", words: "palabras", it: "eso", takes: "tarda", minutes: "minutos",
  instead: "en lugar", of: "de", days: "días", nobody: "nadie", has: "tiene", retype: "reescribir", transcript: "transcripción", ever: "nunca",
  again: "otra vez", let: "deja", me: "me", walk: "guiar", through: "por", whole: "todo el", workflow: "flujo", step: "paso", by: "a",
  so: "así", can: "puedes", try: "probar", on: "en", your: "tu", next: "próximo", first: "primero", upload: "subimos", recording: "grabación",
  then: "luego", check: "revisamos", finally: "finalmente", pick: "elegimos", languages: "idiomas", ship: "publicar", is: "es", are: "son",
  this: "este", that: "que", with: "con", my: "mi", new: "nuevo", product: "producto", team: "equipo", great: "genial", thank: "gracias",
  thanks: "gracias", good: "bueno", day: "día", world: "mundo", time: "tiempo", make: "hacer", one: "uno", all: "todos", now: "ahora",
  here: "aquí", what: "qué", why: "por qué", people: "gente", love: "encanta", fast: "rápido", easy: "fácil", simple: "simple", free: "gratis",
};

const DE: Dict = {
  hi: "hallo", hello: "hallo", everyone: "zusammen", welcome: "willkommen", back: "zurück", to: "zu", the: "der", a: "ein", an: "ein",
  channel: "Kanal", today: "heute", i: "ich", want: "möchte", show: "zeigen", you: "euch", how: "wie", we: "wir", turn: "machen",
  single: "einzigen", voice: "Stimme", "voice-over": "Sprachaufnahme", into: "zu", captioned: "untertitelten", videos: "Videos", video: "Video",
  for: "für", every: "jeden", market: "Markt", sell: "verkaufen", in: "in", record: "nehmen", once: "einmal", our: "unserer", own: "eigenen",
  and: "und", captions: "Untertitel", follow: "folgen", word: "Wort", words: "Wörter", it: "es", takes: "dauert", minutes: "Minuten",
  instead: "statt", of: "von", days: "Tage", nobody: "niemand", has: "muss", retype: "abtippen", transcript: "Transkript", ever: "jemals",
  again: "wieder", let: "lasst", me: "mich", walk: "führen", through: "durch", whole: "ganzen", workflow: "Ablauf", step: "Schritt",
  by: "für", so: "damit", can: "könnt", try: "ausprobieren", on: "bei", your: "eurem", next: "nächsten", first: "zuerst", upload: "laden",
  recording: "Aufnahme", then: "dann", check: "prüfen", finally: "schließlich", pick: "wählen", languages: "Sprachen", ship: "veröffentlichen",
  is: "ist", are: "sind", this: "das", that: "dass", with: "mit", my: "mein", new: "neu", product: "Produkt", team: "Team", great: "toll",
  thank: "danke", thanks: "danke", good: "gut", day: "Tag", world: "Welt", time: "Zeit", make: "machen", one: "eins", all: "alle", now: "jetzt",
  here: "hier", what: "was", why: "warum", people: "Leute", love: "lieben", fast: "schnell", easy: "einfach", simple: "einfach", free: "kostenlos",
};

const PT: Dict = {
  hi: "olá", hello: "olá", everyone: "a todos", welcome: "bem-vindos", back: "de volta", to: "ao", the: "o", a: "um", an: "um",
  channel: "canal", today: "hoje", i: "eu", want: "quero", show: "mostrar", you: "vocês", how: "como", we: "nós", turn: "transformamos",
  single: "única", voice: "voz", "voice-over": "narração", into: "em", captioned: "legendados", videos: "vídeos", video: "vídeo", for: "para",
  every: "cada", market: "mercado", sell: "vendemos", in: "em", record: "gravamos", once: "uma vez", our: "nossa", own: "própria",
  and: "e", captions: "legendas", follow: "acompanham", word: "palavra", words: "palavras", it: "isso", takes: "leva", minutes: "minutos",
  instead: "em vez", of: "de", days: "dias", nobody: "ninguém", has: "precisa", retype: "redigitar", transcript: "transcrição", ever: "nunca",
  again: "mais", let: "deixe", me: "me", walk: "guiar", through: "por", whole: "todo o", workflow: "fluxo", step: "passo", by: "a",
  so: "assim", can: "podem", try: "testar", on: "no", your: "seu", next: "próximo", first: "primeiro", upload: "enviamos", recording: "gravação",
  then: "depois", check: "revisamos", finally: "finalmente", pick: "escolhemos", languages: "idiomas", ship: "publicar", is: "é", are: "são",
  this: "este", that: "que", with: "com", my: "meu", new: "novo", product: "produto", team: "equipe", great: "ótimo", thank: "obrigado",
  thanks: "obrigado", good: "bom", day: "dia", world: "mundo", time: "tempo", make: "fazer", one: "um", all: "todos", now: "agora",
  here: "aqui", what: "o que", why: "por que", people: "pessoas", love: "adoram", fast: "rápido", easy: "fácil", simple: "simples", free: "grátis",
};

const EN: Dict = Object.fromEntries(
  [FR, ES, DE, PT].flatMap((d) => Object.entries(d).map(([en, other]) => [other.toLowerCase(), en])),
);

const DICTS: Record<Lang, Dict> = { en: EN, fr: FR, es: ES, de: DE, pt: PT };

/** Word-by-word dictionary translation. Good enough to exercise the pipeline offline. */
export function mockTranslate(text: string, target: Lang): string {
  const dict = DICTS[target];
  return text
    .split(/(\s+)/)
    .map((token) => {
      const match = token.match(/^([("']*)([\p{L}'-]+)([^\p{L}]*)$/u);
      if (!match) return token;
      const [, lead, core, trail] = match;
      const hit = dict[core.toLowerCase()];
      if (!hit) return token;
      const cased = core[0] === core[0].toUpperCase() && core[0] !== core[0].toLowerCase()
        ? hit[0].toUpperCase() + hit.slice(1)
        : hit;
      return `${lead}${cased}${trail}`;
    })
    .join("");
}
