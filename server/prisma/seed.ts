import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function hash(p: string) {
  return argon2.hash(p, { type: argon2.argon2id });
}

/**
 * Demo seed. Creates one org, a schedule, teams, clients/projects, a super
 * admin, and a handful of employees with today's sessions/tasks/status so the
 * live board and timesheets have something to show immediately.
 *
 * Login: admin@folgo.studio / folgopulse2026   (super admin)
 *        Any employee: <first>@folgo.studio / folgopulse2026
 */
async function main() {
  const existing = await prisma.organisation.findFirst({ where: { bootstrapped: true } });
  if (existing) {
    console.log('Already seeded — skipping. Delete dev.db to reseed.');
    return;
  }

  const org = await prisma.organisation.create({
    data: { name: 'Folgo Design', timezone: 'Asia/Kolkata', bootstrapped: true },
  });

  const schedule = await prisma.workSchedule.create({
    data: { orgId: org.id, name: 'Standard 10–7', startTime: '10:00', endTime: '19:00', requiredHours: 8, graceMinutes: 15, halfDayThresholdHours: 4 },
  });

  const design = await prisma.team.create({ data: { orgId: org.id, name: 'Design' } });
  const dev = await prisma.team.create({ data: { orgId: org.id, name: 'Development' } });
  const accounts = await prisma.team.create({ data: { orgId: org.id, name: 'Accounts' } });

  const acme = await prisma.client.create({ data: { orgId: org.id, name: 'Acme Corp', colour: '#EB5E29' } });
  const globex = await prisma.client.create({ data: { orgId: org.id, name: 'Globex', colour: '#5B9DFF' } });
  const website = await prisma.project.create({ data: { orgId: org.id, clientId: acme.id, name: 'Website Redesign' } });
  const brand = await prisma.project.create({ data: { orgId: org.id, clientId: globex.id, name: 'Brand Guidelines' } });

  for (const [name, quota] of [
    ['Casual', 12],
    ['Sick', 8],
    ['Earned', 15],
    ['Unpaid', 0],
    ['Comp-off', 0],
  ] as const) {
    await prisma.leaveType.create({ data: { orgId: org.id, name, annualQuota: quota, isPaid: name !== 'Unpaid' } });
  }

  const pw = await hash('folgopulse2026');

  const admin = await prisma.user.create({
    data: {
      orgId: org.id, name: 'Ada Menon', email: 'admin@folgo.studio', role: 'super_admin', status: 'active',
      passwordHash: pw, workScheduleId: schedule.id, teamId: design.id, designation: 'Studio Lead',
      employeeCode: 'FLG-001', timezone: 'Asia/Kolkata', consentVersion: '2026-08-19', consentAt: new Date(),
    },
  });
  await prisma.team.update({ where: { id: design.id }, data: { leadId: admin.id } });

  const employees = [
    { name: 'Rahul Nair', email: 'rahul@folgo.studio', team: design.id, role: 'employee', designation: 'Senior Designer', code: 'FLG-002', tz: 'Asia/Kolkata' },
    { name: 'Priya Sharma', email: 'priya@folgo.studio', team: dev.id, role: 'lead', designation: 'Engineering Lead', code: 'FLG-003', tz: 'Asia/Kolkata' },
    { name: 'Tom Baker', email: 'tom@folgo.studio', team: dev.id, role: 'employee', designation: 'Developer', code: 'FLG-004', tz: 'Europe/London' },
    { name: 'Sara Khan', email: 'sara@folgo.studio', team: design.id, role: 'employee', designation: 'Copywriter', code: 'FLG-005', tz: 'Asia/Kolkata' },
    { name: 'Meera Iyer', email: 'meera@folgo.studio', team: accounts.id, role: 'employee', designation: 'Account Manager', code: 'FLG-006', tz: 'Asia/Kolkata' },
  ];

  const created = [] as { id: string; name: string }[];
  for (const e of employees) {
    const u = await prisma.user.create({
      data: {
        orgId: org.id, name: e.name, email: e.email, role: e.role, status: 'active', passwordHash: pw,
        workScheduleId: schedule.id, teamId: e.team, designation: e.designation, employeeCode: e.code,
        managerId: admin.id, timezone: e.tz, consentVersion: '2026-08-19', consentAt: new Date(),
      },
    });
    created.push({ id: u.id, name: u.name });
  }

  // Give three of them an open session today with a live task + status so the
  // board is populated on first load.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const now = new Date();
  const scenarios = [
    { idx: 0, status: 'WORKING', task: 'Revising homepage wireframes', client: acme.id, project: website.id, agoMin: 154 },
    { idx: 1, status: 'IN_MEETING', task: 'Sprint planning with client', client: globex.id, project: brand.id, agoMin: 92 },
    { idx: 3, status: 'FOCUS', task: 'Drafting Acme launch copy', client: acme.id, project: website.id, agoMin: 45 },
  ];
  for (const sc of scenarios) {
    const u = created[sc.idx];
    const checkIn = new Date(now.getTime() - sc.agoMin * 60000);
    const day = await prisma.attendanceDay.create({ data: { userId: u.id, date: today, firstCheckIn: checkIn } });
    const session = await prisma.session.create({ data: { userId: u.id, attendanceDayId: day.id, checkInAt: checkIn } });
    const taskStart = new Date(now.getTime() - Math.min(sc.agoMin, 60) * 60000);
    const task = await prisma.task.create({ data: { userId: u.id, orgId: org.id, title: sc.task, clientId: sc.client, projectId: sc.project, state: 'in_progress', startedAt: taskStart } });
    await prisma.taskInterval.create({ data: { taskId: task.id, startedAt: taskStart } });
    await prisma.statusUpdate.create({ data: { userId: u.id, sessionId: session.id, status: sc.status, startedAt: checkIn } });
  }

  console.log('Seed complete.');
  console.log('Super admin: admin@folgo.studio / folgopulse2026');
  console.log('Employees:   rahul@ / priya@ / tom@ / sara@ / meera@ folgo.studio / folgopulse2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
