
export interface Metric {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
}

export interface Campaign {
  id: string;
  name: string;
  date: string; // display date (legacy)
  status: 'Sent' | 'Scheduled' | 'Active' | 'Draft';
  openRate?: string;
  clickRate?: string;
  subject?: string;
  body?: string;
  topic?: string;
  tone?: string;
  // dynamic analytics (new)
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
  sentCount?: number;
  openCount?: number;
  clickCount?: number;
  conversionCount?: number;
  segmentName?: string;
  emailBlocks?: EmailBlock[];
  emailStyle?: EmailStyle;
}

export interface Automation {
  id: string;
  name: string;
  runs: string;
  status: 'Running' | 'Paused';
  count: number;
  trigger?: string;
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
  lastActivityAt?: string; // ISO
  steps?: AutomationStep[];
}

export interface Contact {
  id: string;
  name: string; // legacy display name
  email: string;
  status: 'Subscribed' | 'Unsubscribed' | 'Bounced';
  addedDate: string; // legacy display date
  tags: string[];
  // richer fields (new)
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  // Phase 1 canonical lifecycle stages (lowercase). Legacy values are kept for backwards compatibility.
  lifecycleStage?: 'cold' | 'lead' | 'mql' | 'customer' | 'churned' | 'Lead' | 'Subscriber' | 'Customer';
  // Phase 1 canonical temperature (lowercase). Legacy values are kept for backwards compatibility.
  temperature?: 'cold' | 'warm' | 'hot' | 'Cold' | 'Warm' | 'Hot';
  lists?: string[];
  acquisitionSource?:
    | 'facebook_ad'
    | 'landing_page'
    | 'imported_csv'
    | 'referral'
    | 'website_form'
    | 'api'
    | 'manual'
    // legacy
    | 'Website Form'
    | 'API'
    | 'CSV Import'
    | 'Web Form'
    | 'Manual';
  lastOpenDate?: string; // ISO
  lastClickDate?: string; // ISO
  lastPurchaseDate?: string; // ISO
  totalEmailsSent?: number;
  totalOpens?: number;
  totalClicks?: number;
  totalPurchases?: number;
  unsubscribed?: boolean;
  bounced?: boolean;
  spamComplaint?: boolean;
  leadScore?: number; // 0-100
  company?: string;
  jobTitle?: string;
  location?: string;
  website?: string;
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
  events?: ContactEvent[];
}

export interface ChartData {
  name: string;
  opens: number;
  clicks: number;
  conversions: number;
}

export type EmailBlock =
  | { id: string; type: 'header'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'button'; text: string; href: string }
  | { id: string; type: 'image'; src: string; alt?: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'product'; title?: string; items: Array<{ id: string; name: string; price: string; imageUrl?: string; url?: string }> }
  | { id: string; type: 'social'; items: Array<{ id: string; network: 'Facebook' | 'Instagram' | 'X' | 'LinkedIn' | 'YouTube'; url: string }> };

export interface EmailStyle {
  primaryColor: string; // hex
  secondaryColor: string; // hex / neutral
  primaryFont: string;
  secondaryFont: string;
  textScale: number; // 0.85 - 1.15
}

export type ContactEventType =
  | 'email_open'
  | 'link_click'
  | 'purchase'
  | 'subscribed'
  | 'unsubscribed'
  | 'imported'
  | 'contact_created'
  | 'bounce'
  | 'spam_complaint'
  | 'tag_added'
  | 'tag_removed'
  | 'list_joined'
  | 'list_left'
  | 'form_submitted';

export interface ContactEvent {
  id: string;
  type: ContactEventType;
  title: string;
  occurredAt: string; // ISO
  meta?: Record<string, string | number | boolean | null>;
}

export type AutomationStepType = 'trigger' | 'condition' | 'action' | 'wait';

export interface AutomationStep {
  id: string;
  type: AutomationStepType;
  title: string;
  config?: Record<string, unknown>;
}

export interface WorkspaceSettings {
  // Profile (stored in auth user metadata in production; kept here for legacy seed UI)
  firstName: string;
  lastName: string;
  email: string;

  // Workspace
  companyName: string;
  timezone: string;
  defaultFromEmail?: string;
  teamNotifyEmail?: string;
}

export enum ViewState {
  DASHBOARD = 'Dashboard',
  CAMPAIGNS = 'Campaigns',
  AUTOMATIONS = 'Automations',
  CONTACTS = 'Contacts',
  CONTENT = 'Content',
  REPORTS = 'Reports',
  ANALYTICS = 'Analytics', // kept for backwards compatibility (unused in new nav)
  SETTINGS = 'Settings'
}
