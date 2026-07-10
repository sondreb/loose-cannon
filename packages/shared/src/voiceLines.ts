/**
 * Offline NPC voice catalog (Grok TTS → public/voice/{id}.mp3).
 * Spoken text is Kingpin-flavored: foul, funny, crime-movie cheese.
 */

export type GrokVoiceId = "ara" | "eve" | "leo" | "rex" | "sal";

export interface VoiceLineDef {
  id: string;
  /** Text sent to TTS (may include [pause] / [laugh] speech tags). */
  speak: string;
  voice: GrokVoiceId;
  role?: string;
}

/** All shippable bark / dialogue VO lines. */
export const VOICE_LINES: VoiceLineDef[] = [
  // Vince the Barman (rex)
  {
    id: "vince_greet_1",
    speak:
      "You lookin' to hire muscle, or start a fucking funeral? [pause] Either way, the drinks still cost money.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_greet_2",
    speak: "Welcome to the Nail. Wipe your feet, or don't. The blood blends in.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_hire_ok",
    speak: "They're yours. Try not to get 'em killed in the first five minutes, genius.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_hire_broke",
    speak: "Come back when your pockets ain't empty. This ain't a charity for broke-ass bosses.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_hire_full",
    speak: "Crew's full, boss. Fire someone first. I don't do circus acts.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_laylow_ok",
    speak: "Sit. Drink water. Forget your name for twenty minutes. Heat cools if you shut the fuck up.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_laylow_cool",
    speak: "You're already a nobody. Congrats. That's free.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_laylow_broke",
    speak: "Cooling off costs cash. Your wallet is still hotter than your gun.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_rumor",
    speak:
      "Dumpster Dogs prowl the west road. Silk Street plays nice until they don't. Watch the fucking warehouse.",
    voice: "rex",
    role: "bartender_m",
  },
  {
    id: "vince_insult",
    speak: "I will fucking bury you. [pause] And then charge your crew for the shovel.",
    voice: "rex",
    role: "bartender_m",
  },

  // Venus Static (eve)
  {
    id: "venus_greet_1",
    speak:
      "Hello daddy, what can I get you today to make you fall under the table again? [laugh] First round's on you either way.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_greet_2",
    speak:
      "Mmm. Look what the neon dragged in. Buy a drink, hire some meat, or keep staring — clock's ticking, boss.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_greet_3",
    speak: "Hey sugar. You here for muscle, mischief, or just to ruin my night in the fun way?",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_hire_ok",
    speak: "They're yours, daddy. Try not to get those pretty faces shot off. Bad for business.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_hire_broke",
    speak: "Baby, that wallet looks sadder than last call. Come back with cash or charming lies.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_laylow_ok",
    speak:
      "Sit pretty. Drink slow. Forget your sins for twenty minutes. I'll keep the heat off... mostly.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_rumor",
    speak:
      "Word is the Dock boys are hungry and the Vipers are worse. Don't die broke, sugar. Die rich and stupid.",
    voice: "eve",
    role: "bartender_f",
  },
  {
    id: "venus_insult",
    speak:
      "Oh honey. [laugh] Keep talking like that and I'll bury you myself — heels first. Still want a drink?",
    voice: "eve",
    role: "bartender_f",
  },

  // Rita Fix (ara)
  {
    id: "rita_greet",
    speak: "Jobs, tips, or trouble. Pick one. I don't do small talk for free.",
    voice: "ara",
    role: "fixer",
  },
  {
    id: "rita_job_open",
    speak: "Alright. Don't fuck this up. Contracts don't grow on dumpsters.",
    voice: "ara",
    role: "fixer",
  },
  {
    id: "rita_busy",
    speak: "You're already on a job. Finish it or abandon first — I don't double-book amateurs.",
    voice: "ara",
    role: "fixer",
  },
  {
    id: "rita_tip",
    speak:
      "Dumpster Dogs west. Slicks south. Warehouse smells like free money and broken ribs. You're welcome.",
    voice: "ara",
    role: "fixer",
  },
  {
    id: "rita_threat",
    speak: "I will fucking bury you. [pause] And bill your memorial for the ink.",
    voice: "ara",
    role: "fixer",
  },
  {
    id: "rita_abandon_hint",
    speak: "Hit abandon on the contract, or ask me again when you're done playing tourist.",
    voice: "ara",
    role: "fixer",
  },

  // Dealers
  {
    id: "phil_greet",
    speak: "Cash only. No refunds on regrets. Guns, jackets, miracles — pick your poison.",
    voice: "sal",
    role: "dealer_m",
  },
  {
    id: "phil_open",
    speak: "Browse the counter. Touch anything without paying and we got a different conversation.",
    voice: "sal",
    role: "dealer_m",
  },
  {
    id: "phil_haggle",
    speak: "Prices are criminal? Buddy, look around. You're shopping in a fucking crime scene.",
    voice: "sal",
    role: "dealer_m",
  },
  {
    id: "kate_greet",
    speak: "Caliber Kate. I sell loud solutions. Don't ask for quiet ones — I don't stock regrets.",
    voice: "ara",
    role: "dealer_f",
  },
  {
    id: "kate_open",
    speak: "Show me the cash and I'll show you the hardware. Fair trade in a dirty city.",
    voice: "ara",
    role: "dealer_f",
  },
  {
    id: "bob_greet",
    speak: "Bottle Bob. Liquor, lies, and liquid courage. What dilutes your conscience today?",
    voice: "leo",
    role: "dealer_m",
  },
  {
    id: "bob_open",
    speak: "Drink special is whatever I haven't spilled yet. Cash up front, genius.",
    voice: "leo",
    role: "dealer_m",
  },

  // Services
  {
    id: "doc_greet",
    speak: "Doc Bandage. You leak, I patch. No insurance, no judgment, lots of screaming. Sit still.",
    voice: "sal",
    role: "doc",
  },
  {
    id: "doc_heal",
    speak: "There. Almost human again. Try not to redecorate the sidewalk with your insides.",
    voice: "sal",
    role: "doc",
  },
  {
    id: "coach_greet",
    speak: "Coach Brick. Guts, guns, and goddamn posture. You here to train or cry?",
    voice: "leo",
    role: "coach",
  },
  {
    id: "coach_train",
    speak: "Sweat paid for. Don't waste it dying stupid out there.",
    voice: "leo",
    role: "coach",
  },
  {
    id: "priest_greet",
    speak: "Confession is fifty bucks. Absolution is extra. Smoking is free if God isn't looking.",
    voice: "sal",
    role: "priest",
  },
  {
    id: "priest_bless",
    speak: "You're blessed. Marginally. Don't test it in traffic, you magnificent idiot.",
    voice: "sal",
    role: "priest",
  },
  {
    id: "priest_broke",
    speak: "Faith without funds is just hope. And hope don't stop bullets.",
    voice: "sal",
    role: "priest",
  },
  {
    id: "tony_greet",
    speak: "Grease Tony. If it rolls, I can make it roll faster — or explode quieter.",
    voice: "rex",
    role: "mechanic",
  },

  // Street meat
  {
    id: "thug_greet_m",
    speak: "The fuck you looking at? Hiring, or just lost and stupid?",
    voice: "leo",
    role: "thug_m",
  },
  {
    id: "thug_greet_f",
    speak: "Buy me a drink or a contract, boss. Standing around is free; my time ain't.",
    voice: "eve",
    role: "thug_f",
  },
  {
    id: "thug_join",
    speak: "Alright boss. I'm with you. Don't get me killed for nothing cute.",
    voice: "leo",
    role: "thug_m",
  },
  {
    id: "thug_join_f",
    speak: "Fine. I'm in. Try not to die first — I hate carrying bodies in heels.",
    voice: "eve",
    role: "thug_f",
  },
  {
    id: "generic_bury",
    speak: "I will fucking bury you!",
    voice: "rex",
    role: "generic",
  },
  {
    id: "generic_bye",
    speak: "Yeah. Get out of my face.",
    voice: "rex",
    role: "generic",
  },

  // ——— The Titty Twister dancers (sensual) ———
  {
    id: "dancer_greet_1",
    speak:
      "Hey sugar… eyes up here. Or don't. [laugh] Tips make the clothes come off. House rules.",
    voice: "eve",
    role: "dancer",
  },
  {
    id: "dancer_greet_2",
    speak:
      "Mmm, fresh money. Sit pretty, daddy. Want a private show, or just gonna stare and dream?",
    voice: "ara",
    role: "dancer",
  },
  {
    id: "dancer_greet_3",
    speak:
      "Welcome to the Twister, boss. Keep those bills coming and I'll keep giving you something to lose sleep over.",
    voice: "eve",
    role: "dancer",
  },
  {
    id: "dancer_tip_1",
    speak:
      "Ooh… just like that. [laugh] A little more skin for a little more cash. Don't stop now.",
    voice: "eve",
    role: "dancer",
  },
  {
    id: "dancer_tip_2",
    speak:
      "Mmm, you're spoiling me. Watch close… I don't do this for free, and I never do it boring.",
    voice: "ara",
    role: "dancer",
  },
  {
    id: "dancer_tip_max",
    speak:
      "That's as naughty as the stage allows, sugar. [laugh] You want more, you better own the club.",
    voice: "eve",
    role: "dancer",
  },
  {
    id: "dancer_broke",
    speak: "Empty pockets? Cute. Come back when your wallet matches that hungry look.",
    voice: "ara",
    role: "dancer",
  },
  {
    id: "dancer_flirt",
    speak:
      "Careful, boss… keep talking sweet and I might actually like you. Then you'll really go broke.",
    voice: "eve",
    role: "dancer",
  },
];

const byId = new Map(VOICE_LINES.map((l) => [l.id, l]));

export function getVoiceLine(id: string | undefined | null): VoiceLineDef | undefined {
  if (!id) return undefined;
  return byId.get(id);
}

export function pickVoiceLineId(ids: string[]): string | undefined {
  if (!ids.length) return undefined;
  return ids[Math.floor(Math.random() * ids.length)]!;
}
