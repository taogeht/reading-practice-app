// Shared transaction display labels. Used by the student Wallet tab and any
// future teacher-facing star reports. Keep the labels short and emoji-led so
// they scan on a mobile list. The map covers every value awardStars() can emit
// today — adding a new earn/spend source needs an entry here.

import type { XpEventType } from './rules';

type StarSourceType = 'xp_action' | 'teacher_grant' | 'shop_purchase' | 'reroll';

const XP_LABELS: Record<XpEventType | 'level_up', { emoji: string; label: string }> = {
    recording_submitted: { emoji: '🎤', label: 'Submitted a recording' },
    reading_page_finished: { emoji: '📖', label: 'Read a page' },
    reading_question_correct: { emoji: '📖', label: 'Answered a story question' },
    reading_question_first_try_correct: { emoji: '⚡', label: 'First-try story bonus' },
    reading_story_completed: { emoji: '📚', label: 'Finished a reading story' },
    reading_perfect_score: { emoji: '⭐', label: 'Perfect story score!' },
    spelling_won: { emoji: '🏆', label: 'Won a spelling round' },
    spelling_lost: { emoji: '✏️', label: 'Tried a spelling round' },
    practice_correct: { emoji: '✅', label: 'Practice answer correct' },
    practice_first_try_bonus: { emoji: '⚡', label: 'First-try practice bonus' },
    practice_wrong_first_attempt: { emoji: '✏️', label: 'Practice attempt' },
    vocab_word_mastered: { emoji: '📚', label: 'Mastered a word' },
    daily_login: { emoji: '👋', label: 'Daily login bonus' },
    streak_7_bonus: { emoji: '🔥', label: '7-day streak!' },
    streak_30_bonus: { emoji: '🔥', label: '30-day streak!' },
    streak_100_bonus: { emoji: '🔥', label: '100-day streak!' },
    level_up: { emoji: '🎉', label: 'Leveled up!' },
};

export interface TransactionLabelInput {
    source_type: string;
    source_ref: string | null;
    // Optional context the caller hydrates: shop item name for purchases,
    // teacher grant note for teacher_grant rows.
    item_name?: string | null;
    note?: string | null;
}

export interface TransactionLabel {
    emoji: string;
    label: string;
    subtitle?: string;
}

export function labelForTransaction(tx: TransactionLabelInput): TransactionLabel {
    const sourceType = tx.source_type as StarSourceType | string;
    if (sourceType === 'xp_action' && tx.source_ref) {
        const entry = (XP_LABELS as Record<string, { emoji: string; label: string } | undefined>)[tx.source_ref];
        if (entry) return entry;
        return { emoji: '⭐', label: 'Earned stars' };
    }
    if (sourceType === 'teacher_grant') {
        return {
            emoji: '🎁',
            label: 'Award from teacher',
            subtitle: tx.note ?? undefined,
        };
    }
    if (sourceType === 'shop_purchase') {
        return {
            emoji: '🛍️',
            label: tx.item_name ? `Bought ${tx.item_name}` : 'Shop purchase',
        };
    }
    if (sourceType === 'reroll') {
        return { emoji: '🔄', label: 'Changed character' };
    }
    return { emoji: '⭐', label: 'Stars activity' };
}
