import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import JSZip from 'https://esm.sh/jszip@3.10.1'
import { corsHeaders } from '../_shared/cors.ts'

interface SnapshotRequest {
  projectId: string
}

interface SnapshotResponse {
  success: boolean
  signedUrl?: string
  manifest?: {
    projectId: string
    snapshotId: string
    fileCount: number
    totalSize: number
    createdAt: string
  }
  error?: string
}

// Initialize Supabase client with service role
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json() as SnapshotRequest

    if (!projectId) {
      throw new Error('Project ID is required')
    }

    console.log(`Building snapshot for project: ${projectId}`)

    // Get current files via list_current_files RPC
    const { data: files, error: filesError } = await supabase.rpc('list_current_files', {
      project_uuid: projectId
    })

    if (filesError) {
      console.error('Failed to fetch files:', filesError)
      throw new Error(`Failed to fetch files: ${filesError.message}`)
    }

    if (!files || files.length === 0) {
      console.log('No files found for project, creating empty snapshot')
    }

    // Create JSZip instance
    const zip = new JSZip()

    // Add files to zip
    let totalSize = 0
    for (const file of files || []) {
      if (file.content) {
        zip.file(file.file_path, file.content)
        totalSize += file.content.length
        console.log(`Added file: ${file.file_path} (${file.content.length} bytes)`)
      }
    }

    // Generate snapshot ID
    const snapshotId = `${projectId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

    // Generate zip blob
    console.log('Generating zip file...')
    const zipBlob = await zip.generateAsync({ 
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    console.log(`Zip generated: ${zipBlob.length} bytes`)

    // Upload to project-snapshots bucket
    const fileName = `${projectId}/${snapshotId}.zip`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-snapshots')
      .upload(fileName, zipBlob, {
        contentType: 'application/zip',
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error(`Failed to upload snapshot: ${uploadError.message}`)
    }

    console.log(`Uploaded to: ${fileName}`)

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('project-snapshots')
      .createSignedUrl(fileName, 3600)

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError)
      throw new Error(`Failed to create signed URL: ${signedUrlError.message}`)
    }

    // Create manifest
    const manifest = {
      projectId,
      snapshotId,
      fileCount: files?.length || 0,
      totalSize,
      createdAt: new Date().toISOString()
    }

    console.log('Snapshot created successfully:', manifest)

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl: signedUrlData.signedUrl,
        manifest
      } as SnapshotResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Snapshot creation error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create project snapshot'
      } as SnapshotResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})