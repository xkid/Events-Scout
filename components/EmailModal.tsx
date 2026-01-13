import React, { useState } from 'react';
import { X, Copy, Wand2, Loader2, Check, Mail } from 'lucide-react';
import { EventData } from '../types';
import { draftEmailContent } from '../services/geminiService';

interface EmailModalProps {
  event: EventData;
  onClose: () => void;
}

export const EmailModal: React.FC<EmailModalProps> = ({ event, onClose }) => {
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  // Clipboard states
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  // Extract unique emails
  const uniqueEmails = Array.from(new Set(
    event.companies
      .map(c => c.email?.trim())
      .filter(email => email && email.includes('@'))
  )).filter(Boolean) as string[];

  const handleCopy = (text: string, setCopied: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDraft = async () => {
    setIsGenerating(true);
    try {
      const result = await draftEmailContent(
        event.name,
        event.venue,
        event.country,
        instructions
      );
      setSubject(result.subject);
      setBody(result.body);
      setHasGenerated(true);
    } catch (e) {
      console.error(e);
      alert("Failed to generate draft. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-ios-green/10 rounded-full text-ios-green">
              <Mail size={18} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Email Generator</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-4 space-y-6">
          
          {/* Section 1: Recipients */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex justify-between items-center">
              Recipients ({uniqueEmails.length})
              {uniqueEmails.length > 0 && (
                <button 
                  onClick={() => handleCopy(uniqueEmails.join(', '), setCopiedEmails)}
                  className="text-ios-blue text-xs normal-case font-normal flex items-center hover:underline"
                >
                  {copiedEmails ? <Check size={12} className="mr-1" /> : <Copy size={12} className="mr-1" />}
                  {copiedEmails ? "Copied!" : "Copy List"}
                </button>
              )}
            </label>
            <div className="relative">
              <textarea
                readOnly
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 font-mono h-20 resize-none focus:outline-none focus:ring-2 focus:ring-ios-blue/20"
                value={uniqueEmails.join(', ')}
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section 2: AI Drafter */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Draft Content with AI
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="E.g. Ask about booth availability and floor plan..."
                className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/10 transition-all"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDraft()}
              />
              <button
                onClick={handleDraft}
                disabled={isGenerating}
                className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
              >
                {isGenerating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Wand2 size={16} />
                )}
                <span>Generate</span>
              </button>
            </div>
          </div>

          {/* Section 3: Result Preview */}
          {(hasGenerated || isGenerating) && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-400">Subject</span>
                  <button 
                    onClick={() => handleCopy(subject, setCopiedSubject)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-ios-blue transition-colors"
                    title="Copy Subject"
                  >
                    {copiedSubject ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {isGenerating ? (
                   <div className="h-9 bg-gray-100 rounded-lg animate-pulse"></div>
                ) : (
                  <input 
                    className="w-full text-sm font-medium text-gray-900 border-b border-gray-200 py-2 focus:outline-none focus:border-ios-blue"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                   <span className="text-xs font-medium text-gray-400">Body</span>
                   <button 
                    onClick={() => handleCopy(body, setCopiedBody)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-ios-blue transition-colors"
                    title="Copy Body"
                  >
                    {copiedBody ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {isGenerating ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded w-5/6 animate-pulse"></div>
                  </div>
                ) : (
                  <textarea
                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 h-48 focus:outline-none focus:ring-2 focus:ring-ios-blue/20 resize-none"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};