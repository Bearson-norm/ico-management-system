import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function testConnection() {
  console.log('🔄 Testing MTC Database Connection...');
  const mtc = new MtcPrisma();
  try {
    const usersCount = await mtc.user.count();
    console.log(`✅ MTC Connection Successful! Total users in database: ${usersCount}`);
    
    const firstUser = await mtc.user.findFirst({ select: { username: true, role: true } });
    console.log(`👤 First MTC user in database:`, firstUser || 'No users found');

    console.log('\n⚙️ Fetching MTC Settings...');
    const settings = await mtc.mtcSetting.findMany();
    console.log('MTC Settings found in database:', settings);
  } catch (error) {
    console.error('❌ MTC Database Connection Failed:');
    console.error(error);
  } finally {
    await mtc.$disconnect();
  }

  console.log('\n🔄 Testing GA Database Connection...');
  const ga = new GaPrisma();
  try {
    const usersCount = await ga.user.count();
    console.log(`✅ GA Connection Successful! Total users in database: ${usersCount}`);
    
    const firstUser = await ga.user.findFirst({ select: { username: true, role: true } });
    console.log(`👤 First GA user in database:`, firstUser || 'No users found');

    console.log('\n⚙️ Fetching GA Settings...');
    const settings = await ga.gaSetting.findMany();
    console.log('GA Settings found in database:', settings);
  } catch (error) {
    console.error('❌ GA Database Connection Failed:');
    console.error(error);
  } finally {
    await ga.$disconnect();
  }
}

testConnection();

