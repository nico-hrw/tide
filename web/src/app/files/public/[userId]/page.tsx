"use client";

import { useState, useEffect } from "react";
import { notify, notifyError } from '@/lib/feedback';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface PublicFile {
    id: string;
    type: string;
    size: number;
    updated_at: string;
    public_meta: any;
}

export default function PublicProfilePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const userId = params.userId as string;
    const targetFileId = searchParams.get('file');

    const [files, setFiles] = useState<PublicFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notFoundFile, setNotFoundFile] = useState(false);

    const [previewFile, setPreviewFile] = useState<PublicFile | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const handlePreview = async (file: PublicFile) => {
        setPreviewFile(file);
        setIsPreviewLoading(true);
        setPreviewContent(null);

        try {
            const res = await apiFetch(`/api/v1/files/public/${encodeURIComponent(userId)}/download/${encodeURIComponent(file.id)}`);
            if (!res.ok) throw new Error("Failed to download content");

            const text = await res.text();
            setPreviewContent(text);
        } catch (err) {
            console.error(err);
            setPreviewContent("Failed to load preview.");
        } finally {
            setIsPreviewLoading(false);
        }
    };

    useEffect(() => {
        if (!userId) return;

        const fetchFiles = async () => {
            try {
                const res = await apiFetch(`/api/v1/files/public/${encodeURIComponent(userId)}`);
                if (!res.ok) {
                    if (res.status === 404) throw new Error("User not found or no public files.");
                    throw new Error("Failed to load public files");
                }
                const data: PublicFile[] = await res.json().catch(() => []);
                const fetchedFiles = data || [];
                setFiles(fetchedFiles);

                if (targetFileId) {
                    const found = fetchedFiles.find(f => f.id === targetFileId);
                    if (found) {
                        handlePreview(found);
                    } else {
                        setNotFoundFile(true);
                    }
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFiles();
    }, [userId, targetFileId]);

    const handleCopy = async (fileId: string) => {
        const email = sessionStorage.getItem("tide_user_email");
        if (!email) {
            notifyError("You must be logged in to copy files.");
            return;
        }

        let myId = "user-1";
        const userRecordStr = localStorage.getItem("tide_user_" + email);
        if (userRecordStr) {
            try {
                const u = JSON.parse(userRecordStr);
                if (u.id) myId = u.id;
            } catch (e) { }
        }

        try {
            const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/copy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_owner_id: myId })
            });

            if (!res.ok) throw new Error("Failed to copy");
            const data = await res.json();
            notify("Datei in deinen Tresor kopiert", { tone: "success" });
        } catch (err: any) {
            console.error("Copy failed:", err);
            notifyError("Copy failed: " + err.message);
        }
    };

    const closePreview = () => {
        setPreviewFile(null);
        setPreviewContent(null);
    };

    const handleKeepFromPreview = () => {
        if (previewFile) {
            handleCopy(previewFile.id);
            closePreview();
        }
    };

    if (loading) return <div className="p-8">Loading profile...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto relative">
            <header className="mb-8 flex justify-between items-center">
                <h1 className="text-2xl font-bold">Public Files: {userId}</h1>
                <button
                    onClick={() => router.push("/")}
                    className="px-4 py-2 border dark:border-slate-700 rounded hover:bg-t2-hover  transition-colors"
                >
                    Go to My Dashboard
                </button>
            </header>

            {notFoundFile && (
                <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <div className="font-bold">Notice</div>
                        <div className="text-sm">This file is no longer being shared or has been made private.</div>
                    </div>
                </div>
            )}

            <div className="grid gap-4">
                {files.length === 0 ? (
                    <div className="text-t2-ink-2  text-center py-12">No public files found.</div>
                ) : (
                    files.map(file => (
                        <div key={file.id}
                            className="p-4 border border-t2-line-soft  rounded-xl bg-t2-surface  shadow-sm flex justify-between items-center cursor-pointer hover:shadow-md hover:border-t2-line  transition-all active:scale-[0.99]"
                            onClick={() => handlePreview(file)}
                        >
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="font-bold text-lg text-t2-ink  truncate">
                                    {file.public_meta?.name || file.public_meta?.title || "Untitled"}
                                </div>
                                <div className="text-sm text-t2-ink-2 ">
                                    {file.type} • {(file.size / 1024).toFixed(1)} KB • {new Date(file.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleCopy(file.id); }}
                                className="text-t2-accent  hover:text-t2-accent  font-semibold px-4 py-1.5 border border-t2-line  rounded-lg hover:bg-t2-sub  transition-colors shrink-0"
                                title="Copy to my vault"
                            >
                                Copy to Vault
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Preview Modal */}
            {previewFile && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-t2-surface  rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-t2-line-soft  flex justify-between items-center">
                            <h3 className="font-bold text-xl text-t2-ink ">
                                {previewFile.public_meta?.name || previewFile.public_meta?.title || "Untitled"}
                            </h3>
                            <button onClick={closePreview} className="w-8 h-8 rounded-full flex items-center justify-center text-t2-ink-3 hover:text-t2-ink-2  hover:bg-t2-hover  transition-colors">✕</button>
                        </div>
                        <div className="p-6 flex-1 overflow-auto bg-t2-sub  font-mono text-sm whitespace-pre-wrap text-t2-ink ">
                            {isPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-t2-ink-3">
                                    <div className="w-6 h-6 border-2 border-t2-accent border-t-transparent rounded-full animate-spin"></div>
                                    <span>Loading content...</span>
                                </div>
                            ) : previewContent}
                        </div>
                        <div className="p-4 border-t border-t2-line-soft  flex justify-end gap-3 bg-t2-sub ">
                            <button onClick={closePreview} className="px-5 py-2.5 border border-t2-line  rounded-xl text-sm font-medium text-t2-ink-2  hover:bg-t2-surface  transition-colors">
                                Close
                            </button>
                            <button onClick={handleKeepFromPreview} className="px-5 py-2.5 bg-t2-accent hover:opacity-90 text-t2-accent-ink rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95">
                                Keep (Copy to Vault)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
