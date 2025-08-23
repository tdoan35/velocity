import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseConnectForm } from '../SupabaseConnectForm';
import { useToast } from '../../../hooks/use-toast';

// Mock the toast hook
vi.mock('../../../hooks/use-toast', () => ({
  useToast: vi.fn()
}));

describe('SupabaseConnectForm', () => {
  const mockOnConnect = vi.fn();
  const mockOnUpdate = vi.fn();
  const mockToast = vi.fn();

  const defaultProps = {
    projectId: 'test-project',
    isConnected: false,
    isConnecting: false,
    onConnect: mockOnConnect
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast } as any);
  });

  describe('rendering', () => {
    it('should render connection form when not connected', () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      expect(screen.getByText('Connect Your Supabase Project')).toBeInTheDocument();
      expect(screen.getByLabelText(/Supabase Project URL/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Anon Key/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Connect Supabase/i })).toBeInTheDocument();
    });

    it('should render update form when connected', () => {
      render(
        <SupabaseConnectForm
          {...defaultProps}
          isConnected={true}
          onUpdate={mockOnUpdate}
          projectUrl="https://test.supabase.co"
        />
      );

      expect(screen.getByText('Update Supabase Connection')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Update Connection/i })).toBeInTheDocument();
    });

    it('should show security notice', () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      expect(screen.getByText(/Your credentials are encrypted/)).toBeInTheDocument();
    });

    it('should show data sovereignty notice when not connected', () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      expect(screen.getByText(/You maintain full ownership/)).toBeInTheDocument();
    });

    it('should not show data sovereignty notice when connected', () => {
      render(
        <SupabaseConnectForm
          {...defaultProps}
          isConnected={true}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByText(/You maintain full ownership/)).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('should validate empty project URL', async () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Project URL is required')).toBeInTheDocument();
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it('should validate invalid URL format', async () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      fireEvent.change(urlInput, { target: { value: 'not-a-url' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it('should validate non-Supabase URLs', async () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      fireEvent.change(urlInput, { target: { value: 'https://google.com' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid Supabase project URL format')).toBeInTheDocument();
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it('should validate empty anon key', async () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Anon key is required')).toBeInTheDocument();
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it('should validate short anon key', async () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'short-key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Anon key appears to be invalid (too short)')).toBeInTheDocument();
      });
      expect(mockOnConnect).not.toHaveBeenCalled();
    });

    it('should accept valid Supabase URLs', () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      
      // Test .supabase.co domain
      fireEvent.change(urlInput, { target: { value: 'https://myproject.supabase.co' } });
      expect(screen.queryByText(/Invalid.*URL/)).not.toBeInTheDocument();

      // Test .supabase.in domain
      fireEvent.change(urlInput, { target: { value: 'https://myproject.supabase.in' } });
      expect(screen.queryByText(/Invalid.*URL/)).not.toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should call onConnect with valid credentials when not connected', async () => {
      mockOnConnect.mockResolvedValue({ success: true, message: 'Connected' });

      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnConnect).toHaveBeenCalledWith({
          projectUrl: 'https://test.supabase.co',
          anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key'
        });
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Connected Successfully',
        description: expect.any(String),
        duration: 5000
      });
    });

    it('should call onUpdate when connected', async () => {
      mockOnUpdate.mockResolvedValue({ success: true });

      render(
        <SupabaseConnectForm
          {...defaultProps}
          isConnected={true}
          onUpdate={mockOnUpdate}
          projectUrl="https://old.supabase.co"
        />
      );

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://new.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new.key' } });

      const submitButton = screen.getByRole('button', { name: /Update Connection/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledWith({
          projectUrl: 'https://new.supabase.co',
          anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new.key'
        });
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Connection Updated',
        description: expect.any(String),
        duration: 5000
      });
    });

    it('should handle connection failure', async () => {
      mockOnConnect.mockResolvedValue({ 
        success: false, 
        message: 'Invalid credentials' 
      });

      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Connection Failed',
          description: 'Invalid credentials',
          variant: 'destructive',
          duration: 5000
        });
      });
    });

    it('should handle connection errors', async () => {
      mockOnConnect.mockRejectedValue(new Error('Network error'));

      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Connection Error',
          description: 'Network error',
          variant: 'destructive',
          duration: 5000
        });
      });
    });

    it('should clear anon key after successful initial connection', async () => {
      mockOnConnect.mockResolvedValue({ success: true, message: 'Connected' });

      render(<SupabaseConnectForm {...defaultProps} />);

      const keyInput = screen.getByLabelText(/Anon Key/) as HTMLInputElement;
      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(keyInput.value).toBe('');
      });
    });
  });

  describe('password visibility toggle', () => {
    it('should toggle anon key visibility', () => {
      render(<SupabaseConnectForm {...defaultProps} />);

      const keyInput = screen.getByLabelText(/Anon Key/) as HTMLInputElement;
      
      // Initially password type
      expect(keyInput.type).toBe('password');

      // Click show button
      const showButton = screen.getByRole('button', { name: /Show/i });
      fireEvent.click(showButton);
      expect(keyInput.type).toBe('text');

      // Click hide button
      const hideButton = screen.getByRole('button', { name: /Hide/i });
      fireEvent.click(hideButton);
      expect(keyInput.type).toBe('password');
    });
  });

  describe('form state', () => {
    it('should disable inputs when connecting', () => {
      render(
        <SupabaseConnectForm
          {...defaultProps}
          isConnecting={true}
        />
      );

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      const submitButton = screen.getByRole('button', { name: /Testing Connection/i });

      expect(urlInput).toBeDisabled();
      expect(keyInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });

    it('should show loading state when submitting', async () => {
      mockOnConnect.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<SupabaseConnectForm {...defaultProps} />);

      const urlInput = screen.getByLabelText(/Supabase Project URL/);
      const keyInput = screen.getByLabelText(/Anon Key/);
      
      fireEvent.change(urlInput, { target: { value: 'https://test.supabase.co' } });
      fireEvent.change(keyInput, { target: { value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key' } });

      const submitButton = screen.getByRole('button', { name: /Connect Supabase/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Testing Connection/i)).toBeInTheDocument();
      });
    });
  });
});