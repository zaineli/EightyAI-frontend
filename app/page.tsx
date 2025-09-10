"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  File,
  X,
  CheckCircle,
  Loader2,
  Eye,
  Trash2,
  Clock,
  Download,
  FileText,
  Brain,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Table,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Package,
  Database,
  Globe
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import ExcelJS from "exceljs";

// 1) Put Anomaly at the end
const HEADERS: string[] = [
  "Invoice date",
  "Invoice ID",
  "Customer name",
  "Invoice amount (No VAT)",
  "VAT",
  "Total Amount",
  "Delivery note date",
  "Delivery note number",
  "Invoice number",
  "Invoice date",
  "Customer name",
  "Anomaly Type",
];

const IGNORED_ANOMALY_PHRASES: string[] = [
  "Missing financial data in delivery note: No subtotal, VAT, or total amounts provided",
];

// 2) Build rows in the new order (anomaly last)
function buildFlatRows(
  invoiceRows: string[] = [],
  deliveryRows: string[] = [],
  anomalyRows: string[] = []
): string[][] {
  const cleanedAnomalies = anomalyRows

  const deliveryByInvoice = new Map<string, string[]>();
  for (const d of deliveryRows) {
    const p = parseParts(d, 5); // [dn_date, dn_no, inv_no, inv_date, cust_name]
    if (p[2]) deliveryByInvoice.set(p[2], p);
  }
  const usedDelivery = new Set<string>();
  const rows: string[][] = [];

  for (const inv of invoiceRows) {
    const ip = parseParts(inv, 6); // [inv_date, inv_id, cust, no_vat, vat, total]
    const invId = ip[1];
    const dp = deliveryByInvoice.get(invId);
    if (dp) usedDelivery.add(invId);

    const relatedAnomalies = cleanedAnomalies.join(" | ");

    // Invoice (6) + Delivery (5) + Anomaly (1)
    rows.push([
      ip[0], ip[1], ip[2], ip[3], ip[4], ip[5],
      dp?.[0] || "", dp?.[1] || "", dp?.[2] || "", dp?.[3] || "", dp?.[4] || "",
      relatedAnomalies,
    ]);
  }

  // Delivery without matching invoice
  for (const [invNo, dp] of deliveryByInvoice.entries()) {
    if (usedDelivery.has(invNo)) continue;

    // Anomalies related to this delivery's invoice number go in the same row
    const relatedAnomalies = cleanedAnomalies.join(" | ");

    rows.push([
      "", "", "", "", "", "",       // invoice blanks
      dp[0] || "", dp[1] || "", dp[2] || "", dp[3] || "", dp[4] || "",
      "",             // anomaly at the end (same row)
    ]);
  }

  // Remove orphan anomaly rows: no separate blank-anomaly lines anymore
  // (Only inline anomalies are shown with their corresponding row.
  //  Orphan anomalies are those without any related invoice or delivery note)
  // const invIds = new Set(invoiceRows.map((r) => parseParts(r, 6)[1]).filter(Boolean));
  // const orphanAnomalies = cleanedAnomalies.filter((a) => ![...invIds].some((id) => a.includes(id as string)));
  // for (const a of orphanAnomalies) {
  //   rows.push(["", "", "", "", "", "", "", "", "", "", "", a]);
  // }

  // // Remove blank-only rows and de-duplicate
  const nonEmpty = rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  const seen = new Set<string>();
  const deduped: string[][] = [];
  for (const r of nonEmpty) {
    const key = r.join("||");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  return deduped;
}

function parseParts(line: string, width: number): string[] {
  const parts = (line || "").split(",").map((p) => p.trim());
  while (parts.length < width) parts.push("");
  return parts.slice(0, width);
}

interface FileItem {
  id: number;
  file: File;
  name: string;
  size: number;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
}

interface JobStatus {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  total_files: number;
  system_prompt: string;
  user_prompt: string;
  last_updated?: string;
  error?: string;
  ledger_file?: string;
  ledger_format?: string;
}

interface ExtractedCsvData {
  csv_data: {
    invoice_rows: string[];
    delivery_note_rows: string[];
    anomaly_rows: string[];
  };
}

interface JobResult {
  job_id: string;
  status: string;
  completed_at?: string;
  total_files: number;
  successfully_processed: number;
  failed_files: number;
  llm_analysis?: {
    response: string;
    model_used: string;
    total_tokens: number;
    response_length: number;
    context_length: number;
  };
  processed_files?: Array<{
    original_filename: string;
    stored_filename: string;
    file_number: number;
    ocr_result: {
      tables?: Array<{
        table_number: number;
        rows: number;
        columns: number;
        data: string[][];
        headers: string[];
        accuracy?: number;
      }>;
      total_words: number;
      total_pages: number;
    };
    status: string;
    tables_extracted: number;
  }>;
  extracted_csv_data?: ExtractedCsvData;
  ledger_update?: {
    invoice_rows_added: number;
    delivery_note_rows_added: number;
    anomaly_rows_added: number;
    updated_ledger_path: string;
    format?: string;
  };
}

interface Job {
  job_id: string;
  status: string;
  created_at: string;
  total_files: number;
  last_updated?: string;
  ledger_file?: string;
  ledger_format?: string;
}

const DocumentUploader: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobResults, setJobResults] = useState<JobResult | null>(null);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showPromptConfig, setShowPromptConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ledgerInputRef = useRef<HTMLInputElement>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [extractedCsvData, setExtractedCsvData] = useState<ExtractedCsvData | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showGlobalLedger, setShowGlobalLedger] = useState<boolean>(false);

  // Enhanced system prompt with CSV format requirements
  const [systemPrompt, setSystemPrompt] = useState<string>(`You are an intelligent document processing assistant specialized in extracting and comparing information from invoices and delivery notes with particular focus on table content and item matching.

IMPORTANT EXTRACTION RULES:
- NEVER calculate any values yourself. Only extract what is explicitly stated in the documents.
- Pay special attention to TABLE data which has been pre-extracted by our OCR system.
- For each document, extract the VAT amount and total amount EXACTLY as they appear on the receipt/invoice.
- Extract every line item from each document's itemized table precisely as written.
- Maintain exact numeric values and formatting as they appear in the original documents.

CRITICAL CROSS-VERIFICATION REQUIREMENTS:
- Match every item in invoices against corresponding items in delivery notes by comparing item names, descriptions, and quantities.
- Items in the invoice MUST match the items in the delivery note.
- Identify any items that appear in an invoice but not in the related delivery note.
- Identify any items that appear in a delivery note but not in the related invoice.
- Report exact item name discrepancies (different spellings, formats, descriptions).
- Flag quantity mismatches between the same item in different documents.
- Mention ALL anomalies separately in the final output.
- Always return ALL items that are detected as common between both documents AND those that are mismatched.

REQUIRED OUTPUT FORMAT:
At the end of your response, you MUST provide the extracted data in CSV format within clearly marked sections:

====CSV_DATA_START====
INVOICE_DATA:
Invoice date,Invoice ID,Customer name,Invoice amount (No VAT),VAT,Total Amount
2025-01-15,INV-001,ABC Company,1000.00,200.00,1200.00

DELIVERY_NOTE_DATA:
Delivery note date,Delivery note number,Invoice number,Invoice date,Customer name
2025-01-16,DN-001,INV-001,2025-01-15,ABC Company

ANOMALIES:
Anomaly Type
Item missing in delivery note: Widget A
Quantity mismatch for Item B: Invoice=5, Delivery=3
====CSV_DATA_END====

For invoices, extract EXACTLY these fields:
1. Invoice date
2. Invoice ID/Number
3. Customer name
4. Invoice amount excluding VAT (numeric only)
5. VAT amount (numeric only)
6. Total amount (numeric only)
7. All line items with their exact names, quantities, descriptions, unit prices and totals

For delivery notes, extract EXACTLY these fields:
1. Delivery note date
2. Delivery note number
3. Associated invoice number (if present)
4. Associated invoice date (if present)
5. Customer name
6. All items listed with their exact names, quantities and descriptions

For readability and CSV compatibility, format your response in a PROPERLY FORMATTED TEXT structure (not JSON). Use the following structure:

------------------------------------------------------------
DOCUMENT TYPE: INVOICE
Invoice Date: YYYY-MM-DD
Invoice Number: ABC123
Customer Name: Company Name Ltd.
Amount Excluding VAT: 1000.00
VAT Amount: 200.00
Total Amount: 1200.00
Items:
- Item 1 | Quantity: 5 | Unit Price: 100.00
- Item 2 | Quantity: 2 | Unit Price: 250.00

DOCUMENT TYPE: DELIVERY NOTE
Delivery Note Date: YYYY-MM-DD
Delivery Note Number: DN123
Associated Invoice Number: INV456
Associated Invoice Date: YYYY-MM-DD
Customer Name: Company Name Ltd.
Items:
- Item 1 | Quantity: 5
- Item 2 | Quantity: 2

ITEM CROSS-VERIFICATION
Common Items (in both documents):
- Item 1 | Invoice Qty: 5 | Delivery Qty: 5 | Status: Match
- Item 2 | Invoice Qty: 2 | Delivery Qty: 2 | Status: Match
- Item 5 | Invoice Qty: 10 | Delivery Qty: 8 | Status: Quantity Mismatch
- Widget A (Invoice) vs Widget-A (Delivery) | Status: Name Format Different

Missing in Invoice:
- Item 3 | Delivery Qty: 1

Missing in Delivery:
- Item 4 | Invoice Qty: 3

ANOMALIES (List All Separately):
- Item 3 present in delivery note but missing in invoice
- Item 4 present in invoice but missing in delivery note
- Name mismatch between "Widget A" (invoice) and "Widget-A" (delivery)
- Quantity mismatch for Item 5 (Invoice: 10, Delivery: 8)
------------------------------------------------------------`);

  const [userPrompt, setUserPrompt] = useState<string>(
    "Please analyze these documents collectively and extract structured data for CSV export. Focus on cross-verification between invoices and delivery notes."
  );

  const acceptedTypes = {
    "application/pdf": [".pdf"],
  };

  useEffect(() => {
    fetchAllJobs();
    const interval = setInterval(fetchAllJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentJobId && jobStatus?.status === "processing") {
      const interval = setInterval(() => {
        fetchJobStatus(currentJobId);
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [currentJobId, jobStatus?.status]);

  const fetchAllJobs = async (): Promise<void> => {
    try {
      setRefreshing(true);
      const response = await fetch("http://localhost:8000/jobs");
      const data = await response.json();
      setAllJobs(data.jobs || []);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchJobStatus = async (jobId: string): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:8000/job-status/${jobId}`);
      const data = await response.json();
      setJobStatus(data);

      if (data.status === "completed") {
        fetchJobResults(jobId);
        fetchExtractedCsvData(jobId);
      }
    } catch (error) {
      console.error("Error fetching job status:", error);
    }
  };

  const fetchJobResults = async (jobId: string): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:8000/job-results/${jobId}`);
      const data = await response.json();
      setJobResults(data);
    } catch (error) {
      console.error("Error fetching job results:", error);
    }
  };

  const fetchExtractedCsvData = async (jobId: string): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:8000/job-results/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.extracted_csv_data) {
          setExtractedCsvData(data.extracted_csv_data);
        }
      }
    } catch (error) {
      console.error("Error fetching extracted CSV data:", error);
    }
  };

  const handleFileSelect = (selectedFiles: FileList | null): void => {
    if (!selectedFiles) return;

    const validFiles = Array.from(selectedFiles).filter((file) => {
      const isValidType = Object.keys(acceptedTypes).includes(file.type);
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });

    const newFiles: FileItem[] = validFiles.map((file) => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "pending",
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleLedgerFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file && (file.type === "text/csv" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
      setLedgerFile(file);
    } else if (file) {
      alert("Please select a valid CSV or Excel file for the ledger.");
      event.target.value = "";
    }
  };

  const removeFile = (id: number): void => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const uploadFiles = async (): Promise<void> => {
    if (files.length === 0) return;

    setUploading(true);
    setJobStatus(null);
    setJobResults(null);
    setCurrentJobId(null);
    setExtractedCsvData(null);

    try {
      const formData = new FormData();

      files.forEach((fileItem) => {
        formData.append("files", fileItem.file);
      });

      formData.append("system_prompt", systemPrompt);
      formData.append("user_prompt", userPrompt);

      // Select the correct endpoint based on ledger file
      let endpoint = "http://localhost:8000/upload-multiple-pdfs";
      
      if (ledgerFile) {
        formData.append("ledger_file", ledgerFile);
        
        if (ledgerFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
          endpoint = "http://localhost:8000/upload-multiple-pdfs-with-ledger-xlsx";
        } else if (ledgerFile.type === "text/csv") {
          endpoint = "http://localhost:8000/upload-multiple-pdfs-with-ledger";
        }
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setCurrentJobId(result.job_id);
        setJobStatus({
          job_id: result.job_id,
          status: "processing",
          created_at: result.created_at,
          total_files: files.length,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          ledger_file: ledgerFile?.name,
          ledger_format: ledgerFile ? (ledgerFile.type === "text/csv" ? "csv" : "xlsx") : undefined
        });

        setFiles([]);
        setShowPromptConfig(false);
      } else {
        throw new Error(result.detail || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed: " + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const viewJobResults = async (jobId: string): Promise<void> => {
    setSelectedJobId(jobId);
    await fetchJobResults(jobId);
    await fetchJobStatus(jobId);
    await fetchExtractedCsvData(jobId);
  };

  const deleteJob = async (jobId: string): Promise<void> => {
    if (!confirm("Are you sure you want to delete this job? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/job/${jobId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchAllJobs();
        if (selectedJobId === jobId) {
          setSelectedJobId(null);
          setJobResults(null);
          setJobStatus(null);
          setExtractedCsvData(null);
        }
      } else {
        const error = await response.json();
        alert("Delete failed: " + error.detail);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Delete failed: " + (error as Error).message);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    handleFileSelect(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
  };

    const downloadCsvData = async (jobId: string): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:8000/job-results/${jobId}`);
      if (!response.ok) {
        alert(`Failed to fetch job results: ${response.status}`);
        return;
      }
      const data = await response.json();
      const invoiceRows: string[] = data?.extracted_csv_data?.csv_data?.invoice_rows || [];
      const deliveryRows: string[] = data?.extracted_csv_data?.csv_data?.delivery_note_rows || [];
      const anomalyRows: string[] = data?.extracted_csv_data?.csv_data?.anomaly_rows || [];

      const tableRows = buildFlatRows(invoiceRows, deliveryRows, anomalyRows);

      const csvEscape = (v: string) => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      let csv = HEADERS.map(csvEscape).join(",") + "\n";
      for (const row of tableRows) {
        csv += row.map(csvEscape).join(",") + "\n";
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted_data_${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed");
    }
  };

  // New: Excel download with colored header groups
  const downloadExcelData = async (jobId: string): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:8000/job-results/${jobId}`);
      if (!response.ok) {
        alert(`Failed to fetch job results: ${response.status}`);
        return;
      }
      const data = await response.json();
      const invoiceRows: string[] = data?.extracted_csv_data?.csv_data?.invoice_rows || [];
      const deliveryRows: string[] = data?.extracted_csv_data?.csv_data?.delivery_note_rows || [];
      const anomalyRows: string[] = data?.extracted_csv_data?.csv_data?.anomaly_rows || [];

      const tableRows = buildFlatRows(invoiceRows, deliveryRows, anomalyRows);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Extracted Data");

      // Header
      ws.addRow(HEADERS);
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.getRow(1).font = { bold: true };

      // Widths (12 columns)
      const widths = [14, 16, 20, 20, 12, 14, 18, 20, 16, 14, 20, 26];
      widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

      // Header group colors: Invoice (1-6), Delivery (7-11), Anomaly (12)
      const colorHeaderRange = (from: number, to: number, bg: string) => {
        for (let c = from; c <= to; c++) {
          const cell = ws.getCell(1, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            top: { style: "thin" }, bottom: { style: "thin" },
            left: { style: "thin" }, right: { style: "thin" },
          };
        }
      };
      colorHeaderRange(1, 6, "FFD9EAD3");   // light green
      colorHeaderRange(7, 11, "FFDCE6F1");  // light blue
      colorHeaderRange(12, 12, "FFFDE9D9"); // light amber

      // Data rows with colored cells
      const borderThin = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      } as const;

      const lightGreen = "FFF6FBF4"; // very light green
      const lightBlue = "FFF4F8FD";  // very light blue
      const lightAmber = "FFFFF6DD"; // very light amber

      for (const r of tableRows) {
        const row = ws.addRow(r);
        const rn = row.number;

        // Color invoice group cells
        for (let c = 1; c <= 6; c++) {
          const cell = ws.getCell(rn, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightGreen } };
          cell.border = borderThin;
        }
        // Color delivery group cells
        for (let c = 7; c <= 11; c++) {
          const cell = ws.getCell(rn, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
          cell.border = borderThin;
        }
        // Anomaly cell: color only if not empty
        const anomalyCell = ws.getCell(rn, 12);
        anomalyCell.border = borderThin;
        if (String(anomalyCell.value || "").trim()) {
          anomalyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightAmber } };
          anomalyCell.font = { color: { argb: "FF9C6500" }, bold: true };
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted_data_${jobId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download Excel failed:", error);
      alert("Download Excel failed");
    }
  };

  // Status handling functions
  const getStatusColor = (status: string): string => {
    switch (status || "unknown") {
      case "completed":
        return "text-emerald-600";
      case "processing":
        return "text-blue-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status || "unknown") {
      case "completed":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status || "unknown") {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatAnalysisResponse = (response: string) => {
    // Enhanced formatting for structured response
    const sections = response.split(/(?=##\s)/g);
    return sections.map((section, index) => {
      if (section.trim().startsWith('##')) {
        const lines = section.split('\n');
        const heading = lines[0].replace(/^##\s*/, '');
        const content = lines.slice(1).join('\n');
        
        return (
          <div key={index} className="mb-6">
            <h3 className="text-lg font-semibold mb-3 pb-2 border-b-2 border-purple-200 text-purple-800">
              {heading}
            </h3>
            <div className="pl-4">
              {content.split(/(?=###\s)/g).map((subsection, subIndex) => {
                if (subsection.trim().startsWith('###')) {
                  const subLines = subsection.split('\n');
                  const subHeading = subLines[0].replace(/^###\s*/, '');
                  const subContent = subLines.slice(1).join('\n');
                  return (
                    <div key={subIndex} className="mb-4">
                      <h4 className="font-medium text-gray-700 mb-2">{subHeading}</h4>
                      <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 p-3 rounded border">
                        {subContent.trim()}
                      </pre>
                    </div>
                  );
                } else if (subsection.trim()) {
                  return (
                    <pre key={subIndex} className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 p-3 rounded border mb-3">
                      {subsection.trim()}
                    </pre>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      } else if (section.trim()) {
        return (
          <pre key={index} className="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 p-3 rounded border mb-4">
            {section.trim()}
          </pre>
        );
      }
      return null;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Intelligent Document Processor
                </h1>
                <p className="text-gray-600 mt-1">
                  Advanced OCR + AI Analysis with DeepSeek + Ledger Integration
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowGlobalLedger(!showGlobalLedger)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              >
                <Database className="h-4 w-4" />
                <span>Global Ledger</span>
              </button>
              <button
                onClick={fetchAllJobs}
                disabled={refreshing}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Ledger Section */}
      {showGlobalLedger && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="bg-white rounded-2xl shadow-lg border border-green-200 mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <Globe className="h-6 w-6 text-green-600" />
                  <h2 className="text-2xl font-semibold text-gray-900">
                    Global Ledger
                  </h2>
                </div>
                <button
                  onClick={() => setShowGlobalLedger(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <p className="text-gray-600 mb-6">
                The global ledger contains all extracted data from processed jobs in a centralized file.
                Download in your preferred format to view all accumulated data.
              </p>
              
              <div className="flex space-x-4">
                <button 
                  onClick={() => downloadGlobalLedger('csv')}
                  className="flex items-center space-x-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="h-5 w-5" />
                  <span>Download CSV Ledger</span>
                </button>
                <button 
                  onClick={() => downloadGlobalLedger('xlsx')}
                  className="flex items-center space-x-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <FileSpreadsheet className="h-5 w-5" />
                  <span>Download Excel Ledger</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-8">
          <div className="p-8">
            <div className="flex items-center space-x-3 mb-6">
              <FileText className="h-6 w-6 text-blue-600" />
              <h2 className="text-2xl font-semibold text-gray-900">
                Upload Documents
              </h2>
            </div>

            {/* Drop Zone */}
            <div
              className="border-2 border-dashed border-blue-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-300 cursor-pointer group"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="group-hover:scale-110 transition-transform duration-300">
                <Upload className="mx-auto h-16 w-16 text-blue-400 mb-4" />
              </div>
              <p className="text-xl text-gray-700 font-medium mb-2">
                Drop your PDF documents here or click to browse
              </p>
              <p className="text-gray-500">
                Supports multiple PDF files up to 10MB each
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Ledger CSV/XLSX Upload */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center space-x-3 mb-3">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <label className="text-sm font-semibold text-gray-700">
                  Ledger File (Optional - for automatic ledger updates):
                </label>
              </div>
              <div className="flex items-center space-x-4">
                <input
                  ref={ledgerInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleLedgerFileSelect}
                  className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-green-50 file:text-green-700
                            hover:file:bg-green-100"
                />
                {ledgerFile && (
                  <div className="flex items-center space-x-2 text-sm text-green-700 bg-green-100 px-3 py-1 rounded-lg">
                    <CheckCircle className="h-4 w-4" />
                    <span>{ledgerFile.name}</span>
                    <button
                      onClick={() => {
                        setLedgerFile(null);
                        if (ledgerInputRef.current) ledgerInputRef.current.value = '';
                      }}
                      className="text-green-600 hover:text-green-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Upload your ledger file (CSV or Excel) to automatically append extracted invoice and delivery note data
              </p>
            </div>

            {/* Prompt Configuration Toggle */}
            <div className="mt-6">
              <button
                onClick={() => setShowPromptConfig(!showPromptConfig)}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                {showPromptConfig ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span>Advanced Configuration</span>
              </button>
            </div>

            {/* Prompt Configuration */}
            {showPromptConfig && (
              <div className="mt-6 space-y-6 p-6 bg-gray-50 rounded-xl border">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    System Prompt (AI Instructions):
                  </label>
                  <textarea
                    rows={12}
                    className="w-full border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Define how the AI should process your documents..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Analysis Prompt (Specific Request):
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="What specific analysis do you want?"
                  />
                </div>
              </div>
            )}

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Selected Files ({files.length})
                </h3>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {files.map((fileItem) => (
                    <div
                      key={fileItem.id}
                      className="flex items-center justify-between p-4 bg-white rounded-lg border-2 border-gray-100 hover:border-blue-200 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <File className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {fileItem.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(fileItem.size)} • PDF Document
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFile(fileItem.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
                        disabled={uploading}
                      >
                        <X className="h-5 w-5 text-gray-400 group-hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Process Button */}
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={uploadFiles}
                    disabled={uploading || files.length === 0}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-5 w-5" />
                        <span>
                          Process {files.length} Document
                          {files.length > 1 ? "s" : ""} with AI
                          {ledgerFile && ` + Update ${ledgerFile.type === "text/csv" ? "CSV" : "Excel"} Ledger`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Job Status */}
        {jobStatus && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-800">
                  Current Processing Job
                </h3>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeColor(
                    jobStatus?.status || "unknown"
                  )}`}
                >
                  {jobStatus?.status
                    ? jobStatus.status.charAt(0).toUpperCase() +
                      jobStatus.status.slice(1)
                    : "Unknown"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-800">
                    {jobStatus.job_id}
                  </div>
                  <div className="text-sm text-gray-600">Job ID</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-center space-x-2">
                    {getStatusIcon(jobStatus?.status || "unknown")}
                    <span className="text-2xl font-bold text-gray-800">
                      {jobStatus?.status
                        ? jobStatus.status.charAt(0).toUpperCase() +
                          jobStatus.status.slice(1)
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">Status</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-800">
                    {jobStatus.total_files}
                  </div>
                  <div className="text-sm text-gray-600">PDF Files</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-center space-x-2">
                    {jobStatus.ledger_file ? (
                      <>
                        <FileSpreadsheet className="h-6 w-6 text-green-600" />
                        <span className="text-sm font-medium text-green-700">
                          {jobStatus.ledger_format === "xlsx" ? "Excel Ledger" : "CSV Ledger"}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500">No Ledger</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">Integration</div>
                </div>
              </div>

              {jobStatus.status === "processing" && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="font-medium text-blue-800">
                        Processing in Progress
                      </p>
                      <p className="text-sm text-blue-600">
                        {jobStatus.ledger_file 
                          ? `Extracting data with OCR, analyzing with AI, and updating ${jobStatus.ledger_format === "xlsx" ? "Excel" : "CSV"} ledger...`
                          : "Extracting text with OCR and preparing for AI analysis..."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {jobStatus.error && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">
                        Processing Error
                      </p>
                      <p className="text-sm text-red-600 mt-1">
                        {jobStatus.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job Results */}
        {jobResults && selectedJobId && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-800">
                  Analysis Results: {jobResults.job_id}
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => downloadCsvData(jobResults.job_id)}
                    className="flex items-center space-x-2 px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download CSV Data</span>
                  </button>
                  <button
                    onClick={() => downloadExcelData(jobResults.job_id)}
                    className="flex items-center space-x-2 px-3 py-1 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Download Excel Data</span>
                  </button>
                  <button
                    onClick={() =>
                      copyToClipboard(jobResults.llm_analysis?.response || "")
                    }
                    className="flex items-center space-x-2 px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span>{copied ? "Copied!" : "Copy Results"}</span>
                  </button>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-3xl font-bold text-emerald-600">
                    {jobResults.successfully_processed}
                  </div>
                  <div className="text-sm text-emerald-700 font-medium">
                    Success
                  </div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-3xl font-bold text-red-600">
                    {jobResults.failed_files}
                  </div>
                  <div className="text-sm text-red-700 font-medium">
                    Failed
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-3xl font-bold text-blue-600">
                    {Math.round((jobResults.llm_analysis?.total_tokens || 0) / 1000)}K
                  </div>
                  <div className="text-sm text-blue-700 font-medium">
                    Tokens Used
                  </div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-3xl font-bold text-purple-600">
                    {jobResults.processed_files?.reduce((sum, file) => sum + (file.tables_extracted || 0), 0) || 0}
                  </div>
                  <div className="text-sm text-purple-700 font-medium">
                    Tables Extracted
                  </div>
                </div>
              </div>

              {/* Processed Files */}
              <div className="mb-8">
                <h4 className="font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span>Processed Documents</span>
                </h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {jobResults.processed_files?.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-white rounded border"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-semibold text-blue-600">
                            {file.file_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {file.original_filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {file.ocr_result?.total_pages} pages • {file.ocr_result?.total_words} words • {file.tables_extracted} tables
                            </p>
                          </div>
                        </div>
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Extracted CSV Data Section */}
              {extractedCsvData && (
                <div className="mb-8">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                    <Package className="h-5 w-5 text-green-600" />
                    <span>Extracted Structured Data</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-2xl font-bold text-green-600">
                        {extractedCsvData.csv_data.invoice_rows.length}
                      </div>
                      <div className="text-sm text-green-700 font-medium">
                        Invoice Records
                      </div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="text-2xl font-bold text-blue-600">
                        {extractedCsvData.csv_data.delivery_note_rows.length}
                      </div>
                      <div className="text-sm text-blue-700 font-medium">
                        Delivery Notes
                      </div>
                    </div>
                    <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="text-2xl font-bold text-amber-600">
                        {extractedCsvData.csv_data.anomaly_rows.length}
                      </div>
                      <div className="text-sm text-amber-700 font-medium">
                        Anomalies Found
                      </div>
                    </div>
                  </div>
                  
                  {/* Ledger Update Information */}
                  {jobResults.ledger_update && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                        <h5 className="font-medium text-green-800">Ledger Update Summary</h5>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="bg-white rounded px-3 py-2 border border-green-100">
                          <span className="font-medium text-green-700">
                            {jobResults.ledger_update.invoice_rows_added} invoice rows added
                          </span>
                        </div>
                        <div className="bg-white rounded px-3 py-2 border border-green-100">
                          <span className="font-medium text-green-700">
                            {jobResults.ledger_update.delivery_note_rows_added} delivery note rows added
                          </span>
                        </div>
                        <div className="bg-white rounded px-3 py-2 border border-green-100">
                          <span className="font-medium text-green-700">
                            {jobResults.ledger_update.anomaly_rows_added} anomaly rows added
                          </span>
                        </div>
                        <div className="bg-white rounded px-3 py-2 border border-green-100">
                          <span className="font-medium text-green-700">
                            Format: {jobResults.ledger_update.format || "CSV"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* CSV Data Previews */}
                  {extractedCsvData.csv_data.invoice_rows.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-700 mb-2">Invoice Data:</h5>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono overflow-x-auto">
                        <div className="text-gray-600 mb-1">Invoice date,Invoice ID,Customer name,Invoice amount (No VAT),VAT,Total Amount</div>
                        {extractedCsvData.csv_data.invoice_rows.slice(0, 3).map((row, i) => (
                          <div key={i} className="text-gray-800">{row}</div>
                        ))}
                        {extractedCsvData.csv_data.invoice_rows.length > 3 && (
                          <div className="text-gray-500">... and {extractedCsvData.csv_data.invoice_rows.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )}

                  {extractedCsvData.csv_data.delivery_note_rows.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-700 mb-2">Delivery Note Data:</h5>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono overflow-x-auto">
                        <div className="text-gray-600 mb-1">Delivery note date,Delivery note number,Invoice number,Invoice date,Customer name</div>
                        {extractedCsvData.csv_data.delivery_note_rows.slice(0, 3).map((row, i) => (
                          <div key={i} className="text-gray-800">{row}</div>
                        ))}
                        {extractedCsvData.csv_data.delivery_note_rows.length > 3 && (
                          <div className="text-gray-500">... and {extractedCsvData.csv_data.delivery_note_rows.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )}

                  {extractedCsvData.csv_data.anomaly_rows.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-700 mb-2">Anomalies:</h5>
                      <div className="bg-amber-50 rounded-lg p-3 text-sm">
                        {extractedCsvData.csv_data.anomaly_rows.map((anomaly, i) => (
                          <div key={i} className="text-amber-800 mb-1">• {anomaly}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Analysis Results */}
              {jobResults.llm_analysis && (
                <div className="mb-8">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                    <Brain className="h-5 w-5 text-purple-600" />
                    <span>AI Analysis Results</span>
                  </h4>

                  <div className="mb-4 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Model:</span> {jobResults.llm_analysis.model_used}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-6 border-l-4 border-purple-400 shadow-sm">
                    <div className="prose max-w-none">
                      {formatAnalysisResponse(jobResults.llm_analysis.response)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Jobs List */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-800">
                Job History
              </h3>
              <span className="text-sm text-gray-500">
                {allJobs.length} total jobs
              </span>
            </div>

            {allJobs.length > 0 ? (
              <div className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Job ID
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Files
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Type
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Created
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {allJobs.map((job) => (
                        <tr
                          key={job.job_id}
                          className={`hover:bg-gray-50 transition-colors ${
                            selectedJobId === job.job_id ? "bg-blue-50" : ""
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="font-mono text-sm text-gray-800">
                              {job.job_id}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(job.status)}
                              <span
                                className={`text-sm font-medium ${getStatusColor(
                                  job.status
                                )}`}
                              >
                                {job.status.charAt(0).toUpperCase() +
                                  job.status.slice(1)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">
                              {job.total_files} files
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-1">
                              {job.ledger_file ? (
                                <>
                                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                  <span className="text-sm text-green-700">
                                    {job.ledger_format === "xlsx" ? "Excel Ledger" : "CSV Ledger"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <FileText className="h-4 w-4 text-blue-600" />
                                  <span className="text-sm text-blue-700">Analysis Only</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">
                              {new Date(job.created_at).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => viewJobResults(job.job_id)}
                                className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                                disabled={job.status === "processing"}
                              >
                                <Eye className="h-4 w-4" />
                                <span>View</span>
                              </button>
                              <button
                                onClick={() => deleteJob(job.job_id)}
                                className="flex items-center space-x-1 text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">No jobs found</p>
                <p className="text-gray-400 text-sm">
                  Upload some PDFs to get started with AI analysis and ledger integration!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentUploader;
