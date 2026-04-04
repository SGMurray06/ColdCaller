"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  getInputByteFrequencyData: () => Uint8Array | null;
  getOutputByteFrequencyData: () => Uint8Array | null;
  isActive: boolean;
}

export function AudioVisualizer({
  getInputByteFrequencyData,
  getOutputByteFrequencyData,
  isActive,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const midY = height / 2;
      const barWidth = 3;
      const gap = 2;
      const totalBars = Math.floor(width / (barWidth + gap));
      const halfBars = Math.floor(totalBars / 2);

      // Draw input (rep) bars on the left — blue/cyan
      const inputData = getInputByteFrequencyData?.();
      if (inputData && inputData.length > 0) {
        for (let i = 0; i < halfBars; i++) {
          const dataIndex = Math.floor((i / halfBars) * inputData.length);
          const value = inputData[dataIndex] / 255;
          const barHeight = Math.max(2, value * midY * 0.9);

          const x = i * (barWidth + gap);
          ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + value * 0.6})`;
          ctx.fillRect(x, midY - barHeight, barWidth, barHeight);
          ctx.fillRect(x, midY, barWidth, barHeight);
        }
      }

      // Draw output (prospect) bars on the right — orange/amber
      const outputData = getOutputByteFrequencyData?.();
      if (outputData && outputData.length > 0) {
        for (let i = 0; i < halfBars; i++) {
          const dataIndex = Math.floor((i / halfBars) * outputData.length);
          const value = outputData[dataIndex] / 255;
          const barHeight = Math.max(2, value * midY * 0.9);

          const x = (halfBars + i) * (barWidth + gap);
          ctx.fillStyle = `rgba(251, 146, 60, ${0.4 + value * 0.6})`;
          ctx.fillRect(x, midY - barHeight, barWidth, barHeight);
          ctx.fillRect(x, midY, barWidth, barHeight);
        }
      }

      // Center divider line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(halfBars * (barWidth + gap), 0);
      ctx.lineTo(halfBars * (barWidth + gap), height);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getInputByteFrequencyData, getOutputByteFrequencyData]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        className="w-full h-[120px] rounded-lg bg-black/20"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
        <span className="text-sky-400">You</span>
        <span className="text-orange-400">Prospect</span>
      </div>
    </div>
  );
}
