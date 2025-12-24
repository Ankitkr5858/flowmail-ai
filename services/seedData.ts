import type { Automation, Campaign, Contact, WorkspaceSettings, ChartData, EmailBlock, ContactEvent } from '../types';
import type { UiState } from '../store/AppStore';

const nowIso = () => new Date().toISOString();
const daysAgoIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function makeEmailBlocks(topic: string): EmailBlock[] {
  return [
    { id: uid(), type: 'header', text: topic },
    { id: uid(), type: 'text', text: `Hi {{firstName}},\n\nHere’s an update about ${topic}.` },
    { id: uid(), type: 'button', text: 'Shop Now', href: 'https://example.com' },
    { id: uid(), type: 'divider' },
    { id: uid(), type: 'text', text: 'If you have any questions, just reply to this email.' }
  ];
}

function makeContactEvents(): ContactEvent[] {
  return [
    { id: uid(), type: 'imported', title: 'Contact Created (imported)', occurredAt: daysAgoIso(90) },
    { id: uid(), type: 'subscribed', title: 'Subscribed to List: "Newsletter"', occurredAt: daysAgoIso(40) },
    { id: uid(), type: 'email_open', title: 'Email Opened: "Your Insights Weekly"', occurredAt: daysAgoIso(2), meta: { campaign: 'Newsletter' } },
    { id: uid(), type: 'link_click', title: 'Link Clicked: "Try New Feature"', occurredAt: daysAgoIso(2), meta: { url: 'https://example.com/feature' } },
    { id: uid(), type: 'purchase', title: 'Purchase Made: "Premium Plan - Annual"', occurredAt: daysAgoIso(1), meta: { amount: 199, currency: 'USD' } },
  ];
}

export interface SeedState {
  campaigns: Campaign[];
  contacts: Contact[];
  automations: Automation[];
  chartData: ChartData[];
  settings: WorkspaceSettings;
  ui: UiState;
}

export function createSeedState(): SeedState {
  const campaigns: Campaign[] = [
    {
      id: '1',
      name: 'Summer Sale Blast',
      date: formatDisplayDate(daysAgoIso(220)),
      status: 'Sent',
      openRate: '21%',
      clickRate: '3.8%',
      topic: 'Summer Sale',
      tone: 'Urgent',
      createdAt: daysAgoIso(220),
      updatedAt: daysAgoIso(220),
      segmentName: 'Warm Leads',
      sentCount: 25000,
      openCount: 8125,
      clickCount: 3025,
      conversionCount: 300,
      emailBlocks: makeEmailBlocks('Summer Sale is live'),
    },
    {
      id: '2',
      name: 'Product Update Newsletter',
      date: formatDisplayDate(daysAgoIso(210)),
      status: 'Scheduled',
      openRate: '-',
      clickRate: '-',
      topic: 'Product Update',
      tone: 'Professional',
      createdAt: daysAgoIso(210),
      updatedAt: daysAgoIso(10),
      segmentName: 'Subscribers',
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      conversionCount: 0,
      emailBlocks: makeEmailBlocks('What’s new in FlowMail'),
    },
    {
      id: '3',
      name: 'Welcome Series - New Users',
      date: formatDisplayDate(daysAgoIso(205)),
      status: 'Active',
      openRate: '45%',
      clickRate: '9.1%',
      topic: 'Welcome',
      tone: 'Friendly',
      createdAt: daysAgoIso(205),
      updatedAt: daysAgoIso(3),
      segmentName: 'New Subscribers',
      sentCount: 10000,
      openCount: 4500,
      clickCount: 910,
      conversionCount: 120,
      emailBlocks: makeEmailBlocks('Welcome to the community!'),
    },
    {
      id: '4',
      name: 'Black Friday Teaser',
      date: formatDisplayDate(daysAgoIso(30)),
      status: 'Draft',
      openRate: '-',
      clickRate: '-',
      topic: 'Black Friday',
      tone: 'Exciting',
      createdAt: daysAgoIso(30),
      updatedAt: daysAgoIso(1),
      segmentName: 'VIP',
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      conversionCount: 0,
      emailBlocks: makeEmailBlocks('Black Friday is coming'),
    },
  ];

  const contacts: Contact[] = [
    {
      id: 'c1',
      name: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1 (555) 123-4567',
      timezone: 'GMT-8',
      lifecycleStage: 'Lead',
      temperature: 'Hot',
      tags: ['High Value', 'Lead'],
      lists: ['Newsletter', 'Product Updates'],
      acquisitionSource: 'Website Form',
      lastOpenDate: daysAgoIso(2),
      lastClickDate: daysAgoIso(2),
      leadScore: 85,
      status: 'Subscribed',
      addedDate: formatDisplayDate(daysAgoIso(90)),
      company: 'Acme Corp',
      jobTitle: 'Marketing Manager',
      location: 'San Francisco, CA',
      website: 'acmecorp.com',
      createdAt: daysAgoIso(90),
      updatedAt: daysAgoIso(1),
      events: makeContactEvents(),
    },
    {
      id: 'c2',
      name: 'John Smith',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+1 (555) 555-1234',
      timezone: 'GMT-5',
      lifecycleStage: 'Lead',
      temperature: 'Warm',
      tags: ['VIP', 'Newsletter'],
      lists: ['Primary List'],
      acquisitionSource: 'Website Form',
      lastOpenDate: daysAgoIso(3),
      lastClickDate: daysAgoIso(2),
      leadScore: 85,
      status: 'Subscribed',
      addedDate: formatDisplayDate(daysAgoIso(60)),
      createdAt: daysAgoIso(60),
      updatedAt: daysAgoIso(2),
      events: [
        { id: uid(), type: 'contact_created', title: 'Contact Created', occurredAt: daysAgoIso(60) },
        { id: uid(), type: 'email_open', title: 'Email Opened: "Holiday Sale"', occurredAt: daysAgoIso(3) },
        { id: uid(), type: 'link_click', title: 'Link Clicked: "Shop Now"', occurredAt: daysAgoIso(2) },
      ],
    },
  ];

  const automations: Automation[] = [
    { id: 'a1', name: 'Abandoned Cart Recovery', runs: '1250 contacts', status: 'Running', count: 1250, trigger: 'Cart Abandoned', createdAt: daysAgoIso(120), updatedAt: daysAgoIso(2), lastActivityAt: daysAgoIso(0), steps: (() => {
      const t1 = uid();
      const c1 = uid();
      const yes1 = uid();
      const no1 = uid();
      const w1 = uid();
      const f1 = uid();
      return [
        { id: t1, type: 'trigger', title: 'Form Submitted: Newsletter Signup', config: { kind: 'trigger.form_submitted', form: 'Newsletter Signup', x: 120, y: 80, next: c1 } },
        { id: c1, type: 'condition', title: 'Check: Lead Score > 50', config: { kind: 'condition.lead_score', op: '>', value: 50, x: 480, y: 80, nextYes: yes1, nextNo: no1 } },
        { id: yes1, type: 'action', title: 'Send Email: Welcome Packet', config: { kind: 'action.send_email', template: 'Welcome V3', subject: 'Welcome to the community!', body: 'Hi {{firstName}},\n\nWelcome aboard! Here’s your welcome packet…', x: 840, y: 10, next: w1 } },
        { id: no1, type: 'action', title: 'Send Email: Learn More', config: { kind: 'action.send_email', template: 'Nurture', subject: 'A few resources to get started', body: 'Hi {{firstName}},\n\nHere are a few resources to help you get value fast…', x: 840, y: 150, next: w1 } },
        { id: w1, type: 'wait', title: 'Wait: 1 day', config: { kind: 'wait', days: 1, x: 1200, y: 80, next: f1 } },
        { id: f1, type: 'action', title: 'Send Email: Follow-up', config: { kind: 'action.send_email', template: 'Follow-up', subject: 'Quick follow-up', body: 'Just checking in—any questions?', x: 1560, y: 80 } },
      ];
    })()},
    { id: 'a2', name: 'Post-Purchase Follow-up', runs: '340 contacts', status: 'Running', count: 340, trigger: 'Purchase Complete', createdAt: daysAgoIso(80), updatedAt: daysAgoIso(8), lastActivityAt: daysAgoIso(0) },
    { id: 'a3', name: 'Lead Nurturing Sequence', runs: '890 contacts', status: 'Running', count: 890, trigger: 'Form Submit', createdAt: daysAgoIso(70), updatedAt: daysAgoIso(4), lastActivityAt: daysAgoIso(1) },
    { id: 'a4', name: 'Win-back Inactive', runs: '50 contacts', status: 'Paused', count: 50, trigger: 'Inactivity > 30d', createdAt: daysAgoIso(45), updatedAt: daysAgoIso(5), lastActivityAt: daysAgoIso(10) },
  ];

  // chart series (last 11 points like the existing UI)
  const chartData: ChartData[] = [
    { name: 'Last 1', opens: 11000, clicks: 6000, conversions: 2000 },
    { name: 'Last 3', opens: 15000, clicks: 5500, conversions: 2500 },
    { name: 'Jan 09', opens: 24000, clicks: 7000, conversions: 3500 },
    { name: 'Jan 11', opens: 25500, clicks: 10500, conversions: 4000 },
    { name: 'Jan 13', opens: 21000, clicks: 8000, conversions: 3000 },
    { name: 'Jan 15', opens: 31000, clicks: 9500, conversions: 5000 },
    { name: 'Jan 18', opens: 30000, clicks: 11000, conversions: 4800 },
    { name: 'Jan 21', opens: 22500, clicks: 8000, conversions: 3200 },
    { name: 'Jan 24', opens: 32000, clicks: 9800, conversions: 5200 },
    { name: 'Jan 27', opens: 28000, clicks: 9500, conversions: 4100 },
    { name: 'Month', opens: 35000, clicks: 12500, conversions: 6000 },
  ];

  const settings: WorkspaceSettings = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'admin@flowmail.com',
    companyName: 'FlowMail Inc.',
    timezone: '(GMT-08:00) Pacific Time',
    defaultFromEmail: 'jimmy@peremis.com',
    teamNotifyEmail: 'jimmy@peremis.com',
  };

  const ui: UiState = {
    dateRangePreset: '30d',
    lastRefreshedAt: nowIso(),
    chartSeed: 42,
  };

  return { campaigns, contacts, automations, chartData, settings, ui };
}


