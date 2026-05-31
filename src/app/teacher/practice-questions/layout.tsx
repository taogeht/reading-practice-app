import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';

export default async function TeacherPracticeQuestionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canGeneratePracticeQuestions(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
