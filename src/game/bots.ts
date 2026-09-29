/** Rival buyers: personalities, looks and lines. */
export interface Bot {
  id: string;
  name: string;
  short: string;
  /** shirt / hat colours */
  color: number;
  hat: 'cap' | 'none' | 'fedora' | 'beanie' | 'visor' | 'cowboy';
  skin: number;
  /** 0..1 — how fast/eager they counter-bid */
  aggression: number;
  /** 0..1 — how long they wait before bidding */
  patience: number;
  /** 0..1 — how often they jump-bid */
  jumpy: number;
  voice: { pitch: number; rate: number };
  bidLines: string[];
  dropLines: string[];
  winLines: string[];
  loseLines: string[];
  intro: string;
}

export const BOTS: Bot[] = [
  {
    id: 'dave', name: 'Big Dave', short: 'Dave', color: 0xc0392b, hat: 'cap', skin: 0xe0b08c,
    aggression: 0.9, patience: 0.15, jumpy: 0.5, voice: { pitch: 0.6, rate: 1.15 },
    bidLines: ['YUP!', 'Right here!', 'Bump it!', 'Keep going!', 'HERE!'],
    dropLines: ["Nah, y'all are nuts.", "Too rich for Dave.", "Fine. FINE."],
    winLines: ["That's how Dave does it!", 'Boom. Mine.'],
    loseLines: ['Enjoy the junk, rookie.', 'You way overpaid.', 'Pfft.'],
    intro: 'Bids loud, bids early, rarely thinks.',
  },
  {
    id: 'marisol', name: 'Marisol', short: 'Marisol', color: 0x16a085, hat: 'none', skin: 0xc68642,
    aggression: 0.55, patience: 0.6, jumpy: 0.15, voice: { pitch: 1.3, rate: 1.05 },
    bidLines: ['Yes.', 'I\'ll take that.', 'Here.', 'Go on.'],
    dropLines: ['Not at that price.', 'It\'s yours.', 'No, thank you.'],
    winLines: ['Perfect.', 'As planned.'],
    loseLines: ['Hope you know something I don\'t.', 'Interesting choice.'],
    intro: 'Cool, precise, and never overpays. Probably.',
  },
  {
    id: 'prof', name: 'The Professor', short: 'Prof', color: 0x8e6b3d, hat: 'fedora', skin: 0xf1c27d,
    aggression: 0.4, patience: 0.75, jumpy: 0.1, voice: { pitch: 0.9, rate: 0.95 },
    bidLines: ['Indeed.', 'Continue.', 'One more.', 'Quite.'],
    dropLines: ['Beyond reason.', 'I shall abstain.', 'Statistically unwise.'],
    winLines: ['Splendid.', 'A calculated acquisition.'],
    loseLines: ['Bold. Foolish, but bold.', 'The numbers disagree with you.'],
    intro: 'Bids slow, bids smart, lectures afterwards.',
  },
  {
    id: 'kenny', name: 'Kenny Ka-Ching', short: 'Kenny', color: 0xf1c40f, hat: 'visor', skin: 0xd9a066,
    aggression: 0.8, patience: 0.25, jumpy: 0.7, voice: { pitch: 1.1, rate: 1.3 },
    bidLines: ['KA-CHING!', 'Let\'s GO!', 'Money money!', 'Up top!'],
    dropLines: ['Whoa whoa whoa, no.', 'My accountant says no.', 'Nope nope nope.'],
    winLines: ['KA-CHIIING!', 'Show me the money!'],
    loseLines: ['Ka-CHING for me later!', 'Yikes.'],
    intro: 'Jump-bids for fun. Loves the sound of his own catchphrase.',
  },
  {
    id: 'lou', name: 'Auntie Lou', short: 'Lou', color: 0x8e44ad, hat: 'beanie', skin: 0x8d5524,
    aggression: 0.35, patience: 0.5, jumpy: 0.05, voice: { pitch: 1.4, rate: 0.9 },
    bidLines: ['Mm-hm.', 'Fine, here.', 'Oh alright.', 'Yes, dear.'],
    dropLines: ['Honey, no.', 'Not with my money.', 'You can have it.'],
    winLines: ['Told you.', 'Mm-hm. Mine.'],
    loseLines: ['Bless your heart.', 'Oh, sweetie.'],
    intro: 'Cheap, grumbly, and somehow always profitable.',
  },
  {
    id: 'rick', name: 'Slick Rick', short: 'Rick', color: 0x2c3e50, hat: 'cowboy', skin: 0xe8beac,
    aggression: 0.6, patience: 0.85, jumpy: 0.35, voice: { pitch: 0.75, rate: 1.0 },
    bidLines: ['Yeah.', 'Here.', 'Sure.', 'Why not.'],
    dropLines: ['I\'m good.', 'Nah.', 'Have at it.'],
    winLines: ['Easy.', 'Thanks for playing.'],
    loseLines: ['Sucker bet.', 'Good luck with that.'],
    intro: 'Sits back, then swoops in late.',
  },
  {
    id: 'rosa', name: 'Rosa & Ray', short: 'Rosa', color: 0x27ae60, hat: 'cap', skin: 0xffdbac,
    aggression: 0.5, patience: 0.4, jumpy: 0.25, voice: { pitch: 1.2, rate: 1.1 },
    bidLines: ['We\'re in!', 'Yes!', 'Ray says yes!', 'Here!'],
    dropLines: ['Ray says no.', 'We\'re out.', 'Nope, kids\' college.'],
    winLines: ['We got it!', 'Woo!'],
    loseLines: ['Good luck!', 'Ray says you overpaid.'],
    intro: 'Bid as a team. Argue as a team.',
  },
];

export const BOT_BY_ID: Record<string, Bot> = Object.fromEntries(BOTS.map((b) => [b.id, b]));
