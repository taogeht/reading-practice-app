"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QrCode, Copy, Download, Share2 } from "lucide-react";

interface ClassQRCodeProps {
  classId: string;
  className: string;
}

export function ClassQRCode({ classId, className }: ClassQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const studentLoginUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/student-login/${classId}`;

  const generateQRCode = async () => {
    setIsGenerating(true);
    try {
      // Using a free QR code API service
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(studentLoginUrl)}`;
      setQrCodeUrl(qrApiUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(studentLoginUrl);
    // Could add a toast notification here
  };

  const downloadQRCode = () => {
    if (qrCodeUrl) {
      const link = document.createElement('a');
      link.href = qrCodeUrl;
      link.download = `${className}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={generateQRCode}
        >
          <QrCode className="w-4 h-4 mr-2" />
          Class QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Student Login QR Code
          </DialogTitle>
          <DialogDescription>
            Students can scan this QR code to access the login page for {className}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* QR Code Display */}
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                {isGenerating ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : qrCodeUrl ? (
                  <div className="space-y-4">
                    <img
                      src={qrCodeUrl}
                      alt={`QR Code for ${className}`}
                      className="mx-auto border rounded-lg"
                      width={300}
                      height={300}
                    />
                    <p className="text-xs text-gray-500">
                      Scan with any QR code reader or camera app
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-gray-400">
                    <QrCode className="w-16 h-16" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* URL Display */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Direct Link</CardTitle>
              <CardDescription className="text-xs">
                Share this link directly with students
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center space-x-2">
                <div className="flex-1 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                  {studentLoginUrl}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={downloadQRCode}
              disabled={!qrCodeUrl}
            >
              <Download className="w-4 h-4 mr-2" />
              Download QR
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: `${className} - Student Login`,
                    text: `Join ${className} for reading practice`,
                    url: studentLoginUrl,
                  });
                } else {
                  copyToClipboard();
                }
              }}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share Link
            </Button>
          </div>

          {/* Instructions */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h4 className="font-medium text-blue-800 mb-2 text-sm">How to use:</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Share the QR code with your students</li>
                <li>• Students scan the code with their device camera</li>
                <li>• They'll see only students from {className}</li>
                <li>• Students can then log in with their visual password</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}