export type LandingNewsItem = {
  id: string;
  headline: string;
  summary: string;
  publishedAt: string;
  category: string;
};

export type RecentChronicleItem = {
  id: string;
  title: string;
  character: string;
  hook: string;
  location: string;
  completedAt: string;
};

export type SystemsUpdateItem = {
  id: string;
  label: string;
  status: 'rolling-out' | 'in-progress' | 'research';
  summary: string;
  updatedAt: string;
};

export type UpdateSnippet = {
  id: string;
  title: string;
  description: string;
  tag: string;
  updatedAt: string;
};

const DATE_NOV_13_2025 = '2025-11-13';
const DATE_NOV_14_2025 = '2025-11-14';
const DATE_NOV_15_2025 = '2025-11-15';
const DATE_NOV_16_2025 = '2025-11-16';

export const landingNews: LandingNewsItem[] = [
  {
    category: 'Devlog',
    headline: 'Signal relays go live for settlement hails',
    id: 'news-signal-relays',
    publishedAt: DATE_NOV_16_2025,
    summary:
      'The chronicle API now mirrors live Step Function events to the relay bus, letting the client subscribe to settlement alerts without polling.',
  },
  {
    category: 'World State',
    headline: 'Location shards receive curator notes',
    id: 'news-world-seeds',
    publishedAt: DATE_NOV_15_2025,
    summary:
      'World builders can now push annotated hooks with recommended tone, local NPCs, and threat triggers, making shard-based chronicle starts more flavorful.',
  },
  {
    category: 'Prototype',
    headline: 'Ambient audio cues enter private alpha',
    id: 'news-audio-cues',
    publishedAt: DATE_NOV_14_2025,
    summary:
      'A lightweight audio service now renders ambient beds that match chronicle mood streams. Private alpha pilots will evaluate the loop timing this week.',
  },
];

export const recentChronicleFeed: RecentChronicleItem[] = [
  {
    completedAt: '2025-11-16T04:20:00Z',
    character: 'Ayo',
    hook: 'Ayo uncovered the rain-split docks ritual brokers and sealed their pact circle before the eclipse hit.',
    id: 'chronicle-neon-silence',
    location: 'Rain-Split Docks · Bastion Rim',
    title: 'A Silence of Neon',
  },
  {
    completedAt: '2025-11-15T18:05:00Z',
    character: 'Cael',
    hook: 'Cael negotiated a ceasefire with the Folded Choir, trading intent diagrams for refugee passages.',
    id: 'chronicle-sundered-veil',
    location: 'Choir Reliquary · Ember Steppes',
    title: 'The Sundered Veil',
  },
  {
    completedAt: '2025-11-15T09:51:00Z',
    character: 'Jun',
    hook: 'Jun guided the White Stag caravan through an anti-sky storm and sanctified a new resonant path.',
    id: 'chronicle-firmament',
    location: 'The Petrified Firmament',
    title: 'Fragments of the Firmament',
  },
];

export const systemsUpdates: SystemsUpdateItem[] = [
  {
    id: 'systems-reputation-tracks',
    label: 'Reputation tracks',
    status: 'rolling-out',
    summary: 'Character reputation now gates loaner gear and influences GM-favor prompts across chronicles.',
    updatedAt: DATE_NOV_16_2025,
  },
  {
    id: 'systems-portal-network',
    label: 'Portal network sync',
    status: 'in-progress',
    summary:
      'Expanding the world graph indexer to ingest Chronicle Closer payloads so future runs can reference concluded storylines.',
    updatedAt: DATE_NOV_15_2025,
  },
  {
    id: 'systems-online-roster',
    label: 'Online roster',
    status: 'research',
    summary:
      'Designing the account presence layer that will power the live player list showcased on this landing page.',
    updatedAt: DATE_NOV_14_2025,
  },
];

export const updateSnippets: UpdateSnippet[] = [
  {
    description:
      'Classifier prompts now ship discrete guard-rails for planning, clarifying, and reflecting intents, smoothing timeline detection.',
    id: 'update-intent-kit',
    tag: 'Narrative Engine',
    title: 'Intent kit refresh',
    updatedAt: DATE_NOV_15_2025,
  },
  {
    description:
      'Moderators can diff prompt revisions inline, capturing audit notes against specific DAG nodes with a single click.',
    id: 'update-template-inspector',
    tag: 'Moderation',
    title: 'Template inspector polish',
    updatedAt: DATE_NOV_14_2025,
  },
  {
    description:
      'Active beat titles now pin under the composer when the GM focuses a goal, so players never lose sight of the stakes.',
    id: 'update-beat-pins',
    tag: 'Client UX',
    title: 'Beat pins in chat',
    updatedAt: DATE_NOV_13_2025,
  },
];
