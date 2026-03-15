"use client";

import { useState, useEffect } from "react";
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
            const res = await apiFetch(`/api/v1/files/${file.id}/download`);
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
                const res = await apiFetch(`/api/v1/files/public/${userId}`);
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
            alert("You must be logged in to copy files.");
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
            const res = await apiFetch(`/api/v1/files/${fileId}/copy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new_owner_id: myId })
            });

            if (!res.ok) throw new Error("Failed to copy");
            const data = await res.json();
            alert("File copied to your Personal Vault! ID: " + data.id);
        } catch (err: any) {
            console.error("Copy failed:", err);
            alert("Copy failed: " + err.message);
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
                    className="px-4 py-2 border rounded hover:bg-gray-100 transition-colors"
                >
                    Go to My Dashboard
                </button>
            </header>

            {notFoundFile && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <div className="font-bold">Notice</div>
                        <div className="text-sm">This file is no longer being shared or has been made private.</div>
                    </div>
                </div>
            )}

            <div className="grid gap-4">
                {files.length === 0 ? (
                    <div className="text-gray-500 text-center py-12">No public files found.</div>
                ) : (
                    files.map(file => (
                        <div key={file.id}
                            className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm flex justify-between items-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.99]"
                            onClick={() => handlePreview(file)}
                        >
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="font-bold text-lg text-gray-900 truncate">
                                    {file.public_meta?.name || file.public_meta?.title || "Untitled"}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {file.type} • {(file.size / 1024).toFixed(1)} KB • {new Date(file.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleCopy(file.id); }}
                                className="text-blue-600 hover:text-blue-800 font-semibold px-4 py-1.5 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
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
                    <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                            <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                                {previewFile.public_meta?.name || previewFile.public_meta?.title || "Untitled"}
                            </h3>
                            <button onClick={closePreview} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">✕</button>
                        </div>
                        <div className="p-6 flex-1 overflow-auto bg-gray-50 dark:bg-black/20 font-mono text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {isPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Loading content...</span>
                                </div>
                            ) : previewContent}
                        </div>
                        <div className="p-4 border-t border-gray-100 dark:border-white/5 flex justify-end gap-3 bg-gray-50/50 dark:bg-white/5">
                            <button onClick={closePreview} className="px-5 py-2.5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-white/5 transition-colors">
                                Close
                            </button>
                            <button onClick={handleKeepFromPreview} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95">
                                Keep (Copy to Vault)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
