import type { Automation, Campaign, Contact, WorkspaceSettings, ChartData } from '../types';
import type { UiState } from '../store/AppStore';

// IMPORTANT: Production must never show demo/dummy data. This function now returns an empty state.
// Demo seeding (if you ever want it) is handled explicitly via Supabase and controlled by env vars there.

export interface SeedState {
  campaigns: Campaign[];
  contacts: Contact[];
  automations: Automation[];
  chartData: ChartData[];
  settings: WorkspaceSettings;
  ui: UiState;
}

export function createSeedState(): SeedState {
  const ui: UiState = {
    dateRangePreset: '30d',
    lastRefreshedAt: new Date().toISOString(),
    chartSeed: 0,
  };
  const settings: WorkspaceSettings = {
    firstName: '',
    lastName: '',
    email: '',
    companyName: '',
    timezone: 'UTC',
    defaultFromEmail: undefined,
    teamNotifyEmail: undefined,
  };
  return { campaigns: [], contacts: [], automations: [], chartData: [], settings, ui };
}


