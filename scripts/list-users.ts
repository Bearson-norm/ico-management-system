import { PrismaClient } from '../lib/generated/mtc';
import bcrypt from 'bcryptjs';

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        namaLengkap: true,
        role: true,
        aktif: true,
      }
    });
    console.log('MTC Users:', users);

    if (users.length > 0) {
      const newHash = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: users[0].id },
        data: { passwordHash: newHash }
      });
      console.log(`Password for user ${users[0].username} has been updated to 'admin123'`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
