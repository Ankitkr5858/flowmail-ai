import React from 'react';
import { User, Bell, Lock, Globe, CreditCard, Save } from 'lucide-react';

const SettingsView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences and workspace settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Settings Navigation */}
        <div className="space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg font-medium">
            <User className="w-4 h-4" /> Profile
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium transition-colors">
            <Bell className="w-4 h-4" /> Notifications
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium transition-colors">
            <Lock className="w-4 h-4" /> Security & API
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium transition-colors">
            <CreditCard className="w-4 h-4" /> Billing
          </button>
        </div>

        {/* Main Settings Form */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Section: Profile */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Personal Information</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                  <input type="text" defaultValue="John" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                  <input type="text" defaultValue="Doe" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input type="email" defaultValue="admin@flowmail.com" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          </div>

          {/* Section: Workspace */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
             <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Workspace & Preferences</h2>
             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                 <input type="text" defaultValue="FlowMail Inc." className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                 <select className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none">
                   <option>(GMT-08:00) Pacific Time</option>
                   <option>(GMT-05:00) Eastern Time</option>
                   <option>(GMT+00:00) UTC</option>
                 </select>
               </div>
             </div>
          </div>

          <div className="flex justify-end">
             <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors">
               <Save className="w-4 h-4" />
               Save Changes
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsView;
