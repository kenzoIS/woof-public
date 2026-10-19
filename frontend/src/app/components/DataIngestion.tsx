import { useState, useEffect, useCallback } from "react";
import { Upload, Trash2, FileSpreadsheet, Database, ShoppingCart, DollarSign, Hash, Radio, AlertTriangle, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast } from "sonner";
import { uploadCSV, getUploads, deleteUpload, getMetrics } from "../lib/api";

interface CsvUploadRecord {
  _id: string;
  id?: string;
  filename: string;
  file_name?: string;
  channel: string;
  recordCount?: number;
  record_count?: number;
  totalRevenue?: number;
  total_revenue?: number;
  totalQuantity?: number;
  total_quantity?: number;
  totalTransactions?: number;
  total_transactions?: number;
  uploadedAt?: string;
  uploaded_at?: string;
  created_at?: string;
  etlReport?: {
    stage1_droppedCount?: number;
    stage1_duplicateCount?: number;
    stage1_dropReasons?: string[];
    stage2_droppedCount?: number;
    stage2_dropReasons?: string[];
  };
}

interface Metrics {
  totalRecords: number;
  totalTransactions: number;
  totalQuantity: number;
  totalRevenue: number;
  channels: Record<string, { count: number; revenue: number }>;
  uploadCount: number;
}

const CHANNEL_OPTIONS = [
  { value: "POS", label: "POS", description: "Cafe, Services & Retail", color: "#F53799" },
  { value: "Shopee", label: "Shopee", description: "Retail only", color: "#EE4D2D" },
  { value: "TikTok", label: "TikTok", description: "Retail only", color: "#000000" },
  { value: "PetHub", label: "PetHub", description: "Cafe, Services & Retail", color: "#06B6D4" },
];

const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatNumber = (value: unknown) => toNumber(value).toLocaleString();

const formatCurrency = (value: unknown) => `₱${formatNumber(value)}`;

interface DataIngestionProps {
  surface?: "card" | "drawer";
}

export function DataIngestion({ surface = "card" }: DataIngestionProps = {}) {
  const isDrawer = surface === "drawer";
  const [uploads, setUploads] = useState<CsvUploadRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>("POS");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  const [lastReport, setLastReport] = useState<any>(null);
  const [lastWebhookEvent, setLastWebhookEvent] = useState<{ transactionId: string; recordCount: number; timestamp: string } | null>(null);

  const numberOrZero = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatUploadDate = (value?: string) => {
    if (!value) return "Unknown date";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Unknown date" : parsed.toLocaleDateString();
  };

  const refreshData = useCallback(async () => {
    try {
      const [uploadsRes, metricsRes] = await Promise.all([getUploads(), getMetrics()]);
      setUploads(uploadsRes.uploads || []);
      setMetrics(metricsRes);
      setConnectionError(null);
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Backend unavailable",
      );
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type, data, timestamp } = customEvent.detail;
      
      if (type === 'upload_processed' || type === 'etl_completed' || type === 'etl_started') {
        refreshData();
      }

      if (type === 'upload_processed' && data?.channel === 'PetHub' && data?.transactionId) {
        setLastWebhookEvent({
          transactionId: data.transactionId,
          recordCount: data.recordCount || 0,
          timestamp: timestamp || new Date().toISOString()
        });
        setLastReport(null);
      }
    };

    window.addEventListener("woof:realtime", handleRealtime);
    return () => window.removeEventListener("woof:realtime", handleRealtime);
  }, [refreshData]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setConnectionError(null);
    setLastReport(null);
    try {
      const res = await uploadCSV(file, selectedChannel);
      toast.success("CSV uploaded successfully!", { description: `${file.name} processed as ${selectedChannel}.` });
      if (res?.report) {
        setLastReport({ filename: file.name, ...res.report });
      }
      await refreshData();
    } catch (err: any) {
      setConnectionError(err.message);
      toast.error("Upload failed", { description: err.message });
      await refreshData();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    try {
      setDeletingIds((prev) => [...prev, id]);
      await deleteUpload(id);
      toast.success("Deleted", { description: `${filename} removed.` });
      await refreshData();
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    } finally {
      setDeletingIds((prev) => prev.filter((prevId) => prevId !== id));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const channelColor: Record<string, string> = {
    POS: "#F53799",
    Shopee: "#EE4D2D",
    TikTok: "#000000",
    "TikTok Shop": "#000000",
    PetHub: "#06B6D4",
  };

  return (
    <div
      className={
        isDrawer
          ? "bg-white space-y-4"
          : "bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-5"
      }
    >
      <div>
        <h2 className={isDrawer ? "text-xl font-extrabold text-[#223047]" : "text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]"}>
          {isDrawer ? "Upload Data" : "Data Ingestion Center"}
        </h2>
        <p className={isDrawer ? "text-xs text-[#223047] opacity-60 mt-1" : "text-xs md:text-sm text-[#223047] opacity-60 mt-1"} style={{ lineHeight: "1.6" }}>
          {isDrawer
            ? "Upload CSV/Excel files and monitor recent staging activity."
            : "Upload CSV/Excel files from POS, Shopee, TikTok, or PetHub to power your analytics. Totals below cover all uploaded data."}
        </p>
      </div>

      {connectionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-semibold">Upload needs attention</div>
          <div className="mt-1">{connectionError}</div>
        </div>
      )}

      {/* Metric Cards */}
      <div className={isDrawer ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-2 lg:grid-cols-5 gap-3"}>
        {[
          { label: isDrawer ? "Records" : "All Records", value: formatNumber(metrics?.totalRecords), icon: Database, color: "#F53799" },
          { label: isDrawer ? "Transactions" : "All Transactions", value: formatNumber(metrics?.totalTransactions), icon: Hash, color: "#06B6D4" },
          { label: isDrawer ? "Quantity" : "All Quantity Sold", value: formatNumber(metrics?.totalQuantity), icon: ShoppingCart, color: "#0EA5E9" },
          { label: isDrawer ? "Revenue" : "All Revenue", value: formatCurrency(metrics?.totalRevenue), icon: DollarSign, color: "#F53799" },
          { label: "Channels", value: Object.keys(metrics?.channels || {}).length.toString(), icon: Radio, color: "#7C3AED" },
        ].map((card) => (
          <div
            key={card.label}
            className={
              isDrawer
                ? "flex items-center gap-2 min-w-0 bg-[#FFF2FA] border border-[#FFD9EC] rounded-xl px-3 py-2.5"
                : "flex items-center gap-2 bg-[#FFF2FA] border border-[#FFD9EC] rounded-xl px-3 py-2.5"
            }
          >
            <div className={isDrawer ? "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" : "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"}
              style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}dd)` }}>
              <card.icon className={isDrawer ? "w-3.5 h-3.5 text-white" : "w-4 h-4 text-white"} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[#223047] opacity-60 truncate">{card.label}</div>
              <div className={isDrawer ? "text-sm font-bold text-[#223047] truncate" : "text-sm font-bold text-[#223047]"}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Channel Breakdown */}
      {metrics?.channels && Object.keys(metrics.channels).length > 0 && (
        <div className={isDrawer ? "space-y-2" : "flex flex-wrap gap-2"}>
          {Object.entries(metrics.channels).map(([ch, data]) => (
            isDrawer ? (
              <div key={ch} className="flex items-center justify-between gap-3 rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: channelColor[ch] || "#666" }} />
                  <span className="font-semibold text-[#223047] truncate">{ch}</span>
                </div>
                <div className="text-right text-[#223047] opacity-70 flex-shrink-0">
                  {formatNumber(data?.count)} • {formatCurrency(data?.revenue)}
                </div>
              </div>
            ) : (
              <Badge key={ch} className="text-xs px-3 py-1" style={{ backgroundColor: channelColor[ch] || "#666", color: "#fff" }}>
                {ch}: {formatNumber(data?.count)} records • {formatCurrency(data?.revenue)}
              </Badge>
            )
          ))}
        </div>
      )}

      {/* Channel Selector + Upload Dropzone */}
      <div className="space-y-3">
        <div className={isDrawer ? "space-y-2" : "flex flex-col sm:flex-row items-start sm:items-center gap-3"}>
          <label className="text-sm font-semibold text-[#223047]">CSV Category</label>
          <div className={isDrawer ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
            {CHANNEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedChannel(opt.value)}
                className={`flex items-center gap-2 rounded-xl border-2 transition-all font-medium min-w-0 ${
                  selectedChannel === opt.value
                    ? "border-[#F53799] bg-[#FFF2FA] text-[#223047]"
                    : "border-[#FFD9EC] bg-white text-[#223047] opacity-70 hover:border-[#F53799] hover:opacity-100"
                } ${isDrawer ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"}`}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                <span className="truncate">{opt.label}</span>
                {!isDrawer && <span className="text-xs opacity-50">({opt.description})</span>}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
            dragActive ? "border-[#F53799] bg-[#FFF2FA]" : "border-[#FFD9EC] hover:border-[#F53799] hover:bg-[#FFF7FB]"
          } ${isDrawer ? "p-5" : "p-6 md:p-8"}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("csv-upload-input")?.click()}
        >
          <input id="csv-upload-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} className="hidden" />
          <Upload className={`${isDrawer ? "w-7 h-7 mb-2" : "w-8 h-8 mb-3"} mx-auto ${uploading ? "animate-bounce text-[#F53799]" : "text-[#223047] opacity-40"}`} />
          <p className={isDrawer ? "text-sm font-semibold text-[#223047]" : "text-sm font-semibold text-[#223047]"}>
            {uploading ? "Processing..." : isDrawer ? "Drop file or click to browse" : "Drop CSV/Excel file here or click to browse"}
          </p>
          <p className="text-xs text-[#223047] opacity-50 mt-1">
            Maximum upload size: 100 MB
          </p>
          <p className="text-xs text-[#223047] opacity-50 mt-1 max-w-[320px] mx-auto">
            Uploading as <span className="font-bold text-[#F53799]">{selectedChannel}</span>
            {!isDrawer && (selectedChannel === "POS" || selectedChannel === "PetHub"
              ? " -> rows split into Cafe, Services & Retail by category"
              : " -> all rows go to Retail")}
          </p>
        </div>
      </div>

      {/* Latest Upload Report */}
      {lastReport && (
        <div className={`p-4 rounded-xl border ${lastReport.stage1_droppedCount > 0 || lastReport.stage1_duplicateCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-start gap-3">
            {lastReport.stage1_droppedCount > 0 || lastReport.stage1_duplicateCount > 0 ? (
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className={`text-sm font-bold ${lastReport.stage1_droppedCount > 0 || lastReport.stage1_duplicateCount > 0 ? 'text-orange-800' : 'text-green-800'}`}>
                {lastReport.filename} processed
              </h4>
              <p className={`text-xs mt-1 ${lastReport.stage1_droppedCount > 0 || lastReport.stage1_duplicateCount > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {lastReport.stage1_droppedCount > 0 || lastReport.stage1_duplicateCount > 0
                  ? `Dropped: ${lastReport.stage1_droppedCount} invalid rows, ${lastReport.stage1_duplicateCount} duplicates.`
                  : "All rows passed validation!"}
              </p>
              {lastReport.stage1_dropReasons && lastReport.stage1_dropReasons.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-semibold text-orange-800">Sample Errors:</p>
                  <ul className="text-[10px] text-orange-700 list-disc pl-4 space-y-0.5">
                    {lastReport.stage1_dropReasons.slice(0, 5).map((reason: string, i: number) => (
                      <li key={i}>{reason}</li>
                    ))}
                    {lastReport.stage1_dropReasons.length > 5 && (
                      <li className="italic">...and {lastReport.stage1_dropReasons.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Latest Webhook Report */}
      {lastWebhookEvent && !lastReport && (
        <div className="p-4 rounded-xl border bg-[#ECFEFF] border-[#A5F3FC]">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#06B6D4] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-[#164E63]">
                Ingested PetHub data via Webhook: {lastWebhookEvent.transactionId}
              </h4>
              <p className="text-xs mt-1 text-[#155E75]">
                Successfully staged {lastWebhookEvent.recordCount} records. They will appear in analytics shortly.
              </p>
              <div className="text-[10px] mt-1 text-[#164E63] opacity-80">
                Received at: {new Date(lastWebhookEvent.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload History */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#223047]">Upload History</h3>
          <div className={isDrawer ? "space-y-2 max-h-[360px] overflow-y-auto pr-1" : "space-y-2 max-h-[250px] overflow-y-auto"}>
            {uploads.map((upload, index) => {
              const uploadId = upload._id || upload.id || upload.filename || upload.file_name || `upload-${index}`;
              const filename = upload.filename || upload.file_name || "Uploaded file";
              const recordCount = numberOrZero(upload.recordCount ?? upload.record_count);
              const totalRevenue = numberOrZero(upload.totalRevenue ?? upload.total_revenue);
              const uploadedAt = upload.uploadedAt || upload.uploaded_at || upload.created_at;

              return (
              <div
                key={uploadId}
                className={
                  isDrawer
                    ? "flex items-start justify-between gap-2 p-3 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl"
                    : "flex items-center justify-between p-3 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl"
                }
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <FileSpreadsheet className="w-5 h-5 text-[#F53799] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#223047] truncate">{filename}</div>
                    <div className="text-xs text-[#223047] opacity-50 leading-relaxed">
                      {isDrawer ? (
                        <>
                          <span>{upload.channel || "Unknown"} • {formatUploadDate(uploadedAt)}</span>
                          <br />
                          <span>{formatNumber(recordCount)} records • {formatCurrency(totalRevenue)}</span>
                        </>
                      ) : (
                        <>
                          {formatNumber(recordCount)} records • {formatCurrency(totalRevenue)} • {upload.channel || "Unknown"}
                          {" • "}{formatUploadDate(uploadedAt)}
                        </>
                      )}
                    </div>
                    {upload.etlReport && (
                      <div className={`text-[10px] mt-1 ${(upload.etlReport.stage1_droppedCount || 0) > 0 || (upload.etlReport.stage1_duplicateCount || 0) > 0 ? "text-orange-500" : "text-green-500"}`}>
                        {(upload.etlReport.stage1_droppedCount || 0) > 0 || (upload.etlReport.stage1_duplicateCount || 0) > 0 
                          ? `Stage 1: ${upload.etlReport.stage1_droppedCount || 0} dropped, ${upload.etlReport.stage1_duplicateCount || 0} dupes`
                          : "Stage 1: 100% Valid"}
                        {upload.etlReport.stage2_droppedCount ? ` | Stage 2 DB Errors: ${upload.etlReport.stage2_droppedCount}` : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className={isDrawer ? "flex flex-col gap-2 flex-shrink-0" : "flex gap-2 ml-2"}>
                  {upload.etlReport && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm" variant="outline"
                          className="border-[#FFD9EC] text-[#F53799] hover:bg-[#FFF0F7] flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent onClick={(e) => e.stopPropagation()}>
                        <DialogHeader>
                          <DialogTitle>ETL Summary Report</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto mt-2 pr-2">
                          <div>
                            <h4 className="font-semibold text-sm mb-1">Stage 1: Data Validation</h4>
                            <p className="text-sm text-gray-600">Dropped Rows: {upload.etlReport.stage1_droppedCount || 0}</p>
                            <p className="text-sm text-gray-600">Exact Duplicates: {upload.etlReport.stage1_duplicateCount || 0}</p>
                            {(upload.etlReport.stage1_dropReasons?.length || 0) > 0 && (
                              <div className="mt-2 bg-orange-50 p-3 rounded-lg text-xs text-orange-800 border border-orange-100">
                                <span className="font-semibold text-sm">Drop Reasons:</span>
                                <ul className="list-disc pl-4 mt-2 space-y-1 font-mono text-[11px] max-h-[150px] overflow-y-auto">
                                  {upload.etlReport.stage1_dropReasons?.map((reason, i) => (
                                    <li key={i}>{reason}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          {upload.etlReport.stage2_droppedCount !== undefined && (
                            <div>
                              <h4 className="font-semibold text-sm mb-1">Stage 2: Database Ingestion</h4>
                              <p className="text-sm text-gray-600">DB Insert Errors: {upload.etlReport.stage2_droppedCount}</p>
                              {(upload.etlReport.stage2_dropReasons?.length || 0) > 0 && (
                                <div className="mt-2 bg-red-50 p-3 rounded-lg text-xs text-red-800 border border-red-100">
                                  <span className="font-semibold text-sm">DB Error Logs:</span>
                                  <ul className="list-disc pl-4 mt-2 space-y-1 font-mono text-[11px] max-h-[150px] overflow-y-auto">
                                    {upload.etlReport.stage2_dropReasons?.map((reason, i) => (
                                      <li key={i}>{reason}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Button
                    size="sm" variant="outline"
                    className="border-red-200 text-red-500 hover:bg-red-50 flex-shrink-0"
                    disabled={deletingIds.includes(String(uploadId))}
                    onClick={(e) => { e.stopPropagation(); handleDelete(String(uploadId), filename); }}
                  >
                    {deletingIds.includes(String(uploadId)) ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
