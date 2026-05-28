import ShellLayout from '@/components/shared/ShellLayout';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function MtcEditorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.tenant !== 'mtc') {
    redirect('/mtc/login');
  }
  if (session.user.role !== 'editor') {
    redirect('/mtc/stock');
  }

  return <ShellLayout>{children}</ShellLayout>;
}
