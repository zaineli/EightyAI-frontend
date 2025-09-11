import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configure the maximum file size (10MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const fileName = formData.get('fileName');

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename to prevent conflicts
    const fileExtension = path.extname(fileName || file.name);
    const uniqueId = uuidv4();
    const uniqueFileName = `${uniqueId}${fileExtension}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Store file metadata (you can save this to a database)
    const fileMetadata = {
      id: uniqueId,
      originalName: fileName || file.name,
      filename: uniqueFileName,
      path: filePath,
      size: file.size,
      type: file.type,
      uploadDate: new Date().toISOString(),
    };

    // Optional: Save metadata to database
    // await saveFileMetadataToDatabase(fileMetadata);

    console.log('File uploaded successfully:', fileMetadata);

    return NextResponse.json({
      message: 'File uploaded successfully',
      fileId: uniqueId,
      fileName: uniqueFileName,
      filePath: `/uploads/${uniqueFileName}`,
      metadata: fileMetadata
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to retrieve file metadata
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID required' },
        { status: 400 }
      );
    }

    // Here you would typically fetch from your database
    // const fileMetadata = await getFileMetadataFromDatabase(fileId);
    
    // For now, return a placeholder response
    return NextResponse.json({
      message: 'File metadata endpoint - integrate with your database',
      fileId: fileId
    });

  } catch (error) {
    console.error('Get file error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file information' },
      { status: 500 }
    );
  }
}