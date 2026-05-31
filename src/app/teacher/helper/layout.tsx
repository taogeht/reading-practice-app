import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUseSunnyPreview } from '@/lib/auth/teacher-capabilities';

export default async function TeacherHelperLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canUseSunnyPreview(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
