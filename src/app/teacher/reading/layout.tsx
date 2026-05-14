import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';

export default async function TeacherReadingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canGenerateReadingContent(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
