"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, FileText, Settings, User, ArrowLeft, Folder, ChevronRight, Plus } from 'lucide-react';
import { isSameDay, format, differenceInMinutes, startOfWeek, addDays } from 'date-fns';
import { enUS, de } from 'date-fns/locale';
import MiniCalendar from '../Calendar/MiniCalendar';
import { useDataStore } from '@/store/useDataStore';

interface MobileLayoutProps {
  events: any[];
  files: any[];
  folders: any[];
  onNoteSelect: (id: string, title: string) => void;
  onNewNote: () => void;
  onDeleteNote?: (id: string) => void;
  editorElement: React.ReactNode; 
  activeNoteId: string | null;
  activeNoteTitle: string;
  onNewEvent?: (date: Date) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date) => void;
  onEventDelete?: (id: string) => void;
  userProfile?: { username: string; email: string; avatar_seed?: string; avatar_salt?: string; bio?: string; title?: string; id?: string; user_id?: string } | null;
}

export default function MobileLayout({
  events,
  files,
  folders,
  onNoteSelect,
  onNewNote,
  editorElement,
  activeNoteId,
  activeNoteTitle,
  onEventUpdate,
  onEventDelete,
  onNewEvent,
  onEventClick,
  userProfile
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<'notes' | 'calendar' | 'profile'>('calendar');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const weekStart = startOfWeek(activeDate, { weekStartsOn: 0 }); // Sunday start
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // Determine current/next event for highlighting
  const now = new Date();
  const nextEvent = useMemo(() => {
    const futureEvents = events
      .filter(e => new Date(e.start) > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return futureEvents[0] || null;
  }, [events, now]);

  useEffect(() => {
     const handleMobileOpenNote = (e: any) => {
         const { id, title } = e.detail;
         onNoteSelect(id, title);
         setIsEditingNote(true);
     };
     window.addEventListener('mobile_open_note', handleMobileOpenNote);
     return () => window.removeEventListener('mobile_open_note', handleMobileOpenNote);
  }, [onNoteSelect]);

  const todaysEvents = useMemo(() => {
    return events.filter(e => {
        const startNode = new Date(e.start);
        const occDateKey = format(activeDate, "yyyy-MM-dd");
        if (e.exdates && e.exdates.includes(occDateKey)) return false;

        const rule = (e as any).recurrence_rule;
        const rrule = rule || `FREQ=${(e.recurrence && e.recurrence !== 'none') ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;
        
        let freq = 'none';
        let interval = 1;
        const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
        if (matchFreq) freq = matchFreq[1].toLowerCase();
        const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
        if (matchInterval) interval = parseInt(matchInterval[1], 10);
        interval = Math.max(1, interval);

        if (freq === 'none') {
            return isSameDay(startNode, activeDate);
        }

        let current = new Date(startNode);
        const safeRecEnd = (e as any).recurrence_end ? new Date((e as any).recurrence_end) : new Date(activeDate.getTime() + 31536000000);

        let count = 0;
        const targetTime = new Date(activeDate.getFullYear(), activeDate.getMonth(), activeDate.getDate()).getTime();
        const endTime = new Date(safeRecEnd.getFullYear(), safeRecEnd.getMonth(), safeRecEnd.getDate()).getTime();

        while (count < 1000) {
            const curTime = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
            
            if (curTime === targetTime) return true;
            if (curTime > targetTime || curTime > endTime) break;

            if (freq === 'daily') current.setDate(current.getDate() + interval);
            else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
            else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
            else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
            else break;
            count++;
        }
        return false;
    }).map(e => {
        const startNode = new Date(e.start);
        const endNode = e.end ? new Date(e.end) : startNode;
        const duration = endNode.getTime() - startNode.getTime();
        const mappedStart = new Date(activeDate);
        mappedStart.setHours(startNode.getHours(), startNode.getMinutes(), 0, 0);
        return {
            ...e,
            id: isSameDay(new Date(e.start), activeDate) ? e.id : `${e.id}_${mappedStart.getTime()}`,
            start: mappedStart.toISOString(),
            end: new Date(mappedStart.getTime() + duration).toISOString()
        }
    }).sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, activeDate]);

  return (
    <div className="flex md:hidden flex-col h-[100dvh] w-full bg-[#f8f9fc] dark:bg-black text-gray-900 dark:text-gray-100 relative overflow-hidden font-sans">
      
      {/* 1. Header - Clean White Look */}
      <div className="w-full z-40 bg-white dark:bg-[#1A1C23] transition-all duration-300 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <AnimatePresence mode="wait">
           {activeTab === 'calendar' ? (
              <motion.div key="header-calendar" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="px-4 pt-10 pb-4">
                 <div className="flex justify-between items-center px-2 mb-2">
                     <div className="w-10 h-10 rounded-full bg-[#4A3AFF] flex items-center justify-center text-white font-bold text-sm shadow-md uppercase">
                        {userProfile?.username?.[0] || sessionStorage.getItem('tide_user_name')?.[0] || userProfile?.email?.[0] || "U"}
                     </div>
                     <div className="flex gap-3">
                         <div 
                            onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
                            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                         >
                            <CalendarIcon size={18} />
                         </div>
                         <div 
                            onClick={() => { if (onNewEvent) onNewEvent(activeDate); }}
                            className="w-10 h-10 rounded-full bg-[#4A3AFF] flex items-center justify-center text-white cursor-pointer shadow-lg shadow-indigo-500/30 transition-colors"
                         >
                            <Plus size={20} strokeWidth={2.5} />
                         </div>
                     </div>
                 </div>
                 
                 <AnimatePresence mode="wait">
                 {isCalendarExpanded ? (
                     <motion.div 
                        key="month" 
                        initial={{opacity: 0, height: 0}} 
                        animate={{opacity: 1, height: 'auto'}} 
                        exit={{opacity: 0, height: 0}}
                        className="w-full mt-2"
                     >
                        <MiniCalendar selectedDate={activeDate} onSelect={setActiveDate} />
                     </motion.div>
                 ) : (
                     <motion.div 
                        key="week"
                        initial={{opacity: 0, height: 0}} 
                        animate={{opacity: 1, height: 'auto'}} 
                        exit={{opacity: 0, height: 0}}
                        className="flex justify-between items-center mt-4 px-2 pb-2"
                     >
                         {weekDays.map(d => {
                             const isSelected = isSameDay(d, activeDate);
                             return (
                                <div 
                                   key={d.toISOString()} 
                                   onClick={() => setActiveDate(d)}
                                   className="flex flex-col items-center gap-2 cursor-pointer"
                                >
                                    <span className="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-semibold">{format(d, 'eeeee', { locale: enUS })}</span>
                                    <div className={`w-10 h-10 flex items-center justify-center rounded-full font-bold text-sm transition-all duration-300 ${isSelected ? 'bg-[#4A3AFF] text-white shadow-md scale-110' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {format(d, 'd')}
                                    </div>
                                </div>
                             );
                         })}
                     </motion.div>
                 )}
                 </AnimatePresence>
              </motion.div>
           ) : activeTab === 'notes' ? (
              <motion.div key="header-notes" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="px-6 pt-12 pb-6 flex items-center justify-center relative">
                 <span className="text-gray-900 dark:text-gray-100 font-bold text-xl tracking-wide drop-shadow-sm">
                     {isEditingNote ? (activeNoteTitle || 'Untitled Note') : 'My Notes'}
                 </span>
              </motion.div>
           ) : (
              <motion.div key="header-other" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="px-6 pt-12 pb-6 flex items-center justify-center">
                 <span className="text-gray-900 dark:text-gray-100 font-bold text-xl tracking-wide capitalize">{activeTab}</span>
              </motion.div>
           )}
        </AnimatePresence>
      </div>

      {/* Main Content Area */}
      <div 
        className="flex-1 w-full relative overflow-y-auto no-scrollbar pb-32 bg-[#F8F9FC] dark:bg-black"
        onScroll={(e) => {
          if (activeTab === 'calendar') {
             if (e.currentTarget.scrollTop > 10) {
                 setIsCalendarExpanded(false);
             } else if (e.currentTarget.scrollTop === 0) {
                 setIsCalendarExpanded(true);
             }
          }
        }}
      >
        <AnimatePresence mode="wait">
          
          {/* CALENDAR VIEW (Timeline) */}
          {activeTab === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex w-full relative px-4"
            >
               <div className="flex flex-col w-full bg-white dark:bg-[#1A1C23] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                  <div className="flex items-center gap-4 mb-6">
                      <span className="text-gray-400 dark:text-gray-500 font-semibold text-xs tracking-widest uppercase">
                          {format(activeDate, "EEEE d", { locale: enUS })}
                      </span>
                      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800"></div>
                  </div>

                  {todaysEvents.length === 0 && (
                      <div className="flex flex-col items-center justify-center text-center py-10">
                          <CalendarIcon size={24} className="text-gray-300 dark:text-gray-700 mb-2" />
                          <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">No events for this day</span>
                      </div>
                  )}

                  <div className="flex flex-col gap-6 relative">
                      {/* Vertical Timeline Line */}
                      <div className="absolute top-2 bottom-4 left-[3.65rem] w-0.5 bg-gray-100 dark:bg-gray-800 z-0"></div>

                      {todaysEvents.map((event, idx) => {
                         const startDate = new Date(event.start);
                         const endDate = event.end ? new Date(event.end) : startDate;
                         
                         return (
                             <div 
                                key={event.id + idx}
                                onClick={() => {
                                    setExpandedEventId(expandedEventId === event.id ? null : event.id);
                                    if (onEventClick) onEventClick(event.id);
                                }}
                                className="flex gap-4 cursor-pointer group relative z-10"
                             >
                                 <div className="w-12 flex flex-col text-right pt-0.5 shrink-0">
                                     <span className="text-gray-400 dark:text-gray-500 text-xs font-medium">{format(startDate, 'HH:mm')}</span>
                                     {event.end && <span className="text-gray-300 dark:text-gray-600 text-[10px] mt-1">{format(endDate, 'HH:mm')}</span>}
                                 </div>
                                 
                                 <div className="flex flex-col relative w-full">
                                     <div 
                                        className="w-2.5 h-2.5 rounded-full absolute top-1 -left-[5px] ring-4 ring-white dark:ring-[#1A1C23] z-10 shadow-sm"
                                        style={{ backgroundColor: event.color || '#4A3AFF' }}
                                     />
                                     <div className="pl-4 pb-2">
                                         <h3 className="text-gray-900 dark:text-white font-semibold text-sm leading-tight group-hover:text-blue-600 transition-colors">
                                             {event.title || 'Untitled Event'}
                                         </h3>
                                         {event.description && (
                                             <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 line-clamp-1">
                                                 {event.description}
                                             </p>
                                         )}
                                         
                                         <AnimatePresence>
                                           {expandedEventId === event.id && (
                                              <motion.div 
                                                 initial={{ opacity: 0, height: 0 }} 
                                                 animate={{ opacity: 1, height: 'auto' }} 
                                                 exit={{ opacity: 0, height: 0 }} 
                                                 className="mt-3"
                                              >
                                                 <div className="text-gray-600 dark:text-gray-300 text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-2">
                                                    {event.description || 'No additional details.'}
                                                 </div>
                                                 <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onEventDelete) onEventDelete(event.id);
                                                    }}
                                                    className="text-red-500 hover:text-red-600 text-xs font-medium px-2 py-1 transition-colors"
                                                 >
                                                    Delete
                                                 </button>
                                              </motion.div>
                                           )}
                                         </AnimatePresence>
                                     </div>
                                 </div>
                             </div>
                         );
                      })}
                  </div>
               </div>
            </motion.div>
          )}

          {/* NOTES VIEW */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div
              key="notes-list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-6 pt-32 pb-32 flex flex-col gap-4 mt-4"
            >
               <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Recent</h2>
                  <button onClick={onNewNote} className="p-2 rounded-full bg-blue-50 text-blue-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                     <Plus size={18} strokeWidth={3} />
                  </button>
               </div>

const MobileFolderItem = ({ folder, allFiles, level = 0 }: { folder: any, allFiles: any[], level?: number }) => {
   const [isOpen, setIsOpen] = useState(false);
   const children = allFiles.filter(f => f.parent_id === folder.id);
   const subfolders = children.filter(f => f.type === 'folder');
   const notes = children.filter(f => f.type !== 'folder');

   return (
       <div className={`flex flex-col bg-white dark:bg-gray-900 rounded-[24px] overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 ${level > 0 ? 'mt-2' : ''}`}>
          <div 
             className={`flex items-center gap-3 px-5 py-4 bg-gray-50 dark:bg-gray-800/50 cursor-pointer`}
             onClick={() => {
                setIsOpen(!isOpen);
                if (!isOpen) {
                     const store = useDataStore.getState();
                     if (!store.loadedDirectories.has(folder.id)) {
                          store.fetchDirectory(folder.id);
                     }
                }
             }}
          >
             <Folder size={18} className="text-[#4A3AFF]" />
             <span className="font-bold text-sm w-full truncate">{folder.title || 'Untitled Folder'}</span>
             <ChevronRight size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </div>
          <AnimatePresence>
          {isOpen && (
             <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="flex flex-col px-3 py-2 pl-4">
                {subfolders.map(sub => (
                   <MobileFolderItem key={sub.id} folder={sub} allFiles={allFiles} level={level + 1} />
                ))}
                {notes.map(file => (
                   <button 
                     key={file.id} 
                     onClick={() => {
                        useDataStore.getState().setActiveTabId?.(file.id);
                        useDataStore.setState({ activeNoteId: file.id, activeNoteTitle: file.title });
                        // setIsEditingNote should be passed or we can rely on standard note opening
                        // But since MobileFolderItem is out of scope of MobileLayout, we can dispatch an event or use Zustand
                        window.dispatchEvent(new CustomEvent('mobile_open_note', { detail: { id: file.id, title: file.title } }));
                     }}
                     className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 text-left transition-colors"
                   >
                     <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                         <FileText size={16} className="text-[#4A3AFF]" />
                     </div>
                     <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate w-full">{file.title || 'Untitled'}</span>
                   </button>
                ))}
             </motion.div>
          )}
          </AnimatePresence>
       </div>
   );
};

                 <div className="flex flex-col gap-3">
                   {folders.filter(f => !f.parent_id).map(folder => (
                      <MobileFolderItem key={folder.id} folder={folder} allFiles={files} />
                   ))}

                 {/* Root Files */}
                 {(() => {
                    const rootFiles = files.filter(f => !f.parent_id && f.type !== 'folder');
                    if (rootFiles.length === 0) return null;
                    return (
                        <div className="flex flex-col bg-white dark:bg-gray-900 rounded-[28px] px-3 py-2 shadow-sm border border-gray-100 dark:border-gray-800 mt-2">
                           {rootFiles.map(file => (
                               <button 
                                 key={file.id} 
                                 onClick={() => {
                                    onNoteSelect(file.id, file.title);
                                    setIsEditingNote(true);
                                 }}
                                 className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 text-left transition-colors"
                               >
                                 <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                                     <FileText size={16} className="text-[#8B5CF6]" />
                                 </div>
                                 <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{file.title || 'Untitled'}</span>
                               </button>
                           ))}
                        </div>
                    );
                 })()}
               </div>
            </motion.div>
          )}

          {/* EDITOR VIEW */}
          {activeTab === 'notes' && isEditingNote && (
            <motion.div
              key="notes-editor"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 inset-y-0 bg-white dark:bg-black z-40 overflow-y-auto no-scrollbar pt-32 px-6 pb-32"
            >
               {editorElement}
            </motion.div>
          )}



          {/* PROFILE VIEW */}
          {activeTab === 'profile' && (
             <motion.div key="profile" initial={{opacity:0}} animate={{opacity:1}} className="p-6 pt-32 pb-32 flex flex-col items-center gap-6">
                 {/* Avatar & Info */}
                 <div className="flex flex-col items-center mt-6">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#4A3AFF] to-[#8B5CF6] flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-500/30 mb-4 uppercase">
                       {userProfile?.username?.[0] || sessionStorage.getItem('tide_user_name')?.[0] || userProfile?.email?.[0] || "U"}
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                        {userProfile?.username || sessionStorage.getItem('tide_user_name') || userProfile?.email?.split('@')[0] || "User"}
                    </h2>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">
                        {userProfile?.email || "No email linked"}
                    </span>
                 </div>

                 {/* Menu List */}
                 <div className="w-full bg-white dark:bg-gray-900 rounded-[28px] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden mt-2">
                    {[
                       { icon: <User size={20} className="text-gray-600 dark:text-gray-300" />, name: 'Profil' },
                       { icon: <Settings size={20} className="text-gray-600 dark:text-gray-300" />, name: 'E2EE Keys' },
                       { icon: <Settings size={20} className="text-gray-600 dark:text-gray-300" />, name: 'Geräte' },
                       { icon: <Settings size={20} className="text-gray-600 dark:text-gray-300" />, name: 'Passwörter' },
                       { icon: <FileText size={20} className="text-gray-600 dark:text-gray-300" />, name: 'Sprache' },
                       { icon: <ArrowLeft size={20} className="text-red-500" />, name: 'Abmelden', isRed: true }
                    ].map((m, i) => (
                       <button key={m.name} className={`flex items-center justify-between p-4 px-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                {m.icon}
                             </div>
                             <span className={`font-semibold ${m.isRed ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>{m.name}</span>
                          </div>
                          {!m.isRed && <ChevronRight size={20} className="text-gray-400" />}
                       </button>
                    ))}
                 </div>
             </motion.div>
          )}

        </AnimatePresence>
      </div>



      {/* 3. Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full h-24 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-t-[40px] z-50 flex justify-around items-center px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] dark:shadow-none border-t border-white/20 dark:border-gray-800">
         <NavIcon 
            tab="notes" 
            active={activeTab === 'notes'} 
            icon={activeTab === 'notes' && isEditingNote ? <ArrowLeft size={24} /> : <FileText size={24} />} 
            onClick={() => {
               if (activeTab === 'notes' && isEditingNote) {
                  setIsEditingNote(false);
               } else {
                  setActiveTab('notes');
               }
            }} 
         />
         <NavIcon tab="calendar" active={activeTab === 'calendar'} icon={<CalendarIcon size={24} />} onClick={() => { setIsEditingNote(false); setActiveTab('calendar'); }} />

         <NavIcon tab="profile" active={activeTab === 'profile'} icon={<User size={24} />} onClick={() => { setIsEditingNote(false); setActiveTab('profile'); }} />
      </div>

    </div>
  );
}

const NavIcon = ({ active, icon, onClick }: { tab?: string, active: boolean, icon: React.ReactNode, onClick: () => void }) => {
   if (active) {
      return (
         <div onClick={onClick} className="text-[#4A3AFF] p-2 cursor-pointer transition-all duration-300 transform scale-110">
            {icon}
         </div>
      );
   }
   return (
      <div onClick={onClick} className="text-gray-400 p-2 cursor-pointer transition-all duration-300 hover:text-gray-600 dark:hover:text-gray-200 transform scale-90">
         {icon}
      </div>
   );
};
