import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import { 
  Upload, FileText, Cpu, CheckCircle2, AlertCircle, RefreshCw, 
  Search, Download, Database, ChevronRight, HelpCircle, Layers, 
  Trash2, Play, AlertTriangle, ArrowRight, ExternalLink, Moon, Sun, Table, Check, X, ShieldAlert
} from 'lucide-react';

// Define TS Interfaces
interface CRMRecord {
  created_at: string | null;
  name: string | null;
  email: string | null;
  country_code: string | null;
  mobile_without_country_code: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lead_owner: string | null;
  crm_status: 'GOOD_LEAD_FOLLOW_UP' | 'DID_NOT_CONNECT' | 'BAD_LEAD' | 'SALE_DONE' | null;
  crm_note: string | null;
  data_source: 'leads_on_demand' | 'meridian_tower' | 'eden_park' | 'varah_swamy' | 'sarjapur_plots' | null;
  possession_time: string | null;
  description: string | null;
}

interface ExtractionResult {
  index: number;
  original: any;
  normalized: CRMRecord | null;
  status: 'success' | 'skipped' | 'failed';
  error?: string;
  retryCount?: number;
}

// Built-in messy sample datasets for instant 1-click testing
const SAMPLES = {
  facebook: `"Creation Time","Full Name","Email","Phone","Company Name","City","Notes"
"2026-05-14 10:20:48","micheal green","mike.g@outlook.com","+1 (555) 381-0023","Acme Corp","New York","Wants to buy sarjapur_plots land, callback after 5 PM"
"2026-05-14 11:45:12","ANNA SMITH","anna123@gmail.com, ann.smith@company.com","+919988776655, +919988776654","Tech Solutions","Bangalore","Requires immediate follow-up on meridian_tower"
"2026-05-14 12:22:00","Robert Downey","rdj@marvel.com","+1-123-456-7890","Stark Industries","Los Angeles","Busy, schedule callback for tomorrow"
"2026-05-14 13:05:14","Unknown Company Contact","contact@acme.com","","Acme Corp","San Francisco","No phone provided, only email"
"2026-05-14 14:30:00","Broken Lead Data","","","","","No email and no phone number - should be skipped by AI"`,

  messy: `"date_created","client_name","mail_id","cellphone","org","loc_city","lead_details"
"13 May 2026 2:20 PM","John Doe","john.doe@example.com","+919876543210","GrowEasy","Mumbai","Status: GOOD_LEAD_FOLLOW_UP. Interested in leads_on_demand."
"13 May 2026 2:25 PM","Sarah Johnson","sarah.johnson@example.com","+919876543211","Tech Solutions","Bangalore","Status is DID_NOT_CONNECT. Person busy."
"13 May 2026 2:30 PM","Rajesh Patel","rajesh.patel@example.com","+919876543212","Startup Inc","Delhi","BAD_LEAD - Not interested."
"13 May 2026 2:35 PM","Priya Singh","priya.singh@example.com","+919876543213","Enterprise Corp","Pune","Status is SALE_DONE. Onboarding process active."
"","Incomplete Row","","","","","No details"`
};

export default function App() {
  const [activeStep, setActiveStep] = useState<'upload' | 'preview' | 'processing' | 'results'>('upload');
  
  // File upload state
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [csvText, setCsvText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Parsed raw CSV data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  
  // Processing & batching pipeline state
  const [batchSize, setBatchSize] = useState<number>(15);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(0);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  
  // Search & Filtering of results
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'skipped' | 'failed'>('all');

  // References for drag-drop
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      addToastLog("Error: Only CSV files are supported", "error");
      return;
    }

    setFileName(file.name);
    // Convert size to human readable
    const sizeKB = (file.size / 1024).toFixed(2);
    setFileSize(`${sizeKB} KB`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCSVContent(text);
    };
    reader.readAsText(file);
  };

  const parseCSVContent = (text: string) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (parsedResults) => {
        const parsedHeaders = parsedResults.meta.fields || [];
        const parsedRows = parsedResults.data || [];

        if (parsedRows.length === 0) {
          addToastLog("The CSV contains no rows to parse.", "error");
          return;
        }

        setHeaders(parsedHeaders);
        setRawRows((parsedRows as any[]).map((row, idx) => ({
          _originalIndex: idx,
          ...(row as Record<string, any>)
        })));
        
        setActiveStep('preview');
        addToastLog(`Successfully loaded CSV with ${parsedRows.length} rows and ${parsedHeaders.length} columns.`, "success");
      },
      error: (err) => {
        addToastLog(`CSV parsing failed: ${err.message}`, "error");
      }
    });
  };

  // Helper to load sample files
  const loadSample = (type: 'facebook' | 'messy') => {
    const text = SAMPLES[type];
    setFileName(`sample_${type}_lead_export.csv`);
    setFileSize(`${(text.length / 1024).toFixed(2)} KB`);
    setCsvText(text);
    parseCSVContent(text);
  };

  const addToastLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setPipelineLogs(prev => [`[${timestamp}] [${type.toUpperCase()}] ${msg}`, ...prev]);
  };

  // Clear current upload
  const resetImporter = () => {
    setFileName('');
    setFileSize('');
    setCsvText('');
    setHeaders([]);
    setRawRows([]);
    setResults([]);
    setCurrentBatchIndex(0);
    setPipelineLogs([]);
    setIsProcessing(false);
    setActiveStep('upload');
  };

  // Run the batch pipeline
  const startAIPipeline = async () => {
    setIsProcessing(true);
    setActiveStep('processing');
    setResults([]);
    setCurrentBatchIndex(0);
    setPipelineLogs([]);
    
    addToastLog("Initializing GrowEasy CRM Intelligent AI Extractor...", "info");
    addToastLog(`Slicing dataset of ${rawRows.length} rows into batches of ${batchSize}...`, "info");

    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const rowBatches = chunkArray(rawRows, batchSize);
    const tempResults: ExtractionResult[] = [];

    for (let bIdx = 0; bIdx < rowBatches.length; bIdx++) {
      setCurrentBatchIndex(bIdx);
      const currentBatch = rowBatches[bIdx];
      addToastLog(`Processing Batch ${bIdx + 1} of ${rowBatches.length} (${currentBatch.length} rows)...`, "info");

      // Format payload
      const payloadBatch = currentBatch.map(row => ({
        index: (row as any)._originalIndex,
        data: { ...(row as any) }
      }));

      let retryCount = 0;
      const maxRetries = 2;
      let batchSuccess = false;
      let batchResults: ExtractionResult[] = [];

      while (retryCount <= maxRetries && !batchSuccess) {
        if (retryCount > 0) {
          addToastLog(`Retrying Batch ${bIdx + 1} (Attempt ${retryCount}/${maxRetries})...`, "warning");
        }

        try {
          const response = await axios.post('/api/extract', {
            batch: payloadBatch
          }, {
            timeout: 25000 // 25 seconds timeout
          });

          if (response.data && response.data.results) {
            batchResults = response.data.results;
            batchSuccess = true;
          } else {
            throw new Error("Invalid response schema from backend API");
          }
        } catch (error: any) {
          console.error(`Error on batch ${bIdx + 1} execution:`, error);
          retryCount++;
          if (retryCount > maxRetries) {
            addToastLog(`Batch ${bIdx + 1} failed after ${maxRetries} retries: ${error.message}`, "error");
            // Fill batch with failed states
            batchResults = payloadBatch.map(item => ({
              index: item.index,
              original: item.data,
              normalized: null,
              status: 'failed',
              error: error.message || 'Network/Server connection failed'
            }));
          }
        }
      }

      // Track statistics from batch results
      const successCount = batchResults.filter(r => r.status === 'success').length;
      const skippedCount = batchResults.filter(r => r.status === 'skipped').length;
      const failedCount = batchResults.filter(r => r.status === 'failed').length;

      addToastLog(`Batch ${bIdx + 1} complete: ${successCount} mapped, ${skippedCount} skipped, ${failedCount} failed`, "success");
      
      tempResults.push(...batchResults);
      setResults([...tempResults]);
    }

    setIsProcessing(false);
    addToastLog("Intelligent extraction completed successfully!", "success");
    setActiveStep('results');
  };

  // Convert normalized results back to standard CRM CSV
  const exportToCSV = () => {
    const activeResults = results.filter(r => r.status === 'success' && r.normalized);
    if (activeResults.length === 0) {
      addToastLog("No successfully mapped rows available to export", "error");
      return;
    }

    const exportRows = activeResults.map(r => ({
      index: r.index,
      created_at: r.normalized?.created_at || '',
      name: r.normalized?.name || '',
      email: r.normalized?.email || '',
      country_code: r.normalized?.country_code || '',
      mobile_without_country_code: r.normalized?.mobile_without_country_code || '',
      company: r.normalized?.company || '',
      city: r.normalized?.city || '',
      state: r.normalized?.state || '',
      country: r.normalized?.country || '',
      lead_owner: r.normalized?.lead_owner || '',
      crm_status: r.normalized?.crm_status || '',
      crm_note: r.normalized?.crm_note || '',
      data_source: r.normalized?.data_source || '',
      possession_time: r.normalized?.possession_time || '',
      description: r.normalized?.description || ''
    }));

    const csvOutput = Papa.unparse(exportRows);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `groweasy_crm_normalized_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToastLog("Standardized CRM CSV downloaded successfully", "success");
  };

  // Filtering Logic
  const filteredResults = results.filter(r => {
    // Search query matches name, email, or company
    const matchesSearch = 
      !searchQuery ||
      (r.normalized?.name && r.normalized.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.normalized?.email && r.normalized.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.normalized?.company && r.normalized.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.original && JSON.stringify(r.original).toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter matches
    const matchesStatus = 
      statusFilter === 'all' || 
      r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalRowsCount = rawRows.length;
  const processedRowsCount = results.length;
  const successRowsCount = results.filter(r => r.status === 'success').length;
  const skippedRowsCount = results.filter(r => r.status === 'skipped').length;
  const failedRowsCount = results.filter(r => r.status === 'failed').length;

  const progressPercentage = totalRowsCount > 0 
    ? Math.round((processedRowsCount / totalRowsCount) * 100) 
    : 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-800" id="main_root">
      {/* Sidebar Layout */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800" id="sidebar_container">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">GrowEasy AI</span>
              <span className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider">CSV Ingest Pipeline</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button 
              onClick={() => csvText && setActiveStep('upload')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeStep === 'upload' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
              id="sidebar_nav_upload"
            >
              <Upload className="w-4.5 h-4.5" /> Upload CSV
            </button>
            <button 
              onClick={() => headers.length > 0 && setActiveStep('preview')}
              disabled={headers.length === 0}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${headers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'preview' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
              id="sidebar_nav_preview"
            >
              <Table className="w-4.5 h-4.5" /> Preview Raw
            </button>
            <button 
              onClick={() => results.length > 0 && setActiveStep('processing')}
              disabled={results.length === 0 && !isProcessing}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${results.length === 0 && !isProcessing ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'processing' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
              id="sidebar_nav_processing"
            >
              <Cpu className="w-4.5 h-4.5" /> AI Processing
            </button>
            <button 
              onClick={() => results.length > 0 && setActiveStep('results')}
              disabled={results.length === 0}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${results.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'results' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
              id="sidebar_nav_results"
            >
              <CheckCircle2 className="w-4.5 h-4.5" /> Export Results
            </button>
          </nav>
        </div>

        <div className="p-6 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold shadow-inner">
              VG
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Vatsal Goel</p>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Internship Submission</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col overflow-hidden" id="main_content_container">
        {/* Header bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm shadow-slate-100 z-10" id="header_container">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-800">
              {activeStep === 'upload' && 'Step 1: Upload CSV Dataset'}
              {activeStep === 'preview' && 'Step 2: Inspect Raw Records'}
              {activeStep === 'processing' && 'Step 3: Real-Time AI Normalization'}
              {activeStep === 'results' && 'Step 4: Unified Lead Extraction Results'}
            </h1>
            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
              State: {activeStep}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold text-emerald-800">Local Pipeline Active</span>
            </div>
            
            {fileName && (
              <button 
                onClick={resetImporter}
                className="flex items-center gap-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 px-3 py-1.5 rounded-md transition-all font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset App
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Step Screens */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8" id="view_screen_container">
          
          {/* STEP 1: UPLOAD SCREEN */}
          {activeStep === 'upload' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn" id="step_upload_view">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Intelligently Import & Map Leads with AI</h2>
                <p className="text-slate-500 text-sm max-w-lg mx-auto">
                  Upload ANY lead list format, Facebook export, or Excel sheet. Our system parses columns and maps attributes into the target CRM automatically.
                </p>
              </div>

              {/* Drag and Drop Zone */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer bg-white group min-h-[280px] ${dragActive ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-300 hover:border-indigo-400 shadow-sm'}`}
                id="drag_drop_zone"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv" 
                  className="hidden" 
                />
                
                <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-105 transition-transform duration-200">
                  <Upload className="w-6 h-6" />
                </div>
                
                <h3 className="font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">Drag and drop your CSV file here</h3>
                <p className="text-xs text-slate-400 mb-4">or click to browse local files (max size 5MB)</p>
                
                <div className="bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 px-4 py-1.5 rounded-full flex items-center gap-1.5 font-medium">
                  <FileText className="w-3.5 h-3.5 text-slate-400" /> Supported extensions: .csv
                </div>
              </div>

              {/* Instant Messy Sample Data Generators */}
              <div className="card bg-white border border-slate-200 rounded-xl p-6 shadow-sm" id="samples_card">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-slate-800 text-sm">Testing Corner (No CSV ready? Try raw messy files)</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Experience immediate AI normalization by using one of our scrambled, multi-header diagnostic templates representing messy marketing campaigns.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => loadSample('facebook')}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-indigo-500 hover:bg-slate-50/40 text-left transition-all"
                    id="sample_btn_facebook"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Facebook Leads Export</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Scrambled headers, multi-emails, duplicate phones.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                  <button 
                    onClick={() => loadSample('messy')}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-indigo-500 hover:bg-slate-50/40 text-left transition-all"
                    id="sample_btn_messy"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Messy Multi-Format Leads</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Custom date strings, inline status parameters, incomplete data.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Supported Attributes Mapping Reference */}
              <div className="bg-slate-100 border border-slate-200/60 rounded-xl p-6" id="mapping_specs_reference">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Expected GrowEasy Target CRM Schema</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { f: 'created_at', d: 'Creation Date' },
                    { f: 'name', d: 'Lead Full Name' },
                    { f: 'email', d: 'Primary Mail' },
                    { f: 'mobile', d: 'Mobile contact' },
                    { f: 'crm_status', d: 'Enum mapped' },
                    { f: 'data_source', d: 'Property context' },
                    { f: 'company', d: 'Organization' },
                    { f: 'city/state/country', d: 'Full Location' },
                    { f: 'possession_time', d: 'Timeline' },
                    { f: 'crm_note', d: 'Overflow notes' }
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-lg p-2.5 border border-slate-200/50 shadow-xs flex flex-col justify-between">
                      <code className="text-[10px] text-indigo-600 font-bold bg-indigo-50/30 px-1.5 py-0.5 rounded w-max">{item.f}</code>
                      <span className="text-[10px] text-slate-500 mt-1 block">{item.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CSV PREVIEW SCREEN */}
          {activeStep === 'preview' && (
            <div className="space-y-6 animate-fadeIn h-full flex flex-col" id="step_preview_view">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">File parsed</span>
                    <span className="px-2 py-0.5 bg-slate-100 border text-slate-700 text-[10px] font-bold rounded">CSV</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">{fileName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Found {rawRows.length} total rows and {headers.length} columns in file ({fileSize}).</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2 bg-slate-50 border px-3 py-1.5 rounded-lg text-xs">
                    <span className="text-slate-500 font-medium">Batch Size:</span>
                    <select 
                      value={batchSize} 
                      onChange={(e) => setBatchSize(parseInt(e.target.value))}
                      className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      <option value={5}>5 Rows</option>
                      <option value={10}>10 Rows</option>
                      <option value={15}>15 Rows</option>
                      <option value={25}>25 Rows</option>
                      <option value={50}>50 Rows</option>
                    </select>
                  </div>

                  <button 
                    onClick={startAIPipeline}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-lg text-xs transition-all shadow-md shadow-indigo-600/10"
                    id="confirm_import_btn"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Confirm & Start AI Extraction
                  </button>
                </div>
              </div>

              {/* Preview Table container */}
              <div className="card flex-1 min-h-[300px] overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col" id="preview_table_container">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Raw Data Inspector (No AI processing done yet)</span>
                  <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-100 font-semibold">Pre-AI Stage</span>
                </div>
                
                <div className="flex-1 overflow-auto max-h-[420px]" id="preview_table_scrollable">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-100/80 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-100">Index</th>
                        {headers.map((header, i) => (
                          <th key={i} className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100">
                      {rawRows.slice(0, 50).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5 font-mono font-semibold text-slate-400 sticky left-0 bg-white border-r border-slate-100">#{rIdx + 1}</td>
                          {headers.map((header, hIdx) => (
                            <td key={hIdx} className="px-5 py-3.5 max-w-xs truncate text-slate-600">
                              {row[header] !== undefined ? String(row[header]) : <span className="text-slate-300 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rawRows.length > 50 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400 font-medium">
                    Showing first 50 rows of {rawRows.length}. The remaining rows will be fully analyzed during extraction.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: AI PROCESSING SCREEN */}
          {activeStep === 'processing' && (
            <div className="space-y-6 animate-fadeIn" id="step_processing_view">
              
              {/* Progress Panel */}
              <div className="card bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5" id="pipeline_progress_card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                      Intelligent Extraction Active
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mt-1">
                      {progressPercentage}% Completed
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Batch {currentBatchIndex + 1} of {Math.ceil(rawRows.length / batchSize)} is processing. Do not close this window.
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Processing Model</span>
                    <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 block mt-1">gemini-3.5-flash</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className="bg-indigo-600 h-full transition-all duration-300 ease-out animate-pulse" 
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>

                {/* Statistic Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Dataset</span>
                    <span className="block text-xl font-bold text-slate-800 mt-0.5">{totalRowsCount} rows</span>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
                    <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold">AI Normalizations</span>
                    <span className="block text-xl font-bold text-emerald-800 mt-0.5">{successRowsCount} leads</span>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                    <span className="text-[10px] text-amber-600 uppercase tracking-wider font-bold">Skipped (Incomplete)</span>
                    <span className="block text-xl font-bold text-amber-800 mt-0.5">{skippedRowsCount} records</span>
                  </div>
                  <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-3">
                    <span className="text-[10px] text-rose-600 uppercase tracking-wider font-bold">Failures (To Retry)</span>
                    <span className="block text-xl font-bold text-rose-800 mt-0.5">{failedRowsCount} batches</span>
                  </div>
                </div>
              </div>

              {/* Live console logs */}
              <div className="card bg-slate-950 rounded-xl border border-slate-800 p-5 font-mono text-slate-300 shadow-xl flex flex-col h-[320px]" id="logs_console">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 tracking-wider">PIPELINE MONITOR LOGS</span>
                  </div>
                  <span className="text-[10px] text-indigo-400 uppercase font-semibold">Active Console</span>
                </div>
                
                <div className="flex-1 overflow-y-auto text-[11px] space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                  {pipelineLogs.map((log, i) => {
                    let textClass = "text-slate-300";
                    if (log.includes("[ERROR]")) textClass = "text-rose-400 font-bold";
                    if (log.includes("[SUCCESS]")) textClass = "text-emerald-400";
                    if (log.includes("[WARNING]")) textClass = "text-amber-400";
                    return (
                      <div key={i} className={`leading-relaxed border-l-2 pl-2 border-slate-800 ${textClass}`}>
                        {log}
                      </div>
                    );
                  })}
                  {pipelineLogs.length === 0 && (
                    <div className="text-slate-600 italic text-center pt-10">
                      Awaiting connection, streaming raw log feeds...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: RESULTS & EXPORT SCREEN */}
          {activeStep === 'results' && (
            <div className="space-y-6 animate-fadeIn flex flex-col h-full" id="step_results_view">
              
              {/* Pipeline summary stats banner */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Source Rows</span>
                    <span className="text-lg font-bold text-slate-800">{totalRowsCount} records</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">AI Extracted Leads</span>
                    <span className="text-lg font-bold text-slate-800">{successRowsCount} records</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <X className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Skipped Leads</span>
                    <span className="text-lg font-bold text-slate-800">{skippedRowsCount} records</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Failures</span>
                    <span className="text-lg font-bold text-slate-800">{failedRowsCount} records</span>
                  </div>
                </div>
              </div>

              {/* Interactive Results Dashboard Card */}
              <div className="card flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col" id="results_dashboard_table_card">
                
                {/* Search & Action Bar */}
                <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search leads by name, email, company..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2 rounded-lg text-xs outline-none focus:bg-white focus:border-indigo-500 transition-all font-medium"
                      />
                    </div>

                    <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
                      {(['all', 'success', 'skipped', 'failed'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`px-3 py-1.5 rounded-md font-semibold capitalize transition-all ${statusFilter === status ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportToCSV}
                      disabled={successRowsCount === 0}
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg text-xs transition-all shadow-md shadow-indigo-600/15"
                      id="export_results_csv_btn"
                    >
                      <Download className="w-4 h-4" /> Export Mapped CRM CSV
                    </button>
                  </div>
                </div>

                {/* Extracted table */}
                <div className="flex-1 overflow-auto max-h-[400px]" id="results_table_scrollable">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-50 sticky top-0 border-b z-10">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-3 sticky left-0 bg-slate-50">Row</th>
                        <th className="px-5 py-3">Normalization Status</th>
                        <th className="px-5 py-3">Full Name</th>
                        <th className="px-5 py-3">Primary Email</th>
                        <th className="px-5 py-3">Phone Contact</th>
                        <th className="px-5 py-3">Company</th>
                        <th className="px-5 py-3">Source & Status</th>
                        <th className="px-5 py-3">CRM note & Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100">
                      {filteredResults.map((result, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-400 bg-white sticky left-0 border-r border-slate-100">
                            #{result.index + 1}
                          </td>
                          <td className="px-5 py-3.5">
                            {result.status === 'success' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
                                <span className="w-1 h-1 rounded-full bg-emerald-500"></span> Mapped
                              </span>
                            )}
                            {result.status === 'skipped' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide">
                                <span className="w-1 h-1 rounded-full bg-amber-500"></span> Skipped
                              </span>
                            )}
                            {result.status === 'failed' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
                                <span className="w-1 h-1 rounded-full bg-rose-500"></span> Failed
                              </span>
                            )}
                          </td>
                          
                          {/* Name column */}
                          <td className="px-5 py-3.5 font-semibold text-slate-800">
                            {result.normalized?.name || (
                              <span className="text-slate-400 italic font-normal">
                                {result.original?.name || result.original?.client_name || result.original?.['Full Name'] || 'N/A'}
                              </span>
                            )}
                          </td>

                          {/* Email column */}
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {result.normalized?.email || (
                              <span className="text-slate-300 italic font-normal">N/A</span>
                            )}
                          </td>

                          {/* Mobile Contact */}
                          <td className="px-5 py-3.5 text-slate-600">
                            {result.normalized?.mobile_without_country_code ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800">{result.normalized.mobile_without_country_code}</span>
                                {result.normalized.country_code && (
                                  <span className="text-[9px] text-slate-400">Code: {result.normalized.country_code}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 italic">N/A</span>
                            )}
                          </td>

                          {/* Company */}
                          <td className="px-5 py-3.5 text-slate-600">
                            {result.normalized?.company || (
                              <span className="text-slate-300 italic">N/A</span>
                            )}
                          </td>

                          {/* Source & Status Enums */}
                          <td className="px-5 py-3.5 space-y-1">
                            {result.normalized?.crm_status && (
                              <span className="block text-[9px] font-extrabold bg-blue-50 border border-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase tracking-wide w-max">
                                {result.normalized.crm_status}
                              </span>
                            )}
                            {result.normalized?.data_source && (
                              <span className="block text-[9px] font-extrabold bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wide w-max">
                                Source: {result.normalized.data_source}
                              </span>
                            )}
                            {!result.normalized?.crm_status && !result.normalized?.data_source && (
                              <span className="text-slate-300 italic">-</span>
                            )}
                          </td>

                          {/* Notes column */}
                          <td className="px-5 py-3.5 max-w-xs truncate text-slate-500 italic" title={result.normalized?.crm_note || ''}>
                            {result.normalized?.crm_note || <span className="text-slate-300 italic">-</span>}
                          </td>
                        </tr>
                      ))}
                      {filteredResults.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-slate-400 italic">
                            No records found matching the active criteria filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t bg-slate-50/80 rounded-b-xl flex justify-between items-center text-xs text-slate-500">
                  <span>Showing {filteredResults.length} of {results.length} total results</span>
                  <span className="text-[11px] font-medium text-slate-400">Standard GrowEasy Format Output</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
