import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import GaShellLayout from '@/components/ga/GaShellLayout';

export default async function GaViewerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.tenant !== 'ga') {
    redirect('/ga/login');
  }
  return <GaShellLayout>{children}</GaShellLayout>;
}
