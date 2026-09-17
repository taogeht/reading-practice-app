"use client";

import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface TeacherQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeacherQrModal({ open, onOpenChange }: TeacherQrModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printCardRef = useRef<HTMLDivElement>(null);

  const fetchToken = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/teacher/qr-login");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load login QR state");
      }
      const data = await res.json();
      setHasToken(data.hasToken);
      setLoginUrl(data.loginUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchToken();
    }
  }, [open]);

  const handleGenerate = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/teacher/qr-login", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate QR token");
      }
      const data = await res.json();
      setHasToken(data.hasToken);
      setLoginUrl(data.loginUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm("Revoke this QR code? Any printed badges with this code will immediately stop working.")) {
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/teacher/qr-login", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke QR token");
      }
      setHasToken(false);
      setLoginUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!loginUrl) return;
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handlePrintBadge = () => {
    if (!loginUrl || !user) return;
    const printWindow = window.open("", "_blank", "width=600,height=700");
    if (!printWindow) {
      alert("Please allow popups to print your badge.");
      return;
    }

    const teacherName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Teacher";
    const teacherEmail = user.email || "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Teacher Login Pass - ${teacherName}</title>
          <style>
            @page { size: auto; margin: 0.5in; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f8fafc;
            }
            .badge-card {
              width: 3.4in;
              height: 4.8in;
              background: #ffffff;
              border: 2px dashed #94a3b8;
              border-radius: 16px;
              padding: 24px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
              box-sizing: border-box;
            }
            .role-tag {
              display: inline-block;
              background: #dbeafe;
              color: #1e40af;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              padding: 4px 10px;
              border-radius: 9999px;
            }
            .name {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 8px;
            }
            .email {
              font-size: 12px;
              color: #64748b;
              margin-top: 2px;
            }
            .qr-box {
              padding: 8px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #ffffff;
            }
            .instructions {
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              border-radius: 8px;
              padding: 8px 12px;
              color: #166534;
              font-size: 12px;
              font-weight: 600;
            }
            .footer {
              font-size: 10px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="badge-card">
            <div>
              <span class="role-tag">Teacher Login Pass</span>
              <div class="name">${teacherName}</div>
              <div class="email">${teacherEmail}</div>
            </div>

            <div class="qr-box">
              ${printCardRef.current?.querySelector("svg")?.outerHTML || ""}
            </div>

            <div class="instructions">
              Point camera to instantly log in without typing password
            </div>

            <div class="footer">
              Keep this pass secure. Invalidate anytime in Teacher Settings.
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const teacherFullName =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Teacher";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <QrCode className="w-5 h-5 text-blue-600" />
            My Login QR Pass
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Scan this code on any device with a camera to instantly log into your teacher account without entering your password.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">Loading login token…</span>
          </div>
        ) : hasToken && loginUrl ? (
          <div className="flex flex-col items-center space-y-4 py-2">
            {/* Visual Badge Card */}
            <div
              ref={printCardRef}
              className="w-full max-w-[280px] bg-white border-2 border-dashed border-blue-200 rounded-xl p-5 shadow-xs flex flex-col items-center text-center space-y-3"
            >
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                  Teacher Pass
                </span>
                <div className="text-lg font-bold text-gray-900 mt-1">
                  {teacherFullName}
                </div>
                <div className="text-xs text-gray-500">{user?.email}</div>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-gray-100 shadow-xs">
                <QRCodeSVG value={loginUrl} size={160} level="M" />
              </div>

              <div className="w-full bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-800 font-medium">
                Scan with phone camera or webcam
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handlePrintBadge}
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Print Badge
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="w-4 h-4 mr-1.5 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 mr-1.5" />
                )}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>

            {/* Security notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full flex items-start gap-2.5 text-xs text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-normal">
                <span className="font-semibold">Security Tip: </span>
                Anyone with access to this QR code can access your teacher dashboard. If you misplace a printed copy, click below to immediately revoke it.
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <QrCode className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">No active QR pass</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Generate a secure personal QR code so you can log in on classroom devices with a single scan.
              </p>
            </div>
            <Button onClick={handleGenerate} disabled={actionLoading} className="mx-auto">
              {actionLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4 mr-2" />
              )}
              {actionLoading ? "Generating…" : "Generate My Login QR"}
            </Button>
          </div>
        )}

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full border-t pt-3 mt-2">
          {hasToken ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={actionLoading}
                className="text-xs text-gray-600 hover:text-gray-900"
                title="Generate a new QR code and invalidate the old one"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Reset Code
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                disabled={actionLoading}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Disable QR login completely"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Revoke
              </Button>
            </div>
          ) : (
            <div />
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
