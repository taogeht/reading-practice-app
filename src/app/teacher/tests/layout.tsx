import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';

// Printable tests reuse the practice-questions capability — both are
// teacher-generated practice content (see CLAUDE.md / teacher-capabilities).
export default async function TeacherTestsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canGeneratePracticeQuestions(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
