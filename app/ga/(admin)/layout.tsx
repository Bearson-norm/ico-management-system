import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import GaShellLayout from '@/components/ga/GaShellLayout';

export default async function GaAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(getAuthOptions('ga'));
  if (!session || session.user.tenant !== 'ga') redirect('/ga/login');
  if (session.user.role !== 'administrator') redirect('/ga/dashboard');
  return <GaShellLayout>{children}</GaShellLayout>;
}
