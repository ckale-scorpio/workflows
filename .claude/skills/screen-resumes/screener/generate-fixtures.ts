/**
 * Generates sample PDF resumes for screener smoke tests.
 *
 * Run from screener/:
 *   pnpm install && ./node_modules/.bin/tsx generate-fixtures.ts
 *
 * Output: ../fixtures/resumes/*.pdf
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import PDFDocument from 'pdfkit';

const OUT_DIR = path.join(__dirname, '../fixtures/resumes');

interface Job {
  title: string;
  company: string;
  start: string;
  end: string | null;
  bullets: string[];
}

interface Education {
  degree: string;
  field: string;
  school: string;
  year: number;
}

interface Resume {
  name: string;
  headline: string;
  email: string;
  phone: string;
  skills: string[];
  jobs: Job[];
  education: Education[];
}

function writePdf(filename: string, resume: Resume): void {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  const out = fs.createWriteStream(path.join(OUT_DIR, filename));
  doc.pipe(out);

  const W = 512; // usable width (612 - 2*50)

  // ── Header ────────────────────────────────────────────────────────────────
  doc.fontSize(20).font('Helvetica-Bold').text(resume.name, { align: 'center' });
  doc.fontSize(11).font('Helvetica').text(resume.headline, { align: 'center' });
  doc
    .fontSize(9)
    .fillColor('#555')
    .text(`${resume.email}  ·  ${resume.phone}`, { align: 'center' });
  doc.fillColor('#000').moveDown(0.5);

  doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#ccc');
  doc.moveDown(0.5);

  // ── Skills ────────────────────────────────────────────────────────────────
  doc.fontSize(13).font('Helvetica-Bold').text('Skills');
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').text(resume.skills.join('  ·  '), { width: W });
  doc.moveDown(0.8);

  // ── Experience ────────────────────────────────────────────────────────────
  doc.fontSize(13).font('Helvetica-Bold').text('Experience');
  doc.moveDown(0.2);

  for (const job of resume.jobs) {
    const period = `${job.start} – ${job.end ?? 'Present'}`;
    doc.fontSize(11).font('Helvetica-Bold').text(job.title, { continued: true });
    doc.font('Helvetica').text(`   ${job.company}`, { continued: true });
    doc.fillColor('#555').text(`   ${period}`, { align: 'right' }).fillColor('#000');
    doc.moveDown(0.2);

    for (const bullet of job.bullets) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .list([bullet], { bulletRadius: 2, width: W - 10 });
    }
    doc.moveDown(0.5);
  }

  // ── Education ────────────────────────────────────────────────────────────
  doc.fontSize(13).font('Helvetica-Bold').text('Education');
  doc.moveDown(0.2);

  for (const edu of resume.education) {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`${edu.degree} in ${edu.field}`, { continued: true });
    doc.font('Helvetica').fillColor('#555').text(`   ${edu.school}, ${edu.year}`).fillColor('#000');
    doc.moveDown(0.3);
  }

  doc.end();
  console.log(`  wrote ${filename}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND ENGINEERS
// ═══════════════════════════════════════════════════════════════════════════

const sarah: Resume = {
  name: 'Sarah Chen',
  headline: 'Senior Backend Engineer · Payments & Platform',
  email: 'sarah.chen@example.com',
  phone: '(415) 555-0182',
  skills: [
    'TypeScript',
    'Node.js',
    'PostgreSQL',
    'AWS',
    'Redis',
    'Docker',
    'Kubernetes',
    'GraphQL',
    'gRPC',
  ],
  jobs: [
    {
      title: 'Senior Backend Engineer',
      company: 'Stripe',
      start: '2022-03',
      end: null,
      bullets: [
        'Designed and shipped the idempotency layer for the Charges API, eliminating ~3,000 duplicate transactions per month.',
        'Owned the PostgreSQL schema migration strategy for the billing service; rewrote slow queries reducing p99 latency from 800 ms to 42 ms.',
        'Led a 3-engineer team that rebuilt the webhook delivery system, increasing throughput 4× while reducing missed deliveries to <0.01%.',
        'Defined SLOs for five platform services and built the alerting runbooks adopted by the oncall rotation.',
      ],
    },
    {
      title: 'Backend Engineer',
      company: 'Brex',
      start: '2020-06',
      end: '2022-02',
      bullets: [
        'Built the spend-limit enforcement service in TypeScript/Node, processing 200k decisions/day with zero downtime in 18 months.',
        'Introduced Redis-based short-TTL caching on the card-authorization path, cutting read latency by 60%.',
        'Drove adoption of Docker Compose across the backend team, reducing "works on my machine" incidents by ~80%.',
      ],
    },
    {
      title: 'Software Engineer',
      company: 'Plaid',
      start: '2018-08',
      end: '2020-05',
      bullets: [
        'Maintained the institution-connector pipeline; added 12 new bank connectors and reduced error rate from 4% to 0.8%.',
        'Wrote the internal load-testing harness that became standard across the backend org.',
      ],
    },
  ],
  education: [{ degree: 'B.S.', field: 'Computer Science', school: 'UC Berkeley', year: 2018 }],
};

const marcus: Resume = {
  name: 'Marcus Okafor',
  headline: 'Staff Backend Engineer · Infrastructure & Reliability',
  email: 'marcus.okafor@example.com',
  phone: '(628) 555-0041',
  skills: [
    'TypeScript',
    'Node.js',
    'PostgreSQL',
    'AWS (ECS, RDS, SQS)',
    'Redis',
    'Docker',
    'Terraform',
    'Datadog',
  ],
  jobs: [
    {
      title: 'Staff Engineer, Platform',
      company: 'Chime',
      start: '2021-09',
      end: null,
      bullets: [
        'Architected the event-sourcing backbone for the core account ledger, reducing reconciliation bugs by 95% across 14M accounts.',
        'Decided to migrate the monolith to ECS-based microservices; led the 8-month rollout with no customer-facing incidents.',
        'Established the database-migration review process, preventing two potential data-loss incidents before they reached production.',
        'Mentored five engineers from mid-level to senior; two now lead their own squads.',
        'Drove the cost-optimization initiative that cut AWS spend by $1.2M/year through right-sizing and reserved instances.',
      ],
    },
    {
      title: 'Senior Backend Engineer',
      company: 'Square',
      start: '2018-01',
      end: '2021-08',
      bullets: [
        'Built and owned the seller-analytics pipeline from scratch; ingested 5B rows/day into PostgreSQL with sub-minute freshness.',
        'Introduced Redis Streams for real-time fraud-signal propagation, replacing a polling approach that lagged by up to 90 seconds.',
        'Led the API versioning strategy for the Catalog service, enabling two major breaking changes with zero partner disruptions.',
      ],
    },
    {
      title: 'Backend Engineer',
      company: 'Zendesk',
      start: '2015-06',
      end: '2017-12',
      bullets: [
        'Maintained the ticket-routing engine and added SLA-breach prediction, reducing breaches by 18%.',
      ],
    },
  ],
  education: [
    {
      degree: 'B.Eng.',
      field: 'Electrical & Computer Engineering',
      school: 'University of Toronto',
      year: 2015,
    },
  ],
};

const priya: Resume = {
  name: 'Priya Patel',
  headline: 'Backend Engineer · APIs & Data',
  email: 'priya.patel@example.com',
  phone: '(312) 555-0093',
  skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'REST APIs', 'Python', 'MongoDB'],
  jobs: [
    {
      title: 'Backend Engineer',
      company: 'Grubhub',
      start: '2022-07',
      end: null,
      bullets: [
        'Implemented the restaurant-availability service in TypeScript/Node, replacing a legacy PHP endpoint serving 800k requests/day.',
        'Optimized the order-history PostgreSQL queries; reduced page load time for 60% of users.',
        'Added integration tests to the checkout service, increasing branch coverage from 41% to 78%.',
      ],
    },
    {
      title: 'Software Engineer',
      company: 'Sprinklr',
      start: '2020-08',
      end: '2022-06',
      bullets: [
        'Developed REST API endpoints for the analytics dashboard used by enterprise customers.',
        'Migrated three internal services from MongoDB to PostgreSQL as part of the data-consolidation initiative.',
        'Helped onboard two new team members and documented the local development setup.',
      ],
    },
  ],
  education: [
    {
      degree: 'B.S.',
      field: 'Information Systems',
      school: 'University of Illinois Chicago',
      year: 2020,
    },
  ],
};

// Backend engineer with mostly older experience — tests recency weighting
const james: Resume = {
  name: 'James Whitfield',
  headline: 'Backend Engineer · Enterprise Software',
  email: 'james.whitfield@example.com',
  phone: '(206) 555-0217',
  skills: ['Java', 'Spring Boot', 'Oracle DB', 'PostgreSQL', 'TypeScript', 'Node.js', 'Docker'],
  jobs: [
    {
      title: 'Senior Software Engineer',
      company: 'SAP',
      start: '2015-03',
      end: '2020-11',
      bullets: [
        'Led a team of 6 engineers building the procurement workflow engine in Java/Spring Boot, processing 10M events/day.',
        'Designed the Oracle-to-PostgreSQL migration plan for the reporting database; completed on time with no data loss.',
        'Introduced automated integration testing that caught 3 production-impacting bugs before release.',
      ],
    },
    {
      title: 'Software Engineer II',
      company: 'Accenture',
      start: '2012-01',
      end: '2015-02',
      bullets: [
        'Developed SOAP/REST services for a large insurance client in Java.',
        'Wrote technical documentation and maintained the CI/CD pipeline.',
      ],
    },
    {
      title: 'Junior Developer',
      company: 'TechSolutions Inc.',
      start: '2010-06',
      end: '2011-12',
      bullets: ['Built internal tooling in Python for the ops team.'],
    },
  ],
  education: [
    { degree: 'B.S.', field: 'Computer Science', school: 'University of Washington', year: 2010 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// FRONTEND ENGINEERS
// ═══════════════════════════════════════════════════════════════════════════

const alex: Resume = {
  name: 'Alex Torres',
  headline: 'Frontend Engineer · React & Design Systems',
  email: 'alex.torres@example.com',
  phone: '(737) 555-0064',
  skills: [
    'TypeScript',
    'React',
    'Next.js',
    'CSS Modules',
    'Tailwind',
    'Figma',
    'Storybook',
    'GraphQL (client)',
    'Webpack',
  ],
  jobs: [
    {
      title: 'Senior Frontend Engineer',
      company: 'Figma',
      start: '2022-01',
      end: null,
      bullets: [
        'Built and maintained the design-token pipeline that syncs Figma styles to the React component library used by 200+ engineers.',
        'Led the migration of the plugin marketplace UI from class components to hooks, reducing re-renders by 35%.',
        'Drove adoption of Storybook across three product teams and wrote the contributing guide.',
      ],
    },
    {
      title: 'Frontend Engineer',
      company: 'Notion',
      start: '2019-05',
      end: '2021-12',
      bullets: [
        'Owned the settings and permissions UI; shipped SAML SSO frontend in 6 weeks end-to-end.',
        'Optimized the editor initial load from 4.1 s to 1.8 s through code-splitting and lazy hydration.',
        'Built the GraphQL fragment colocation pattern used across the frontend codebase.',
      ],
    },
  ],
  education: [
    {
      degree: 'B.A.',
      field: 'Human-Computer Interaction',
      school: 'Carnegie Mellon University',
      year: 2019,
    },
  ],
};

const emily: Resume = {
  name: 'Emily Russo',
  headline: 'UI Engineer · Web Performance',
  email: 'emily.russo@example.com',
  phone: '(617) 555-0138',
  skills: [
    'JavaScript',
    'TypeScript',
    'Vue.js',
    'Nuxt',
    'CSS',
    'Web Vitals',
    'Lighthouse',
    'A/B Testing',
  ],
  jobs: [
    {
      title: 'UI Engineer',
      company: 'HubSpot',
      start: '2021-04',
      end: null,
      bullets: [
        'Improved CRM dashboard LCP from 3.8 s to 1.4 s using resource prioritization and lazy loading.',
        'Built the A/B testing integration for the marketing pages team, enabling 20 concurrent experiments.',
        'Implemented the dark-mode theme rollout across 40+ Vue components.',
      ],
    },
    {
      title: 'Frontend Developer',
      company: 'Wayfair',
      start: '2018-09',
      end: '2021-03',
      bullets: [
        'Maintained product listing pages and implemented sorting/filtering in Nuxt/Vue.',
        'Wrote CSS performance audit tooling that flagged 12 layout-shift regressions before shipping.',
      ],
    },
  ],
  education: [
    { degree: 'B.S.', field: 'Web Development', school: 'Northeastern University', year: 2018 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// HIGH SCHOOL TEACHERS
// ═══════════════════════════════════════════════════════════════════════════

// CS degree but no software engineering experience — tests degree gate vs. skill gap
const david: Resume = {
  name: 'David Washington',
  headline: 'High School Computer Science Teacher',
  email: 'david.washington@example.com',
  phone: '(503) 555-0079',
  skills: [
    'Python',
    'Scratch',
    'Curriculum Design',
    'Classroom Management',
    'Google Workspace',
    'JavaScript (intro level)',
  ],
  jobs: [
    {
      title: 'Computer Science Teacher',
      company: 'Lincoln High School',
      start: '2015-08',
      end: null,
      bullets: [
        'Taught AP Computer Science Principles and introductory Python to 120 students per year.',
        "Developed the school's first cybersecurity elective, now in its third year with a 40-student waitlist.",
        'Led the robotics club to a regional competition win in 2022.',
        'Coordinated with district admin to update the CS curriculum to include data structures.',
      ],
    },
    {
      title: 'Teaching Assistant',
      company: 'Portland State University',
      start: '2013-09',
      end: '2015-05',
      bullets: ['Graded assignments for CS101 and held weekly office hours for 30+ students.'],
    },
  ],
  education: [
    { degree: 'B.S.', field: 'Computer Science', school: 'Portland State University', year: 2013 },
    { degree: 'M.Ed.', field: 'Secondary Education', school: 'Lewis & Clark College', year: 2015 },
  ],
};

const linda: Resume = {
  name: 'Linda Brooks',
  headline: 'High School English & Creative Writing Teacher',
  email: 'linda.brooks@example.com',
  phone: '(718) 555-0201',
  skills: [
    'Curriculum Development',
    'AP English Literature',
    'Creative Writing Workshop',
    'Google Classroom',
    'Differentiated Instruction',
  ],
  jobs: [
    {
      title: 'English Teacher',
      company: 'Westfield Academy',
      start: '2010-08',
      end: null,
      bullets: [
        'Taught AP English Literature and Composition; 87% of students score 3 or higher on the AP exam.',
        'Launched the school literary magazine, now in its 9th year of publication.',
        'Mentored 5 student essay winners at state-level writing competitions.',
        "Led the department's transition to project-based learning across all grade levels.",
      ],
    },
    {
      title: 'Substitute Teacher',
      company: 'Brooklyn City Schools',
      start: '2008-09',
      end: '2010-06',
      bullets: ['Covered English and social studies classes across 12 schools in the district.'],
    },
  ],
  education: [
    { degree: 'B.A.', field: 'English Literature', school: 'Brooklyn College', year: 2008 },
    { degree: 'M.A.', field: 'Teaching', school: 'Fordham University', year: 2010 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

console.log(`Generating fixtures → ${OUT_DIR}`);
writePdf('sarah-chen-backend.pdf', sarah);
writePdf('marcus-okafor-backend.pdf', marcus);
writePdf('priya-patel-backend.pdf', priya);
writePdf('james-whitfield-backend.pdf', james);
writePdf('alex-torres-frontend.pdf', alex);
writePdf('emily-russo-frontend.pdf', emily);
writePdf('david-washington-teacher.pdf', david);
writePdf('linda-brooks-teacher.pdf', linda);
console.log('Done.');
