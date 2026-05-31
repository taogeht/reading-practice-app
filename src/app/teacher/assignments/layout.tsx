import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canManageAssignments } from '@/lib/auth/teacher-capabilities';

export default async function TeacherAssignmentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!(await canManageAssignments(user))) {
    redirect('/teacher/dashboard');
  }
  return <>{children}</>;
}
