import React, { useEffect, useMemo, useState } from 'react';
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
import { ViewState, Campaign, Contact } from './types';
import { computeDashboardMetrics, useAppStore } from './store/AppStore';
import { parseContactsCsv } from './services/csvImport';
import { getSupabase } from './services/supabase';
import { invokeEdgeFunction } from './services/edgeFunctions';
import ConfirmDialog from './components/ConfirmDialog';
import AlertDialog from './components/AlertDialog';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [contactsMode, setContactsMode] = useState<'list' | 'detail'>('list');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isContactEditorOpen, setIsContactEditorOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [automationsMode, setAutomationsMode] = useState<'list' | 'builder'>('list');
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<'list' | 'builder'>('list');
  const [selectedContentCampaignId, setSelectedContentCampaignId] = useState<string | null>(null);
  const [composeForContactId, setComposeForContactId] = useState<string | null>(null);
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendPreviewBusy, setSendPreviewBusy] = useState(false);
  const [sendPreview, setSendPreview] = useState<{ eligibleCount: number; limit: number; fromEmail: string | null } | null>(null);
  const [sendPreviewError, setSendPreviewError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const { state, actions } = useAppStore();

  const metrics = useMemo(() => computeDashboardMetrics(state), [state]);
  const chartData = state.chartData;
  const campaigns = state.campaigns;
  const automations = state.automations;
  const contacts = state.contacts;

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return contacts.find(c => c.id === selectedContactId) ?? null;
  }, [contacts, selectedContactId]);

  const selectedAutomation = useMemo(() => {
    if (!selectedAutomationId) return null;
    return automations.find(a => a.id === selectedAutomationId) ?? null;
  }, [automations, selectedAutomationId]);

  const selectedContentCampaign = useMemo(() => {
    if (!selectedContentCampaignId) return null;
    return campaigns.find(c => c.id === selectedContentCampaignId) ?? null;
  }, [campaigns, selectedContentCampaignId]);

  const composeForContactName = useMemo(() => {
    if (!composeForContactId) return null;
    return contacts.find(c => c.id === composeForContactId)?.name ?? null;
  }, [composeForContactId, contacts]);

  const handleSidebarViewChange = (view: ViewState) => {
    setCurrentView(view);
    if (view !== ViewState.CONTACTS) {
      setContactsMode('list');
      setSelectedContactId(null);
    }
    if (view !== ViewState.AUTOMATIONS) {
      setAutomationsMode('list');
      setSelectedAutomationId(null);
    }
    if (view !== ViewState.CONTENT) {
      setContentMode('list');
      setSelectedContentCampaignId(null);
      setComposeForContactId(null);
    }
  };

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
    // Navigate to reports; campaign filter lives inside Reports
    // (we'll pass selected id through localStorage param until we introduce proper routing)
    try { localStorage.setItem('flowmail.ai.reports.selectedCampaignId', id); } catch {}
    setCurrentView(ViewState.REPORTS);
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
    setSelectedContactId(id);
    setContactsMode('detail');
  };

  const handleImportContactsCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseContactsCsv(text);
    rows.forEach((row) => {
      actions.createContact({
        leadScore: 40 + Math.round(Math.random() * 50),
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
    setSelectedAutomationId(created.id);
    setAutomationsMode('builder');
  };

  const openAutomation = (id: string) => {
    setSelectedAutomationId(id);
    setAutomationsMode('builder');
  };

  const openEmailBuilder = (campaignId: string) => {
    setSelectedContentCampaignId(campaignId);
    setContentMode('builder');
  };

  const sendCampaignNow = async (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    try {
      setSendBusy(true);
      const data = await invokeEdgeFunction<any>('send-campaign', { campaignId, workspaceId: 'default', limit: 50 });
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
          workspaceId: 'default',
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

  return (
    <div className="flex min-h-screen bg-transparent">
      <Sidebar currentView={currentView} onViewChange={handleSidebarViewChange} />
      
      <main className="ml-64 flex-1 p-8 h-screen overflow-y-auto relative">
        {/* View Router */}
        {currentView === ViewState.DASHBOARD && (
          <Dashboard 
            metrics={metrics}
            chartData={chartData}
            campaigns={campaigns.slice(0, 3)}
            automations={automations.slice(0, 3)}
            dateRangePreset={state.ui?.dateRangePreset ?? '30d'}
            onDateRangePresetChange={actions.setDateRangePreset}
            onRefresh={actions.refreshChartData}
          />
        )}
        {currentView === ViewState.CAMPAIGNS && (
          <CampaignsView 
            onCreate={openCreator} 
            campaigns={campaigns} 
            onDelete={handleDeleteCampaign}
            onEdit={handleEditCampaign}
            onAnalytics={handleViewAnalytics}
            onOpenContent={(id) => {
              setCurrentView(ViewState.CONTENT);
              setContentMode('builder');
              setSelectedContentCampaignId(id);
            }}
            onSendNow={(id) => {
              setConfirmSendId(id);
            }}
          />
        )}
        {currentView === ViewState.AUTOMATIONS && (
          <>
            {automationsMode === 'list' && (
              <AutomationsView
                automations={automations}
                onCreate={createAutomation}
                onOpen={openAutomation}
                onToggleStatus={actions.toggleAutomationStatus}
                onDelete={(id) => actions.deleteAutomation(id)}
              />
            )}
            {automationsMode === 'builder' && selectedAutomation && (
              <AutomationBuilderView
                automation={selectedAutomation}
                onBack={() => { setAutomationsMode('list'); setSelectedAutomationId(null); }}
                onToggleStatus={() => actions.toggleAutomationStatus(selectedAutomation.id)}
                onDelete={() => {
                  if (window.confirm('Delete this automation?')) {
                    actions.deleteAutomation(selectedAutomation.id);
                    setAutomationsMode('list');
                    setSelectedAutomationId(null);
                  }
                }}
                onUpdate={(patch) => actions.updateAutomation(selectedAutomation.id, patch)}
              />
            )}
          </>
        )}
        {currentView === ViewState.CONTACTS && (
          <>
            {contactsMode === 'list' && (
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
            )}
            {contactsMode === 'detail' && selectedContact && (
              <ContactDetailView
                contact={selectedContact}
                onBack={() => { setContactsMode('list'); setSelectedContactId(null); }}
                onEdit={() => openContactEditor(selectedContact.id)}
                onSendEmail={() => {
                  setComposeForContactId(selectedContact.id);
                  setCurrentView(ViewState.CONTENT);
                  setContentMode('list');
                }}
                onAddToWorkflow={() => {
                  setCurrentView(ViewState.AUTOMATIONS);
                  setAutomationsMode('list');
                }}
              />
            )}
          </>
        )}
        {currentView === ViewState.CONTENT && (
          <>
            {contentMode === 'list' && (
              <ContentView
                campaigns={campaigns}
                onOpenBuilder={openEmailBuilder}
                composeForContactName={composeForContactName}
              />
            )}
            {contentMode === 'builder' && selectedContentCampaign && (
              <EmailBuilderView
                campaign={selectedContentCampaign}
                onBack={() => { setContentMode('list'); setSelectedContentCampaignId(null); }}
                onUpdate={(patch) => actions.updateCampaign(selectedContentCampaign.id, patch)}
              />
            )}
          </>
        )}
        {currentView === ViewState.REPORTS && (
          <ReportsView />
        )}
        {currentView === ViewState.SETTINGS && (
          <SettingsView />
        )}

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
  );
};

export default App;