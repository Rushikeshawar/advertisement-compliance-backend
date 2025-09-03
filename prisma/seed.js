const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Helper function to generate unique UIN
function generateUniqueUin(existingUins = new Set()) {
  let uin;
  do {
    uin = `UIN-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  } while (existingUins.has(uin));
  
  existingUins.add(uin);
  return uin;
}

// Helper function to get random date within range
function getRandomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Clear existing data in correct order (respecting foreign key constraints)
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.exchangeApproval.deleteMany();
    await prisma.version.deleteMany();
    await prisma.absence.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();

    // Create users with hashed passwords
    const saltRounds = 10;

    // Admin user
    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@company.com',
        password: await bcrypt.hash('admin123', saltRounds),
        fullName: 'System Administrator',
        role: 'ADMIN',
        isActive: true,
        team: 'IT'
      }
    });
    console.log('✅ Admin user created:', adminUser.username);

    // Senior Manager
    const seniorManager = await prisma.user.create({
      data: {
        username: 'seniormanager',
        email: 'senior.manager@company.com',
        password: await bcrypt.hash('manager123', saltRounds),
        fullName: 'Senior Manager',
        role: 'SENIOR_MANAGER',
        isActive: true,
        team: 'Management'
      }
    });
    console.log('✅ Senior Manager created:', seniorManager.username);

    // Compliance Admin
    const complianceAdmin = await prisma.user.create({
      data: {
        username: 'complianceadmin',
        email: 'compliance.admin@company.com',
        password: await bcrypt.hash('compliance123', saltRounds),
        fullName: 'Compliance Administrator',
        role: 'COMPLIANCE_ADMIN',
        isActive: true,
        team: 'Compliance'
      }
    });
    console.log('✅ Compliance Admin created:', complianceAdmin.username);

    // Product Admin
    const productAdmin = await prisma.user.create({
      data: {
        username: 'productadmin',
        email: 'product.admin@company.com',
        password: await bcrypt.hash('product123', saltRounds),
        fullName: 'Product Administrator',
        role: 'PRODUCT_ADMIN',
        isActive: true,
        team: 'Product'
      }
    });
    console.log('✅ Product Admin created:', productAdmin.username);

    // Compliance Users
    const createdComplianceUsers = [];
    for (let i = 1; i <= 2; i++) {
      const user = await prisma.user.create({
        data: {
          username: `compliance${i}`,
          email: `compliance${i}@company.com`,
          password: await bcrypt.hash(`compliance${i}123`, saltRounds),
          fullName: `Compliance User ${i}`,
          role: 'COMPLIANCE_USER',
          isActive: true,
          team: 'Compliance'
        }
      });
      createdComplianceUsers.push(user);
      console.log('✅ Compliance User created:', user.username);
    }

    // Product Users
    const createdProductUsers = [];
    for (let i = 1; i <= 3; i++) {
      const user = await prisma.user.create({
        data: {
          username: `product${i}`,
          email: `product${i}@company.com`,
          password: await bcrypt.hash(`product${i}123`, saltRounds),
          fullName: `Product User ${i}`,
          role: 'PRODUCT_USER',
          isActive: true,
          team: 'Product'
        }
      });
      createdProductUsers.push(user);
      console.log('✅ Product User created:', user.username);
    }

    // Create sample tasks with unique UINs
    const existingUins = new Set();
    const taskStatuses = ['OPEN', 'COMPLIANCE_REVIEW', 'PRODUCT_REVIEW', 'APPROVED', 'PUBLISHED'];
    const taskTypes = ['INTERNAL', 'EXCHANGE'];
    
    const sampleTasks = [
      {
        title: 'Social Media Campaign Review',
        description: 'Review compliance for new social media advertising campaign targeting millennials',
        type: 'EXCHANGE'
      },
      {
        title: 'Product Launch Advertisement',
        description: 'Compliance check for product launch advertisement across digital channels',
        type: 'EXCHANGE'
      },
      {
        title: 'Internal Newsletter Content',
        description: 'Review internal newsletter content for compliance standards',
        type: 'INTERNAL'
      },
      {
        title: 'Email Marketing Campaign',
        description: 'Compliance review for automated email marketing sequences',
        type: 'EXCHANGE'
      },
      {
        title: 'Website Banner Updates',
        description: 'Review website banner advertisements for regulatory compliance',
        type: 'INTERNAL'
      },
      {
        title: 'TV Commercial Script',
        description: 'Compliance review for new television commercial script and storyboard',
        type: 'EXCHANGE'
      },
      {
        title: 'Print Advertisement Design',
        description: 'Review print advertisement design for magazine placement',
        type: 'EXCHANGE'
      },
      {
        title: 'Radio Spot Content',
        description: 'Compliance check for radio advertisement content and timing',
        type: 'EXCHANGE'
      }
    ];

    const createdTasks = [];
    
    for (let i = 0; i < sampleTasks.length; i++) {
      const taskData = sampleTasks[i];
      
      // Assign random creator from product users
      const creator = createdProductUsers[i % createdProductUsers.length];
      
      // Assign random compliance user
      const assignedCompliance = createdComplianceUsers[i % createdComplianceUsers.length];
      
      const task = await prisma.task.create({
        data: {
          uin: generateUniqueUin(existingUins),
          title: taskData.title,
          description: taskData.description,
          taskType: taskData.type,
          status: taskStatuses[i % taskStatuses.length],
          creator: {
            connect: { id: creator.id }
          },
          assignedCompliance: {
            connect: { id: assignedCompliance.id }
          }
        }
      });
      
      createdTasks.push(task);
      console.log('✅ Task created:', task.title);
    }

    // Create sample versions for some tasks
    for (let i = 0; i < Math.min(4, createdTasks.length); i++) {
      const task = createdTasks[i];
      const uploader = createdProductUsers[i % createdProductUsers.length];
      
      const version = await prisma.version.create({
        data: {
          task: {
            connect: { id: task.id }
          },
          versionNumber: "1",
          fileUrls: [`/uploads/tasks/${task.id}/v1.pdf`],
          remarks: "Initial version upload",
          uploadedBy: {
            connect: { id: uploader.id }
          }
        }
      });
      console.log('✅ Version created for task:', task.title);
    }

    // Create sample comments
    const sampleComments = [
      'Please review the font size compliance for accessibility standards.',
      'The claims in section 2 need legal verification.',
      'Great work! This looks compliant with current regulations.',
      'Consider revising the disclaimer text to be more prominent.',
      'The target audience specification needs clarification.'
    ];

    for (let i = 0; i < Math.min(6, createdTasks.length); i++) {
      const task = createdTasks[i];
      const commenter = i % 2 === 0 ? createdComplianceUsers[0] : createdProductUsers[0];
      
      await prisma.comment.create({
        data: {
          task: {
            connect: { id: task.id }
          },
          content: sampleComments[i % sampleComments.length],
          author: {
            connect: { id: commenter.id }
          },
          isGlobal: Math.random() < 0.3 // 30% global comments, 70% non-global
        }
      });
      console.log('✅ Comment created for task:', task.title);
    }

    // Create sample absence records
    const currentDate = new Date();
    const absences = [
      {
        user: createdComplianceUsers[0],
        reason: 'Annual Leave',
        days: 5
      },
      {
        user: createdProductUsers[0],
        reason: 'Sick Leave',
        days: 2
      },
      {
        user: createdProductUsers[1],
        reason: 'Training',
        days: 3
      }
    ];

    for (const absence of absences) {
      const startDate = getRandomDate(
        new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)   // 30 days future
      );
      const endDate = new Date(startDate.getTime() + absence.days * 24 * 60 * 60 * 1000);

      await prisma.absence.create({
        data: {
          user: {
            connect: { id: absence.user.id }
          },
          fromDate: startDate, // Added required fromDate field
          startDate: startDate,
          endDate: endDate,
          reason: absence.reason,
          isApproved: true,
          createdBy: {
            connect: { id: seniorManager.id }
          }
        }
      });
      console.log('✅ Absence created for:', absence.user.fullName);
    }

    // Create sample notifications
    const notificationTypes = ['TASK_ASSIGNED', 'COMMENT_ADDED', 'VERSION_UPLOADED', 'TASK_APPROVED'];
    
    for (let i = 0; i < 5; i++) {
      const task = createdTasks[i % createdTasks.length];
      const user = [...createdComplianceUsers, ...createdProductUsers][i % (createdComplianceUsers.length + createdProductUsers.length)];
      
      await prisma.notification.create({
        data: {
          user: {
            connect: { id: user.id }
          },
          task: {
            connect: { id: task.id }
          },
          type: notificationTypes[i % notificationTypes.length],
          title: `Task Update: ${task.title}`,
          message: `You have a new update on task: ${task.title}`,
          isRead: Math.random() > 0.5 // 50% read notifications
        }
      });
      console.log('✅ Notification created for:', user.fullName);
    }

    // Create sample audit logs
    const actions = ['CREATED', 'UPDATED', 'DELETED', 'ASSIGNED', 'APPROVED', 'PUBLISHED'];
    
    for (let i = 0; i < 8; i++) {
      const task = createdTasks[i % createdTasks.length];
      const user = [adminUser, seniorManager, complianceAdmin, productAdmin][i % 4];
      
      await prisma.auditLog.create({
        data: {
          user: {
            connect: { id: user.id }
          },
          task: {
            connect: { id: task.id }
          },
          action: actions[i % actions.length],
          details: `Task ${task.title} was ${actions[i % actions.length].toLowerCase()}`,
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log('✅ Audit log created for task:', task.title);
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`👥 Users created: ${await prisma.user.count()}`);
    console.log(`📋 Tasks created: ${await prisma.task.count()}`);
    console.log(`📄 Versions created: ${await prisma.version.count()}`);
    console.log(`💬 Comments created: ${await prisma.comment.count()}`);
    console.log(`🏖️ Absences created: ${await prisma.absence.count()}`);
    console.log(`🔔 Notifications created: ${await prisma.notification.count()}`);
    console.log(`📝 Audit logs created: ${await prisma.auditLog.count()}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding process failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('📡 Database connection closed.');
  });