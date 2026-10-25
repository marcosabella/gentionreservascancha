import { useState } from 'react';
import PlayerAnnouncementSettings from './PlayerAnnouncementSettings';
import BookingReminderSettings from './BookingReminderSettings';
import AnnouncementHistory from './AnnouncementHistory';

const tabs = [{ id: 'send', label: 'Envío de notificaciones' }, { id: 'history', label: 'Historial' }, { id: 'reminders', label: 'Configuración de recordatorios' }] as const;

export default function AdminNotificationSettings() {
  const [tab, setTab] = useState<'send' | 'history' | 'reminders'>('send');
  const [historyVersion, setHistoryVersion] = useState(0);
  return <div className="mt-6">
    <div role="tablist" aria-label="Administración de notificaciones" className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
      {tabs.map((item, index) => <button key={item.id}
        type="button" role="tab" id={`notification-tab-${item.id}`} aria-controls={`notification-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
        onClick={() => setTab(item.id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
          const next = tabs[nextIndex].id;
          setTab(next); document.getElementById(`notification-tab-${next}`)?.focus();
        }} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-green-600 ${tab === item.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id="notification-panel-send" aria-labelledby="notification-tab-send" hidden={tab !== 'send'}><PlayerAnnouncementSettings onSent={() => setHistoryVersion(previous => previous + 1)} /></div>
    <div role="tabpanel" id="notification-panel-history" aria-labelledby="notification-tab-history" hidden={tab !== 'history'}><AnnouncementHistory version={historyVersion} active={tab === 'history'} /></div>
    <div role="tabpanel" id="notification-panel-reminders" aria-labelledby="notification-tab-reminders" hidden={tab !== 'reminders'}><BookingReminderSettings /></div>
  </div>;
}
