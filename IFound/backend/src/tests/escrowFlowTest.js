/**
 * Escrow Flow Test
 *
 * Tests the complete escrow flow:
 * 1. Create users (finder, claimant)
 * 2. Finder posts a found item
 * 3. Claimant creates a claim with bounty
 * 4. Finder accepts claim (escrow hold created)
 * 5. Both parties confirm handover (escrow released)
 *
 * Run with: node src/tests/escrowFlowTest.js
 */

require('dotenv').config();

const { sequelize } = require('../config/database');
const { User, Case, Claim, Transaction, Message } = require('../models');
const escrowService = require('../services/escrowService');
const logger = require('../config/logger');
const bcrypt = require('bcryptjs');

// Test data
const TEST_DATA = {
  finder: {
    email: 'test.finder@escrowtest.com',
    password: 'TestPass123!',
    first_name: 'Test',
    last_name: 'Finder',
    user_type: 'finder',
  },
  claimant: {
    email: 'test.claimant@escrowtest.com',
    password: 'TestPass123!',
    first_name: 'Test',
    last_name: 'Claimant',
    user_type: 'poster',
  },
  foundCase: {
    case_type: 'found_item',
    title: 'Found Blue Wallet - Test Escrow',
    description: 'Found a blue leather wallet near the park.',
    bounty_amount: 0,
    item_category: 'other',
    status: 'active',
  },
  claim: {
    verification_description: 'This is my wallet. It has my initials JD on the inside.',
    bounty_offered: 25.00,
  },
};

async function runTest() {
  console.log('\n========================================');
  console.log('   ESCROW FLOW TEST');
  console.log('========================================\n');

  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Clean up any previous test data
    console.log('Cleaning up previous test data...');
    await cleanupTestData();
    console.log('✓ Cleanup complete\n');

    // Step 1: Create test users
    console.log('STEP 1: Creating test users...');
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    const finder = await User.create({
      ...TEST_DATA.finder,
      password_hash: hashedPassword,
    });
    const claimant = await User.create({
      ...TEST_DATA.claimant,
      password_hash: hashedPassword,
    });
    console.log(`  ✓ Finder created: ${finder.id}`);
    console.log(`  ✓ Claimant created: ${claimant.id}\n`);

    // Step 2: Finder posts a found item
    console.log('STEP 2: Finder posts a found item...');
    const foundCase = await Case.create({
      ...TEST_DATA.foundCase,
      poster_id: finder.id,
    });
    console.log(`  ✓ Found case created: ${foundCase.id}`);
    console.log(`  ✓ Case title: "${foundCase.title}"\n`);

    // Step 3: Claimant creates a claim with bounty
    console.log('STEP 3: Claimant creates a claim with bounty...');
    const claim = await Claim.create({
      found_case_id: foundCase.id,
      claimant_id: claimant.id,
      verification_description: TEST_DATA.claim.verification_description,
      bounty_offered: TEST_DATA.claim.bounty_offered,
      status: 'pending',
    });
    console.log(`  ✓ Claim created: ${claim.id}`);
    console.log(`  ✓ Bounty offered: $${claim.bounty_offered} CAD\n`);

    // Step 4: Finder accepts claim (escrow hold should be created)
    console.log('STEP 4: Finder accepts claim (escrow hold)...');

    // Simulate accept claim logic
    const escrowCaseData = {
      id: foundCase.id,
      title: foundCase.title,
      bounty_amount: claim.bounty_offered,
      platform_commission: claim.bounty_offered * 0.025,
    };

    const escrowResult = await escrowService.createEscrowHold(
      escrowCaseData,
      claimant.id
    );

    claim.status = 'accepted';
    claim.accepted_at = new Date();
    claim.chat_enabled = true;
    claim.payment_transaction_id = escrowResult.transaction.id;
    claim.payment_status = 'processing';
    await claim.save();

    await foundCase.update({
      status: 'claimed',
      bounty_amount: claim.bounty_offered,
      bounty_status: 'held',
    });

    console.log(`  ✓ Escrow transaction created: ${escrowResult.transaction.id}`);
    console.log(`  ✓ Transaction status: ${escrowResult.transaction.status}`);
    console.log(`  ✓ Amount held: $${escrowResult.transaction.amount}`);
    console.log(`  ✓ Platform fee: $${escrowResult.transaction.platform_commission}`);
    console.log(`  ✓ Net amount for finder: $${escrowResult.transaction.net_amount}`);
    console.log(`  ✓ Claim status: ${claim.status}`);
    console.log(`  ✓ Case bounty_status: held\n`);

    // Check escrow status
    console.log('Checking escrow status...');
    const escrowStatus = await escrowService.getEscrowStatus(foundCase.id);
    console.log(`  ✓ Escrow status: ${escrowStatus.status}`);
    console.log(`  ✓ Amount: $${escrowStatus.amount}`);
    console.log(`  ✓ Can dispute: ${escrowStatus.canDispute}\n`);

    // Step 5: Both parties confirm handover
    console.log('STEP 5: Confirming handover...');

    // Claimant confirms
    claim.handover_confirmed_by_claimant = true;
    await claim.save();
    console.log('  ✓ Claimant confirmed handover');

    // Finder confirms
    claim.handover_confirmed_by_finder = true;
    await claim.save();
    console.log('  ✓ Finder confirmed handover');

    // Both confirmed - release escrow
    console.log('\n  Both parties confirmed - releasing escrow...');

    const releaseResult = await escrowService.releaseEscrow(
      claim.payment_transaction_id,
      finder.id,
      claim.id
    );

    claim.status = 'completed';
    claim.handover_completed_at = new Date();
    claim.payment_status = 'completed';
    await claim.save();

    await foundCase.update({
      status: 'archived',
      bounty_status: 'paid',
      resolved_at: new Date(),
      resolved_by: claimant.id,
    });

    console.log(`  ✓ Escrow released!`);
    console.log(`  ✓ Transaction status: ${releaseResult.transaction.status}`);
    console.log(`  ✓ Amount paid to finder: $${releaseResult.transaction.net_amount}`);
    console.log(`  ✓ Claim status: ${claim.status}`);
    console.log(`  ✓ Case status: archived`);
    console.log(`  ✓ Case bounty_status: paid\n`);

    // Verify finder's earnings updated
    const updatedFinder = await User.findByPk(finder.id);
    console.log(`  ✓ Finder total earnings: $${updatedFinder.total_earnings}\n`);

    // Final verification
    console.log('FINAL VERIFICATION:');
    const finalTransaction = await Transaction.findByPk(claim.payment_transaction_id);
    const finalClaim = await Claim.findByPk(claim.id);
    const finalCase = await Case.findByPk(foundCase.id);

    console.log(`  Transaction: ${finalTransaction.status}`);
    console.log(`  Claim: ${finalClaim.status}, payment: ${finalClaim.payment_status}`);
    console.log(`  Case: ${finalCase.status}, bounty: ${finalCase.bounty_status}`);

    console.log('\n========================================');
    console.log('   ✓ ESCROW FLOW TEST PASSED!');
    console.log('========================================\n');

    // Cleanup
    console.log('Cleaning up test data...');
    await cleanupTestData();
    console.log('✓ Test data cleaned up\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Cleanup on failure
    try {
      await cleanupTestData();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError.message);
    }

    throw error;
  }
}

async function cleanupTestData() {
  // Delete in order to respect foreign keys
  await Message.destroy({
    where: {},
    include: [{
      model: Claim,
      as: 'claim',
      include: [{
        model: User,
        as: 'claimant',
        where: { email: { [require('sequelize').Op.like]: '%@escrowtest.com' } },
      }],
    }],
  });

  const testUsers = await User.findAll({
    where: {
      email: {
        [require('sequelize').Op.in]: [
          TEST_DATA.finder.email,
          TEST_DATA.claimant.email,
        ],
      },
    },
  });

  const userIds = testUsers.map(u => u.id);

  if (userIds.length > 0) {
    // Delete claims
    await Claim.destroy({
      where: { claimant_id: { [require('sequelize').Op.in]: userIds } },
    });

    // Delete transactions
    await Transaction.destroy({
      where: {
        [require('sequelize').Op.or]: [
          { poster_id: { [require('sequelize').Op.in]: userIds } },
          { finder_id: { [require('sequelize').Op.in]: userIds } },
        ],
      },
    });

    // Delete cases
    await Case.destroy({
      where: { poster_id: { [require('sequelize').Op.in]: userIds } },
    });

    // Delete users
    await User.destroy({
      where: { id: { [require('sequelize').Op.in]: userIds } },
    });
  }
}

// Test dispute flow
async function testDisputeFlow() {
  console.log('\n========================================');
  console.log('   DISPUTE FLOW TEST');
  console.log('========================================\n');

  try {
    await sequelize.authenticate();
    await cleanupTestData();

    // Create users
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    const finder = await User.create({
      ...TEST_DATA.finder,
      password_hash: hashedPassword,
    });
    const claimant = await User.create({
      ...TEST_DATA.claimant,
      password_hash: hashedPassword,
    });

    // Create case and claim
    const foundCase = await Case.create({
      ...TEST_DATA.foundCase,
      poster_id: finder.id,
    });

    const claim = await Claim.create({
      found_case_id: foundCase.id,
      claimant_id: claimant.id,
      verification_description: TEST_DATA.claim.verification_description,
      bounty_offered: TEST_DATA.claim.bounty_offered,
      status: 'pending',
    });

    // Create escrow
    const escrowCaseData = {
      id: foundCase.id,
      title: foundCase.title,
      bounty_amount: claim.bounty_offered,
      platform_commission: claim.bounty_offered * 0.025,
    };

    const escrowResult = await escrowService.createEscrowHold(
      escrowCaseData,
      claimant.id
    );

    console.log('✓ Escrow created, opening dispute...\n');

    // Open dispute
    const disputedTransaction = await escrowService.openDispute(
      escrowResult.transaction.id,
      claimant.id,
      'Item does not match description'
    );

    console.log(`✓ Dispute opened`);
    console.log(`  Transaction status: ${disputedTransaction.status}`);
    console.log(`  Dispute reason: ${disputedTransaction.metadata?.dispute?.reason}\n`);

    // Admin resolves dispute (refund to poster)
    console.log('Admin resolving dispute (refund to claimant)...');

    const adminId = claimant.id; // Using claimant as mock admin
    const resolution = await escrowService.resolveDispute(
      escrowResult.transaction.id,
      'refund_to_poster',
      adminId
    );

    console.log(`✓ Dispute resolved`);
    console.log(`  Final status: ${resolution.transaction.status}\n`);

    console.log('========================================');
    console.log('   ✓ DISPUTE FLOW TEST PASSED!');
    console.log('========================================\n');

    await cleanupTestData();

  } catch (error) {
    console.error('❌ DISPUTE TEST FAILED:', error.message);
    await cleanupTestData();
    throw error;
  }
}

// Test refund flow
async function testRefundFlow() {
  console.log('\n========================================');
  console.log('   REFUND FLOW TEST');
  console.log('========================================\n');

  try {
    await sequelize.authenticate();
    await cleanupTestData();

    // Create users
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);
    const finder = await User.create({
      ...TEST_DATA.finder,
      password_hash: hashedPassword,
    });
    const claimant = await User.create({
      ...TEST_DATA.claimant,
      password_hash: hashedPassword,
    });

    // Create case and claim
    const foundCase = await Case.create({
      ...TEST_DATA.foundCase,
      poster_id: finder.id,
    });

    const claim = await Claim.create({
      found_case_id: foundCase.id,
      claimant_id: claimant.id,
      verification_description: TEST_DATA.claim.verification_description,
      bounty_offered: TEST_DATA.claim.bounty_offered,
      status: 'accepted',
    });

    // Create escrow
    const escrowCaseData = {
      id: foundCase.id,
      title: foundCase.title,
      bounty_amount: claim.bounty_offered,
      platform_commission: claim.bounty_offered * 0.025,
    };

    const escrowResult = await escrowService.createEscrowHold(
      escrowCaseData,
      claimant.id
    );

    console.log('✓ Escrow created');
    console.log(`  Transaction ID: ${escrowResult.transaction.id}`);
    console.log(`  Status: ${escrowResult.transaction.status}\n`);

    // Claimant cancels - trigger refund
    console.log('Claimant cancelling claim - triggering refund...\n');

    const refundResult = await escrowService.refundEscrow(
      escrowResult.transaction.id,
      'Claim cancelled by claimant'
    );

    console.log(`✓ Escrow refunded`);
    console.log(`  Transaction status: ${refundResult.transaction.status}`);
    console.log(`  Refund reason: ${refundResult.transaction.refund_reason}\n`);

    console.log('========================================');
    console.log('   ✓ REFUND FLOW TEST PASSED!');
    console.log('========================================\n');

    await cleanupTestData();

  } catch (error) {
    console.error('❌ REFUND TEST FAILED:', error.message);
    await cleanupTestData();
    throw error;
  }
}

// Main test runner
async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  console.log('\n🧪 Starting Escrow Tests...\n');

  try {
    if (testType === 'all' || testType === 'main') {
      await runTest();
    }

    if (testType === 'all' || testType === 'dispute') {
      await testDisputeFlow();
    }

    if (testType === 'all' || testType === 'refund') {
      await testRefundFlow();
    }

    console.log('\n✅ All tests passed!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Tests failed\n');
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
