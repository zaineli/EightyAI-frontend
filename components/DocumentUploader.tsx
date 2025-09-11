'use client';

import { useState, useRef } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const DocumentUploader = () => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const fileInputRef = useRef(null);

  const acceptedTypes = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt']
  };

  const handleFileSelect = (selectedFiles) => {
    const validFiles = Array.from(selectedFiles).filter(file => {
      const isValidType = Object.keys(acceptedTypes).includes(file.type);
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit
      return isValidType && isValidSize;
    });

    const newFiles = validFiles.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setUploadResults(prev => prev.filter(r => r.id !== id));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadResults([]);

    const results = [];

    for (const fileItem of files) {
      try {
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('fileName', fileItem.name);

        const response = await fetch('http://localhost:8000/upload-pdf', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (response.ok) {
          results.push({
            id: fileItem.id,
            name: fileItem.name,
            status: 'success',
            message: 'Uploaded successfully',
            filePath: result.filePath
          });
        } else {
          results.push({
            id: fileItem.id,
            name: fileItem.name,
            status: 'error',
            message: result.error || 'Upload failed'
          });
        }
      } catch (error) {
        results.push({
          id: fileItem.id,
          name: fileItem.name,
          status: 'error',
          message: 'Network error occurred'
        });
      }
    }

    setUploadResults(results);
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    handleFileSelect(droppedFiles);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Document Upload</h2>
      
      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg text-gray-600 mb-2">
          Drop your documents here or click to browse
        </p>
        <p className="text-sm text-gray-500">
          Supports PDF, DOC, DOCX, TXT files up to 10MB
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Selected Files</h3>
          <div className="space-y-3">
            {files.map((fileItem) => {
              const result = uploadResults.find(r => r.id === fileItem.id);
              return (
                <div
                  key={fileItem.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center space-x-3">
                    <File className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-medium text-gray-800">{fileItem.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(fileItem.size)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {result && (
                      <div className="flex items-center space-x-2">
                        {result.status === 'success' && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        {result.status === 'error' && (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className={`text-sm ${
                          result.status === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {result.message}
                        </span>
                      </div>
                    )}
                    
                    <button
                      onClick={() => removeFile(fileItem.id)}
                      className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                      disabled={uploading}
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Upload Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={uploadFiles}
              disabled={uploading || files.length === 0}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{uploading ? 'Processing with OCR...' : 'Upload & Process with OCR'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Results</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Successfully uploaded {uploadResults.filter(r => r.status === 'success').length} of {uploadResults.length} files
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;