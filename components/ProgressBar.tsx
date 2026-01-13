import React from 'react';

interface ProgressBarProps {
  progress: number;
  message?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message }) => {
  return (
    <div className="w-full max-w-md mx-auto p-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-ios-blue uppercase tracking-wide">
          {message || "Processing"}
        </span>
        <span className="text-xs font-bold text-gray-500">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-ios-blue transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};
