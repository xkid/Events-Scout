import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { ProgressBar } from './components/ProgressBar';
import { EmailModal } from './components/EmailModal';
import { Country, EventData } from './types';
import { searchEventList, enrichEventDetails, findExtendedExhibitors } from './services/geminiService';
import { Calendar, Users, Download, MapPin, Search, Mail, Phone, RefreshCw, Plus, ChevronDown, ChevronUp, Globe, Send } from 'lucide-react';

// Categorize countries by Continent
const REGION_MAPPING: Record<string, Country[]> = {
  'Asia': [
    Country.Thailand, 
    Country.Malaysia, 
    Country.Singapore,
    Country.Indonesia,
    Country.Philippines,
    Country.Vietnam,
    Country.UAE
  ],
  'Europe': [
    Country.Germany,
    Country.Europe
  ],
  'Oceania': [
    Country.Australia
  ],
  'Americas': [], // Placeholder for future expansion
  'Africa': []    // Placeholder for future expansion
};

const REGIONS = Object.keys(REGION_MAPPING);

// Helper to generate a consistent ID for checking duplicates/new status
const generateEventId = (name: string, date: string) => {
  return btoa(unescape(encodeURIComponent(`${name.toLowerCase().trim()}-${date}`)));
};

// Helper for CSV escaping
const escapeCsv = (str?: string) => {
  if (!str) return "";
  const stringValue = String(str);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const App: React.FC = () => {
  const [activeRegion, setActiveRegion] = useState<string>('Asia');
  const [activeCountry, setActiveCountry] = useState<Country>(Country.Thailand);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchingId, setSearchingId] = useState<string | null>(null); // For single event deep search
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'companies'>('calendar');
  const [emailModalEvent, setEmailModalEvent] = useState<EventData | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('asean_events_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setEvents(parsed);
        }
      } catch (e) {
        console.error("Failed to parse saved events", e);
      }
    }
  }, []);

  const handleRegionChange = (region: string) => {
    if (loading) return;
    
    const countriesInRegion = REGION_MAPPING[region];
    if (countriesInRegion.length === 0) return; // Prevent selecting empty regions

    setActiveRegion(region);
    // Auto-select first country in the new region
    setActiveCountry(countriesInRegion[0]);
  };

  const handleSearch = async () => {
    setLoading(true);
    setProgress(0);
    setError(null);
    setStatusMessage(`Scanning major event calendars in ${activeCountry}...`);

    try {
      // Step 1: Get the list of events (High level)
      const basicList = await searchEventList(activeCountry);
      
      if (basicList.length === 0) {
        throw new Error("No events found. Please try again.");
      }

      setProgress(20);
      setStatusMessage(`Found ${basicList.length} events. Analyzing details...`);

      // Prepare events with ID and check if New
      const existingEventsMap = new Map<string, EventData>(events.map(e => [e.id, e]));
      
      const mergedEvents: EventData[] = basicList.map(base => {
        const id = generateEventId(base.name, base.dateStart);
        const existing = existingEventsMap.get(id);
        
        return {
          ...base,
          id,
          // It is new if it doesn't exist in our current local storage
          isNew: !existing,
          // Preserve existing companies if available initially, to be overwritten by fresh search
          companies: existing ? existing.companies : [] 
        };
      });

      // Update state immediately
      setEvents(prev => {
        const others = prev.filter(e => e.country !== activeCountry);
        const combined = [...others, ...mergedEvents];
        combined.sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
        return combined;
      });

      // Step 2: Second Level Search (Vertical Details)
      const concurrency = 3;
      const totalToProcess = mergedEvents.length;
      let processedCount = 0;

      const processQueue = [...mergedEvents];
      
      const worker = async () => {
        while (processQueue.length > 0) {
          const event = processQueue.shift();
          if (!event) break;

          // Only enrich if companies list is empty to save tokens/time, or if specifically requested (handled separately)
          // Here we do the initial pass enrichment
          if (event.companies.length === 0) {
             try {
              const companies = await enrichEventDetails(event.name, event.venue, event.country);
              event.companies = companies;
            } catch (e) {
              console.warn(`Failed to enrich ${event.name}`, e);
            }
          }
           
          processedCount++;
          const currentProgress = 20 + ((processedCount / totalToProcess) * 80);
          setProgress(currentProgress);
        }
      };

      const workers = Array(concurrency).fill(null).map(() => worker());
      await Promise.all(workers);

      // Final update
      setEvents(prev => {
        const others = prev.filter(e => e.country !== activeCountry);
        const finalEvents = [...others, ...mergedEvents];
        finalEvents.sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
        localStorage.setItem('asean_events_data', JSON.stringify(finalEvents));
        return finalEvents;
      });

      setStatusMessage("Scan complete.");
      setTimeout(() => setLoading(false), 500);

    } catch (err) {
      setError("Search failed: " + (err instanceof Error ? err.message : 'Unknown error'));
      setLoading(false);
    }
  };

  const handleDeepSearchEvent = async (event: EventData) => {
    setSearchingId(event.id);
    try {
      const moreCompanies = await findExtendedExhibitors(event.name, event.venue, event.country);
      
      setEvents(prev => {
        const updatedEvents = prev.map(e => {
          if (e.id === event.id) {
            // Merge existing and new companies, deduplicating by name
            const existingNames = new Set(e.companies.map(c => c.name.toLowerCase()));
            const newUnique = moreCompanies.filter(c => !existingNames.has(c.name.toLowerCase()));
            
            return {
              ...e,
              companies: [...e.companies, ...newUnique]
            };
          }
          return e;
        });
        
        localStorage.setItem('asean_events_data', JSON.stringify(updatedEvents));
        return updatedEvents;
      });
      
    } catch (e) {
      console.error("Failed to find more exhibitors", e);
      alert("Failed to retrieve additional exhibitors. Please try again.");
    } finally {
      setSearchingId(null);
    }
  };

  const handleExportCSV = () => {
    const filteredEvents = events.filter(e => e.country === activeCountry);
    
    if (filteredEvents.length === 0) {
      alert("No events to export for this country.");
      return;
    }

    const headers = ["Event Name", "Venue", "Start Date", "End Date", "Country", "Company Name", "Role", "Email", "Contact"];
    const rows: string[] = [];

    filteredEvents.forEach(event => {
      if (event.companies.length === 0) {
        rows.push(
          `${escapeCsv(event.name)},${escapeCsv(event.venue)},${escapeCsv(event.dateStart)},${escapeCsv(event.dateEnd)},${escapeCsv(event.country)},"N/A","N/A","N/A","N/A"`
        );
      } else {
        event.companies.forEach(comp => {
          rows.push(
            `${escapeCsv(event.name)},${escapeCsv(event.venue)},${escapeCsv(event.dateStart)},${escapeCsv(event.dateEnd)},${escapeCsv(event.country)},${escapeCsv(comp.name)},${escapeCsv(comp.role)},${escapeCsv(comp.email)},${escapeCsv(comp.contact)}`
          );
        });
      }
    });

    // Use Blob instead of Data URI to handle large data and special characters (like Thai) correctly
    const csvContent = [headers.join(','), ...rows].join('\n');
    // Add BOM (\uFEFF) for Excel to recognize UTF-8 encoding
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeCountry}_Events_Full_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateEmail = (event: EventData) => {
    const hasEmails = event.companies.some(c => c.email && c.email.includes('@'));

    if (!hasEmails) {
      alert("No valid email addresses found for this event's participants.");
      return;
    }

    setEmailModalEvent(event);
  };

  const filteredEvents = events.filter(e => e.country === activeCountry);

  // Group events by Month for Calendar View
  const eventsByMonth = filteredEvents.reduce((acc, event) => {
    const date = new Date(event.dateStart);
    const key = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {} as Record<string, EventData[]>);

  return (
    <Layout>
      {/* Email Modal */}
      {emailModalEvent && (
        <EmailModal 
          event={emailModalEvent} 
          onClose={() => setEmailModalEvent(null)} 
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-ios-bg/80 backdrop-blur-md border-b border-ios-separator/50">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-4">
             <h1 className="text-3xl font-bold tracking-tight text-black">Event Scout</h1>
             <Globe className="text-gray-400" size={24} />
          </div>
          
          {/* Level 1: Continents / Regions */}
          <div className="flex space-x-1 mb-3 overflow-x-auto scrollbar-hide pb-1">
             {REGIONS.map(region => {
                const isDisabled = REGION_MAPPING[region].length === 0;
                return (
                  <button
                    key={region}
                    onClick={() => handleRegionChange(region)}
                    disabled={isDisabled || loading}
                    className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-full transition-all duration-200 ${
                      activeRegion === region
                        ? 'bg-black text-white'
                        : isDisabled 
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {region}
                  </button>
                );
             })}
          </div>

          {/* Level 2: Countries in selected Region */}
          <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div className="flex space-x-2 min-w-max">
              {REGION_MAPPING[activeRegion].map(country => (
                <button
                  key={country}
                  onClick={() => !loading && setActiveCountry(country)}
                  disabled={loading}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 shadow-sm border ${
                    activeCountry === country 
                      ? 'bg-white text-ios-blue border-ios-blue/20 ring-2 ring-ios-blue/10' 
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 disabled:opacity-50'
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-4">
        
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-ios-separator/30 gap-3">
          <div className="flex space-x-2 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex-1 sm:flex-none p-2 rounded-lg flex justify-center items-center ${viewMode === 'calendar' ? 'bg-ios-blue/10 text-ios-blue' : 'text-gray-400'}`}
            >
              <Calendar size={20} />
            </button>
            <button
              onClick={() => setViewMode('companies')}
              className={`flex-1 sm:flex-none p-2 rounded-lg flex justify-center items-center ${viewMode === 'companies' ? 'bg-ios-blue/10 text-ios-blue' : 'text-gray-400'}`}
            >
              <Users size={20} />
            </button>
          </div>
          
          <div className="flex space-x-2 w-full sm:w-auto">
             <button 
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-ios-blue text-white rounded-lg font-medium active:bg-blue-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              <span>{loading ? 'Scanning...' : 'Deep Scan'}</span>
            </button>

            <button 
              onClick={handleExportCSV}
              disabled={loading}
              className="flex items-center justify-center w-10 h-10 bg-ios-green/10 text-ios-green rounded-lg active:bg-ios-green/20 disabled:opacity-30"
              title="Export Full CSV"
            >
              <Download size={20} />
            </button>
          </div>
        </div>

        {loading && <ProgressBar progress={progress} message={statusMessage} />}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}

        {filteredEvents.length === 0 && !loading && !error && (
          <div className="text-center py-20 text-gray-400">
            <Calendar size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">No events found for {activeCountry}.</p>
            <p className="text-sm">Tap "Deep Scan" to search using AI.</p>
          </div>
        )}

        {/* Calendar / List View */}
        {viewMode === 'calendar' && Object.keys(eventsByMonth).length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {Object.entries(eventsByMonth).map(([month, monthEvents]: [string, EventData[]]) => (
              <div key={month} className="space-y-2">
                <h3 className="text-lg font-bold text-gray-500 sticky top-32 px-2 mix-blend-multiply">{month}</h3>
                <div className="space-y-3">
                  {monthEvents.map(event => (
                    <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-ios-separator/30 relative overflow-hidden transition-all">
                      {event.isNew && (
                        <div className="absolute top-0 right-0">
                          <span className="bg-ios-red text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">NEW</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-600 mb-2">
                            {new Date(event.dateStart).getDate()} - {new Date(event.dateEnd).getDate()}
                          </span>
                          <h4 className="font-semibold text-lg leading-tight mb-1 pr-8">{event.name}</h4>
                          <div className="flex items-center text-gray-500 text-sm mb-2">
                            <MapPin size={14} className="mr-1 flex-shrink-0" />
                            <span className="truncate max-w-[200px]">{event.venue}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Exhibitor List in Card */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between items-center mb-2 gap-2">
                           <p className="text-xs font-medium text-gray-400 uppercase">
                              Participants ({event.companies.length})
                           </p>
                           <div className="flex gap-2">
                              {event.companies.some(c => c.email) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGenerateEmail(event);
                                  }}
                                  className="text-xs flex items-center bg-ios-green/10 text-ios-green px-2 py-1 rounded-full font-medium active:bg-ios-green/20 hover:bg-ios-green/20"
                                  title="Draft email to all participants"
                                >
                                  <Mail size={10} className="mr-1" /> Email Gen
                                </button>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeepSearchEvent(event);
                                }}
                                disabled={searchingId === event.id}
                                className="text-xs flex items-center bg-ios-blue/10 text-ios-blue px-2 py-1 rounded-full font-medium active:bg-ios-blue/20 disabled:opacity-50 hover:bg-ios-blue/20"
                              >
                                {searchingId === event.id ? (
                                  <><RefreshCw size={10} className="animate-spin mr-1" /> Searching...</>
                                ) : (
                                  <><Plus size={10} className="mr-1" /> Find More Exhibitors</>
                                )}
                              </button>
                           </div>
                        </div>

                        {event.companies.length > 0 ? (
                           <div className="max-h-32 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
                             {event.companies.map((c, i) => (
                               <div key={i} className="flex justify-between items-center text-xs p-1.5 bg-gray-50 rounded border border-gray-100">
                                  <span className="font-medium text-gray-700 truncate max-w-[60%]">{c.name}</span>
                                  <span className="text-gray-400 text-[10px]">{c.role}</span>
                               </div>
                             ))}
                           </div>
                        ) : (
                          <div className="text-center py-2 text-gray-300 text-xs italic">
                            No participants found yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Companies / Contacts View */}
        {viewMode === 'companies' && filteredEvents.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-ios-separator/30 animate-in fade-in duration-500">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-1/3">Event</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-1/3">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-1/3">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEvents.map(event => (
                    <React.Fragment key={event.id}>
                      {event.companies.length > 0 ? (
                        event.companies.map((comp, idx) => (
                          <tr key={`${event.id}-${idx}`} className="group hover:bg-gray-50">
                            <td className="px-4 py-3 align-top">
                              {idx === 0 && (
                                <div className="max-w-[150px]">
                                  <div className="flex items-center gap-2">
                                    <div className="font-medium truncate" title={event.name}>{event.name}</div>
                                    {event.isNew && <div className="w-2 h-2 rounded-full bg-ios-red flex-shrink-0" title="New Event"></div>}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-1">{event.dateStart.split('-').slice(1).join('/')}</div>
                                  
                                  <div className="flex flex-col gap-1 mt-2">
                                     <button 
                                       onClick={() => handleDeepSearchEvent(event)}
                                       disabled={searchingId === event.id}
                                       className="text-[10px] text-ios-blue bg-blue-50 px-2 py-1 rounded border border-blue-100 w-full text-center hover:bg-blue-100 transition-colors"
                                     >
                                       {searchingId === event.id ? 'Loading...' : '+ Load More'}
                                     </button>
                                     
                                     {event.companies.some(c => c.email) && (
                                       <button 
                                         onClick={() => handleGenerateEmail(event)}
                                         className="text-[10px] text-ios-green bg-green-50 px-2 py-1 rounded border border-green-100 w-full text-center flex items-center justify-center hover:bg-green-100 transition-colors"
                                       >
                                         <Mail size={10} className="mr-1" /> Email Gen
                                       </button>
                                     )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-gray-900">{comp.name}</div>
                              <div className="text-xs text-gray-500">{comp.role}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="space-y-1">
                                {comp.email && (
                                  <div className="flex items-center text-blue-600">
                                    <Mail size={12} className="mr-1.5 flex-shrink-0" />
                                    <a href={`mailto:${comp.email}`} className="hover:underline truncate max-w-[120px] block">{comp.email}</a>
                                  </div>
                                )}
                                {comp.contact && (
                                  <div className="flex items-center text-gray-600">
                                    <Phone size={12} className="mr-1.5 flex-shrink-0" />
                                    <span className="truncate max-w-[120px] block">{comp.contact}</span>
                                  </div>
                                )}
                                {!comp.email && !comp.contact && <span className="text-gray-300 italic text-xs">--</span>}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                         <tr className="hover:bg-gray-50">
                            <td className="px-4 py-3 align-top">
                               <div className="flex items-center gap-2 max-w-[150px]">
                                  <div className="font-medium truncate">{event.name}</div>
                                  {event.isNew && <div className="w-2 h-2 rounded-full bg-ios-red flex-shrink-0"></div>}
                               </div>
                               <button 
                                     onClick={() => handleDeepSearchEvent(event)}
                                     disabled={searchingId === event.id}
                                     className="mt-2 text-[10px] text-ios-blue bg-blue-50 px-2 py-1 rounded border border-blue-100 w-full text-center hover:bg-blue-100"
                                  >
                                    {searchingId === event.id ? 'Loading...' : '+ Find Participants'}
                                  </button>
                            </td>
                            <td className="px-4 py-3 text-gray-400 italic text-xs" colSpan={2}>Scanning details...</td>
                         </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
};

export default App;