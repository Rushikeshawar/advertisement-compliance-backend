 
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@company.com',
      password: adminPassword,
      fullName: 'System Administrator',
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('✅ Admin user created:', admin.username);

  // Create Senior Manager
  const seniorManagerPassword = await bcrypt.hash('manager123', 12);
  const seniorManager = await prisma.user.upsert({
    where: { username: 'seniormanager' },
    update: {},
    create: {
      username: 'seniormanager',
      email: 'senior.manager@company.com',
      password: seniorManagerPassword,
      fullName: 'Senior Manager',
      role: 'SENIOR_MANAGER',
      isActive: true
    }
  });
  console.log('✅ Senior Manager created:', seniorManager.username);

  // Create Compliance Admin
  const complianceAdminPassword = await bcrypt.hash('compliance123', 12);
  const complianceAdmin = await prisma.user.upsert({
    where: { username: 'complianceadmin' },
    update: {},
    create: {
      username: 'complianceadmin',
      email: 'compliance.admin@company.com',
      password: complianceAdminPassword,
      fullName: 'Compliance Administrator',
      role: 'COMPLIANCE_ADMIN',
      isActive: true
    }
  });
  console.log('✅ Compliance Admin created:', complianceAdmin.username);

  // Create Product Admin
  const productAdminPassword = await bcrypt.hash('product123', 12);
  const productAdmin = await prisma.user.upsert({
    where: { username: 'productadmin' },
    update: {},
    create: {
      username: 'productadmin',
      email: 'product.admin@company.com',
      password: productAdminPassword,
      fullName: 'Product Administrator',
      role: 'PRODUCT_ADMIN',
      team: 'Marketing',
      isActive: true
    }
  });
  console.log('✅ Product Admin created:', productAdmin.username);

  // Create Compliance Users
  const complianceUsers = [
    {
      username: 'compliance1',
      email: 'compliance1@company.com',
      fullName: 'Compliance User One',
      team: 'Compliance Team A'
    },
    {
      username: 'compliance2',
      email: 'compliance2@company.com',
      fullName: 'Compliance User Two',
      team: 'Compliance Team B'
    }
  ];

  const compliancePassword = await bcrypt.hash('compliance123', 12);
  for (const userData of complianceUsers) {
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        ...userData,
        password: compliancePassword,
        role: 'COMPLIANCE_USER',
        isActive: true
      }
    });
    console.log('✅ Compliance User created:', user.username);
  }

  // Create Product Users
  const productUsers = [
    {
      username: 'product1',
      email: 'product1@company.com',
      fullName: 'Product User One',
      team: 'Marketing'
    },
    {
      username: 'product2',
      email: 'product2@company.com',
      fullName: 'Product User Two',
      team: 'Marketing'
    },
    {
      username: 'product3',
      email: 'product3@company.com',
      fullName: 'Product User Three',
      team: 'Sales'
    }
  ];

  const productPassword = await bcrypt.hash('product123', 12);
  const createdProductUsers = [];
  for (const userData of productUsers) {
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        ...userData,
        password: productPassword,
        role: 'PRODUCT_USER',
        isActive: true
      }
    });
    createdProductUsers.push(user);
    console.log('✅ Product User created:', user.username);
  }

  // Get created compliance users
  const createdComplianceUsers = await prisma.user.findMany({
    where: {
      role: 'COMPLIANCE_USER'
    }
  });

  // Create sample tasks
  const sampleTasks = [
    {
      title: 'Summer Campaign Advertisement',
      description: 'Advertisement for summer campaign targeting young adults',
      taskType: 'INTERNAL',
      status: 'COMPLIANCE_REVIEW',
      platform: 'Digital',
      category: 'Campaign',
      expectedPublishDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    },
    {
      title: 'NSE Product Launch Ad',
      description: 'Product launch advertisement for NSE approval',
      taskType: 'EXCHANGE',
      status: 'OPEN',
      platform: 'Print & Digital',
      category: 'Product Launch',
      expectedPublishDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
    },
    {
      title: 'Quarterly Results Announcement',
      description: 'Advertisement for quarterly results announcement',
      taskType: 'EXCHANGE',
      status: 'APPROVED',
      platform: 'Newspaper',
      category: 'Corporate',
      approvalDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      expectedPublishDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    }
  ];

  for (let i = 0; i < sampleTasks.length; i++) {
    const taskData = sampleTasks[i];
    
    // Generate UIN
    const currentYear = new Date().getFullYear();
    const uin = `ACT${currentYear}${String(i + 1).padStart(3, '0')}`;
    
    // Assign random product users
    const assignedProducts = createdProductUsers.slice(0, 2).map(u => u.id);
    
    // Assign random compliance user
    const assignedCompliance = createdComplianceUsers[i % createdComplianceUsers.length];

    const task = await prisma.task.create({
      data: {
        uin,
        ...taskData,
        createdBy: createdProductUsers[0].id, // First product user creates all tasks
        assignedProductIds: assignedProducts,
        assignedComplianceId: assignedCompliance.id
      }
    });

    console.log('✅ Sample task created:', task.uin);

    // Create initial version for each task
    const version = await prisma.version.create({
      data: {
        versionNumber: '1.0',
        fileUrls: [
          'https://example.com/sample-ad-1.pdf',
          'https://example.com/sample-creative.jpg'
        ],
        remarks: 'Initial version',
        taskId: task.id,
        uploadedById: createdProductUsers[0].id
      }
    });

    console.log('✅ Initial version created for task:', task.uin);

    // Add sample comments
    if (task.status === 'COMPLIANCE_REVIEW' || task.status === 'APPROVED') {
      const comment = await prisma.comment.create({
        data: {
          content: 'Please review the compliance requirements and update accordingly.',
          isGlobal: false,
          taskId: task.id,
          versionId: version.id,
          authorId: assignedCompliance.id
        }
      });

      console.log('✅ Sample comment added for task:', task.uin);
    }

    // Add exchange approvals for exchange tasks
    if (task.taskType === 'EXCHANGE') {
      const exchangeApproval = await prisma.exchangeApproval.create({
        data: {
          exchangeName: i === 1 ? 'NSE' : 'BSE',
          typeOfContent: 'Product Advertisement',
          approvalStatus: task.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
          ...(task.status === 'APPROVED' && {
            approvalDate: task.approvalDate,
            expiryDate: task.expiryDate,
            referenceNumber: `REF${currentYear}${String(i + 1).padStart(4, '0')}`,
            approvalEmailUrl: 'https://example.com/approval-email.pdf'
          }),
          taskId: task.id,
          updatedById: assignedCompliance.id
        }
      });

      console.log('✅ Exchange approval created for task:', task.uin);
    }

    // Create audit logs
    await prisma.auditLog.create({
      data: {
        action: 'TASK_CREATED',
        details: `Task "${task.title}" created with UIN: ${task.uin}`,
        performedBy: createdProductUsers[0].id,
        taskId: task.id
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'VERSION_UPLOADED',
        details: `Version 1.0 uploaded with 2 files`,
        performedBy: createdProductUsers[0].id,
        taskId: task.id
      }
    });

    // Create notifications
    await prisma.notification.create({
      data: {
        title: 'New Task Assigned',
        message: `You have been assigned task: "${task.title}"`,
        type: 'TASK_ASSIGNED',
        userId: assignedCompliance.id,
        taskId: task.id
      }
    });
  }

  // Create sample absence record
  await prisma.absence.create({
    data: {
      fromDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      toDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      reason: 'Personal leave',
      userId: createdComplianceUsers[0].id,
      createdById: complianceAdmin.id
    }
  });

  console.log('✅ Sample absence record created');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('Admin: admin / admin123');
  console.log('Senior Manager: seniormanager / manager123');
  console.log('Compliance Admin: complianceadmin / compliance123');
  console.log('Product Admin: productadmin / product123');
  console.log('Compliance Users: compliance1, compliance2 / compliance123');
  console.log('Product Users: product1, product2, product3 / product123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });