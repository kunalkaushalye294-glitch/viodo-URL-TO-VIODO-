import { PopularShortFormat } from '../types/video';

export const FEATURED_FACEBOOK_SHARE_URL = 'https://www.facebook.com/share/v/1Eimb15K63/';

export const POPULAR_SHORT_FORMATS: PopularShortFormat[] = [
  {
    id: 'street-food-pov',
    title: 'Night Market Sizzle POV',
    category: 'Culinary & Street Food',
    durationRange: '00:18 - 00:32',
    hookPattern: 'High-heat sound + flame burst at 00:00',
    imagePath: '/src/assets/images/short_street_food_1795427706012.jpg',
    summary:
      'Opens mid-action with rising wok steam and crisp oil crackle, followed by 1.2s close-up ingredient drops and a final plating reveal.',
    shotBlueprint: [
      '00:00 - 00:02: Tight macro shot of flame hitting seasoned steel wok',
      '00:02 - 00:08: Rapid 3-cut sequence of aromatics, sauce pour, and toss',
      '00:08 - 00:14: Overhead steam pull-back with price/location overlay',
      '00:14 - 00:18: Cross-section bite or ladle lift looping back to start',
    ],
    sampleTemplateId: 'street_food_countdown',
  },
  {
    id: 'creator-desk-hook',
    title: 'One-Gear Studio Breakdown',
    category: 'Creator Gear & Tech',
    durationRange: '00:24 - 00:45',
    hookPattern: 'Bold contrarian claim + clean rig reveal',
    imagePath: '/src/assets/images/short_creator_studio_1795427706081.jpg',
    summary:
      'Pairs a direct-to-camera problem statement with clean cutaways to desk hardware, keeping caption cadence tight at 4-6 words per line.',
    shotBlueprint: [
      '00:00 - 00:03: Wide desk reveal with 3-word outcome hook overlay',
      '00:03 - 00:12: Before/after lighting toggle showing softbox impact',
      '00:12 - 00:20: Audio mic test comparison with crisp waveform caption',
      '00:20 - 00:26: Full rig specs checklist driving saves and comments',
    ],
    sampleTemplateId: 'creator_desk_hook',
  },
  {
    id: 'urban-sprint-cut',
    title: 'Golden Hour Match-Cut Run',
    category: 'Fitness & Kinetic',
    durationRange: '00:12 - 00:22',
    hookPattern: 'Beat-synced footstep transition on frame 4',
    imagePath: '/src/assets/images/short_urban_parkour_1795427705892.jpg',
    summary:
      'Uses rhythmic stair ascents and directional sunlight silhouettes to anchor beat drops, encouraging instant replays to catch transition seams.',
    shotBlueprint: [
      '00:00 - 00:02: Low-angle sprint launch toward concrete staircase',
      '00:02 - 00:06: Match-cut on mid-air stride across two locations',
      '00:06 - 00:11: Split-pace interval timer overlay with breathing audio',
      '00:11 - 00:15: Summit silhouette frame looping smoothly to start',
    ],
    sampleTemplateId: 'urban_sprint_cut',
  },
  {
    id: 'pottery-process-loop',
    title: 'Tactile Wheel Transformation',
    category: 'Craft & Process',
    durationRange: '00:20 - 00:38',
    hookPattern: 'Satisfying clay centering + zero-narration ASMR',
    imagePath: '/src/assets/images/short_craft_pottery_1795427705886.jpg',
    summary:
      'Relies on steady side-window light and continuous wheel rotation to create a meditative visual loop with minimal subtitle clutter.',
    shotBlueprint: [
      '00:00 - 00:03: Raw wet clay slam onto spinning wheel head',
      '00:03 - 00:11: Two-hand centering and wall pull in unbroken motion',
      '00:11 - 00:18: Rib tool shaping profile with subtle time-skip cut',
      '00:18 - 00:24: Wire cut lift and finished rim reveal',
    ],
    sampleTemplateId: 'pottery_process_loop',
  },
];
