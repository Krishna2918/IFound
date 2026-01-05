/**
 * Database Seed Script
 * Creates initial admin user and test data
 *
 * Usage: npm run seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize } = require('../config/database');
const { User, Case, syncDatabase } = require('../models');

const seedAdmin = async () => {
  console.log('Seeding admin user...');

  const adminEmail = 'krishna@ifound.com';
  const adminPassword = 'Krishna123!';

  // Check if admin already exists
  const existingAdmin = await User.findOne({
    where: { email: adminEmail.toLowerCase() }
  });

  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminEmail}`);
    return existingAdmin;
  }

  // Create admin user
  const admin = await User.create({
    email: adminEmail.toLowerCase(),
    password_hash: adminPassword, // Will be hashed by model hook
    first_name: 'Krishna',
    last_name: 'Admin',
    user_type: 'admin',
    verification_status: 'id_verified',
    is_active: true,
    is_suspended: false,
  });

  console.log(`Admin user created successfully!`);
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log(`  (Change this password after first login!)`);

  return admin;
};

const seedTestUsers = async () => {
  console.log('\nSeeding test users...');

  const testUsers = [
    {
      email: 'user1@ifound.com',
      password_hash: 'User123!',
      first_name: 'User',
      last_name: 'One',
      user_type: 'finder',
      verification_status: 'email_verified',
    },
    {
      email: 'user2@ifound.com',
      password_hash: 'User123!',
      first_name: 'User',
      last_name: 'Two',
      user_type: 'poster',
      verification_status: 'email_verified',
    },
  ];

  for (const userData of testUsers) {
    const existing = await User.findOne({
      where: { email: userData.email }
    });

    if (!existing) {
      await User.create(userData);
      console.log(`  Created: ${userData.email}`);
    } else {
      console.log(`  Exists: ${userData.email}`);
    }
  }
};

const seedTestCases = async () => {
  console.log('\nSeeding test cases...');

  const poster = await User.findOne({
    where: { email: 'user2@ifound.com' }
  });

  if (!poster) {
    console.log('  Skipped: No poster user found');
    return;
  }

  const existingCases = await Case.count({ where: { poster_id: poster.id } });

  if (existingCases > 0) {
    console.log(`  Skipped: ${existingCases} cases already exist`);
    return;
  }

  const testCases = [
    {
      poster_id: poster.id,
      title: 'Missing Person - John Doe',
      description: 'Last seen wearing a blue jacket and jeans. Approximately 5\'10" tall.',
      case_type: 'missing_person',
      bounty_amount: 500,
      status: 'active',
      priority_level: 'high',
      last_seen_location: {
        address: 'Central Park',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        latitude: 40.7829,
        longitude: -73.9654,
      },
    },
    {
      poster_id: poster.id,
      title: 'Lost Dog - Golden Retriever',
      description: 'Female golden retriever, 3 years old, answers to "Bella". Has a red collar.',
      case_type: 'lost_item',
      item_category: 'pet',
      bounty_amount: 200,
      status: 'active',
      priority_level: 'medium',
      last_seen_location: {
        address: 'Riverside Park',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        latitude: 40.8010,
        longitude: -73.9720,
      },
    },
    {
      poster_id: poster.id,
      title: 'Wanted - Robbery Suspect',
      description: 'Suspect in multiple store robberies. Considered armed and dangerous.',
      case_type: 'criminal',
      bounty_amount: 1000,
      status: 'active',
      priority_level: 'critical',
      danger_level: 'armed_and_dangerous',
    },
  ];

  for (const caseData of testCases) {
    await Case.create(caseData);
    console.log(`  Created: ${caseData.title}`);
  }
};

const main = async () => {
  try {
    console.log('='.repeat(50));
    console.log('IFound Database Seed Script');
    console.log('='.repeat(50));

    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Sync database tables
    console.log('Syncing database tables...');
    await syncDatabase({ alter: true });
    console.log('Database synced.\n');

    // Run seeds
    await seedAdmin();
    await seedTestUsers();
    await seedTestCases();

    console.log('\n' + '='.repeat(50));
    console.log('Seeding completed successfully!');
    console.log('='.repeat(50));

    console.log('\n📋 Login Credentials:');
    console.log('   Admin:  krishna@ifound.com / Krishna123!');
    console.log('   User1:  user1@ifound.com / User123!');
    console.log('   User2:  user2@ifound.com / User123!');

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

main();
