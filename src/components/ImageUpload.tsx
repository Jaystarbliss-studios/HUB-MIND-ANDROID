import React, { useState } from 'react';
import { Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { cloudinaryConfig } from '../cloudinaryConfig';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImageUploadProps {
  onUploadSuccess: (url: string, publicId: string) => void;
  className?: string;
  label?: string;
}

export function ImageUpload({ onUploadSuccess, className, label = "Upload Image" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Keep images under 5MB");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "Upload failed");
      }

      onUploadSuccess(data.secure_url, data.public_id);
    } catch (err: any) {
      setError(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <label className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md cursor-pointer text-sm font-medium transition-colors">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Upload className="w-4 h-4" />}
        <span>{uploading ? "Uploading..." : label}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <p className="text-slate-500 text-xs flex items-center gap-1">
        <ImageIcon className="w-3 h-3" /> Max size: 5MB
      </p>
    </div>
  );
}
