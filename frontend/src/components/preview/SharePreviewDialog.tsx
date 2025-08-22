import { useState } from 'react'
import { previewSharingService } from '../../services/previewSharingService'
import type { CreateShareOptions } from '../../services/previewSharingService'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Badge } from '../ui/badge'
import { useToast } from '../../hooks/use-toast'
import { 
  Copy, 
  Link, 
  Lock, 
  Clock, 
  Eye, 
  Mail,
  Shield,
  Users,
  Loader2,
  Check
} from 'lucide-react'

interface SharePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName?: string
}

export function SharePreviewDialog({
  open,
  onOpenChange,
  projectId,
  projectName = 'Preview'
}: SharePreviewDialogProps) {
  const { toast } = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Share options
  const [title, setTitle] = useState(`${projectName} Preview`)
  const [description, setDescription] = useState('')
  const [accessLevel, setAccessLevel] = useState<'viewer' | 'commenter' | 'editor'>('viewer')
  const [password, setPassword] = useState('')
  const [expiresIn, setExpiresIn] = useState<number | undefined>()
  const [maxViews, setMaxViews] = useState<number | undefined>()
  const [requiresAuth, setRequiresAuth] = useState(false)
  const [allowedEmails, setAllowedEmails] = useState('')

  const handleCreateShare = async () => {
    setIsCreating(true)

    try {
      const options: CreateShareOptions = {
        projectId,
        title,
        description: description || undefined,
        accessLevel,
        password: password || undefined,
        expiresIn: expiresIn || undefined,
        maxViews: maxViews || undefined,
        requiresAuth,
        allowedEmails: allowedEmails 
          ? allowedEmails.split(',').map(e => e.trim()).filter(Boolean)
          : undefined
      }

      const result = await previewSharingService.createShareLink(options)
      setShareLink(result.shareLink)

      toast({
        title: 'Share Link Created',
        description: 'Your preview is now shareable!',
      })
    } catch (error) {
      console.error('Failed to create share link:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create share link'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopyLink = async () => {
    if (!shareLink) return

    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      
      toast({
        title: 'Link Copied',
        description: 'Share link copied to clipboard',
        duration: 2000
      })

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive'
      })
    }
  }

  const resetForm = () => {
    setShareLink(null)
    setTitle(`${projectName} Preview`)
    setDescription('')
    setAccessLevel('viewer')
    setPassword('')
    setExpiresIn(undefined)
    setMaxViews(undefined)
    setRequiresAuth(false)
    setAllowedEmails('')
    setCopied(false)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open)
      if (!open) resetForm()
    }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Share Preview</DialogTitle>
          <DialogDescription>
            Create a secure link to share your preview with others
          </DialogDescription>
        </DialogHeader>

        {!shareLink ? (
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for the shared preview"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description or instructions"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="access">Access Level</Label>
                <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as any)}>
                  <SelectTrigger id="access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        <span>Viewer - Can view only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="commenter">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>Commenter - Can view and comment</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="editor">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <span>Editor - Full access</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password Protection (optional)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a password"
                />
                <p className="text-sm text-muted-foreground">
                  Viewers will need this password to access the preview
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auth">Require Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Only signed-in users can access
                  </p>
                </div>
                <Switch
                  id="auth"
                  checked={requiresAuth}
                  onCheckedChange={setRequiresAuth}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emails">Email Whitelist (optional)</Label>
                <Textarea
                  id="emails"
                  value={allowedEmails}
                  onChange={(e) => setAllowedEmails(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  Only these email addresses can access (comma-separated)
                </p>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expires">Link Expiration</Label>
                <Select 
                  value={expiresIn?.toString() || 'never'} 
                  onValueChange={(v) => setExpiresIn(v === 'never' ? undefined : parseInt(v))}
                >
                  <SelectTrigger id="expires">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never expires</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                    <SelectItem value="720">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="views">Maximum Views (optional)</Label>
                <Input
                  id="views"
                  type="number"
                  value={maxViews || ''}
                  onChange={(e) => setMaxViews(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Unlimited"
                  min={1}
                />
                <p className="text-sm text-muted-foreground">
                  Link expires after this many views
                </p>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Share Link</span>
                <Badge variant="outline" className="text-xs">
                  <Link className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={shareLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>Access Level: {accessLevel}</span>
              </div>
              {password && (
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span>Password protected</span>
                </div>
              )}
              {expiresIn && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Expires in {expiresIn} hours</span>
                </div>
              )}
              {maxViews && (
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span>Limited to {maxViews} views</span>
                </div>
              )}
              {requiresAuth && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Requires authentication</span>
                </div>
              )}
              {allowedEmails && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>Email whitelist enabled</span>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              onClick={resetForm}
              className="w-full"
            >
              Create Another Link
            </Button>
          </div>
        )}

        <DialogFooter>
          {!shareLink && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={isCreating || !title}
              >
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Share Link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}