import React, { useEffect, useState } from 'react';
import { X, Wand2, Loader2, Send, Save } from 'lucide-react';
import { generateEmailContent } from '../services/geminiService';
import type { Campaign, EmailBlock } from '../types';
import { Select } from './ui/Select';

interface CampaignCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (campaign: Partial<Campaign>) => void;
  initialCampaign?: Campaign | null;
}

const CampaignCreator: React.FC<CampaignCreatorProps> = ({ isOpen, onClose, onSave, initialCampaign }) => {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Professional');
  const [audienceType, setAudienceType] = useState<'cold' | 'warm' | 'customer' | 'general'>('general');
  const [generatedContent, setGeneratedContent] = useState<{ subject: string; body: string; previewText?: string; subjectOptions?: string[]; previewOptions?: string[] } | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Sync modal state whenever we open or switch campaigns
    if (!isOpen) return;
    setTopic(initialCampaign?.topic || initialCampaign?.name || '');
    setTone(initialCampaign?.tone || 'Professional');
    if (initialCampaign?.subject && initialCampaign?.body) {
      setGeneratedContent({ subject: initialCampaign.subject, body: initialCampaign.body });
    } else {
      setGeneratedContent(null);
    }
    setIsGenerating(false);
  }, [isOpen, initialCampaign?.id]);

  const makeId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  const buildBlocksFromContent = (subject: string, body: string): EmailBlock[] => {
    const blocks: EmailBlock[] = [
      { id: makeId('blk'), type: 'header', text: subject || topic || 'Email' },
      { id: makeId('blk'), type: 'text', text: body || '' },
      { id: makeId('blk'), type: 'button', text: 'Learn More', href: 'https://example.com' },
      { id: makeId('blk'), type: 'divider' },
      { id: makeId('blk'), type: 'text', text: '—\nYou are receiving this because you subscribed.' },
    ];
    return blocks;
  };

  const handleGenerate = async () => {
    if (!topic) return;
    setIsGenerating(true);
    const content: any = await generateEmailContent(topic, tone, audienceType);
    setGeneratedContent(content);
    setIsGenerating(false);
  };

  const handleSave = (status: 'Draft' | 'Scheduled') => {
    if (!generatedContent) return;

    const shouldGenerateBlocks = !(initialCampaign?.emailBlocks && initialCampaign.emailBlocks.length > 0);
    
    onSave({
        name: topic || 'New Campaign',
        status: status,
        topic: topic,
        tone: tone,
        subject: generatedContent.subject,
        body: generatedContent.body,
        ...(shouldGenerateBlocks ? { emailBlocks: buildBlocksFromContent(generatedContent.subject, generatedContent.body) } : {})
    });
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-sky-700 icon-inherit">
            <Wand2 className="app-icon w-5 h-5" />
            <h2 className="font-semibold text-lg text-slate-800">
                {initialCampaign ? 'Edit Campaign' : 'Campaign Creator'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 icon-inherit">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Topic / Goal</label>
              <input
                type="text"
                className="w-full bg-white text-slate-800 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                placeholder="e.g., Summer Sale announcement for loyal customers"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tone</label>
              <Select<string>
                value={tone}
                onChange={(v) => setTone(v)}
                options={[
                  { value: 'Professional', label: 'Professional' },
                  { value: 'Friendly & Casual', label: 'Friendly & Casual' },
                  { value: 'Urgent / Sales-focused', label: 'Urgent / Sales-focused' },
                  { value: 'Witty & Fun', label: 'Witty & Fun' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Audience Type</label>
              <Select<'cold' | 'warm' | 'customer' | 'general'>
                value={audienceType}
                onChange={(v) => setAudienceType(v)}
                options={[
                  { value: 'general', label: 'general' },
                  { value: 'cold', label: 'cold lead' },
                  { value: 'warm', label: 'warm lead' },
                  { value: 'customer', label: 'customer' },
                ]}
              />
            </div>

            {!generatedContent && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !topic}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed icon-on-solid"
              >
                {isGenerating ? <Loader2 className="app-icon w-4 h-4 animate-spin" /> : <Wand2 className="app-icon w-4 h-4" />}
                {isGenerating ? 'Generating Magic...' : 'Generate with Gemini'}
              </button>
            )}

            {generatedContent && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {(generatedContent.subjectOptions && generatedContent.subjectOptions.length > 0) && (
                  <div className="p-4 bg-white rounded-lg border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Subject Options</div>
                    <div className="flex flex-wrap gap-2">
                      {generatedContent.subjectOptions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setGeneratedContent({ ...generatedContent, subject: s })}
                          className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                          title="Use this subject"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subject Line</label>
                  <input 
                    value={generatedContent.subject} 
                    className="w-full bg-transparent font-medium text-slate-900 outline-none border-b border-transparent focus:border-sky-300"
                    onChange={(e) => setGeneratedContent({...generatedContent, subject: e.target.value})}
                  />
                </div>

                {(generatedContent.previewOptions && generatedContent.previewOptions.length > 0) && (
                  <div className="p-4 bg-white rounded-lg border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Preview Options</div>
                    <div className="flex flex-wrap gap-2">
                      {generatedContent.previewOptions.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setGeneratedContent({ ...generatedContent, previewText: p })}
                          className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                          title="Use this preview"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    {generatedContent.previewText && (
                      <div className="mt-3 text-sm text-slate-700">
                        <span className="font-semibold">Selected:</span> {generatedContent.previewText}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 h-64 flex flex-col">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Email Body</label>
                  <textarea 
                    value={generatedContent.body}
                    className="w-full flex-1 bg-transparent text-slate-700 resize-none outline-none leading-relaxed"
                    onChange={(e) => setGeneratedContent({...generatedContent, body: e.target.value})}
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                        setGeneratedContent(null);
                        handleGenerate();
                    }}
                    className="flex-1 border border-slate-300 text-slate-600 font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Regenerate
                  </button>
                   <button 
                    onClick={() => handleSave('Draft')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors icon-on-solid"
                  >
                    <Save className="app-icon w-4 h-4" />
                    Save Draft
                  </button>
                  <button 
                    onClick={() => handleSave('Scheduled')}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors icon-on-solid"
                  >
                    <Send className="app-icon w-4 h-4" />
                    {initialCampaign?.status === 'Scheduled' ? 'Update Schedule' : 'Schedule'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignCreator;