// Bilingual UI strings for the young-learner V2 student dashboard.
// English + Traditional Chinese (zh-Hant) for every load-bearing label so a
// 6-7yo Mandarin-L1 child can navigate without reading English. No i18n
// framework — a small, finite, typed const map. The English text doubles as
// the read-aloud source (see /api/student/ui-audio + usePlayTts); render the
// zh line with lang="zh-Hant" so the browser picks a Traditional-Chinese face.
//
// Keep this list small and finite — it is also the audio allowlist.

export interface UiString {
  en: string;
  zh: string;
}

export const UI_STRINGS = {
  // Header
  'header.hi': { en: 'Hi', zh: '你好' },
  'header.logout': { en: 'Log out', zh: '登出' },

  // Tabs
  'tab.home': { en: 'Home', zh: '首頁' },
  'tab.recordings': { en: 'My Recordings', zh: '我的錄音' },
  'tab.spelling': { en: 'Spelling', zh: '拼字' },
  'tab.stories': { en: 'Stories', zh: '讀故事' },

  // Homework hero
  'hero.title': { en: "Today's homework", zh: '今天的功課' },
  'hero.haveOne': { en: 'You have homework!', zh: '你有功課要做！' },
  'hero.cta': { en: 'Listen & Record', zh: '聽故事並錄音' },
  'hero.more': { en: 'more', zh: '還有' },
  'hero.allDone': { en: 'All done!', zh: '都做完了！' },
  'hero.allDoneSub': { en: 'Great job today 🎉', zh: '今天做得很棒 🎉' },
  'hero.readStories': { en: 'Read a story', zh: '去讀故事' },

  // Latest recording
  'latest.title': { en: 'My last recording', zh: '我最近的錄音' },
  'latest.none': { en: 'No recordings yet', zh: '還沒有錄音' },
  'latest.more': { en: 'See all', zh: '看全部' },

  // Actions
  'action.listen': { en: 'Listen', zh: '聽' },
  'action.record': { en: 'Record', zh: '錄音' },
  'action.play': { en: 'Play', zh: '播放' },
  'action.start': { en: 'Start', zh: '開始' },

  // Status pills
  'status.inReview': { en: 'In Review', zh: '批改中' },
  'status.completed': { en: 'Completed', zh: '完成' },
  'status.feedback': { en: 'Teacher said…', zh: '老師回覆' },

  // Test scores
  'scores.title': { en: 'My Test Scores', zh: '我的測驗成績' },
  'scores.none': { en: 'No scores yet', zh: '還沒有成績' },

  // Section headings
  'section.myWork': { en: 'My work', zh: '我的作業' },
  'section.more': { en: 'More', zh: '更多' },
  'section.thisWeek': { en: 'This week', zh: '本週' },

  // States
  'empty.loading': { en: 'Loading…', zh: '載入中…' },
  'empty.error': { en: 'Something went wrong', zh: '出了一點問題' },
  'empty.noWork': { en: 'Nothing here yet', zh: '這裡還沒有東西' },
} as const satisfies Record<string, UiString>;

export type UiStringId = keyof typeof UI_STRINGS;

export function isUiStringId(key: string): key is UiStringId {
  return Object.prototype.hasOwnProperty.call(UI_STRINGS, key);
}
