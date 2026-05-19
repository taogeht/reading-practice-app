// Star currency awards. Stars are a spendable counterpart to XP — every XP
// event also grants a small number of stars (see STAR_RATES), and teachers can
// hand-award stars from the student detail page. Spending lands in Phase 2+.
//
// awardStars never throws. The caller (awardXp, the teacher-grant route) is
// already wrapped in its own try/catch, but this function swallows DB errors
// of its own to guarantee a stars failure can never bring down XP or a grant.

import { db } from '@/lib/db';
import { starTransactions, studentProgression } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { XpEventType } from './rules';

// One number per XP event + a synthetic `level_up`. Tune freely — values are
// roughly half the XP value of each event so a session that pays ~50 XP also
// pays ~25 stars. Streak bonuses pay more because they're rarer.
export const STAR_RATES: Record<XpEventType | 'level_up', number> = {
  recording_submitted: 2,
  reading_page_finished: 1,
  reading_question_correct: 1,
  reading_question_first_try_correct: 1,
  reading_story_completed: 3,
  reading_perfect_score: 2,
  spelling_won: 2,
  spelling_lost: 0,
  practice_correct: 1,
  practice_first_try_bonus: 1,
  practice_wrong_first_attempt: 0,
  vocab_word_mastered: 2,
  daily_login: 1,
  streak_7_bonus: 5,
  streak_30_bonus: 15,
  streak_100_bonus: 50,
  level_up: 10,
};

export type StarSourceType = 'xp_action' | 'teacher_grant';

export interface AwardStarsParams {
  studentId: string;
  amount: number;
  sourceType: StarSourceType;
  sourceRef?: string | null;
}

export async function awardStars(params: AwardStarsParams): Promise<void> {
  const { studentId, amount, sourceType, sourceRef = null } = params;
  if (!amount) return;
  try {
    await db.insert(starTransactions).values({
      studentId,
      amount,
      direction: amount > 0 ? 'earn' : 'spend',
      sourceType,
      sourceRef,
    });

    // Bump the wallet. starsLifetime tracks total ever earned (never
    // decrements); starsBalance can drop when Phase 2 ships spending.
    const lifetimeDelta = amount > 0 ? amount : 0;
    await db
      .update(studentProgression)
      .set({
        starsBalance: sql`${studentProgression.starsBalance} + ${amount}`,
        starsLifetime: sql`${studentProgression.starsLifetime} + ${lifetimeDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(studentProgression.studentId, studentId));
  } catch (error) {
    console.error('[awardStars] Failed:', error);
  }
}
