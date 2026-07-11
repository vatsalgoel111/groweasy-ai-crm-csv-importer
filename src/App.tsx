import React, { useState, useRef, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import { 
  Upload, FileText, Cpu, CheckCircle2, AlertCircle, RefreshCw, 
  Search, Download, Database, ChevronRight, HelpCircle, Layers, 
  Trash2, Play, AlertTriangle, ArrowRight, ExternalLink, Moon, Sun, 
  Table, Check, X, ShieldAlert, Sparkles, Menu, BarChart2, Filter, 
  Clock, Flame, HelpCircle as TooltipIcon, RefreshCcw, CheckCircle, Info
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, Legend, PieChart, Pie, Cell
} from 'recharts';

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

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
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
  
  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Mobile sidebar layout states
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // File upload state
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [csvText, setCsvText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Column widths state for resizable table columns
  const [previewColWidths, setPreviewColWidths] = useState<Record<string, number>>({});
  const [resultsColWidths, setResultsColWidths] = useState<Record<string, number>>({});

  // Parsed raw CSV data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  
  // Processing & batching pipeline state
  const [batchSize, setBatchSize] = useState<number>(15);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(0);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Timing statistics
  const [processingTimeSec, setProcessingTimeSec] = useState<number>(0);
  const [elapsedTimer, setElapsedTimer] = useState<number>(0);

  // Search & Filtering of results
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'skipped' | 'failed'>('all');
  const [resultsTab, setResultsTab] = useState<'table' | 'analytics'>('table');

  // References for drag-drop
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Timer during processing
  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setElapsedTimer(Math.round((Date.now() - startTime) / 100) / 10);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Toast System
  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const addToastLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setPipelineLogs(prev => [`[${timestamp}] [${type.toUpperCase()}] ${msg}`, ...prev]);
    showToast(msg, type);
  };

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
        addToastLog(`Loaded CSV with ${parsedRows.length} rows and ${parsedHeaders.length} columns.`, "success");
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
    setElapsedTimer(0);
    setProcessingTimeSec(0);
  };

  // Run the batch pipeline using the Groq backend
  const startAIPipeline = async () => {
    setIsProcessing(true);
    setActiveStep('processing');
    setResults([]);
    setCurrentBatchIndex(0);
    setPipelineLogs([]);
    setElapsedTimer(0);
    
    const startTime = Date.now();
    addToastLog("Initializing GrowEasy CRM Intelligent AI Extractor (Powered by Groq)...", "info");
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
      addToastLog(`Processing Batch ${bIdx + 1} of ${rowBatches.length} (${currentBatch.length} rows) with AI...`, "info");

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

    const totalDuration = (Date.now() - startTime) / 1000;
    setProcessingTimeSec(Math.round(totalDuration * 10) / 10);
    setIsProcessing(false);
    addToastLog("Intelligent extraction completed successfully!", "success");
    setActiveStep('results');
  };

  // Retry Failed Records only
  const retryFailedRecords = async () => {
    const failedRecords = results.filter(r => r.status === 'failed');
    if (failedRecords.length === 0) return;

    setIsProcessing(true);
    setActiveStep('processing');
    setPipelineLogs([]);
    setElapsedTimer(0);

    const startTime = Date.now();
    addToastLog(`Retrying AI Normalization for ${failedRecords.length} failed records...`, "info");
    addToastLog(`Slicing failed dataset into batches of ${batchSize}...`, "info");

    const preservedResults = results.filter(r => r.status !== 'failed');
    setResults(preservedResults);

    const chunkArray = (arr: ExtractionResult[], size: number): ExtractionResult[][] => {
      const chunks: ExtractionResult[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const rowBatches = chunkArray(failedRecords, batchSize);
    const tempResults = [...preservedResults];

    for (let bIdx = 0; bIdx < rowBatches.length; bIdx++) {
      setCurrentBatchIndex(bIdx);
      const currentBatch = rowBatches[bIdx];
      addToastLog(`Processing Retry Batch ${bIdx + 1} of ${rowBatches.length} (${currentBatch.length} rows) with AI...`, "info");

      // Format payload from the failed record's original data
      const payloadBatch = currentBatch.map(item => ({
        index: item.index,
        data: { ...(item.original) }
      }));

      let retryCount = 0;
      const maxRetries = 2;
      let batchSuccess = false;
      let batchResults: ExtractionResult[] = [];

      while (retryCount <= maxRetries && !batchSuccess) {
        if (retryCount > 0) {
          addToastLog(`Retrying Retry Batch ${bIdx + 1} (Attempt ${retryCount}/${maxRetries})...`, "warning");
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
          console.error(`Error on retry batch ${bIdx + 1} execution:`, error);
          retryCount++;
          if (retryCount > maxRetries) {
            addToastLog(`Retry Batch ${bIdx + 1} failed after ${maxRetries} retries: ${error.message}`, "error");
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

      addToastLog(`Retry Batch ${bIdx + 1} complete: ${successCount} mapped, ${skippedCount} skipped, ${failedCount} failed`, "success");
      
      tempResults.push(...batchResults);
      // Sort tempResults by index so they are in original order
      tempResults.sort((a, b) => a.index - b.index);
      setResults([...tempResults]);
    }

    const totalDuration = (Date.now() - startTime) / 1000;
    setProcessingTimeSec(prev => Math.round((prev + totalDuration) * 10) / 10);
    setIsProcessing(false);
    addToastLog("Retry AI extraction completed!", "success");
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
      index: r.index + 1,
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
    
    // Custom formatted filename: groweasy_crm_YYYY-MM-DD.csv
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `groweasy_crm_${todayStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToastLog("CRM CSV downloaded successfully.", "success");
  };

  // Download Failures/Skipped Report CSV
  const downloadErrorReport = () => {
    const badLeads = results.filter(r => r.status === 'skipped' || r.status === 'failed');
    if (badLeads.length === 0) {
      showToast("No errors or skipped records to export!", "info");
      return;
    }

    const reportRows = badLeads.map(r => ({
      'Original Row Index': r.index + 1,
      'Original Row Data': JSON.stringify(r.original),
      'Ingestion Status': r.status.toUpperCase(),
      'Error or Skipped Reason': r.error || 'Missing mandatory contact details (no email and no mobile number)',
      'Batch Number': Math.floor(r.index / batchSize) + 1
    }));

    const csvOutput = Papa.unparse(reportRows);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `groweasy_crm_error_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToastLog("Error Report CSV downloaded successfully.", "success");
  };

  // Resizable columns logic
  const handleColumnResize = (header: string, isPreviewTable: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const currentWidths = isPreviewTable ? previewColWidths : resultsColWidths;
    const startWidth = currentWidths[header] || 160;

    const doResize = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(90, startWidth + (moveEvent.pageX - startX));
      if (isPreviewTable) {
        setPreviewColWidths(prev => ({ ...prev, [header]: newWidth }));
      } else {
        setResultsColWidths(prev => ({ ...prev, [header]: newWidth }));
      }
    };

    const stopResize = () => {
      document.removeEventListener('mousemove', doResize);
      document.removeEventListener('mouseup', stopResize);
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  };

  // Check if field was AI-Inferred/Transformed (by comparing normalized field with any matching value in raw row)
  const isFieldInferred = (result: ExtractionResult, field: keyof CRMRecord) => {
    if (result.status !== 'success' || !result.normalized) return false;
    const original = result.original || {};
    const normalizedValue = result.normalized[field];
    if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') return false;

    // Enums, country code, and notes are always categorized, parsed, or merged by AI
    if (field === 'crm_status' || field === 'data_source' || field === 'crm_note' || field === 'country_code') {
      return true;
    }

    // See if the string exists in original object raw value
    let foundExactMatch = false;
    for (const key of Object.keys(original)) {
      if (key.startsWith('_')) continue;
      const rawVal = String(original[key] || '');
      if (rawVal.trim() === String(normalizedValue).trim()) {
        foundExactMatch = true;
        break;
      }
    }

    return !foundExactMatch;
  };

  // Helper to render field with optional AI spark indicator & tooltip
  const renderInferredField = (result: ExtractionResult, field: keyof CRMRecord, displayNode: React.ReactNode) => {
    const inferred = isFieldInferred(result, field);
    if (inferred) {
      return (
        <div className="group relative flex items-center gap-1 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 px-1.5 py-1 rounded border border-indigo-100/80 dark:border-indigo-900/40 transition-all hover:bg-indigo-100/50">
          <div className="flex-1 min-w-0 truncate">{displayNode}</div>
          <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0 cursor-help" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 text-white text-[9px] py-1 px-2 rounded shadow-lg whitespace-nowrap z-50 font-sans font-medium">
            Inferred by AI
          </div>
        </div>
      );
    }
    return <div className="px-1.5 py-1 truncate">{displayNode}</div>;
  };

  // Filtering Logic
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      // Search query matches name, email, company, phone, city, country
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !query ||
        (r.normalized?.name && r.normalized.name.toLowerCase().includes(query)) ||
        (r.normalized?.email && r.normalized.email.toLowerCase().includes(query)) ||
        (r.normalized?.company && r.normalized.company.toLowerCase().includes(query)) ||
        (r.normalized?.mobile_without_country_code && r.normalized.mobile_without_country_code.toLowerCase().includes(query)) ||
        (r.normalized?.city && r.normalized.city.toLowerCase().includes(query)) ||
        (r.normalized?.country && r.normalized.country.toLowerCase().includes(query)) ||
        (r.original && JSON.stringify(r.original).toLowerCase().includes(query));

      // Status filter matches
      const matchesStatus = 
        statusFilter === 'all' || 
        r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [results, searchQuery, statusFilter]);

  // Statistics
  const totalRowsCount = rawRows.length;
  const processedRowsCount = results.length;
  const successRowsCount = results.filter(r => r.status === 'success').length;
  const skippedRowsCount = results.filter(r => r.status === 'skipped').length;
  const failedRowsCount = results.filter(r => r.status === 'failed').length;

  const progressPercentage = totalRowsCount > 0 
    ? Math.round((processedRowsCount / totalRowsCount) * 100) 
    : 0;

  // Active rows per second
  const rowsPerSec = useMemo(() => {
    if (processingTimeSec > 0) {
      return Math.round((processedRowsCount / processingTimeSec) * 10) / 10;
    }
    return 0;
  }, [processedRowsCount, processingTimeSec]);

  // Chart data calculations
  const statusChartData = useMemo(() => {
    const data = [
      { name: 'GOOD LEAD FOLLOW UP', value: results.filter(r => r.normalized?.crm_status === 'GOOD_LEAD_FOLLOW_UP').length, color: '#10b981' },
      { name: 'DID NOT CONNECT', value: results.filter(r => r.normalized?.crm_status === 'DID_NOT_CONNECT').length, color: '#f59e0b' },
      { name: 'BAD LEAD', value: results.filter(r => r.normalized?.crm_status === 'BAD_LEAD').length, color: '#ef4444' },
      { name: 'SALE DONE', value: results.filter(r => r.normalized?.crm_status === 'SALE_DONE').length, color: '#6366f1' },
    ];
    return data.filter(d => d.value > 0);
  }, [results]);

  const sourceChartData = useMemo(() => {
    const data = [
      { name: 'leads_on_demand', value: results.filter(r => r.normalized?.data_source === 'leads_on_demand').length, color: '#3b82f6' },
      { name: 'meridian_tower', value: results.filter(r => r.normalized?.data_source === 'meridian_tower').length, color: '#8b5cf6' },
      { name: 'eden_park', value: results.filter(r => r.normalized?.data_source === 'eden_park').length, color: '#ec4899' },
      { name: 'varah_swamy', value: results.filter(r => r.normalized?.data_source === 'varah_swamy').length, color: '#14b8a6' },
      { name: 'sarjapur_plots', value: results.filter(r => r.normalized?.data_source === 'sarjapur_plots').length, color: '#f43f5e' },
    ];
    return data.filter(d => d.value > 0);
  }, [results]);

  const summaryChartData = useMemo(() => {
    return [
      { name: 'Mapped', value: successRowsCount, color: '#10b981' },
      { name: 'Skipped', value: skippedRowsCount, color: '#f59e0b' },
      { name: 'Failed', value: failedRowsCount, color: '#ef4444' }
    ].filter(d => d.value > 0);
  }, [successRowsCount, skippedRowsCount, failedRowsCount]);

  // Switch tab if both analytics are empty
  useEffect(() => {
    if (statusChartData.length === 0 && sourceChartData.length === 0 && resultsTab === 'analytics') {
      setResultsTab('table');
    }
  }, [statusChartData, sourceChartData, resultsTab]);

  return (
    <div className={`flex h-screen w-full overflow-hidden font-sans smooth-transition ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`} id="main_root">
      
      {/* 1. TOAST NOTIFICATION CONTAINER */}
      <div className="fixed top-5 right-5 z-[100] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-xs max-w-sm font-semibold animate-slideIn ${
              toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20 dark:text-emerald-300 dark:bg-emerald-950/80 dark:border-emerald-800' :
              toast.type === 'error' ? 'bg-rose-500/10 text-rose-800 border-rose-500/20 dark:text-rose-300 dark:bg-rose-950/80 dark:border-rose-800' :
              toast.type === 'warning' ? 'bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-300 dark:bg-amber-950/80 dark:border-amber-800' :
              'bg-slate-500/10 text-slate-800 border-slate-500/20 dark:text-slate-300 dark:bg-slate-900/80 dark:border-slate-800'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400" />}
            {toast.type === 'error' && <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />}
            {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />}
            {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400" />}
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* 2. RESPONSIVE SIDEBAR (MOBILE DRAWER) */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileSidebarOpen(false)}>
          <aside 
            className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800 h-full p-6 animate-slideRight"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Cpu className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-white font-black text-base tracking-tight block">GrowEasy AI</span>
                    <span className="block text-[9px] text-slate-500 font-black uppercase tracking-wider">CSV INGEST PIPELINE</span>
                  </div>
                </div>
                <button onClick={() => setIsMobileSidebarOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1.5">
                <button 
                  onClick={() => { csvText && setActiveStep('upload'); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${activeStep === 'upload' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  <Upload className="w-4.5 h-4.5" /> Upload CSV
                </button>
                <button 
                  onClick={() => { headers.length > 0 && setActiveStep('preview'); setIsMobileSidebarOpen(false); }}
                  disabled={headers.length === 0}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${headers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'preview' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  <Table className="w-4.5 h-4.5" /> Preview Raw
                </button>
                <button 
                  onClick={() => { (results.length > 0 || isProcessing) && setActiveStep('processing'); setIsMobileSidebarOpen(false); }}
                  disabled={results.length === 0 && !isProcessing}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${results.length === 0 && !isProcessing ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'processing' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  <Cpu className="w-4.5 h-4.5" /> AI Processing
                </button>
                <button 
                  onClick={() => { results.length > 0 && setActiveStep('results'); setIsMobileSidebarOpen(false); }}
                  disabled={results.length === 0}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${results.length === 0 ? 'opacity-50 cursor-not-allowed' : ''} ${activeStep === 'results' ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/10' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  <CheckCircle2 className="w-4.5 h-4.5" /> Export Results
                </button>
              </nav>
            </div>

            <div className="pt-6 border-t border-slate-800/80 bg-slate-950/40">
              {/* Dark mode button for mobile */}
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="w-full mb-4 flex items-center justify-between text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <span className="flex items-center gap-2">
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
                  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500">Toggle</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold shadow-inner">
                  VG
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Vatsal Goel</p>
                  <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Internship Demo</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 3. PERMANENT DESKTOP SIDEBAR */}
      <aside 
        className={`hidden lg:flex bg-slate-900 border-r border-slate-800 text-slate-300 flex-col justify-between shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`} 
        id="sidebar_container"
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-8">
            <div className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/30 shrink-0">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div className="shrink-0">
                <span className="text-white font-black text-base tracking-tight block">GrowEasy AI</span>
                <span className="block text-[9px] text-slate-500 font-black uppercase tracking-wider">CSV INGEST PIPELINE</span>
              </div>
            </div>
            
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white hidden lg:block"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          <nav className="space-y-1.5">
            {[
              { id: 'upload', label: 'Upload CSV', icon: Upload, active: activeStep === 'upload', disabled: false },
              { id: 'preview', label: 'Preview Raw', icon: Table, active: activeStep === 'preview', disabled: headers.length === 0 },
              { id: 'processing', label: 'AI Processing', icon: Cpu, active: activeStep === 'processing', disabled: results.length === 0 && !isProcessing },
              { id: 'results', label: 'Export Results', icon: CheckCircle2, active: activeStep === 'results', disabled: results.length === 0 },
            ].map(step => (
              <button 
                key={step.id}
                onClick={() => !step.disabled && setActiveStep(step.id as any)}
                disabled={step.disabled}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${step.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${step.active ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                title={step.label}
              >
                <step.icon className="w-4 h-4 shrink-0" />
                <span className={`transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                  {step.label}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-5 border-t border-slate-800/60 bg-slate-950/40">
          {/* Dark Mode toggle */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="w-full mb-4 flex items-center justify-between text-xs font-semibold p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <span className="flex items-center gap-2">
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400 shrink-0" /> : <Moon className="w-4 h-4 text-slate-400 shrink-0" />}
              <span className={`transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {isDarkMode ? 'Light Mode' : 'Dark Mode'}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold shadow-inner shrink-0">
              VG
            </div>
            <div className={`transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
              <p className="text-xs font-extrabold text-white">Vatsal Goel</p>
              <p className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Internship Demo</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 4. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden" id="main_content_container">
        
        {/* Main Header bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              {activeStep === 'upload' && 'Step 1: Upload CSV Dataset'}
              {activeStep === 'preview' && 'Step 2: Inspect Raw Records'}
              {activeStep === 'processing' && 'Step 3: Real-Time AI Normalization'}
              {activeStep === 'results' && 'Step 4: Unified Lead Extraction Results'}
            </h1>
            <span className="hidden sm:inline-block px-3 py-1 bg-indigo-600 border border-indigo-700 text-white text-[10px] font-black rounded-lg uppercase tracking-wider shadow-sm">
              STATE: {activeStep.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 px-2.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold text-emerald-800 dark:text-emerald-400">Groq Engine Active</span>
            </div>
            
            {fileName && (
              <button 
                onClick={resetImporter}
                className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/30 px-3 py-2 rounded-lg transition-all font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset Pipeline
              </button>
            )}
          </div>
        </header>

        {/* Workspace Body container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100" id="view_screen_container">
          
          {/* STEP 1: UPLOAD SCREEN */}
          {activeStep === 'upload' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn" id="step_upload_view">
              <div className="text-center space-y-2">
                <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Intelligently Import & Map Leads with AI
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm max-w-lg mx-auto">
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
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center transition-all cursor-pointer bg-white dark:bg-slate-900 shadow-sm group min-h-[300px] ${dragActive ? 'border-indigo-500 bg-indigo-50/25 dark:bg-indigo-950/10' : 'border-slate-300 dark:border-slate-800 hover:border-indigo-400'}`}
                id="drag_drop_zone"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv" 
                  className="hidden" 
                />
                
                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 group-hover:scale-105 transition-transform duration-300 shadow-inner">
                  <Upload className="w-6 h-6" />
                </div>
                
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Drag and drop your CSV file here
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 text-center">or click to browse local files (max size 5MB)</p>
                
                <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 px-4 py-2 rounded-full flex items-center gap-1.5 font-semibold shadow-xs">
                  <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Supported extensions: .csv
                </div>
              </div>

              {/* Sample Data Playgrounds */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4" id="samples_card">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Testing Corner (No CSV ready? Try raw messy files)</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Experience immediate AI normalization by using one of our scrambled, multi-header diagnostic templates representing messy marketing campaigns.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => loadSample('facebook')}
                    className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 text-left transition-all group"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Facebook Leads Export</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Scrambled headers, multi-emails, duplicate phones.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  </button>
                  <button 
                    onClick={() => loadSample('messy')}
                    className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 text-left transition-all group cursor-pointer"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Messy Multi-Format Leads</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Custom date strings, inline status parameters, incomplete data.</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Supported attributes reference */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm" id="mapping_specs_reference">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">
                  Normalized Target CRM Fields (Ingestion Schema)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {[
                    { f: 'created_at', d: 'Normalized ISO date' },
                    { f: 'name', d: 'Full cleaned name' },
                    { f: 'email', d: 'Primary extracted email' },
                    { f: 'mobile', d: 'Local phone number' },
                    { f: 'country_code', d: 'Parsed dial code' },
                    { f: 'company', d: 'Company organization' },
                    { f: 'city / state', d: 'Geographic markers' },
                    { f: 'crm_status', d: 'Valid status classifications' },
                    { f: 'data_source', d: 'Property identifier' },
                    { f: 'crm_note', d: 'Secondary contact notes' }
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xs">
                      <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded block w-max max-w-full truncate">{item.f}</code>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1.5 font-medium">{item.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CSV PREVIEW SCREEN */}
          {activeStep === 'preview' && (
            <div className="space-y-6 animate-fadeIn h-full flex flex-col" id="step_preview_view">
              
              {/* Configuration panel */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Loaded CSV Dataset</span>
                    <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold rounded">RAW DATA</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{fileName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Found {rawRows.length} total rows and {headers.length} columns. Choose your AI chunk sizing below to start.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs shrink-0">
                    <span className="text-slate-600 dark:text-slate-400 font-bold">AI Batch Size:</span>
                    <select 
                      value={batchSize} 
                      onChange={(e) => setBatchSize(parseInt(e.target.value))}
                      className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold outline-none cursor-pointer border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={5} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">5 records / batch</option>
                      <option value={10} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">10 records / batch</option>
                      <option value={15} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">15 records / batch</option>
                      <option value={25} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">25 records / batch</option>
                      <option value={50} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">50 records / batch</option>
                    </select>
                  </div>

                  <button 
                    onClick={startAIPipeline}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl text-xs transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                    id="confirm_import_btn"
                  >
                    <Play className="w-4 h-4 fill-current text-white shrink-0" /> Confirm & Start AI Extraction
                  </button>
                </div>
              </div>

              {/* RAW DATA TABLE INSPECTOR */}
              <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-[350px] overflow-hidden" id="preview_table_container">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">Raw Data Inspector (Unstructured view)</span>
                  </div>
                  <span className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-wider">Pre-AI Stage</span>
                </div>
                
                <div className="flex-1 overflow-auto" id="preview_table_scrollable">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-100/70 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-800 z-20">Row</th>
                        {headers.map((header) => {
                          const width = previewColWidths[header] || 160;
                          return (
                            <th 
                              key={header} 
                              className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider relative group/th"
                              style={{ width }}
                            >
                              <div className="truncate pr-4">{header}</div>
                              {/* Resize handler bar */}
                              <div 
                                onMouseDown={(e) => handleColumnResize(header, true, e)}
                                className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-200 dark:bg-slate-700 group-hover/th:bg-indigo-500 transition-all opacity-40 group-hover/th:opacity-100"
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      {rawRows.slice(0, 50).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3 font-mono font-bold text-slate-500 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10">#{rIdx + 1}</td>
                          {headers.map((header) => (
                            <td key={header} className="px-5 py-3 truncate max-w-xs text-slate-600 dark:text-slate-300">
                              {row[header] !== undefined ? String(row[header]) : <span className="text-slate-400 dark:text-slate-600 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rawRows.length > 50 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 text-center text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider shrink-0">
                    Displaying first 50 records. The entire dataset of {rawRows.length} rows will be fully structured in the next step.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: AI PROCESSING SCREEN */}
          {activeStep === 'processing' && (
            <div className="space-y-6 animate-fadeIn" id="step_processing_view">
              
              {/* Dynamic Loading Stats Banner */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6" id="pipeline_progress_card">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping shrink-0"></span>
                      AI Pipeline Normalization active
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      {progressPercentage}% structured
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Processing Batch <span className="font-bold text-slate-800 dark:text-slate-100">{currentBatchIndex + 1}</span> of <span className="font-bold text-slate-800 dark:text-slate-100">{Math.ceil(rawRows.length / batchSize)}</span>. Please keep this tab active.
                    </p>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-black uppercase block">Active stopwatch</span>
                      <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{elapsedTimer.toFixed(1)} seconds</span>
                    </div>
                  </div>
                </div>

                {/* Micro Animated Progress bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden shadow-inner relative">
                  <div 
                    className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300 ease-out animate-pulse" 
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>

                {/* Realtime Statistics Feed */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">Total Ingested</span>
                    <span className="block text-xl font-black text-slate-800 dark:text-slate-100">{processedRowsCount} / {totalRowsCount}</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Success Leads</span>
                    <span className="block text-xl font-black text-emerald-800 dark:text-emerald-300">{successRowsCount} rows</span>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold">Skipped Leads</span>
                    <span className="block text-xl font-black text-amber-800 dark:text-amber-300">{skippedRowsCount} rows</span>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/20 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider font-bold">Failures</span>
                    <span className="block text-xl font-black text-rose-800 dark:text-rose-300">{failedRowsCount} rows</span>
                  </div>
                </div>
              </div>

              {/* Streaming logs monitor */}
              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 font-mono text-slate-800 dark:text-slate-300 shadow-xl flex flex-col h-[350px]" id="logs_console">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3 mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">PIPELINE MONITOR LOGS</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                    <Flame className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                    <span>Llama-3.3-70b-versatile via Groq</span>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto text-[11px] space-y-1.5 scrollbar-thin">
                  {pipelineLogs.map((log, i) => {
                    let textClass = "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
                    if (log.includes("[ERROR]")) textClass = "text-rose-700 dark:text-rose-400 font-semibold border-rose-200 dark:border-rose-950/50 bg-rose-50 dark:bg-rose-950/10";
                    if (log.includes("[SUCCESS]")) textClass = "text-emerald-700 dark:text-emerald-400 font-semibold border-emerald-200 dark:border-emerald-950/50 bg-emerald-50 dark:bg-emerald-950/10";
                    if (log.includes("[WARNING]")) textClass = "text-amber-700 dark:text-amber-400 font-semibold border-amber-200 dark:border-amber-950/50 bg-amber-50 dark:bg-amber-950/10";
                    return (
                      <div key={i} className={`leading-relaxed border px-2.5 py-1.5 rounded-lg ${textClass}`}>
                        {log}
                      </div>
                    );
                  })}
                  {pipelineLogs.length === 0 && (
                    <div className="text-slate-500 dark:text-slate-600 italic text-center pt-12">
                      Initializing connection... streaming diagnostic log feeds...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: RESULTS SCREEN */}
          {activeStep === 'results' && (
            <div className="space-y-6 animate-fadeIn flex flex-col h-full" id="step_results_view">
              
              {/* SUCCESS STATE & RUNNING STATISTICS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                    <Check className="w-6 h-6 stroke-[3]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">✔ Import Complete</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{successRowsCount} Leads</span> Successfully Imported and Structured
                    </p>
                  </div>
                </div>

                {/* Secondary Action buttons */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {failedRowsCount > 0 && (
                    <button 
                      onClick={retryFailedRecords}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                      id="retry_failed_records_btn"
                    >
                      <RefreshCcw className="w-4 h-4 text-white" /> Retry Failed Records ({failedRowsCount})
                    </button>
                  )}

                  {(skippedRowsCount > 0 || failedRowsCount > 0) && (
                    <button 
                      onClick={downloadErrorReport}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-2.5 rounded-xl text-xs transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <ShieldAlert className="w-4 h-4 text-amber-500" /> Download Error Report
                    </button>
                  )}
                  
                  <button 
                    onClick={exportToCSV}
                    disabled={successRowsCount === 0}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-indigo-600/15 cursor-pointer"
                    id="export_results_csv_btn"
                  >
                    <Download className="w-4 h-4" /> Download Standardized CSV
                  </button>
                </div>
              </div>

              {/* STATISTICAL METRICS ROW */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {[
                  { label: "Total Rows", value: totalRowsCount, desc: "Source dataset", color: "text-slate-800 dark:text-slate-100" },
                  { label: "Mapped", value: successRowsCount, desc: "Valid leads", color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Skipped", value: skippedRowsCount, desc: "Missing email/phone", color: "text-amber-600 dark:text-amber-400" },
                  { label: "Failed", value: failedRowsCount, desc: "API chunk fails", color: "text-rose-600 dark:text-rose-400" },
                  { label: "Completion %", value: `${progressPercentage}%`, desc: "Successfully run", color: "text-indigo-600 dark:text-indigo-400" },
                  { label: "Total Time", value: `${processingTimeSec}s`, desc: "Full stopwatch duration", color: "text-slate-800 dark:text-slate-100" },
                  { label: "Batch Count", value: `${Math.ceil(totalRowsCount / batchSize)}`, desc: "Total Groq batches", color: "text-slate-800 dark:text-slate-100" },
                  { label: "Rows / Sec", value: `${rowsPerSec}`, desc: "AI pipeline throughput", color: "text-slate-800 dark:text-slate-100" }
                ].map((stat, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs space-y-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block">{stat.label}</span>
                    <span className={`block text-lg font-black ${stat.color}`}>{stat.value}</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate">{stat.desc}</span>
                  </div>
                ))}
              </div>

              {/* TABS SELECTOR (TABLE VS ANALYTICS) */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 shrink-0">
                <button
                  onClick={() => setResultsTab('table')}
                  className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${resultsTab === 'table' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                >
                  <Table className="w-4 h-4" /> Mapped Lead Records ({filteredResults.length})
                </button>
                {!(statusChartData.length === 0 && sourceChartData.length === 0) && (
                  <button
                    onClick={() => setResultsTab('analytics')}
                    className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${resultsTab === 'analytics' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                  >
                    <BarChart2 className="w-4 h-4" /> Interactive Processing Analytics
                  </button>
                )}
              </div>

              {/* SUBTAB 1: MAPPED LEADS TAB */}
              {resultsTab === 'table' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col flex-1" id="results_dashboard_table_card">
                  
                  {/* SEARCH AND FILTERS */}
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search leads by name, email, company, city, country..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium shadow-xs"
                      />
                    </div>

                    <div className="flex bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 gap-1 text-xs shrink-0 self-start md:self-auto">
                      {(['all', 'success', 'skipped', 'failed'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${statusFilter === status ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* RESULTS TABLE */}
                  <div className="flex-1 overflow-auto max-h-[500px]" id="results_table_scrollable">
                    <table className="w-full text-left border-collapse min-w-max">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 z-10">
                        <tr className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                          <th className="px-5 py-3 sticky left-0 bg-slate-50 dark:bg-slate-800 border-r border-slate-100 dark:border-slate-800 z-20 w-16">Row</th>
                          <th className="px-5 py-3 w-32">Status</th>
                          {['name', 'email', 'mobile', 'company', 'city', 'crm_status', 'crm_note'].map((col) => {
                            const width = resultsColWidths[col] || 160;
                            return (
                              <th 
                                key={col} 
                                className="px-5 py-3 relative group/rth"
                                style={{ width }}
                              >
                                <div className="truncate pr-4">{col === 'mobile' ? 'Phone Contact' : col === 'crm_status' ? 'CRM Status & Source' : col === 'crm_note' ? 'CRM Note' : col}</div>
                                <div 
                                  onMouseDown={(e) => handleColumnResize(col, false, e)}
                                  className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-200 dark:bg-slate-700 group-hover/rth:bg-indigo-500 transition-all opacity-40 group-hover/rth:opacity-100"
                                />
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredResults.map((result, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3.5 font-mono font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 sticky left-0 border-r border-slate-200 dark:border-slate-800 z-10">
                              #{result.index + 1}
                            </td>
                            
                            {/* Normalization Status Badge */}
                            <td className="px-5 py-3.5">
                              {result.status === 'success' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Mapped
                                </span>
                              )}
                              {result.status === 'skipped' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Skipped
                                </span>
                              )}
                              {result.status === 'failed' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold bg-rose-500/10 text-rose-700 dark:text-rose-400 uppercase tracking-wide">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Failed
                                </span>
                              )}
                            </td>
                            
                            {/* Mapped Name (Highlighted if AI Transformed) */}
                            <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-100">
                              {renderInferredField(
                                result, 
                                'name', 
                                result.normalized?.name || (
                                  <span className="text-slate-500 dark:text-slate-400 italic font-normal">
                                    {result.original?.name || result.original?.client_name || result.original?.['Full Name'] || 'N/A'}
                                  </span>
                                )
                              )}
                            </td>

                            {/* Mapped Email */}
                            <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {renderInferredField(
                                result,
                                'email',
                                result.normalized?.email || <span className="text-slate-400 dark:text-slate-600 italic">N/A</span>
                              )}
                            </td>

                            {/* Mapped Mobile */}
                            <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                              {renderInferredField(
                                result,
                                'mobile_without_country_code',
                                result.normalized?.mobile_without_country_code ? (
                                  <span>
                                    {result.normalized.country_code && <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1">{result.normalized.country_code}</span>}
                                    {result.normalized.mobile_without_country_code}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-600 italic">N/A</span>
                                )
                              )}
                            </td>

                            {/* Mapped Company */}
                            <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                              {renderInferredField(
                                result,
                                'company',
                                result.normalized?.company || <span className="text-slate-400 dark:text-slate-600 italic">N/A</span>
                              )}
                            </td>

                            {/* Mapped City */}
                            <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                              {renderInferredField(
                                result,
                                'city',
                                result.normalized?.city || <span className="text-slate-400 dark:text-slate-600 italic">N/A</span>
                              )}
                            </td>

                            {/* Source and Status (Double highlighted because it's classified by AI) */}
                            <td className="px-5 py-3.5 space-y-1">
                              {result.normalized?.crm_status && (
                                <span className="block text-[9px] font-extrabold bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded w-max uppercase">
                                  {result.normalized.crm_status}
                                </span>
                              )}
                              {result.normalized?.data_source && (
                                <span className="block text-[9px] font-extrabold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded w-max">
                                  {result.normalized.data_source}
                                </span>
                              )}
                              {!result.normalized?.crm_status && !result.normalized?.data_source && (
                                <span className="text-slate-400 dark:text-slate-600 italic">-</span>
                              )}
                            </td>

                            {/* Mapped CRM Note / Overflow */}
                            <td className="px-5 py-3.5 max-w-xs truncate text-slate-500 dark:text-slate-400 italic" title={result.normalized?.crm_note || ''}>
                              {renderInferredField(
                                result,
                                'crm_note',
                                result.normalized?.crm_note || <span className="text-slate-400 dark:text-slate-600 italic">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredResults.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-5 py-16 text-center text-slate-400 dark:text-slate-500 italic">
                              <div className="flex flex-col items-center justify-center space-y-2">
                                <Search className="w-8 h-8 text-slate-300" />
                                <span>No lead records matched your search query.</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 rounded-b-2xl flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    <span>Showing {filteredResults.length} of {results.length} results</span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Standardized CRM Lead Format</span>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: ANALYTICS DASHBOARD */}
              {resultsTab === 'analytics' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn" id="analytics_container">
                  
                  {/* Status Distribution */}
                  {statusChartData.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 animate-fadeIn">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Lead Status Classification</h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <ChartTooltip 
                              contentStyle={{ 
                                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                                borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                                color: isDarkMode ? '#f8fafc' : '#0f172a',
                                borderRadius: '12px'
                              }} 
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                              {statusChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Source Campaign Distribution */}
                  {sourceChartData.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 animate-fadeIn">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Campaign Source Mapping</h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sourceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                            <ChartTooltip 
                              contentStyle={{ 
                                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                                borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                                color: isDarkMode ? '#f8fafc' : '#0f172a',
                                borderRadius: '12px'
                              }} 
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                              {sourceChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Mapped vs Skipped Pie Summary */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Ingestion Integrity Summary</h3>
                    {summaryChartData.length > 0 ? (
                      <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-around gap-4">
                        <div className="h-48 w-48 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={summaryChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {summaryChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <ChartTooltip 
                                contentStyle={{ 
                                  backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                                  borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                                  color: isDarkMode ? '#f8fafc' : '#0f172a',
                                  borderRadius: '12px'
                                }} 
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-2.5 w-full sm:w-auto">
                          {summaryChartData.map((item, index) => (
                            <div key={index} className="flex items-center gap-2.5 text-xs">
                              <span className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: item.color }} />
                              <span className="font-bold text-slate-700 dark:text-slate-300">{item.name}:</span>
                              <span className="font-mono text-slate-500">{item.value} rows</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-slate-400 text-xs italic">
                        No processing summary data available.
                      </div>
                    )}
                  </div>

                   {/* Processing performance metrics */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1">AI Pipeline Performance</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Underlying hardware and LLM API response statistics</p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Pipeline Engine</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">llama-3.3-70b-versatile</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Batch Chunk Sizing</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{batchSize} rows per API call</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Total Run Time</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{processingTimeSec} seconds</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Processing Speed</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{rowsPerSec} rows / second</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-normal text-center">
                      Deterministic parsing model configured with 0.1 temperature parameter to guarantee consistent CRM ingestion.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
