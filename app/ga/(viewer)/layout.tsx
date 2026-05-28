import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import GaShellLayout from '@/components/ga/GaShellLayout';

export default async function GaViewerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.tenant !== 'ga') {
    redirect('/ga/login');
  }
  return <GaShellLayout>{children}</GaShellLayout>;
}
