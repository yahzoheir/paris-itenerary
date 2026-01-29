import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

export function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`px-6 py-4 border-b border-zinc-100 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`p-6 ${className}`}>{children}</div>;
}

export function Badge({ children, variant = "neutral", className = "" }: { children: React.ReactNode; variant?: "neutral" | "success" | "warning"; className?: string }) {
    const variants = {
        neutral: "bg-zinc-100 text-zinc-600 border-zinc-200",
        success: "bg-green-50 text-green-700 border-green-200",
        warning: "bg-amber-50 text-amber-700 border-amber-200"
    };

    return (
        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
}
