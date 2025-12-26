import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CampaignCreator from './components/CampaignCreator';
import CampaignsView from './components/CampaignsView';
import AutomationsView from './components/AutomationsView';
import ContactsView from './components/ContactsView';
import ContentView from './components/ContentView';
import EmailBuilderView from './components/EmailBuilderView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import ContactDetailView from './components/ContactDetailView';
import ContactEditor from './components/ContactEditor';
import AutomationBuilderView from './components/AutomationBuilderView';
import { Campaign, Contact } from './types';
import { computeDashboardMetrics, useAppStore } from './store/AppStore';
import { parseContactsCsv } from './services/csvImport';
import { invokeEdgeFunction } from './services/edgeFunctions';
import ConfirmDialog from './components/ConfirmDialog';
import AlertDialog from './components/AlertDialog';
import LoginView from './components/LoginView';
import { getWorkspaceId } from './services/supabase';
import { Menu } from 'lucide-react';

const App: React.FC = () => {
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isContactEditorOpen, setIsContactEditorOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [composeForContactId, setComposeForContactId] = useState<string | null>(null);
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendPreviewBusy, setSendPreviewBusy] = useState(false);
  const [sendPreview, setSendPreview] = useState<{ eligibleCount: number; limit: number; fromEmail: string | null } | null>(null);
  const [sendPreviewError, setSendPreviewError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { state, actions } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const metrics = useMemo(() => computeDashboardMetrics(state), [state]);
  const chartData = state.chartData;
  const campaigns = state.campaigns;
  const automations = state.automations;
  const contacts = state.contacts;

  const composeForContactName = useMemo(() => {
    if (!composeForContactId) return null;
    return contacts.find(c => c.id === composeForContactId)?.name ?? null;
  }, [composeForContactId, contacts]);

  const handleDeleteCampaign = (id: string) => {
    if (window.confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      actions.deleteCampaign(id);
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setIsCreatorOpen(true);
  };

  const handleViewAnalytics = (id: string) => {
    navigate(`/reports?campaignId=${encodeURIComponent(id)}`);
  };

  const handleSaveCampaign = (campaignData: Partial<Campaign>) => {
    if (editingCampaign) {
      // Update existing campaign
      actions.updateCampaign(editingCampaign.id, campaignData);
    } else {
      // Create new campaign
      actions.createCampaign(campaignData);
    }
  };

  const handleCloseCreator = () => {
    setIsCreatorOpen(false);
    // Short delay to clear editing state after animation would ideally be better, 
    // but clearing immediately ensures next open is fresh.
    setEditingCampaign(null); 
  };

  const openCreator = () => {
    setEditingCampaign(null);
    setIsCreatorOpen(true);
  };

  const openContactCreator = () => {
    setEditingContactId(null);
    setIsContactEditorOpen(true);
  };

  const openContactEditor = (id: string) => {
    setEditingContactId(id);
    setIsContactEditorOpen(true);
  };

  const closeContactEditor = () => {
    setIsContactEditorOpen(false);
    setEditingContactId(null);
  };

  const handleSaveContact = (patch: Partial<Contact>) => {
    if (editingContactId) {
      actions.updateContact(editingContactId, patch);
    } else {
      // add a default lead score for new contacts
      actions.createContact({ leadScore: 50, ...patch });
    }
  };

  const handleOpenContact = (id: string) => {
    navigate(`/contacts/${encodeURIComponent(id)}`);
  };

  const handleImportContactsCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseContactsCsv(text);
    rows.forEach((row) => {
      actions.createContact({
        // Production: avoid synthetic/random lead scores; use a sensible default.
        leadScore: 50,
        ...row,
      });
    });
  };

  const createAutomation = () => {
    const created = actions.createAutomation({
      name: 'Untitled Automation',
      status: 'Paused',
      count: 0,
      runs: '0 contacts',
      trigger: 'Form Submitted',
      steps: [],
    });
    navigate(`/automations/${encodeURIComponent(created.id)}`);
  };

  const openAutomation = (id: string) => {
    navigate(`/automations/${encodeURIComponent(id)}`);
  };

  const openEmailBuilder = (campaignId: string) => {
    navigate(`/content/${encodeURIComponent(campaignId)}`);
  };

  const sendCampaignNow = async (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    try {
      setSendBusy(true);
      const workspaceId = getWorkspaceId();
      const data = await invokeEdgeFunction<any>('send-campaign', { campaignId, workspaceId, limit: 50 });
      const queuedCount = Number((data as any)?.queued ?? 0);

      actions.updateCampaign(campaignId, {
        status: 'Sent',
        sentCount: queuedCount,
        openCount: 0,
        clickCount: 0,
        conversionCount: 0,
        openRate: '0.0%',
        clickRate: '0.0%',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      });
      setAlert({ title: 'Queued', message: `Queued ${queuedCount} emails for delivery via SMTP.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAlert({ title: 'Send failed', message: msg });
    } finally {
      setSendBusy(false);
    }
  };

  // Pre-flight recipient preview for the confirm modal
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!confirmSendId) {
        setSendPreview(null);
        setSendPreviewError(null);
        setSendPreviewBusy(false);
        return;
      }
      try {
        setSendPreviewBusy(true);
        setSendPreview(null);
        setSendPreviewError(null);
        const data = await invokeEdgeFunction<any>('send-campaign', {
          campaignId: confirmSendId,
          workspaceId: getWorkspaceId(),
          limit: 50,
          dryRun: true,
          sampleSize: 0,
        });
        if (cancelled) return;
        const eligibleCount = Number((data as any)?.eligibleCount ?? 0);
        const limit = Number((data as any)?.limit ?? 50);
        const fromEmail = (data as any)?.fromEmail ? String((data as any).fromEmail) : null;
        setSendPreview({ eligibleCount, limit, fromEmail });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSendPreviewError(msg);
      } finally {
        if (!cancelled) setSendPreviewBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [confirmSendId]);

  // Close the mobile sidebar drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="min-h-screen bg-transparent">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-[60] border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="h-14 px-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            aria-label="Open navigation"
          >
            <Menu className="app-icon w-5 h-5" />
          </button>
          <div className="font-semibold text-slate-900">FlowMail</div>
        </div>
      </div>

      <div className="flex min-h-screen">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 lg:ml-64 p-4 sm:p-6 lg:p-8 min-h-screen overflow-y-auto relative">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginView />} />
          <Route
            path="/dashboard"
            element={
              <Dashboard
                metrics={metrics}
                chartData={chartData}
                campaigns={campaigns.slice(0, 3)}
                automations={automations.slice(0, 3)}
                dateRangePreset={state.ui?.dateRangePreset ?? '30d'}
                onDateRangePresetChange={actions.setDateRangePreset}
                onRefresh={actions.refreshAll}
              />
            }
          />
          <Route
            path="/campaigns"
            element={
              <CampaignsView
                onCreate={openCreator}
                campaigns={campaigns}
                onDelete={handleDeleteCampaign}
                onEdit={handleEditCampaign}
                onAnalytics={handleViewAnalytics}
                onOpenContent={(id) => navigate(`/content/${encodeURIComponent(id)}`)}
                onSendNow={(id) => setConfirmSendId(id)}
              />
            }
          />
          <Route
            path="/automations"
            element={
              <AutomationsView
                automations={automations}
                onCreate={createAutomation}
                onOpen={openAutomation}
                onToggleStatus={actions.toggleAutomationStatus}
                onDelete={(id) => actions.deleteAutomation(id)}
              />
            }
          />
          <Route
            path="/automations/:automationId"
            element={<AutomationRoute automations={automations} onBack={() => navigate('/automations')} />}
          />
          <Route
            path="/contacts"
            element={
              <ContactsView
                contacts={contacts}
                onCreate={openContactCreator}
                onOpenContact={handleOpenContact}
                onEditContact={openContactEditor}
                onDeleteContact={(id) => {
                  if (window.confirm('Delete this contact? This cannot be undone.')) actions.deleteContact(id);
                }}
                onImportCsv={handleImportContactsCsv}
              />
            }
          />
          <Route
            path="/contacts/:contactId"
            element={<ContactRoute contacts={contacts} onBack={() => navigate('/contacts')} onEdit={openContactEditor} onCompose={(id) => { setComposeForContactId(id); navigate('/content'); }} onGoAutomations={() => navigate('/automations')} />}
          />
          <Route
            path="/content"
            element={<ContentView campaigns={campaigns} onOpenBuilder={openEmailBuilder} composeForContactName={composeForContactName} />}
          />
          <Route
            path="/content/:campaignId"
            element={<ContentBuilderRoute campaigns={campaigns} onBack={() => navigate('/content')} onUpdate={actions.updateCampaign} />}
          />
          <Route path="/reports" element={<ReportsRoute />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        </main>

      <CampaignCreator 
        isOpen={isCreatorOpen} 
        onClose={handleCloseCreator} 
        onSave={handleSaveCampaign}
        initialCampaign={editingCampaign}
      />

      <ContactEditor
        isOpen={isContactEditorOpen}
        onClose={closeContactEditor}
        onSave={handleSaveContact}
        initialContact={editingContactId ? contacts.find(c => c.id === editingContactId) ?? null : null}
      />

      <ConfirmDialog
        isOpen={!!confirmSendId}
        title="Send campaign now?"
        description={
          sendPreviewBusy
            ? 'Loading recipient preview…'
            : sendPreviewError
              ? `Could not load recipient preview.\n\nYou can still send if you want.\n\nError: ${sendPreviewError}`
              : `This will enqueue emails and deliver via your SMTP Gateway.\n\nRecipients (limit ${sendPreview?.limit ?? 50}): ${sendPreview?.eligibleCount ?? 0}\nFrom: ${sendPreview?.fromEmail ?? '(not set)'}\n\nTo see the full recipient list after you send, open Reports → select this campaign.`
        }
        confirmText="Send Now"
        cancelText="Cancel"
        isLoading={sendBusy || sendPreviewBusy}
        onCancel={() => { setConfirmSendId(null); }}
        onConfirm={() => {
          const id = confirmSendId;
          setConfirmSendId(null);
          if (id) void sendCampaignNow(id);
        }}
      />

      <AlertDialog
        isOpen={!!alert}
        title={alert?.title ?? 'Info'}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />
      </div>
    </div>
  );
};

export default App;

function AutomationRoute({ automations, onBack }: { automations: any[]; onBack: () => void }) {
  const { actions } = useAppStore();
  const { automationId } = useParams();
  const automation = useMemo(() => automations.find((a: any) => a.id === automationId) ?? null, [automations, automationId]);
  if (!automation) return <Navigate to="/automations" replace />;
  return (
    <AutomationBuilderView
      automation={automation}
      onBack={onBack}
      onToggleStatus={() => actions.toggleAutomationStatus(automation.id)}
      onDelete={() => {
        if (window.confirm('Delete this automation?')) {
          actions.deleteAutomation(automation.id);
          onBack();
        }
      }}
      onUpdate={(patch) => actions.updateAutomation(automation.id, patch)}
    />
  );
}

function ContactRoute({
  contacts,
  onBack,
  onEdit,
  onCompose,
  onGoAutomations,
}: {
  contacts: Contact[];
  onBack: () => void;
  onEdit: (id: string) => void;
  onCompose: (id: string) => void;
  onGoAutomations: () => void;
}) {
  const { contactId } = useParams();
  const contact = useMemo(() => contacts.find((c) => c.id === contactId) ?? null, [contacts, contactId]);
  if (!contact) return <Navigate to="/contacts" replace />;
  return (
    <ContactDetailView
      contact={contact}
      onBack={onBack}
      onEdit={() => onEdit(contact.id)}
      onSendEmail={() => onCompose(contact.id)}
      onAddToWorkflow={onGoAutomations}
    />
  );
}

function ContentBuilderRoute({
  campaigns,
  onBack,
  onUpdate,
}: {
  campaigns: Campaign[];
  onBack: () => void;
  onUpdate: (id: string, patch: Partial<Campaign>) => void;
}) {
  const { campaignId } = useParams();
  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaigns, campaignId]);
  if (!campaign) return <Navigate to="/content" replace />;
  return <EmailBuilderView campaign={campaign} onBack={onBack} onUpdate={(patch) => onUpdate(campaign.id, patch)} />;
}

function ReportsRoute() {
  const [params] = useSearchParams();
  const campaignId = params.get('campaignId');
  useEffect(() => {
    if (!campaignId) return;
    try { localStorage.setItem('flowmail.ai.reports.selectedCampaignId', campaignId); } catch {}
  }, [campaignId]);
  return <ReportsView />;
}