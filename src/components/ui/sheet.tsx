"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface SheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

interface SheetContentProps {
    children: React.ReactNode;
    className?: string;
    side?: "right" | "left" | "top" | "bottom";
}

const Sheet = ({ open = false, onOpenChange, children }: SheetProps) => {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50">
            <div
                className="fixed inset-0 bg-black/50 transition-opacity"
                onClick={() => onOpenChange?.(false)}
            />
            {children}
        </div>,
        document.body
    );
};

const SheetContent = ({ children, className = "", side = "right" }: SheetContentProps) => {
    // Side controls anchor + slide-in animation. Bottom + top are full-width
    // and auto-sized; left + right are full-height with a mobile-friendly
    // max width.
    const layoutByside: Record<typeof side, string> = {
        right: "right-0 top-0 h-full w-full sm:max-w-md animate-in slide-in-from-right",
        left: "left-0 top-0 h-full w-full sm:max-w-md animate-in slide-in-from-left",
        bottom: "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl animate-in slide-in-from-bottom",
        top: "top-0 left-0 right-0 max-h-[85vh] rounded-b-2xl animate-in slide-in-from-top",
    };

    return (
        <div
            className={`fixed bg-white shadow-lg z-50 overflow-y-auto ${layoutByside[side]} ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
};

const SheetHeader = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`flex flex-col space-y-2 p-6 pb-0 ${className}`}>
        {children}
    </div>
);

const SheetTitle = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
        {children}
    </h2>
);

const SheetDescription = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <p className={`text-sm text-gray-600 ${className}`}>
        {children}
    </p>
);

const SheetClose = ({ onClick, className = "" }: { onClick?: () => void; className?: string }) => (
    <button
        onClick={onClick}
        className={`absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 ${className}`}
    >
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
    </button>
);

const SheetTrigger = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <div onClick={onClick}>
        {children}
    </div>
);

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose, SheetTrigger };
