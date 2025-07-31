import React, { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  bgColor?: string;
  fgColor?: string;
  includeMargin?: boolean;
  imageSettings?: {
    src: string;
    height: number;
    width: number;
    excavate?: boolean;
  };
  className?: string;
}

export function QRCode({
  value,
  size = 128,
  level = 'L',
  bgColor = '#FFFFFF',
  fgColor = '#000000',
  includeMargin = false,
  imageSettings,
  className
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // For now, we'll create a simple placeholder
    // In production, you'd use a library like qrcode.js
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = size;
    canvas.height = size;

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Draw placeholder QR code pattern
    const moduleCount = 25; // Typical QR code module count
    const moduleSize = size / moduleCount;
    const margin = includeMargin ? moduleSize * 2 : 0;
    const actualSize = size - margin * 2;
    const actualModuleSize = actualSize / moduleCount;

    // Simple pattern generation (not a real QR code)
    ctx.fillStyle = fgColor;
    
    // Draw finder patterns (corners)
    const drawFinderPattern = (x: number, y: number) => {
      // Outer square
      ctx.fillRect(x, y, actualModuleSize * 7, actualModuleSize * 7);
      // White square
      ctx.fillStyle = bgColor;
      ctx.fillRect(
        x + actualModuleSize,
        y + actualModuleSize,
        actualModuleSize * 5,
        actualModuleSize * 5
      );
      // Inner square
      ctx.fillStyle = fgColor;
      ctx.fillRect(
        x + actualModuleSize * 2,
        y + actualModuleSize * 2,
        actualModuleSize * 3,
        actualModuleSize * 3
      );
    };

    // Top-left finder
    drawFinderPattern(margin, margin);
    // Top-right finder
    drawFinderPattern(margin + actualModuleSize * (moduleCount - 7), margin);
    // Bottom-left finder
    drawFinderPattern(margin, margin + actualModuleSize * (moduleCount - 7));

    // Draw timing patterns
    ctx.fillStyle = fgColor;
    for (let i = 8; i < moduleCount - 8; i += 2) {
      // Horizontal
      ctx.fillRect(
        margin + actualModuleSize * i,
        margin + actualModuleSize * 6,
        actualModuleSize,
        actualModuleSize
      );
      // Vertical
      ctx.fillRect(
        margin + actualModuleSize * 6,
        margin + actualModuleSize * i,
        actualModuleSize,
        actualModuleSize
      );
    }

    // Draw data area with pseudo-random pattern based on value
    const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        // Skip finder patterns and timing patterns
        if (
          (row < 8 && (col < 8 || col >= moduleCount - 7)) ||
          (row >= moduleCount - 7 && col < 8) ||
          (row === 6 || col === 6)
        ) {
          continue;
        }

        // Pseudo-random based on position and value hash
        if ((row * col + hash) % 3 === 0) {
          ctx.fillRect(
            margin + actualModuleSize * col,
            margin + actualModuleSize * row,
            actualModuleSize,
            actualModuleSize
          );
        }
      }
    }

    // Add center image if provided
    if (imageSettings) {
      const img = new Image();
      img.onload = () => {
        const imgSize = Math.min(imageSettings.width, imageSettings.height);
        const imgX = (size - imgSize) / 2;
        const imgY = (size - imgSize) / 2;

        if (imageSettings.excavate) {
          // Clear area for image
          ctx.fillStyle = bgColor;
          ctx.fillRect(imgX - 4, imgY - 4, imgSize + 8, imgSize + 8);
        }

        ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      };
      img.src = imageSettings.src;
    }

    // Add text below (for demonstration)
    ctx.fillStyle = fgColor;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Scan with Expo Go', size / 2, size - 5);

  }, [value, size, level, bgColor, fgColor, includeMargin, imageSettings]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('max-w-full h-auto', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// Export a simpler version that uses an external service
export function QRCodeImage({
  value,
  size = 200,
  className
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  // Using qr-server.com as a fallback
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;

  return (
    <img
      src={qrUrl}
      alt="QR Code"
      width={size}
      height={size}
      className={cn('max-w-full h-auto', className)}
    />
  );
}