import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canManageSpellingLists } from '@/lib/auth/teacher-capabilities';

export default async function TeacherSpellingListsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canManageSpellingLists(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
