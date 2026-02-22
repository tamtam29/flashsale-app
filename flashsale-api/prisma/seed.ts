import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await prisma.orderAuditTrail.deleteMany();
    await prisma.order.deleteMany();
    await prisma.sale.deleteMany();
    console.log('✅ Existing data cleared');

    // Create sample sales
    const now = new Date();

    // Active sale (started 5 minutes ago, ends in 1 hour)
    console.log('📦 Creating active sale...');
    const sale1 = await prisma.sale.create({
      data: {
        name: 'Limited Edition Product - Flash Sale',
        totalStock: 100,
        startsAt: new Date(now.getTime() - 5 * 60 * 1000),
        endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    });
    console.log('✅ Created active sale:', sale1.id);

    // Future sale (starts in 10 minutes, ends in 2 hours)
    console.log('📦 Creating future sale...');
    const sale2 = await prisma.sale.create({
      data: {
        name: 'Upcoming Flash Sale',
        totalStock: 50,
        startsAt: new Date(now.getTime() + 10 * 60 * 1000),
        endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
    });
    console.log('✅ Created future sale:', sale2.id);

    // Past sale (started 3 hours ago, ended 1 hour ago)
    console.log('📦 Creating past sale...');
    const sale3 = await prisma.sale.create({
      data: {
        name: 'Past Flash Sale',
        totalStock: 200,
        startsAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    });
    console.log('✅ Created past sale:', sale3.id);

    // Create some test orders for past sale
    console.log('📦 Creating test orders for past sale...');
    for (let i = 1; i <= 10; i++) {
      await prisma.order.create({
        data: {
          saleId: sale3.id,
          userId: `test_user_${i}`,
          status: 'CONFIRMED',
        },
      });
    }
    console.log('✅ Created 10 test orders for past sale');

    console.log('\n🎉 Seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - Active Sale: ${sale1.id}`);
    console.log(`  - Future Sale: ${sale2.id}`);
    console.log(`  - Past Sale: ${sale3.id}`);
    console.log(
      '\n💡 Use these sale IDs for testing with environment variables:',
    );
    console.log(`  export SALE_ID="${sale1.id}"`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    if (error instanceof Error) {
      if (
        error.message.includes('denied access') ||
        error.message.includes('does not exist')
      ) {
        console.error('\n💡 Troubleshooting:');
        console.error('  1. Make sure DATABASE_URL is set in your .env file');
        console.error('  2. Ensure the database exists');
        console.error('  3. Run migrations first: npx prisma migrate deploy');
        console.error('  4. Check database connection settings');
      }
    }
    throw error;
  }
}

main()
  .catch((e) => {
    const errorMessage =
      e instanceof Error ? e.message : 'Unknown error occurred';
    console.error('❌ Fatal error:', errorMessage);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
